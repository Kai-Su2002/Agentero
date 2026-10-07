//! Host assembly for the generic decision layer.
//!
//! Builds the shared [`DecisionEngine`] (rules + System One) and the
//! [`SystemOneProvider`] that the smart-highlight stream also uses as its
//! transport. The provider reads credentials lazily at request time, so
//! settings changes take effect without rebuilding the engine.

pub mod commands;
mod schemas;

use crate::core::decision::{DecisionEngine, RuleProvider, SystemOneProvider};
use crate::core::error::AppError;
use crate::features::system::settings::AppSettingsStore;
use std::sync::Arc;
use tauri::Manager;

/// Build the process-wide decision engine and the shared System One provider.
pub fn build(handle: tauri::AppHandle) -> (DecisionEngine, Arc<SystemOneProvider>) {
    let provider = Arc::new(SystemOneProvider::with_shared_client({
        let handle = handle.clone();
        move || {
            let store = handle.state::<AppSettingsStore>();
            store
                .decision_config()
                .ok_or_else(|| AppError::message("decision provider API key is not configured"))
        }
    }));

    let mut builder = DecisionEngine::builder().provider(Arc::new(RuleProvider::new()));
    builder = builder.provider(provider.clone());
    for schema in schemas::all() {
        builder = builder.register(schema);
    }

    (builder.build(), provider)
}
