//! Core decision-layer types, traits and schema/routing definitions.
//!
//! A *decision* is a named judgement (`pdf.selection.intent`) over some
//! decision-specific `state`. The layer routes it to a *provider* (deterministic
//! rules, jEV, future LLMs) and returns a typed [`DecisionOutcome`] that records
//! which provider answered and its confidence (when it has one).
//!
//! @see docs/backend/decision.md

use crate::error::AppError;
use crate::json::JsonValue;
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

/// A single decision request crossing the IPC boundary.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct DecisionRequest {
    /// Registered decision id, e.g. `pdf.selection.intent`.
    pub decision_id: String,
    /// Decision-specific context. Shape is owned by the decision schema.
    pub state: JsonValue,
}

impl DecisionRequest {
    pub fn new(decision_id: impl Into<String>, state: Value) -> Self {
        Self {
            decision_id: decision_id.into(),
            state: JsonValue(state),
        }
    }

    /// Borrow the state as a raw JSON value.
    pub fn state_value(&self) -> &Value {
        &self.state.0
    }
}

/// A decision result: the winning provider's `action` plus provenance.
///
/// `action` is whatever the provider produced. Rule/jEV string choices arrive
/// as JSON strings (`"ignore"`), richer payloads as objects; consumers switch
/// on the shape they registered for.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct DecisionOutcome {
    pub action: JsonValue,
    /// Name of the provider that produced the action (`rule` / `jev` /
    /// `default` / `none`).
    pub provider: String,
    /// Confidence in `[0, 1]`, only present for probabilistic providers.
    pub confidence: Option<f64>,
}

impl DecisionOutcome {
    pub fn new(action: Value, provider: impl Into<String>, confidence: Option<f64>) -> Self {
        Self {
            action: JsonValue(action),
            provider: provider.into(),
            confidence,
        }
    }
}

/// Everything a provider needs to answer one routed decision.
///
/// Rules live on the schema (they are provider-agnostic), so the RuleProvider
/// reads them from here; probabilistic providers read their [`ProviderConfig`].
pub struct ProviderCall<'a> {
    pub decision_id: &'a str,
    pub state: &'a Value,
    /// Provider-specific config declared by the schema, if any.
    pub config: Option<&'a dyn ProviderConfig>,
    /// Rule chain, kept at the schema level for [`DecisionRule`] consumers.
    pub rules: &'a [Box<dyn DecisionRule>],
}

/// A module that can answer a routed decision.
#[async_trait]
pub trait DecisionProvider: Send + Sync {
    /// Stable provider name (`"rule"`, `"jev"`, ...).
    fn name(&self) -> &'static str;

    /// Answer the decision. `Ok(None)` means "no opinion" (e.g. no rule
    /// matched) and lets the engine fall through to the fallback provider.
    async fn decide(&self, call: ProviderCall<'_>) -> Result<Option<DecisionOutcome>, AppError>;
}

/// A deterministic branch: `state -> Some(action)` stops the rule chain.
pub trait DecisionRule: Send + Sync {
    fn apply(&self, state: &Value) -> Option<Value>;
}

impl<F> DecisionRule for F
where
    F: Fn(&Value) -> Option<Value> + Send + Sync,
{
    fn apply(&self, state: &Value) -> Option<Value> {
        (self)(state)
    }
}

/// Provider-specific request shape. Implementors turn the decision `state` into
/// the wire body their provider understands (jEV questions, an LLM prompt, ...).
pub trait ProviderConfig: Send + Sync {
    fn provider_name(&self) -> &'static str;

    /// Build the complete provider request body for `state`.
    fn build_request(&self, state: &Value) -> ProviderRequest;
}

/// The generic provider request envelope. `body` is provider-specific.
#[derive(Debug, Clone)]
pub struct ProviderRequest {
    pub provider: String,
    pub body: Value,
}

impl ProviderRequest {
    pub fn new(provider: impl Into<String>, body: Value) -> Self {
        Self {
            provider: provider.into(),
            body,
        }
    }
}

/// Closure-backed [`ProviderConfig`], so schemas can build requests inline.
pub struct FnProviderConfig<F> {
    name: &'static str,
    build: F,
}

impl<F> FnProviderConfig<F>
where
    F: Fn(&Value) -> ProviderRequest + Send + Sync,
{
    pub fn new(name: &'static str, build: F) -> Self {
        Self { name, build }
    }
}

impl<F> ProviderConfig for FnProviderConfig<F>
where
    F: Fn(&Value) -> ProviderRequest + Send + Sync,
{
    fn provider_name(&self) -> &'static str {
        self.name
    }

    fn build_request(&self, state: &Value) -> ProviderRequest {
        (self.build)(state)
    }
}

/// Names of the built-in providers.
pub const RULE_PROVIDER: &str = "rule";
pub const JEV_PROVIDER: &str = "jev";

/// How a decision picks its provider and when it falls back.
#[derive(Debug, Clone)]
pub struct DecisionRouting {
    /// Primary provider name, e.g. `"rule"` / `"jev"`.
    pub primary: String,
    /// Optional fallback provider, tried when the primary has no opinion or
    /// drops below [`Self::fallback_threshold`].
    pub fallback: Option<String>,
    /// Confidence below which the primary result is considered weak. Only
    /// consulted when the primary returned a confidence value.
    pub fallback_threshold: Option<f64>,
}

impl DecisionRouting {
    /// Pure rules.
    pub fn rule_only() -> Self {
        Self {
            primary: RULE_PROVIDER.to_string(),
            fallback: None,
            fallback_threshold: None,
        }
    }

    /// Pure provider (e.g. pure jEV).
    pub fn provider(primary: impl Into<String>) -> Self {
        Self {
            primary: primary.into(),
            fallback: None,
            fallback_threshold: None,
        }
    }

    /// Attach a fallback provider and optional confidence threshold.
    pub fn with_fallback(mut self, fallback: impl Into<String>, threshold: Option<f64>) -> Self {
        self.fallback = Some(fallback.into());
        self.fallback_threshold = threshold;
        self
    }
}

/// A registered decision: routing + rules + per-provider config.
pub struct DecisionSchema {
    pub id: String,
    pub description: String,
    pub routing: DecisionRouting,
    /// Rule chain, evaluated in order by [`RULE_PROVIDER`].
    pub rules: Vec<Box<dyn DecisionRule>>,
    /// Provider-specific config, keyed by provider name.
    pub provider_configs: HashMap<String, Box<dyn ProviderConfig>>,
    /// Action returned when no provider produced one.
    pub default_action: Option<Value>,
}

impl DecisionSchema {
    pub fn new(id: impl Into<String>, description: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            description: description.into(),
            routing: DecisionRouting::rule_only(),
            rules: Vec::new(),
            provider_configs: HashMap::new(),
            default_action: None,
        }
    }

    pub fn routing(mut self, routing: DecisionRouting) -> Self {
        self.routing = routing;
        self
    }

    /// Append one rule (a closure or any [`DecisionRule`]).
    pub fn rule(mut self, rule: impl DecisionRule + 'static) -> Self {
        self.rules.push(Box::new(rule));
        self
    }

    /// Register a provider-specific config; the key is its `provider_name()`.
    pub fn provider_config(mut self, config: impl ProviderConfig + 'static) -> Self {
        self.provider_configs
            .insert(config.provider_name().to_string(), Box::new(config));
        self
    }

    pub fn default_action(mut self, action: Value) -> Self {
        self.default_action = Some(action);
        self
    }
}
