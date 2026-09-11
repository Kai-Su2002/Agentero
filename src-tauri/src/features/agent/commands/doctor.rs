use crate::core::error::{map_err, ApiResult};
use crate::features::agent::doctor::{diagnose_host, HostDoctorReport};
use crate::features::agent::doctor_agents::{diagnose_agents, AgentAcpDiagnostic};
use crate::features::agent::{AgentRegistry, AgentWarmGate};
use tauri::{AppHandle, State};

#[tauri::command]
#[specta::specta]
pub async fn doctor_check_host(
    registry: State<'_, AgentRegistry>,
) -> Result<ApiResult<HostDoctorReport>, String> {
    Ok(match diagnose_host(registry.inner()).await {
        Ok(report) => ApiResult::ok(report),
        Err(error) => map_err(error),
    })
}

/// Re-probe every registered Agent over ACP and return classified failures.
/// Can take up to ~30s per slow agent (probes run with limited concurrency).
#[tauri::command]
#[specta::specta]
pub async fn doctor_check_agents(
    app: AppHandle,
    registry: State<'_, AgentRegistry>,
    warm_gate: State<'_, AgentWarmGate>,
) -> Result<ApiResult<Vec<AgentAcpDiagnostic>>, String> {
    Ok(
        match diagnose_agents(registry.inner(), warm_gate.inner(), &app).await {
            Ok(report) => ApiResult::ok(report),
            Err(error) => map_err(error),
        },
    )
}
