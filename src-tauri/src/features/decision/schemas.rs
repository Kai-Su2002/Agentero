//! Decision schemas registered by the desktop Host.
//!
//! Each schema declares *where* the decision routes and *how* the System One
//! provider should phrase its questions. Rules stay deterministic and cheap;
//! the provider only handles the genuinely semantic cases (intent, tagging).
//! The concrete endpoint + model come from settings, not from here.

use crate::core::decision::{
    DecisionRouting, DecisionSchema, FallbackThreshold, FnProviderConfig, ProviderRequest,
    DEFAULT_SYSTEM_ONE_MODEL, RULE_PROVIDER, SYSTEM_ONE_PROVIDER,
};
use serde_json::{json, Value};

/// `pdf.selection.intent`: what does the user most likely want from a selection?
///
/// The provider picks among the existing toolbar actions; low confidence (or no
/// key) falls back to rules that at least drop empty selections.
pub fn pdf_selection_intent() -> DecisionSchema {
    DecisionSchema::new(
        "pdf.selection.intent",
        "Decide the most likely intent when the user selects text in a PDF",
    )
    .routing(
        DecisionRouting::provider(SYSTEM_ONE_PROVIDER).with_fallback(
            RULE_PROVIDER,
            // Threshold is calibrated for the default jEV model; switching the
            // configured model/provider disables the confidence-based fallback
            // until it is re-calibrated.
            Some(
                FallbackThreshold::for_provider(SYSTEM_ONE_PROVIDER, 0.75)
                    .model_version(DEFAULT_SYSTEM_ONE_MODEL),
            ),
        ),
    )
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
    .provider_config(FnProviderConfig::new(
        SYSTEM_ONE_PROVIDER,
        |state: &Value| {
            let selected = state
                .get("selectedText")
                .and_then(Value::as_str)
                .unwrap_or("");
            ProviderRequest::new(
                SYSTEM_ONE_PROVIDER,
                json!({
                    "state": { "selected_text": selected },
                    "questions": {
                        "intent": {
                            "type": "choice",
                            "instructions": format!(
                                "The user selected the following text in a PDF: \"{selected}\". What is their most likely intent?"
                            ),
                            "criteria": {
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
        },
    ))
    .default_action(json!("ignore"))
}

/// `paper.auto-tag`: suggest a primary research area from title + abstract.
pub fn paper_auto_tag() -> DecisionSchema {
    DecisionSchema::new(
        "paper.auto-tag",
        "Suggest a primary research area for a paper from its title and abstract",
    )
    .routing(DecisionRouting::provider(SYSTEM_ONE_PROVIDER))
    .provider_config(FnProviderConfig::new(
        SYSTEM_ONE_PROVIDER,
        |state: &Value| {
            let title = state.get("title").and_then(Value::as_str).unwrap_or("");
            let abstract_text = state.get("abstract").and_then(Value::as_str).unwrap_or("");
            ProviderRequest::new(
                SYSTEM_ONE_PROVIDER,
                json!({
                    "state": { "title": title, "abstract": abstract_text },
                    "questions": {
                        "primary-tag": {
                            "type": "choice",
                            "instructions": "What is the primary research area of this paper?",
                            "criteria": {
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
        },
    ))
}

/// All schemas registered by the Host.
pub fn all() -> Vec<DecisionSchema> {
    vec![pdf_selection_intent(), paper_auto_tag()]
}
