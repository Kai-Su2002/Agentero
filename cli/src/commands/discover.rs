//! `agentero discover *` — query-first paper discovery.
//!
//! Headless, vault-free: fetch arXiv candidates for a topic/category/date
//! window and rank them with a deterministic lexical scorer. The pipeline
//! (and any external agent) can consume the JSON shortlist directly.

use crate::error::CliError;
use crate::output::to_value;
use crate::resolve::{resolve_vault, GlobalOpts};
use crate::style::{format_table, truncate_chars};
use agentero_core::features::paper::discovery::discover::{
    discover_arxiv, known_arxiv_ids, DiscoverQuery, DEFAULT_MAX_CANDIDATES, DEFAULT_TOP,
};
use clap::Subcommand;
use serde_json::{json, Value};
use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Subcommand)]
pub enum DiscoverCmd {
    /// Rank the day's arXiv submissions for keywords / categories.
    ///
    /// Candidates come from the arXiv Atom API (newest submissions first) and
    /// are scored lexically: a title hit weighs more than an abstract hit.
    /// Provide at least one --keyword or --category.
    Arxiv {
        /// Topic term or phrase (repeatable). e.g. -k agent -k "world model".
        #[arg(short = 'k', long = "keyword", value_name = "TERM")]
        keywords: Vec<String>,
        /// arXiv category (repeatable), e.g. -c cs.AI.
        #[arg(short = 'c', long = "category", value_name = "CAT")]
        categories: Vec<String>,
        /// Only papers submitted on/after this date (YYYY-MM-DD).
        #[arg(long = "since", value_name = "DATE")]
        since: Option<String>,
        /// Only papers submitted on/before this date (YYYY-MM-DD).
        #[arg(long = "until", value_name = "DATE")]
        until: Option<String>,
        /// Shortlist size.
        #[arg(long = "top", value_name = "N", default_value_t = DEFAULT_TOP)]
        top: usize,
        /// Max candidates to fetch before ranking.
        #[arg(long = "max-candidates", value_name = "N", default_value_t = DEFAULT_MAX_CANDIDATES)]
        max_candidates: usize,
        /// Write the full shortlist JSON to this file (creation is idempotent).
        #[arg(long = "out", value_name = "FILE", value_hint = clap::ValueHint::FilePath)]
        out: Option<PathBuf>,
        /// Do not drop papers already in the library catalog.
        #[arg(long = "no-dedup")]
        no_dedup: bool,
    },
}

pub async fn run(cmd: DiscoverCmd, globals: &GlobalOpts) -> Result<Value, CliError> {
    match cmd {
        DiscoverCmd::Arxiv {
            keywords,
            categories,
            since,
            until,
            top,
            max_candidates,
            out,
            no_dedup,
        } => {
            run_arxiv(
                globals,
                ArxivInputs {
                    keywords,
                    categories,
                    since,
                    until,
                    top,
                    max_candidates,
                    out,
                    no_dedup,
                },
            )
            .await
        }
    }
}

struct ArxivInputs {
    keywords: Vec<String>,
    categories: Vec<String>,
    since: Option<String>,
    until: Option<String>,
    top: usize,
    max_candidates: usize,
    out: Option<PathBuf>,
    no_dedup: bool,
}

async fn run_arxiv(globals: &GlobalOpts, inputs: ArxivInputs) -> Result<Value, CliError> {
    let query = DiscoverQuery {
        keywords: inputs.keywords,
        categories: inputs.categories,
        since: inputs.since,
        until: inputs.until,
        top: Some(inputs.top),
        max_candidates: Some(inputs.max_candidates),
    };
    let exclude = dedup_ids(globals, inputs.no_dedup)?;
    let data = discover_arxiv(&query, &exclude).await?;

    if let Some(path) = &inputs.out {
        if let Some(parent) = path.parent() {
            if !parent.as_os_str().is_empty() {
                fs::create_dir_all(parent)?;
            }
        }
        fs::write(path, serde_json::to_string_pretty(&data)?)?;
    }

    let rows: Vec<Vec<String>> = data
        .items
        .iter()
        .enumerate()
        .map(|(i, item)| {
            vec![
                (i + 1).to_string(),
                format!("{:.1}", item.score),
                item.arxiv_id.clone(),
                truncate_chars(&item.title, 72),
            ]
        })
        .collect();
    let mut lines = if data.items.is_empty() {
        vec![globals.style.dim("(no candidates)")]
    } else {
        format_table(globals.style, &["#", "SCORE", "arXiv ID", "TITLE"], &rows)
    };
    lines.push(globals.style.dim(&format!(
        "scanned {} · excluded {} · shortlisted {}",
        data.candidates_scanned,
        data.excluded,
        data.items.len()
    )));

    let mut out = to_value(&data)?;
    if let Some(obj) = out.as_object_mut() {
        obj.insert("lines".into(), json!(lines));
    }
    Ok(out)
}

/// Library arXiv ids to drop from the shortlist.
///
/// Discovery is vault-free, so a resolvable vault enables novelty filtering but
/// its absence is not an error — unless the user explicitly passed `--vault`.
fn dedup_ids(globals: &GlobalOpts, no_dedup: bool) -> Result<HashSet<String>, CliError> {
    if no_dedup {
        return Ok(HashSet::new());
    }
    match resolve_vault(globals) {
        Ok(vault) => Ok(known_arxiv_ids(&vault)?),
        Err(err) => {
            if globals.vault_flag.is_some() {
                Err(err)
            } else {
                Ok(HashSet::new())
            }
        }
    }
}
