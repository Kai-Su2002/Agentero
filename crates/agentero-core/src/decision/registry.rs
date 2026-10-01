//! In-memory registry of decision schemas.

use super::types::DecisionSchema;
use std::collections::HashMap;

/// Stores decision schemas by id. Registration is explicit: a decision only
/// exists once a business module registers it at assembly time.
#[derive(Default)]
pub struct DecisionRegistry {
    schemas: HashMap<String, DecisionSchema>,
}

impl DecisionRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    /// Register a schema, replacing any previous definition with the same id.
    pub fn register(&mut self, schema: DecisionSchema) -> Option<DecisionSchema> {
        self.schemas.insert(schema.id.clone(), schema)
    }

    pub fn get(&self, id: &str) -> Option<&DecisionSchema> {
        self.schemas.get(id)
    }

    /// Registered ids, sorted for stable output.
    pub fn ids(&self) -> Vec<&str> {
        let mut ids: Vec<&str> = self.schemas.keys().map(String::as_str).collect();
        ids.sort_unstable();
        ids
    }

    pub fn is_empty(&self) -> bool {
        self.schemas.is_empty()
    }
}
