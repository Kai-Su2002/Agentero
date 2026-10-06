//! jEV (TypeSafe System One) provider.
//!
//! Wraps the HTTP transport for jEV's `state + questions -> answers` API and
//! the generic interpretation of answers into a [`DecisionOutcome`]. The
//! highlight stream keeps its domain-specific batching/geometry in
//! `features::jev`, but sends every request through [`JevProvider::complete`]
//! so credentials and error handling live in exactly one place.

use super::super::types::{DecisionOutcome, DecisionProvider, ProviderCall, JEV_PROVIDER};
use super::system_one::interpret_answers;
use crate::error::AppError;
use crate::http;
use async_trait::async_trait;
use serde_json::Value;
use std::sync::Arc;
use std::time::Duration;

/// Default jEV model sent with every request.
pub const JEV_MODEL: &str = "jev-latest";

/// Resolved jEV credentials.
#[derive(Debug, Clone)]
pub struct JevCredentials {
    pub api_key: String,
    pub base_url: String,
}

/// Supplies credentials at request time (read from settings).
pub type JevAuth = dyn Fn() -> Result<JevCredentials, AppError> + Send + Sync;

/// HTTP client + credential source for the jEV API.
pub struct JevProvider {
    client: reqwest::Client,
    auth: Arc<JevAuth>,
}

impl JevProvider {
    pub fn new(
        client: reqwest::Client,
        auth: impl Fn() -> Result<JevCredentials, AppError> + Send + Sync + 'static,
    ) -> Self {
        Self {
            client,
            auth: Arc::new(auth),
        }
    }

    /// Build a provider backed by the shared pool with a request timeout.
    pub fn with_shared_client(
        auth: impl Fn() -> Result<JevCredentials, AppError> + Send + Sync + 'static,
    ) -> Self {
        let client =
            http::client(Duration::from_secs(120)).unwrap_or_else(|_| reqwest::Client::new());
        Self::new(client, auth)
    }

    fn credentials(&self) -> Result<JevCredentials, AppError> {
        (self.auth)()
    }

    /// POST a raw jEV body and return the decoded JSON response.
    ///
    /// This is the single transport entry point: the generic [`DecisionProvider`]
    /// path and the smart-highlight stream both call it.
    pub async fn complete(&self, body: Value) -> Result<Value, AppError> {
        let creds = self.credentials()?;
        if creds.api_key.trim().is_empty() {
            return Err(AppError::message("jEV API key is not configured"));
        }

        let resp = self
            .client
            .post(creds.base_url.trim())
            .header("Authorization", format!("Bearer {}", creds.api_key))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| AppError::message(format!("jEV request failed: {e}")))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp
                .text()
                .await
                .unwrap_or_else(|_| "<could not read body>".to_string());
            return Err(AppError::message(format!(
                "jEV API error {}: {}",
                status, body
            )));
        }

        resp.json::<Value>()
            .await
            .map_err(|e| AppError::message(format!("jEV response decode failed: {e}")))
    }
}

#[async_trait]
impl DecisionProvider for JevProvider {
    fn name(&self) -> &'static str {
        JEV_PROVIDER
    }

    async fn decide(&self, call: ProviderCall<'_>) -> Result<Option<DecisionOutcome>, AppError> {
        let Some(config) = call.config else {
            return Ok(None);
        };
        let request = config.build_request(call.state);
        let model_version = request.model_version.clone();
        let response = self.complete(request.body).await?;

        let Some(answer) = interpret_answers(&response) else {
            return Ok(None);
        };

        // Calibration-sensitive values stay in `metadata`, scoped to the
        // provider/version, so routing thresholds never compare them across
        // providers.
        let mut outcome = DecisionOutcome::decided(answer.action, JEV_PROVIDER);
        if let Some(version) = model_version {
            outcome = outcome.with_model_version(version);
        }
        if let Some(confidence) = answer.confidence {
            outcome = outcome.with_confidence(confidence);
        }
        if let Some(probabilities) = answer.probabilities {
            outcome = outcome.with_metadata("probabilities", probabilities);
        }
        Ok(Some(outcome))
    }
}
