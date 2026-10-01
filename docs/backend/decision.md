# 决策层（Decision Layer）

> 状态：已实现。jEV 智能高亮、PDF 选区意图、文件树点击已接入。

决策层把“需要二选一/多选一/打分”的判断统一成一次 *decision*：给定 `decisionId` 与
`state`，由注册的 provider（确定性规则、jEV、未来 LLM）给出带来源与置信度的
`action`。目的是让语义判断（jEV）与大量确定性 if-else 各归其位，而不是把所有判断都
塞给 AI，也不让 jEV 和 hook 架构割裂。

## 核心概念

| 概念 | 说明 |
|---|---|
| Decision | 一次判断任务，例如“PDF 选中文本的意图是什么”。 |
| State | 决策所需上下文，例如 `{ selectedText, page, source: "pdf" }`。 |
| Question | 向 jEV 提出的问题，类型 `score` / `choice` / `noul`。 |
| Rule | 确定性函数：`state -> Option<action>`。 |
| Provider | 具体执行决策的模块：`RuleProvider`、`JevProvider`。 |
| Routing | 主 provider、fallback provider、fallback 阈值。 |
| ProviderConfig | provider 专属配置，例如 jEV 的 questions。 |
| Outcome | 结果：`action` + `provider` 来源 + `confidence`。 |

## 架构

```
业务 hook / 组件
      │  decide(id, state)              ┌── RuleProvider（规则链）
      ▼                                 │
┌──────────────────┐   ┌──────────────┐ │
│ DecisionRegistry │──▶│ DecisionEngine│─┼── JevProvider（HTTP）
│ id → schema      │   │  route/fallback│ │
└──────────────────┘   └──────────────┘ └── （未来：LLM）
```

- **后端（Rust）**：`crates/agentero-core/src/decision/`，Tauri 无关，CLI 可复用。
- **前端（TS）**：`useDecision` 走 Host；纯前端状态的规则走 `decideSync` 本地注册表。

## 后端（`agentero-core::decision`）

### Provider trait

```rust
#[async_trait]
pub trait DecisionProvider: Send + Sync {
    fn name(&self) -> &'static str;
    /// Ok(None) = “无意见”，让引擎走 fallback。
    async fn decide(&self, call: ProviderCall<'_>) -> Result<Option<DecisionOutcome>, AppError>;
}
```

`ProviderCall` 携带 `decision_id` / `state` / 该 provider 的 `ProviderConfig` / schema 顶层
规则链。规则因此留在 schema 上（provider 无关），probabilistic provider 只读自己的 config。

### 路由

`DecisionRouting { primary, fallback, fallback_threshold }`：

| primary | fallback | threshold | 语义 |
|---|---|---|---|
| `rule` | — | — | 纯规则 |
| `jev` | — | — | 纯 jEV |
| `jev` | `rule` | `0.75` | jEV 置信度低时回退规则 |
| `rule` | `jev` | — | 规则未命中时让 jEV 兜底 |

引擎在以下情况尝试 fallback：主 provider 返回 `Ok(None)`、主 provider 置信度低于阈值、
或主 provider 报错且配置了 fallback（报错被吞掉，让确定性 fallback 仍能作答）。fallback
也无意见时保留主 provider 结果；都没有则用 schema 的 `default_action`（否则 `null`）。

### Built-in providers

- `RuleProvider`：按注册顺序执行规则，`Some` 即停；无置信度。
- `JevProvider`：`state + questions -> answers` 的 HTTP 传输。`complete(body)` 是唯一的
  HTTP 入口（Bearer key、错误截断、超时），凭证通过 auth 闭包在请求时读设置。
  `decide` 用 config 构造请求并把 answers 解释成 `(action, confidence)`。

### 注册

Host 在 `features/decision/schemas.rs` 声明 schema，`features/decision/mod.rs::build()`
在 app setup 时装配 engine：

```rust
DecisionSchema::new("pdf.selection.intent", "…")
    .routing(DecisionRouting::provider(JEV_PROVIDER).with_fallback(RULE_PROVIDER, Some(0.75)))
    .rule(|state| /* 空选区 -> ignore */)
    .provider_config(FnProviderConfig::new(JEV_PROVIDER, |state| ProviderRequest::new(
        JEV_PROVIDER,
        json!({ "state": state, "model": JEV_MODEL, "questions": { /* … */ } }),
    )))
    .default_action(json!("ignore"))
```

### IPC

`decide({ decisionId, state }) -> ApiResult<DecisionOutcome>`。`state` / `action` 走
`core::json::Json`（`serde_json::Value` 的 specta 表示，见 [api.md](api.md)）。
未注册 id 或 provider 缺失返回 Host 错误。

## 前端（React）

### `useDecision`（语义决策）

```ts
const { decide } = useDecision();
const outcome = await decide("pdf.selection.intent", { selectedText, page });
if (typeof outcome.action === "string") runAction(outcome.action);
```

### `decideSync`（纯规则决策）

纯前端状态的判断（文件树点击、UI 开关）不该往返 Host：

```ts
registerDecision<{ node: FileNode }>({
  id: "file-tree.click",
  description: "…",
  defaultAction: "noop",
  rules: [
    ({ node }) => (isLibraryVirtualPath(node.path) ? "select-library" : null),
    // …
  ],
});
const action = decideSync("file-tree.click", { node });
```

注册表在 `src/lib/decision/registry.ts`，无副作用、同步求值。

## 已接入用例

| decision | routing | 触发点 |
|---|---|---|
| `pdf.selection.intent` | jEV + 规则兜底（0.75） | 已注册，暂未接 UI（原 PDF 选区「智能操作」按钮已移除），可经 `decide` 命令调用 |
| `paper.auto-tag` | 纯 jEV | 已注册；由后续论文入库流程调用 |
| `file-tree.click` | 纯规则（前端本地） | 文件树点击 `selectFileNode` |

jEV 智能高亮的 HTTP 传输已统一到 `JevProvider::complete`：`features/jev` 保留句子抽取、
问题构造与几何还原等业务逻辑，但不再自建 client、不再自己拼 Bearer 头。

## 边界与后续

- **不是所有判断都进决策层**：文件保存、标签页关闭、简单 UI 状态切换仍由 hook/store 直接处理。
- **规则优先于 jEV**：能用规则确定的不要用 AI（jEV 有 token 成本与延迟）。
- **用户可覆盖**：AI 只给默认建议；UI 上应保留其他选项供用户手动选择。
- **可解释**：`Outcome` 必带 `provider` 与 `confidence`，便于调试与 fallback。
- **未决**：
  - `pdf.smart-highlight` 仍以领域批处理直接调用 `JevProvider::complete`，未统一为通用
    `decide_batch`（通用批量需要 provider 理解按 state 合并 questions 的语义，暂不抽象）。
  - `paper.auto-tag` 尚无 UI 入口。
  - 决策结果缓存、按 decision 单独选择 provider 尚未实现。
  - jEV 的 `choice` 置信度依赖响应里带 `confidence`/`probability`；缺失时按 `score/3`
    归一，真实接口契约待验证。

## 文件

| 层 | 路径 |
|---|---|
| 核心引擎 | `crates/agentero-core/src/decision/`（types / registry / engine / providers） |
| Host 装配 | `src-tauri/src/features/decision/`（mod / commands / schemas） |
| jEV 传输 | `crates/agentero-core/src/decision/providers/jev.rs` |
| 前端 hook | `src/hooks/use-decision.ts` |
| 前端本地规则 | `src/lib/decision/registry.ts` |
