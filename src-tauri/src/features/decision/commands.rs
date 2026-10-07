//! Tauri command surface for the decision layer.

use crate::core::decision::{DecisionEngine, DecisionOutcome, DecisionRequest};
use crate::core::error::{map_err, ApiResult};
use crate::core::json::JsonValue;
use serde::Deserialize;
use tauri::State;

#[derive(Debug, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct DecideArgs {
    /// Registered decision id, e.g. `pdf.selection.intent`.
    pub decision_id: String,
    /// Decision-specific state.
    pub state: JsonValue,
}

/// Run one registered decision through the engine (rules + jEV + fallback).
#[tauri::command]
#[specta::specta]
pub async fn decide(
    engine: State<'_, DecisionEngine>,
    args: DecideArgs,
) -> Result<ApiResult<DecisionOutcome>, String> {
    let request = DecisionRequest {
        decision_id: args.decision_id,
        state: args.state,
    };
    match engine.decide(&request).await {
        Ok(outcome) => Ok(ApiResult::ok(outcome)),
        Err(err) => Ok(map_err(err)),
    }
}
