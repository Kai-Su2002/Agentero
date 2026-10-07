# MinerU 检测有图但侧栏无图（#704）

Issue：[poco-ai/Agentero#704](https://github.com/poco-ai/Agentero/issues/704)。

## 根因与影响

MinerU Content List 中有 image/chart 检测，但适配层丢失附带图注文字，也未读取中间格式中的嵌套图注框。原有合并流程在两处删除未匹配到 `titleBbox` 的图，因此“检测成功”仍可能变成“侧栏零图”。Nature 风格图题、双栏图注以及图与图注分处相邻页会进一步降低匹配率。

PDF 本身和页内渲染不受影响；丢失的是侧栏、聚焦/命中区域及派生 layout-index 中的图条目。本地 ONNX 与 MinerU 是不同版面后端，本地侧栏仍有图不代表 MinerU 路径没有此问题。

## 修复

- 保留可靠的无图题图片，继续复用低置信度、面积、正文重复框、表格重复框和 NMS 过滤；只吸收真正无主图题的子图，避免文字图题宿主互相删除。
- Host 保留 MinerU 的正文 / 图注文字，并提取中间格式内有真实 bbox 的图注；不把图片 bbox 当成图注 bbox。
- 从 PDF 文字行恢复 `Fig. N |`、`Extended Data Fig. N |` 等编号图注。双栏拼接需要连续字符序和几何共同支持，不单凭左右对齐吸收正文。
- 对相邻页的唯一图组与图注进行保守配对，拒绝图号冲突与多候选。跨页图注页码、框与图片坐标独立存储；裁图和跳转仍定位图片页。
- 旧 MinerU schema 3 缓存缺少 `figureCaptionsExtracted` 时本地补读一次文字层，包括零检测框页面。保留原 `generatedAt`；有页尺寸缺失或抽字失败则不标记完成，不重新调用云端。

## 复现与验证

用户提供 `s42255-025-01379-7.pdf`，33 页，27,207,787 字节；SHA-256：`de06f392d10c96346953d01390be336d68982a18eda3025eddb6fb6366683725`。

使用真实 MinerU 云端结果，随后以项目 PDFium 文字层、生产适配/合并/侧栏过滤函数回放：

| 阶段 | 插图 | table 区域 |
|---|---:|---:|
| 原代码侧栏结果 | 0 | 7 |
| 修复后，回放旧适配结果 | 16 | 7 |
| 修复后，回放保留图注的新适配结果 | 16 | 7 |

原适配输出 77 image、88 chart、329 text、114 header、7 table，无 figure_title；正文重叠过滤后仍有 161 个图候选，但旧流程最终将插图全部丢弃。修复后按整图聚合得到主文 Fig. 1–7 和 Extended Data Fig. 1–9。7 个 table 是 Reporting Summary 表单区域，不是 7 张编号科研表格。PDF 第 3/7/22 页的图分别关联第 2/6/23 页图注，断言没有跨页 union 或伪造同页标题框。已渲染并目视检查 16 张裁图联系表；个别裁图仍包含原有页眉，未扩大本次修复范围去调整图例/页眉吸收规则。

自动验证：257 项相关前端测试通过（2 项 opt-in 跳过），真实论文新旧结果回放各通过；11 项 MinerU Rust 测试通过，生成 bindings 一致性检查通过。TypeScript、Biome、生产构建与全 workspace/all-targets Clippy（`-D warnings`）通过。没有进行 Tauri 原生窗口端到端操作，回放验证不等同于原生 UI 验证。

云端 ZIP、PDF 文字与裁图是本机 `tmp/issue704/` 下的忽略产物，不提交论文或凭证。回归用例使用最小合成数据，覆盖无图题保留、噪声过滤、图号冲突、跨页坐标、双栏正文误并、缓存无检测页及重复宿主丢失。

已检查 `docs/development/index.md` 的 Roadmap/TODO 约定；剩余限制记录在 [PDF 版面分析](../frontend/pdf-layout-analysis.md) 的「限制与后续」。
