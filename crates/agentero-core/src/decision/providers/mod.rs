//! Built-in decision providers.

pub mod rule;
pub mod system_one;

pub use rule::RuleProvider;
pub use system_one::{
    interpret_answer, interpret_answers, SystemOneAnswer, SystemOneAuth, SystemOneCredentials,
    SystemOneProvider,
};
