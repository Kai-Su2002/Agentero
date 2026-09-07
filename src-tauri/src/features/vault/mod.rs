//! Vault tree, path services, and Vault creation.
//!
//! The tauri-free body lives in `agentero_core::features::vault`; this module
//! bridges it and keeps the desktop-only shells (commands, watcher).

pub use agentero_core::features::vault::*;

/// Tauri command shells for this feature.
#[cfg(feature = "desktop")]
pub mod commands;
pub mod doctor;
pub mod rename;
pub mod trash;
#[cfg(feature = "desktop")]
pub mod watcher;
