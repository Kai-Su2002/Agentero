//! Coordinated Vault rename (folder/heading rename across wiki links).
//!
//! Body in `agentero_core::features::vault::rename`; desktop command shell here.

pub use agentero_core::features::vault::rename::*;

#[cfg(feature = "desktop")]
pub mod commands;
