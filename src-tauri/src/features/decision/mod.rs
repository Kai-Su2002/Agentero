//! Host assembly for the generic decision layer.
//!
//! Builds the shared [`DecisionEngine`] (rules + jEV) and the [`JevProvider`]
//! that the smart-highlight stream also uses as its transport.

pub mod commands;
mod schemas;

use crate::core::decision::{DecisionEngine, JevCredentials, JevProvider, RuleProvider};
use crate::core::error::AppError;
use crate::features::system::settings::AppSettingsStore;
use std::sync::Arc;
use tauri::Manager;

/// Build the process-wide decision engine and the shared jEV provider.
///
/// The provider reads credentials lazily at request time, so settings changes
/// take effect without rebuilding the engine.
pub fn build(handle: tauri::AppHandle) -> (DecisionEngine, Arc<JevProvider>) {
    let jev = Arc::new(JevProvider::with_shared_client({
        let handle = handle.clone();
        move || {
            let store = handle.state::<AppSettingsStore>();
            match store.jev_config() {
                Some((api_key, base_url)) => Ok(JevCredentials { api_key, base_url }),
                None => Err(AppError::message("jEV API key is not configured")),
            }
        }
    }));

    let mut builder = DecisionEngine::builder().provider(Arc::new(RuleProvider::new()));
    builder = builder.provider(jev.clone());
    for schema in schemas::all() {
        builder = builder.register(schema);
    }

    (builder.build(), jev)
}
