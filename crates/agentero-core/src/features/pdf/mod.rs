//! PDF features (tauri-free subset).

#[cfg(not(any(target_os = "ios", target_os = "android")))]
pub mod locate;
pub mod marks;
