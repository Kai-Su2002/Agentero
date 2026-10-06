//! `agentero discover *` — query-first paper discovery.
//!
//! Headless, vault-free: fetch arXiv candidates for a topic/category/date
//! window and rank them with a deterministic lexical scorer. The pipeline
//! (and any external agent) can consume the JSON shortlist directly.

use crate::error::CliError;
use crate::output::to_value;
use crate::resolve::GlobalOpts;
use crate::style::{format_table, truncate_chars};
use agentero_core::features::paper::discovery::discover::{
    discover_arxiv, DiscoverQuery, DEFAULT_MAX_CANDIDATES, DEFAULT_TOP,
};
use clap::Subcommand;
use serde_json::{json, Value};

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
        } => {
            run_arxiv(
                globals,
                keywords,
                categories,
                since,
                until,
                top,
                max_candidates,
            )
            .await
        }
    }
}

#[allow(clippy::too_many_arguments)]
async fn run_arxiv(
    globals: &GlobalOpts,
    keywords: Vec<String>,
    categories: Vec<String>,
    since: Option<String>,
    until: Option<String>,
    top: usize,
    max_candidates: usize,
) -> Result<Value, CliError> {
    let query = DiscoverQuery {
        keywords,
        categories,
        since,
        until,
        top: Some(top),
        max_candidates: Some(max_candidates),
    };
    let data = discover_arxiv(&query).await?;

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
    let lines = if data.items.is_empty() {
        vec![globals.style.dim("(no candidates)")]
    } else {
        format_table(globals.style, &["#", "SCORE", "arXiv ID", "TITLE"], &rows)
    };

    let mut out = to_value(&data)?;
    if let Some(obj) = out.as_object_mut() {
        obj.insert("lines".into(), json!(lines));
    }
    Ok(out)
}
