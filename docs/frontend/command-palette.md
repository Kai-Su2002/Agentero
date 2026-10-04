# 命令面板 / 快速打开

| 快捷键 | 模式 |
|---|---|
| `⌘P` | 快速打开：论文 + `vault_search` 全文 |
| `⇧⌘P` 或输入 `>` | 执行内置命令 |

- 居中浮层；`Esc` / `⌘W` / 同键再按关闭（`overlay-stack`）。
- 命中论文 → 打开该 paper；命中路径 → 打开对应文档。
- 论文层（内存）匹配标题 / 作者 / id / 可见标签，空查询显示最近论文。
- 别名层：防抖查 Wiki 索引的 frontmatter `aliases`，命中论文别名时打开该 paper、笔记别名时打开该笔记；与论文层、正文层按路径去重。
- 实现：`src/components/dialogs/command-palette.tsx`、`src/lib/vault/search.ts`、`src/lib/wiki/api.ts`、`src/lib/shell/commands/`
- Host：`vault_search`（见 [../backend/search.md](../backend/search.md)）、`wiki_search`（见 [../backend/wiki.md](../backend/wiki.md)）
