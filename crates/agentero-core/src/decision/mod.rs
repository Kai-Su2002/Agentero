//! Generic decision layer: one place to ask "what should happen?" and get a
//! typed answer from rules, jEV, or (later) an LLM.
//!
//! The layer is intentionally Tauri-free so the headless CLI can reuse it.
//! Business modules register [`DecisionSchema`]s at assembly time and call
//! [`DecisionEngine::decide`]; routing/fallback lives here, provider transport
//! lives in [`providers`].
//!
//! @see docs/backend/decision.md

pub mod engine;
pub mod providers;
pub mod registry;
pub mod types;

pub use engine::{DecisionEngine, DecisionEngineBuilder};
pub use providers::{JevCredentials, JevProvider, RuleProvider, JEV_MODEL};
pub use registry::DecisionRegistry;
pub use types::{
    DecisionOutcome, DecisionProvider, DecisionRequest, DecisionRouting, DecisionRule,
    DecisionSchema, FnProviderConfig, ProviderCall, ProviderConfig, ProviderRequest, JEV_PROVIDER,
    RULE_PROVIDER,
};

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::AppError;
    use async_trait::async_trait;
    use serde_json::{json, Value};
    use std::sync::Arc;

    /// Stub provider returning a fixed outcome (or error) for routing tests.
    struct StubProvider {
        name: &'static str,
        outcome: Result<Option<DecisionOutcome>, AppError>,
    }

    #[async_trait]
    impl DecisionProvider for StubProvider {
        fn name(&self) -> &'static str {
            self.name
        }

        async fn decide(
            &self,
            _call: ProviderCall<'_>,
        ) -> Result<Option<DecisionOutcome>, AppError> {
            match &self.outcome {
                Ok(Some(outcome)) => Ok(Some(outcome.clone())),
                Ok(None) => Ok(None),
                Err(err) => Err(AppError::message(err.to_string())),
            }
        }
    }

    fn stub(
        name: &'static str,
        action: Value,
        confidence: Option<f64>,
    ) -> Arc<dyn DecisionProvider> {
        Arc::new(StubProvider {
            name,
            outcome: Ok(Some(DecisionOutcome::new(action, name, confidence))),
        })
    }

    fn empty_stub(name: &'static str) -> Arc<dyn DecisionProvider> {
        Arc::new(StubProvider {
            name,
            outcome: Ok(None),
        })
    }

    fn error_stub(name: &'static str) -> Arc<dyn DecisionProvider> {
        Arc::new(StubProvider {
            name,
            outcome: Err(AppError::message("boom")),
        })
    }

    fn request(id: &str) -> DecisionRequest {
        DecisionRequest::new(id, json!({ "selectedText": "hello" }))
    }

    #[tokio::test]
    async fn rule_primary_matches_first_rule() {
        let schema = DecisionSchema::new("t.rule", "test").rule(|state: &Value| {
            state
                .get("selectedText")
                .and_then(Value::as_str)
                .map(|_| json!("matched"))
        });
        let engine = DecisionEngine::builder()
            .provider(Arc::new(RuleProvider::new()))
            .register(schema)
            .build();

        let outcome = engine.decide(&request("t.rule")).await.expect("decide");
        assert_eq!(outcome.action.0, json!("matched"));
        assert_eq!(outcome.provider, RULE_PROVIDER);
        assert_eq!(outcome.confidence, None);
    }

    #[tokio::test]
    async fn rule_miss_falls_through_to_default() {
        let schema = DecisionSchema::new("t.default", "test")
            .rule(|_: &Value| None)
            .default_action(json!("fallback"));
        let engine = DecisionEngine::builder()
            .provider(Arc::new(RuleProvider::new()))
            .register(schema)
            .build();

        let outcome = engine.decide(&request("t.default")).await.expect("decide");
        assert_eq!(outcome.action.0, json!("fallback"));
        assert_eq!(outcome.provider, "default");
    }

    #[tokio::test]
    async fn low_confidence_primary_falls_back() {
        let schema = DecisionSchema::new("t.low", "test")
            .routing(DecisionRouting::provider("primary").with_fallback(RULE_PROVIDER, Some(0.75)))
            .rule(|_: &Value| Some(json!("rule")));
        let engine = DecisionEngine::builder()
            .provider(stub("primary", json!("weak"), Some(0.2)))
            .provider(Arc::new(RuleProvider::new()))
            .register(schema)
            .build();

        let outcome = engine.decide(&request("t.low")).await.expect("decide");
        assert_eq!(outcome.action.0, json!("rule"));
        assert_eq!(outcome.provider, RULE_PROVIDER);
    }

    #[tokio::test]
    async fn confident_primary_skips_fallback() {
        let schema = DecisionSchema::new("t.high", "test")
            .routing(DecisionRouting::provider("primary").with_fallback(RULE_PROVIDER, Some(0.75)))
            .rule(|_: &Value| Some(json!("rule")));
        let engine = DecisionEngine::builder()
            .provider(stub("primary", json!("strong"), Some(0.95)))
            .provider(Arc::new(RuleProvider::new()))
            .register(schema)
            .build();

        let outcome = engine.decide(&request("t.high")).await.expect("decide");
        assert_eq!(outcome.action.0, json!("strong"));
        assert_eq!(outcome.provider, "primary");
    }

    #[tokio::test]
    async fn rule_miss_falls_through_to_provider_fallback() {
        let schema = DecisionSchema::new("t.chain", "test")
            .routing(DecisionRouting::rule_only().with_fallback("primary", None))
            .rule(|_: &Value| None);
        let engine = DecisionEngine::builder()
            .provider(Arc::new(RuleProvider::new()))
            .provider(stub("primary", json!("provider"), Some(0.9)))
            .register(schema)
            .build();

        let outcome = engine.decide(&request("t.chain")).await.expect("decide");
        assert_eq!(outcome.action.0, json!("provider"));
    }

    #[tokio::test]
    async fn primary_error_uses_fallback_when_configured() {
        let schema = DecisionSchema::new("t.err", "test")
            .routing(DecisionRouting::provider("broken").with_fallback(RULE_PROVIDER, None))
            .rule(|_: &Value| Some(json!("rule")));
        let engine = DecisionEngine::builder()
            .provider(error_stub("broken"))
            .provider(Arc::new(RuleProvider::new()))
            .register(schema)
            .build();

        let outcome = engine.decide(&request("t.err")).await.expect("decide");
        assert_eq!(outcome.action.0, json!("rule"));
    }

    #[tokio::test]
    async fn primary_error_without_fallback_propagates() {
        let schema =
            DecisionSchema::new("t.err2", "test").routing(DecisionRouting::provider("broken"));
        let engine = DecisionEngine::builder()
            .provider(error_stub("broken"))
            .register(schema)
            .build();

        assert!(engine.decide(&request("t.err2")).await.is_err());
    }

    #[tokio::test]
    async fn fallback_miss_keeps_weak_primary() {
        let schema = DecisionSchema::new("t.keep", "test")
            .routing(DecisionRouting::provider("primary").with_fallback("empty", Some(0.75)));
        let engine = DecisionEngine::builder()
            .provider(stub("primary", json!("weak"), Some(0.2)))
            .provider(empty_stub("empty"))
            .register(schema)
            .build();

        let outcome = engine.decide(&request("t.keep")).await.expect("decide");
        assert_eq!(outcome.action.0, json!("weak"));
    }

    #[tokio::test]
    async fn unknown_decision_is_an_error() {
        let engine = DecisionEngine::builder().build();
        assert!(engine.decide(&request("missing")).await.is_err());
    }
}
