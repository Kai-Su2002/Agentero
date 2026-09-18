//! `agentero doctor`

use crate::error::{CliError, ExitCode};
use crate::output::{to_value, OutputFormat};
use crate::prompt;
use crate::resolve::{resolve_vault, GlobalOpts};
use agentero_core::features::doctor::{
    apply_alias_repairs, apply_catalog_duplicate_repairs, apply_visual_mark_repairs, diagnose,
    AliasRepairCandidate, AliasRepairChange, DoctorReport, VisualMarkRepairChange,
};
use agentero_core::features::wiki::index::WikiIndex;
use agentero_core::features::wiki::models::LinkResolutionStatus;
use agentero_core::fs::sanitize_vault_rel;
use clap::{Subcommand, ValueHint};
use serde_json::{json, Value};
use std::path::Path;

#[derive(Debug, Subcommand)]
pub enum DoctorCmd {
    /// Check Vault-local wikilinks with the same resolver used by the desktop app.
    Wiki {
        /// Optional Vault-relative Markdown file or directory.
        #[arg(value_hint = ValueHint::AnyPath)]
        source: Option<String>,
    },
    /// Apply one explicitly selected class of safe repairs.
    Fix {
        #[command(subcommand)]
        cmd: DoctorFixCmd,
    },
}

#[derive(Debug, Subcommand)]
pub enum DoctorFixCmd {
    /// Add missing paper-note aliases while preserving existing aliases and YAML.
    Aliases,
    /// Rewrite legacy visual marks (`agent-trace` v1) to nested `visual` v2.
    #[command(name = "visual-marks")]
    VisualMarks,
    /// Remove duplicate catalog rows, keeping one canonical row per paper id.
    #[command(name = "catalog-duplicates")]
    CatalogDuplicates,
}

pub fn run(cmd: Option<DoctorCmd>, globals: &GlobalOpts) -> Result<Value, CliError> {
    match cmd {
        None => check(globals),
        Some(DoctorCmd::Wiki { source }) => check_wiki(source.as_deref(), globals),
        Some(DoctorCmd::Fix {
            cmd: DoctorFixCmd::Aliases,
        }) => fix_aliases(globals),
        Some(DoctorCmd::Fix {
            cmd: DoctorFixCmd::VisualMarks,
        }) => fix_visual_marks(globals),
        Some(DoctorCmd::Fix {
            cmd: DoctorFixCmd::CatalogDuplicates,
        }) => fix_catalog_duplicates(globals),
    }
}

fn check(globals: &GlobalOpts) -> Result<Value, CliError> {
    let vault = resolve_vault(globals)?;
    let report = diagnose(&vault).map_err(CliError::from)?;
    let value = report_value(&report)?;
    if report.ok {
        Ok(value)
    } else {
        Err(CliError::with_details(
            "doctor_issues",
            "Doctor found Vault issues",
            value,
            ExitCode::Business,
        ))
    }
}

fn fix_aliases(globals: &GlobalOpts) -> Result<Value, CliError> {
    let vault = resolve_vault(globals)?;
    let report = diagnose(&vault).map_err(CliError::from)?;
    let fixable = report
        .aliases
        .candidates
        .iter()
        .filter(|candidate| candidate.fixable)
        .collect::<Vec<_>>();
    if fixable.is_empty() {
        let mut value = report_value(&report)?;
        if let Some(object) = value.as_object_mut() {
            object.insert("updatedPaths".into(), json!([]));
            object.insert("lines".into(), json!(["no safe alias repairs available"]));
        }
        return Ok(value);
    }

    if matches!(globals.format, OutputFormat::Json) && !globals.yes {
        return Err(CliError::with_details(
            "needs_confirmation",
            "alias repair requires confirmation (pass --yes / -y to accept generated aliases)",
            json!({ "candidates": fixable }),
            ExitCode::NeedsConfirmation,
        ));
    }

    let changes = if globals.yes {
        fixable.into_iter().map(default_change).collect::<Vec<_>>()
    } else {
        edit_changes(&fixable, globals)?
    };
    if !prompt::confirm(
        globals,
        &format!("Rewrite aliases in {} paper note(s)?", changes.len()),
        false,
    )? {
        return Err(CliError::needs_confirmation("alias repair cancelled"));
    }

    let result = apply_alias_repairs(&vault, &changes, &[]).map_err(|error| {
        CliError::with_details(
            "alias_repair_failed",
            error.message.clone(),
            serde_json::to_value(error).unwrap_or_default(),
            ExitCode::Business,
        )
    })?;
    let mut value = to_value(&result)?;
    if let Some(object) = value.as_object_mut() {
        object.insert(
            "lines".into(),
            json!([format!(
                "updated aliases in {} paper note(s)",
                result.updated_paths.len()
            )]),
        );
    }
    Ok(value)
}

fn default_change(candidate: &AliasRepairCandidate) -> AliasRepairChange {
    AliasRepairChange {
        path: candidate.path.clone(),
        title_alias: candidate.title_alias.clone(),
        short_alias: candidate.short_alias.clone(),
        expected_hash: candidate.expected_hash.clone(),
    }
}

fn edit_changes(
    candidates: &[&AliasRepairCandidate],
    globals: &GlobalOpts,
) -> Result<Vec<AliasRepairChange>, CliError> {
    let mut changes = Vec::new();
    for candidate in candidates {
        eprintln!("\n{}", candidate.path);
        if !candidate.current_aliases.is_empty() {
            eprintln!(
                "  preserved aliases: {}",
                candidate.current_aliases.join(", ")
            );
        }
        let title_alias = prompt::text(globals, "Title alias", &candidate.title_alias)?;
        let short_alias = prompt::text(globals, "Short alias", &candidate.short_alias)?;
        changes.push(AliasRepairChange {
            path: candidate.path.clone(),
            title_alias,
            short_alias,
            expected_hash: candidate.expected_hash.clone(),
        });
    }
    Ok(changes)
}

fn fix_visual_marks(globals: &GlobalOpts) -> Result<Value, CliError> {
    let vault = resolve_vault(globals)?;
    let report = diagnose(&vault).map_err(CliError::from)?;
    let fixable = report
        .visual_marks
        .candidates
        .iter()
        .filter(|candidate| candidate.fixable)
        .collect::<Vec<_>>();
    if fixable.is_empty() {
        let mut value = report_value(&report)?;
        if let Some(object) = value.as_object_mut() {
            object.insert("updatedPaths".into(), json!([]));
            object.insert("lines".into(), json!(["no legacy visual marks to migrate"]));
        }
        return Ok(value);
    }

    if matches!(globals.format, OutputFormat::Json) && !globals.yes {
        return Err(CliError::with_details(
            "needs_confirmation",
            "visual mark migration requires confirmation (pass --yes / -y)",
            json!({ "candidates": fixable }),
            ExitCode::NeedsConfirmation,
        ));
    }

    if !prompt::confirm(
        globals,
        &format!(
            "Migrate {} legacy visual mark file(s) to kind visual v2?",
            fixable.len()
        ),
        false,
    )? {
        return Err(CliError::needs_confirmation(
            "visual mark migration cancelled",
        ));
    }

    let changes = fixable
        .into_iter()
        .map(|c| VisualMarkRepairChange {
            path: c.path.clone(),
        })
        .collect::<Vec<_>>();
    let result = apply_visual_mark_repairs(&vault, &changes, &[]).map_err(CliError::from)?;
    let mut value = to_value(&result)?;
    if let Some(object) = value.as_object_mut() {
        object.insert(
            "lines".into(),
            json!([format!(
                "migrated {} visual mark file(s)",
                result.updated_paths.len()
            )]),
        );
    }
    Ok(value)
}

fn fix_catalog_duplicates(globals: &GlobalOpts) -> Result<Value, CliError> {
    let vault = resolve_vault(globals)?;
    let report = diagnose(&vault).map_err(CliError::from)?;
    let dup_report = report.catalog.duplicate_report.as_ref();
    let has_duplicates =
        dup_report.is_some_and(|d| !d.duplicate_ids.is_empty() || !d.duplicate_paths.is_empty());

    if !has_duplicates {
        let mut value = report_value(&report)?;
        if let Some(object) = value.as_object_mut() {
            object.insert("removedRows".into(), json!(0));
            object.insert("lines".into(), json!(["no duplicate catalog rows found"]));
        }
        return Ok(value);
    }

    if matches!(globals.format, OutputFormat::Json) && !globals.yes {
        return Err(CliError::with_details(
            "needs_confirmation",
            "catalog duplicate repair requires confirmation (pass --yes / -y)",
            json!({ "duplicateReport": dup_report }),
            ExitCode::NeedsConfirmation,
        ));
    }

    let extra_rows = dup_report.map(|d| d.total_duplicate_rows).unwrap_or(0);
    if !prompt::confirm(
        globals,
        &format!(
            "Remove {extra_rows} duplicate catalog row(s), keeping one canonical row per paper?"
        ),
        false,
    )? {
        return Err(CliError::needs_confirmation(
            "catalog duplicate repair cancelled",
        ));
    }

    let result = apply_catalog_duplicate_repairs(&vault).map_err(CliError::from)?;
    let mut value = to_value(&result)?;
    if let Some(object) = value.as_object_mut() {
        object.insert(
            "lines".into(),
            json!([format!(
                "removed {} duplicate catalog row(s), kept {} canonical row(s)",
                result.removed_rows,
                result.kept_paths.len()
            )]),
        );
    }
    Ok(value)
}

fn report_value(report: &DoctorReport) -> Result<Value, CliError> {
    let mut value = to_value(report)?;
    if let Some(object) = value.as_object_mut() {
        let link_issues = report.wikilinks.issues.len();
        object.insert(
            "lines".into(),
            json!([
                format!("vault: {}", if report.vault.ok { "ok" } else { "issues" }),
                format!(
                    "catalog: {}",
                    if report.catalog.ok { "ok" } else { "issues" }
                ),
                format!("wikilinks: {link_issues} issue(s)"),
                format!(
                    "paper aliases: {}/{} complete, {} repair candidate(s)",
                    report.aliases.complete_papers,
                    report.aliases.checked_papers,
                    report.aliases.candidates.len()
                ),
                format!(
                    "visual marks: {} file(s) checked, {} legacy candidate(s)",
                    report.visual_marks.checked_files,
                    report.visual_marks.candidates.len()
                ),
            ]),
        );
    }
    Ok(value)
}

fn check_wiki(source: Option<&str>, globals: &GlobalOpts) -> Result<Value, CliError> {
    let vault = resolve_vault(globals)?;
    let scope = source.map(validate_wiki_scope).transpose()?;
    if let Some(rel) = scope.as_deref() {
        let path = vault.join(rel);
        if !path.exists() {
            return Err(CliError::message(format!("path not found: {rel}")));
        }
        if path.is_file() && !is_markdown(&path) {
            return Err(CliError::usage(
                "doctor wiki source must be a Markdown file or directory",
            ));
        }
    }

    let vault_str = vault.to_string_lossy();
    let mut index = WikiIndex::default();
    index.rebuild(&vault_str).map_err(|error| {
        CliError::with_details(
            "wiki_index_failed",
            "could not build Wiki index",
            json!({ "cause": error }),
            ExitCode::Business,
        )
    })?;
    let report = index.check_links(&vault_str, scope.as_deref());
    let mut value = to_value(&report)?;

    if !report.issues.is_empty() {
        if let Some(object) = value.as_object_mut() {
            object.insert("lines".into(), json!(wiki_issue_lines(&report.issues)));
        }
        return Err(CliError::with_details(
            "wikilink_check_failed",
            "wikilink check found unresolved or invalid links",
            value,
            ExitCode::Business,
        ));
    }

    if let Some(object) = value.as_object_mut() {
        object.insert(
            "lines".into(),
            json!([format!(
                "ok: {} Markdown file(s), {} resolved link(s)",
                report.checked_files, report.counts.resolved
            )]),
        );
    }
    Ok(value)
}

fn validate_wiki_scope(raw: &str) -> Result<String, CliError> {
    if Path::new(raw).is_absolute() {
        return Err(CliError::usage("doctor wiki source must be Vault-relative"));
    }
    sanitize_vault_rel(raw).map_err(CliError::usage)
}

fn is_markdown(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            matches!(
                extension.to_ascii_lowercase().as_str(),
                "md" | "mdx" | "markdown"
            )
        })
}

fn wiki_issue_lines(
    issues: &[agentero_core::features::wiki::models::WikiCheckIssue],
) -> Vec<String> {
    issues
        .iter()
        .map(|issue| {
            format!(
                "{}: {}:{} -> {}",
                wiki_status_label(&issue.status),
                issue.source,
                issue.line,
                issue.target_raw
            )
        })
        .collect()
}

fn wiki_status_label(status: &LinkResolutionStatus) -> &'static str {
    match status {
        LinkResolutionStatus::Resolved => "resolved",
        LinkResolutionStatus::Missing => "missing",
        LinkResolutionStatus::Ambiguous => "ambiguous",
        LinkResolutionStatus::InvalidFragment => "invalidFragment",
    }
}
