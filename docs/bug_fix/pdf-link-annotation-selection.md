# PDF 链接点击变成八点批注选中框

**状态**：已修复（Link 类型锁定 + 被动边框绘制 + 单一导航入口）。

## 现象与原因

点击论文 PDF 中的 citation、章节或外部链接，原本应跳转，却出现矩形选中框及四角、四边共八个调整点。

`973033f7`（PR #690）为全文译文高亮提升了整个 `AnnotationLayer`：译文纸面为 `z-3`，批注为 `z-5`，译文字形为 `z-6`。该层同时包含 EmbedPDF 内置 Link renderer，其透明区域在 `pointerdown` 时选中 Link annotation。Agentero 原有的 `CitationLinkLayer` 导航按钮仍为 `z-2`，因此点击先被批注层接管。

仅把导航按钮提高到 `z-7` 可以恢复原文链接点击，但英文坐标的区域会覆盖重新排版的译文，干扰译文划选；自定义命中区缺失时也仍会暴露内置 Link 编辑交互。

## 修复

- 为 Link tool 增加独立 `link` category，使用 `LockModeType.Include` 只锁定该类型。保持其它 markup / highlight 可编辑；不修改 PDF 或 sidecar 中的 annotation flags。锁定同样阻止 capability API 把 Link 加入选中集合。
- 覆盖 `id: "link"` 的普通和 locked renderer，仅绘制原有下划线、实线 / 虚线边框。没有透明命中区域，也不挂选中或导航事件。特别覆盖 locked renderer，因为 EmbedPDF 默认 locked Link 仍有独立导航入口，会绕过 Agentero 的引用预览和跳转历史。
- `AnnotationLayer` 容器用 `pointer-events-none`，使空白区和被动 Link 不阻挡下方导航按钮；高亮菜单等真正的交互元素显式启用指针。
- 保留 `CitationLinkLayer` 的原层级和导航逻辑。译文字形仍优先接收划选，未被译文覆盖的链接正常导航。设置 `autoOpenLinks: false`，URI 由现有 Host opener 处理，防止 EmbedPDF 导航事件同时触发 `window.open`。
- AnnotationPlugin 继续负责批注状态、导入导出和更新删除；高亮绘制与全文译文句子映射不移除。

## 验证

- `test/pdf-link-annotation.test.ts` 使用真实 EmbedPDF registry / annotation plugin，验证原生和无目标 Link 均不能选中；新文档重新应用策略；高亮仍能选中、改色；锁定不阻止 URI target 解析；被动 renderer 保留边框。
- PDF 链接、译文句子定位 / 高亮、跳转历史与平移手势的现有测试。
- 独立 Chromium 测试页挂载生产 `PdfPageLayers` 与真实 PDFium / EmbedPDF，使用含内链、URI、无目标 Link 和已有高亮的双页 PDF 做改动前后对照：旧代码出现八点框且导航回调未触发；修复后内链实际滚动到第二页，hover / URI / 纯文本 URL 正常，暗色与普通 PDF 模式正常，高亮编辑 / 删除菜单可操作。译文覆盖英文链接的位置仍可划选，并由生产译文选区 hook 锚回第一句英文，不误触链接。未单独运行 Tauri 系统浏览器打开流程。
