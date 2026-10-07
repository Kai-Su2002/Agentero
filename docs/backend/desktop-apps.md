# 本地桌面应用检测

Agent 设置页的「本地桌面应用」区块列出若干**不支持 ACP** 的流行 AI 桌面端 App（ChatGPT、千问办公 / QwenWork、腾讯 WorkBuddy）。它们装了也不会出现在 Agent 目录里，这个区块向用户解释原因，并允许直接打开。

## 定位

- **只读展示**：这些 App 不实现 Agent Client Protocol，Host 无法以 ACP 与之通信，因此不进注册表。
- **本地优先**：只检查本机安装痕迹，不读账号、不发网络请求。
- **尽力而为**：可能漏报（便携版、非标准路径、Spotlight 关闭、多用户），UI 必须有兜底（未装即灰度）。检测只作提示，不驱动任何必须步骤。

## 命令

| 命令 | 说明 |
|---|---|
| `desktop_apps_probe` | 返回 `DesktopAppStatus[]`（`id` / `installed` / 可选 `path`），顺序固定 ChatGPT → QwenWork → WorkBuddy。 |
| `desktop_app_open(id)` | 启动已安装的 App。 |

均走 `Result<ApiResult<T>, String>`（specta `typedError`）；探测里的 Spotlight 查询会 spawn `mdfind`，故经 `core::blocking::run_blocking` 移出 UI 线程。

## 检测方式（macOS）

1. 直接探测 `/Applications/<name>.app` 与 `~/Applications/<name>.app`（用户可能装在个人目录）。
2. `mdfind "kMDItemCFBundleIdentifier == '<id>'"` 兜住被移动的 App（ChatGPT 新版 `com.openai.codex` / 旧版 `com.openai.chat`）。
3. `mdfind "kMDItemFSName == '<name>.app'"` 文件名兜底。

**刻意不做**：扫描 `~/Library` 或 `~/.<app>` 残留目录。已卸载但留下日志/数据的 App 会因此被误判为「已安装」（WorkBuddy 卸载后仍留 `~/.workbuddy-ai` 等，是典型反例）。可靠判据只有真实 `.app` bundle 与系统注册信息。

## 打开

`desktop_app_open` 优先 `open <resolved .app path>`，未解析到路径时回退 `open -a <name>`。ChatGPT 新版同时注册 `codex://` scheme，后续如需带参深链可在此扩展。

## 平台

当前仅 macOS；Windows / Linux 一律返回 `installed=false`，待补注册表 / MSIX 与 `.desktop` 扫描。

## 代码

- 检测：`src-tauri/src/features/system/desktop_apps/`
- 前端：`src/components/settings/desktop-apps-rows.tsx`、`src/lib/system/desktop-apps.ts`
