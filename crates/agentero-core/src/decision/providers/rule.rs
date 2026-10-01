//! Rule provider: runs the schema's deterministic rule chain.

use super::super::types::{DecisionOutcome, DecisionProvider, ProviderCall, RULE_PROVIDER};
use crate::error::AppError;
use async_trait::async_trait;

/// Evaluates [`crate::decision::DecisionRule`]s in registration order; the
/// first rule returning `Some(action)` wins. Rules carry no confidence.
#[derive(Default)]
pub struct RuleProvider;

impl RuleProvider {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl DecisionProvider for RuleProvider {
    fn name(&self) -> &'static str {
        RULE_PROVIDER
    }

    async fn decide(&self, call: ProviderCall<'_>) -> Result<Option<DecisionOutcome>, AppError> {
        for rule in call.rules {
            if let Some(action) = rule.apply(call.state) {
                return Ok(Some(DecisionOutcome::new(action, RULE_PROVIDER, None)));
            }
        }
        Ok(None)
    }
}
