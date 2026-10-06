//! Query-first arXiv discovery.
//!
//! Given a topic (keywords), a category set, and/or a submission-date window,
//! fetch candidates from the arXiv Atom API and rank them with a
//! **deterministic lexical scorer** — no embedding endpoint, no API key, no
//! catalog. This is the headless "抓当天 arXiv + 关键词排序" primitive that the
//! CLI / Agent can drive; the desktop plaza panel's library-profile ranking is
//! a separate concern.
//!
//! The score is explainable: every item carries the terms that matched and how
//! much each contributed (title hits weigh more than abstract hits).

use serde::{Deserialize, Serialize};

use crate::error::AppError;
use crate::features::scholar_api::sources::arxiv;
use crate::features::scholar_api::ApiPaper;

/// Title term weight — a title hit is a stronger topic signal than an abstract
/// hit, mirroring the classic keyword shortlist heuristic.
const TITLE_WEIGHT: f32 = 3.0;
/// Abstract term weight.
const ABSTRACT_WEIGHT: f32 = 1.0;
/// Candidates scanned when the caller does not cap them.
pub const DEFAULT_MAX_CANDIDATES: usize = 100;
/// Shortlist size when the caller does not ask for a specific one.
pub const DEFAULT_TOP: usize = 8;

/// A discovery request. At least one keyword or category is required; a date
/// window alone would scan an unbounded slice of arXiv.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoverQuery {
    /// Topic terms / phrases (repeatable).
    #[serde(default)]
    pub keywords: Vec<String>,
    /// arXiv categories, e.g. `cs.AI`.
    #[serde(default)]
    pub categories: Vec<String>,
    /// Only papers submitted on/after this date (`YYYY-MM-DD`).
    #[serde(default)]
    pub since: Option<String>,
    /// Only papers submitted on/before this date (`YYYY-MM-DD`).
    #[serde(default)]
    pub until: Option<String>,
    /// Shortlist size.
    #[serde(default)]
    pub top: Option<usize>,
    /// Max candidates fetched before ranking.
    #[serde(default)]
    pub max_candidates: Option<usize>,
}

/// One term's contribution to an item's score (for explainability).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoreTerm {
    pub term: String,
    /// `"title"` or `"abstract"`.
    pub field: String,
    pub count: u32,
    pub weight: f32,
    pub contribution: f32,
}

/// A ranked discovery candidate.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoverItem {
    pub arxiv_id: String,
    pub title: String,
    #[serde(rename = "abstract")]
    pub abstract_text: String,
    pub url: String,
    pub pdf_url: Option<String>,
    pub published_at: Option<String>,
    pub score: f32,
    /// Non-empty matchers, highest-contribution first is not guaranteed.
    pub matches: Vec<ScoreTerm>,
}

/// Result of one discovery run.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoverResult {
    pub source: String,
    /// Echo of the request (with resolved defaults omitted).
    pub query: DiscoverQuery,
    /// The raw arXiv `search_query` expression, for transparency/replay.
    pub search_query: String,
    /// Candidates fetched before ranking.
    pub candidates_scanned: usize,
    pub computed_at: String,
    pub items: Vec<DiscoverItem>,
}

/// Fetch + rank arXiv candidates for `query`.
///
/// Network-only: does not touch the Vault or catalog, so it works headless and
/// without an embedding provider configured.
pub async fn discover_arxiv(query: &DiscoverQuery) -> Result<DiscoverResult, AppError> {
    let search_query = build_search_query(query)?;
    let max_candidates = query
        .max_candidates
        .unwrap_or(DEFAULT_MAX_CANDIDATES)
        .clamp(1, 200);
    let top = query.top.unwrap_or(DEFAULT_TOP).clamp(1, max_candidates);

    let papers = arxiv::query_atom(&search_query, 0, max_candidates).await?;
    let candidates_scanned = papers.len();
    let items = rank(papers, &query.keywords, top);

    Ok(DiscoverResult {
        source: "arxiv".to_string(),
        query: query.clone(),
        search_query,
        candidates_scanned,
        computed_at: crate::time::now_rfc3339_millis(),
        items,
    })
}

/// Compose the arXiv `search_query` expression from keywords / categories /
/// submission-date bounds. Pure so it is unit-testable without the network.
fn build_search_query(query: &DiscoverQuery) -> Result<String, AppError> {
    let mut clauses: Vec<String> = Vec::new();

    for keyword in &query.keywords {
        let keyword = keyword.trim();
        if keyword.is_empty() {
            continue;
        }
        if keyword.chars().any(char::is_whitespace) {
            // Multi-word phrase → quoted so arXiv treats it as one unit.
            clauses.push(format!("all:\"{}\"", keyword.replace('"', " ")));
        } else {
            clauses.push(format!("all:{keyword}"));
        }
    }

    for category in &query.categories {
        let category = category.trim();
        if !category.is_empty() {
            clauses.push(format!("cat:{category}"));
        }
    }

    let from = query
        .since
        .as_deref()
        .map(|d| date_bound(d, false))
        .transpose()?;
    let to = query
        .until
        .as_deref()
        .map(|d| date_bound(d, true))
        .transpose()?;
    match (from, to) {
        (Some(from), Some(to)) => clauses.push(format!("submittedDate:[{from} TO {to}]")),
        (Some(from), None) => clauses.push(format!("submittedDate:[{from} TO 999912312359]")),
        (None, Some(to)) => clauses.push(format!("submittedDate:[000001010000 TO {to}]")),
        (None, None) => {}
    }

    if clauses.is_empty() {
        return Err(AppError::domain(
            "usage",
            "discover: provide at least one keyword or category",
        ));
    }
    Ok(clauses.join(" AND "))
}

/// `YYYY-MM-DD` → arXiv `submittedDate` bound (`YYYYMMDD0000` / `YYYYMMDD2359`).
fn date_bound(date: &str, end: bool) -> Result<String, AppError> {
    let parsed = chrono::NaiveDate::parse_from_str(date.trim(), "%Y-%m-%d").map_err(|_| {
        AppError::domain(
            "usage",
            format!("discover: invalid date '{date}' (expected YYYY-MM-DD)"),
        )
    })?;
    let suffix = if end { "2359" } else { "0000" };
    Ok(format!("{}{suffix}", parsed.format("%Y%m%d")))
}

/// Lowercased, de-duplicated, non-empty query terms.
fn normalize_terms(keywords: &[String]) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for keyword in keywords {
        let term = keyword.trim().to_lowercase().replace('"', "");
        if term.is_empty() || out.iter().any(|existing| existing == &term) {
            continue;
        }
        out.push(term);
    }
    out
}

fn count_occurrences(haystack: &str, needle: &str) -> u32 {
    if needle.is_empty() {
        return 0;
    }
    haystack.matches(needle).count() as u32
}

/// Rank candidates against the keyword terms. With no keywords every score is
/// zero, so the submission-date ordering (newest first, from the query sort)
/// is preserved by the tie-break.
fn rank(papers: Vec<ApiPaper>, keywords: &[String], top: usize) -> Vec<DiscoverItem> {
    let terms = normalize_terms(keywords);

    let mut items: Vec<DiscoverItem> = papers
        .into_iter()
        .map(|paper| {
            let title = paper.title.trim().to_string();
            let abstract_text = paper.abstract_text.unwrap_or_default().trim().to_string();
            let title_lower = title.to_lowercase();
            let abstract_lower = abstract_text.to_lowercase();

            let mut matches: Vec<ScoreTerm> = Vec::new();
            let mut score = 0.0_f32;
            for term in &terms {
                let title_hits = count_occurrences(&title_lower, term);
                let abstract_hits = count_occurrences(&abstract_lower, term);
                if title_hits == 0 && abstract_hits == 0 {
                    continue;
                }
                if title_hits > 0 {
                    let contribution = title_hits as f32 * TITLE_WEIGHT;
                    score += contribution;
                    matches.push(ScoreTerm {
                        term: term.clone(),
                        field: "title".to_string(),
                        count: title_hits,
                        weight: TITLE_WEIGHT,
                        contribution,
                    });
                }
                if abstract_hits > 0 {
                    let contribution = abstract_hits as f32 * ABSTRACT_WEIGHT;
                    score += contribution;
                    matches.push(ScoreTerm {
                        term: term.clone(),
                        field: "abstract".to_string(),
                        count: abstract_hits,
                        weight: ABSTRACT_WEIGHT,
                        contribution,
                    });
                }
            }

            DiscoverItem {
                arxiv_id: paper.identifiers.arxiv_id.unwrap_or_default(),
                title,
                abstract_text,
                url: paper.urls.landing.unwrap_or_default(),
                pdf_url: paper.urls.pdf,
                published_at: paper.date,
                score,
                matches,
            }
        })
        .collect();

    items.sort_by(|a, b| {
        b.score
            .total_cmp(&a.score)
            .then_with(|| b.published_at.cmp(&a.published_at))
            .then_with(|| a.title.cmp(&b.title))
    });
    items.truncate(top);
    items
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::features::scholar_api::{PaperIdentifiers, PaperUrls};

    fn paper(id: &str, title: &str, abstract_text: &str, date: &str) -> ApiPaper {
        ApiPaper {
            identifiers: PaperIdentifiers {
                arxiv_id: Some(id.to_string()),
                ..Default::default()
            },
            title: title.to_string(),
            abstract_text: Some(abstract_text.to_string()),
            date: Some(date.to_string()),
            urls: PaperUrls {
                landing: Some(format!("https://arxiv.org/abs/{id}")),
                pdf: Some(format!("https://arxiv.org/pdf/{id}")),
                ..Default::default()
            },
            source: "arxiv",
            ..Default::default()
        }
    }

    #[test]
    fn builds_keyword_category_and_date_clauses() {
        let query = DiscoverQuery {
            keywords: vec!["agent".into(), "world model".into()],
            categories: vec!["cs.AI".into()],
            since: Some("2026-08-01".into()),
            until: Some("2026-08-07".into()),
            ..Default::default()
        };
        assert_eq!(
            build_search_query(&query).unwrap(),
            "all:agent AND all:\"world model\" AND cat:cs.AI \
             AND submittedDate:[202608010000 TO 202608072359]"
        );
    }

    #[test]
    fn date_bound_rejects_bad_dates() {
        let err = build_search_query(&DiscoverQuery {
            keywords: vec!["agent".into()],
            since: Some("2026/08/01".into()),
            ..Default::default()
        })
        .unwrap_err();
        assert_eq!(err.code(), "usage");
    }

    #[test]
    fn empty_query_is_usage_error() {
        let err = build_search_query(&DiscoverQuery::default()).unwrap_err();
        assert_eq!(err.code(), "usage");
    }

    #[test]
    fn title_hits_outweigh_abstract_hits() {
        let candidates = vec![
            paper("1", "agentic search", "", "2026-08-01T00:00:00Z"),
            paper(
                "2",
                "unrelated",
                "we study agent behaviour",
                "2026-08-02T00:00:00Z",
            ),
        ];
        let ranked = rank(candidates, &["agent".to_string()], 8);
        assert_eq!(ranked[0].arxiv_id, "1");
        assert!(ranked[0].score > ranked[1].score);
        // Title match carries the 3x weight.
        assert_eq!(ranked[0].matches[0].field, "title");
        assert_eq!(ranked[0].matches[0].weight, TITLE_WEIGHT);
    }

    #[test]
    fn no_keywords_preserve_newest_first() {
        let candidates = vec![
            paper("old", "a", "", "2026-08-01T00:00:00Z"),
            paper("new", "b", "", "2026-08-05T00:00:00Z"),
        ];
        let ranked = rank(candidates, &[], 8);
        assert_eq!(ranked[0].arxiv_id, "new");
    }

    #[test]
    fn rank_truncates_to_top() {
        let candidates = (0..10)
            .map(|i| paper(&i.to_string(), "agent", "", "2026-08-01T00:00:00Z"))
            .collect();
        assert_eq!(rank(candidates, &["agent".to_string()], 3).len(), 3);
    }

    #[test]
    fn phrase_term_matches_contiguous_text() {
        let candidates = vec![paper(
            "1",
            "a world model for agents",
            "",
            "2026-08-01T00:00:00Z",
        )];
        let ranked = rank(candidates, &["world model".to_string()], 8);
        assert!(!ranked[0].matches.is_empty());
    }
}
