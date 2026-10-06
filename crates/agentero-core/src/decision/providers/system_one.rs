//! Shared System One answer interpretation.
//!
//! TypeSafe jEV and Cloudflare Clef speak the same `state + questions ->
//! answers` contract (System One API), so the decoding rules live here and are
//! reused by every provider built on that contract. Decoding is intentionally
//! conservative: anything that does not look like a usable answer becomes
//! "no opinion" (`None`) so the engine can fall back instead of acting on a
//! guess.

use serde_json::{json, Value};

/// One decoded System One answer.
#[derive(Debug, Clone, PartialEq)]
pub struct SystemOneAnswer {
    /// The provider-supplied decision value (choice key, score, yes/no, ...).
    pub action: Value,
    /// Calibrated confidence in `[0, 1]`, when the provider supplied or implied
    /// one. Only meaningful together with the provider/model that produced it.
    pub confidence: Option<f64>,
    /// Per-option probabilities, when supplied.
    pub probabilities: Option<Value>,
    /// The raw answer object, kept for metadata/debugging.
    pub raw: Value,
}

/// Decode the first answer in a System One response.
///
/// `None` means the response carried no usable answer (no `answers` map, an
/// empty map, or a shape we don't recognize). This is not a transport error:
/// it is "no opinion", which lets the engine fall back.
pub fn interpret_answers(response: &Value) -> Option<SystemOneAnswer> {
    let answers = response.get("answers")?.as_object()?;
    let (_, answer) = answers.iter().next()?;
    interpret_answer(answer)
}

/// Decode a single System One answer object.
///
/// Recognized shapes, in priority order:
/// - `choice`: an option key (`String`), returns the key + optional confidence.
/// - `noul`: probability that the yes/no answer is true; returns a bool.
/// - `score`: an ordered rubric value; returns `{ "score": n }`.
/// - `value` / `label` / `answer`: generic System One-compatible value.
///
/// A choice outside the requested `criteria` is surfaced verbatim (the schema
/// owns the allowed set and may reject it); it is never silently rewritten.
pub fn interpret_answer(answer: &Value) -> Option<SystemOneAnswer> {
    let object = answer.as_object()?;
    let probabilities = object
        .get("probabilities")
        .filter(|value| value.is_object())
        .cloned();

    if let Some(choice) = object.get("choice") {
        return Some(build(
            choice.clone(),
            explicit_confidence(object).or_else(|| max_probability(probabilities.as_ref())),
            probabilities,
            answer,
        ));
    }

    if let Some(noul) = object.get("noul").and_then(Value::as_f64) {
        let probability = noul.clamp(0.0, 1.0);
        return Some(build(
            Value::Bool(probability >= 0.5),
            explicit_confidence(object).or(Some(probability)),
            probabilities,
            answer,
        ));
    }

    if let Some(score) = object.get("score") {
        return Some(build(
            json!({ "score": score }),
            explicit_confidence(object).or_else(|| {
                // Criteria are 0..3 in the highlight vocabulary; normalize.
                score.as_f64().map(|score| (score / 3.0).clamp(0.0, 1.0))
            }),
            probabilities,
            answer,
        ));
    }

    let value = object
        .get("value")
        .or_else(|| object.get("label"))
        .or_else(|| object.get("answer"))?;
    Some(build(
        value.clone(),
        explicit_confidence(object),
        probabilities,
        answer,
    ))
}

fn build(
    action: Value,
    confidence: Option<f64>,
    probabilities: Option<Value>,
    answer: &Value,
) -> SystemOneAnswer {
    SystemOneAnswer {
        action,
        confidence: confidence.filter(|confidence| confidence.is_finite()),
        probabilities,
        raw: answer.clone(),
    }
}

fn explicit_confidence(object: &serde_json::Map<String, Value>) -> Option<f64> {
    object
        .get("confidence")
        .and_then(Value::as_f64)
        .or_else(|| object.get("probability").and_then(Value::as_f64))
}

fn max_probability(probabilities: Option<&Value>) -> Option<f64> {
    probabilities?
        .as_object()?
        .values()
        .filter_map(Value::as_f64)
        .fold(None, |acc, value| {
            Some(acc.map_or(value, |max: f64| max.max(value)))
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn answer(response: &Value) -> Option<SystemOneAnswer> {
        interpret_answers(response)
    }

    #[test]
    fn decodes_choice_with_confidence() {
        let decoded = answer(&json!({
            "answers": { "intent": { "choice": "translate", "confidence": 0.9 } }
        }))
        .expect("answer");
        assert_eq!(decoded.action, json!("translate"));
        assert_eq!(decoded.confidence, Some(0.9));
    }

    #[test]
    fn decodes_choice_without_confidence_using_probabilities() {
        let decoded = answer(&json!({
            "answers": { "intent": {
                "choice": "ask",
                "probabilities": { "ask": 0.6, "translate": 0.3, "ignore": 0.1 }
            }}
        }))
        .expect("answer");
        assert_eq!(decoded.action, json!("ask"));
        assert_eq!(decoded.confidence, Some(0.6));
        assert!(decoded.probabilities.is_some());
    }

    #[test]
    fn normalizes_score_confidence() {
        let decoded = answer(&json!({ "answers": { "q": { "score": 3.0 } } })).expect("answer");
        assert_eq!(decoded.action, json!({ "score": 3.0 }));
        assert_eq!(decoded.confidence, Some(1.0));
    }

    #[test]
    fn turns_noul_probability_into_boolean() {
        let yes = answer(&json!({ "answers": { "q": { "noul": 0.8 } } })).expect("answer");
        assert_eq!(yes.action, json!(true));
        assert_eq!(yes.confidence, Some(0.8));

        let no = answer(&json!({ "answers": { "q": { "noul": 0.2 } } })).expect("answer");
        assert_eq!(no.action, json!(false));
    }

    #[test]
    fn missing_answers_is_no_opinion() {
        assert!(answer(&json!({ "answers": {} })).is_none());
        assert!(answer(&json!({})).is_none());
    }

    #[test]
    fn unrecognized_answer_shape_is_no_opinion() {
        // A lone confidence with no action must not be echoed as an action.
        assert!(answer(&json!({ "answers": { "q": { "confidence": 0.9 } } })).is_none());
    }

    #[test]
    fn extra_answers_and_fields_are_ignored() {
        let decoded = answer(&json!({
            "answers": {
                "first": { "choice": "a", "confidence": 0.7, "extra": { "ignored": true } },
                "second": { "choice": "b" }
            },
            "usage": { "tokens": 12 }
        }))
        .expect("answer");
        assert_eq!(decoded.action, json!("a"));
        assert_eq!(decoded.confidence, Some(0.7));
    }

    #[test]
    fn out_of_set_choice_is_surfaced_verbatim() {
        // The schema owns the allowed criteria; decoding must not rewrite or
        // drop an option it does not recognize.
        let decoded = answer(&json!({
            "answers": { "intent": { "choice": "not-a-criteria", "confidence": 0.4 } }
        }))
        .expect("answer");
        assert_eq!(decoded.action, json!("not-a-criteria"));
        assert_eq!(decoded.confidence, Some(0.4));
    }

    #[test]
    fn missing_or_non_finite_confidence_is_none() {
        let missing = answer(&json!({ "answers": { "q": { "choice": "a" } } })).expect("answer");
        assert_eq!(missing.confidence, None);

        // serde_json maps non-finite floats (and JSON should never carry them)
        // to null, so a malformed confidence decodes as "no confidence".
        let malformed =
            answer(&json!({ "answers": { "q": { "choice": "a", "confidence": null } } }))
                .expect("answer");
        assert_eq!(malformed.confidence, None);

        let stringy =
            answer(&json!({ "answers": { "q": { "choice": "a", "confidence": "0.9" } } }))
                .expect("answer");
        assert_eq!(stringy.confidence, None);
    }
}
