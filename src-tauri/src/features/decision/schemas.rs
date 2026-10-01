//! Decision schemas registered by the desktop Host.
//!
//! Each schema declares *where* the decision routes and *how* the jEV provider
//! should phrase its questions. Rules stay deterministic and cheap; jEV only
//! handles the genuinely semantic cases (intent, tagging).

use crate::core::decision::{
    DecisionRouting, DecisionSchema, FnProviderConfig, ProviderRequest, JEV_PROVIDER, RULE_PROVIDER,
};
use serde_json::{json, Value};

/// `pdf.selection.intent`: what does the user most likely want from a selection?
///
/// jEV picks among the existing toolbar actions; low confidence (or no key)
/// falls back to rules that at least drop empty selections.
pub fn pdf_selection_intent() -> DecisionSchema {
    DecisionSchema::new(
        "pdf.selection.intent",
        "Decide the most likely intent when the user selects text in a PDF",
    )
    .routing(DecisionRouting::provider(JEV_PROVIDER).with_fallback(RULE_PROVIDER, Some(0.75)))
    .rule(|state: &Value| {
        let text = state
            .get("selectedText")
            .and_then(Value::as_str)
            .unwrap_or("");
        if text.trim().is_empty() {
            Some(json!("ignore"))
        } else {
            None
        }
    })
    .provider_config(FnProviderConfig::new(JEV_PROVIDER, |state: &Value| {
        let selected = state
            .get("selectedText")
            .and_then(Value::as_str)
            .unwrap_or("");
        ProviderRequest::new(
            JEV_PROVIDER,
            json!({
                "state": { "selected_text": selected },
                "model": crate::core::decision::JEV_MODEL,
                "questions": {
                    "intent": {
                        "type": "choice",
                        "instructions": format!(
                            "The user selected the following text in a PDF: \"{selected}\". What is their most likely intent?"
                        ),
                        "options": {
                            "ask": "Ask a question about this content",
                            "translate": "Translate it",
                            "highlight": "Highlight it",
                            "addToChat": "Use it as context in a chat",
                            "ignore": "No clear intent"
                        }
                    }
                }
            }),
        )
    }))
    .default_action(json!("ignore"))
}

/// `paper.auto-tag`: suggest a primary research area from title + abstract.
pub fn paper_auto_tag() -> DecisionSchema {
    DecisionSchema::new(
        "paper.auto-tag",
        "Suggest a primary research area for a paper from its title and abstract",
    )
    .routing(DecisionRouting::provider(JEV_PROVIDER))
    .provider_config(FnProviderConfig::new(JEV_PROVIDER, |state: &Value| {
        let title = state.get("title").and_then(Value::as_str).unwrap_or("");
        let abstract_text = state.get("abstract").and_then(Value::as_str).unwrap_or("");
        ProviderRequest::new(
            JEV_PROVIDER,
            json!({
                "state": { "title": title, "abstract": abstract_text },
                "model": crate::core::decision::JEV_MODEL,
                "questions": {
                    "primary-tag": {
                        "type": "choice",
                        "instructions": "What is the primary research area of this paper?",
                        "options": {
                            "nlp": "Natural language processing",
                            "cv": "Computer vision",
                            "rl": "Reinforcement learning",
                            "systems": "Systems and infrastructure",
                            "theory": "Theory"
                        }
                    }
                }
            }),
        )
    }))
}

/// All schemas registered by the Host.
pub fn all() -> Vec<DecisionSchema> {
    vec![pdf_selection_intent(), paper_auto_tag()]
}
