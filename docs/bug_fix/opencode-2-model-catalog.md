# OpenCode 2 自定义 provider 模型未出现在模型选择器

**Issue**：[#638](https://github.com/poco-ai/Agentero/issues/638)

## 现象

OpenCode 更新到 2.0.15 后，Agent 侧栏模型切换只显示 OpenCode 自带模型，自定义 provider 的模型无法在列表中找到。

## 原因

Agentero warm-up 阶段会同时看到两类模型来源：

- ACP `configOptions` 中的模型选择项；
- `session/new` 原始响应里的 legacy/raw `models.availableModels`。

旧逻辑只在没有 `configOptions` 目录时才读取 raw `models`。当 OpenCode 2 同时返回一个不完整的 `configOptions` 目录和一个更完整的 raw 模型目录时，不完整目录会挡住自定义 provider 模型。

此外，OpenCode 2 的 raw models 可能位于 `_meta.models`，模型 id 也可能采用 `provider/model` 形式。旧解析只覆盖 top-level `models` 和 `provider:model` 分组。

## 修复

- raw session models 解析同时支持 top-level `models` 与 `_meta.models`。
- 模型条目兼容 `modelId` / `model_id` / `id` / `value`，当前模型兼容 `currentModelId` / `current_model_id` 等字段。
- 分组从显式 provider 字段或 `provider:model`、`provider/model` 前缀推导。
- warm-up 阶段在 `configOptions` 和 raw models 都存在时选择更完整的模型目录，避免不完整 ACP catalog 隐藏自定义 provider。

## 验证

```bash
cargo test --manifest-path src-tauri/Cargo.toml session_models_fallback_tests --lib
```

结果：7 个相关测试通过。

Roadmap 与 TODO 已检查：这是已实现 Agent 模型目录兼容性的缺陷修复，不新增未完成产品项。

## 更新：OpenCode 2.0.22 回归

**现象**：升级到 2.0.22 后，模型选择器又变窄（自定义 provider 缺失）；回退 2.0.3 恢复。

**实测**（同一份配置，直接跑 `opencode acp`）：

| 版本 | `session/new` 模型数 | 随后的 `config_option_update` |
|---|---|---|
| 2.0.3 | 25（一次给全） | 无 |
| 2.0.22 | 15（不完整） | 25（约 40ms 后推送） |

**原因**：2.0.22 的 `session/new` 先返回一个不完整的模型目录，完整目录随后经 `config_option_update` 推送。Agentero 的 warm 结果（以及池化 slot 的 `config_options` / `models` 快照）在推送到达前就记录了初始目录，随后在 `applyModelsEvent` 里把更完整的推送覆盖掉，选择器于是丢掉一部分 provider。

**修复**：

- 后端：warm idle 连接收到 `config_option_update` 时，用 `store_richer_models` 更新 warm 结果引用的目录（只接受不少于当前的目录）；`setup` 写回走同一规则，避免乱序覆盖。
- 前端：`applyModelsEvent` 以本次面板会话中见过的**最丰富**目录为准（`mergeModelChoices`），使 warm 结果 / 池化 slot 的旧快照无法再收窄选择器。记录只在内存里，跨重启不保留，所以真正被删除的 provider 仍会消失。

**验证**：

```bash
cargo test --manifest-path src-tauri/Cargo.toml session_models_fallback_tests --lib
pnpm exec vitest run test/agent-chat-state.test.ts
```
