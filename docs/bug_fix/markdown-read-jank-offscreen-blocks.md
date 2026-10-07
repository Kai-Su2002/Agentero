# Markdown 长文阅读卡顿（离屏块跳过渲染）

**状态**：已修复（非 WebKit 引擎阅读态启用 `content-visibility: auto`）
**影响面**：Windows（WebView2）下打开较长 Markdown / NOTES 笔记时的滚动与侧栏拖动
**相关代码**：

- `src/index.css` — `html[data-offscreen-md-blocks] [data-slate-editor][data-selection-chat-origin="markdown"]:not(:focus-within) .slate-blockWrapper` 的 `content-visibility` / `contain-intrinsic-size`
- `src/lib/core/paint-perf.ts` — 按引擎开关 `data-offscreen-md-blocks`
- `src/lib/core/tauri.ts` — `isWebKitEngine`
- `src/main.tsx` — 首帧前调用 `initPaintOptimizations`
- `test/editor-offscreen-blocks.test.ts` — 引擎判定
- 文档：`docs/frontend/markdown.md`

---

## 1. 问题现象

阅读较长的 Markdown 笔记时：

1. 单纯滚动就略有掉帧；
2. 拖拽两侧的侧边栏（或 Dockview 分隔条）时明显卡顿，松手前几乎跟不上指针；
3. 同一篇文档在 PDF 视图里要丝滑得多（#702，Win11 / 0.11.5，几乎没有公式、只有少量图片）。

## 2. 根因

Plate 是「全量渲染」：文档里每个顶层块都在 DOM 里。改变中间面板宽度（拖动侧栏 / 分隔条）会让整篇文档的文本重新换行，每一帧都要对**整篇**做一次 layout；滚动时同样会参与绘制。PDF 视图只渲染视口内页面，所以感觉更顺。

即：卡顿来自阅读态的**整篇重排/重绘**，与公式无关（公式早已有 KaTeX 结果缓存），图片只是放大了单块的布局成本。

## 3. 修复方案

阅读态（编辑器未聚焦）时，让浏览器跳过离屏顶层块的 layout 与 paint：

```css
html[data-offscreen-md-blocks]
	[data-slate-editor][data-selection-chat-origin="markdown"]:not(:focus-within)
	.slate-blockWrapper {
	content-visibility: auto;
	contain-intrinsic-size: auto 4rem;
}
```

- `content-visibility: auto` 是 Slate 官方对超大文档推荐的渲染优化：离屏元素只保留占位，不参与 layout/paint；`contain-intrinsic-size: auto` 会在元素首次渲染后记住真实高度，`4rem` 只用于从未出现过的块。
- 作用域限定在 live editor（只有它会渲染 `.slate-blockWrapper`）；导出面与 `![[…]]` 嵌入不使用 DnD kit，不受影响。
- `:not(:focus-within)` 保证聚焦编辑时关闭该优化，光标、native 选区、IME、块拖拽语义完全不变；拖拽侧栏时分隔条获得焦点，编辑器自动回到阅读态，因此拖动期间优化生效。
- WebKit（macOS WKWebView / Linux WebKitGTK）对逐元素 `content-visibility` 往往比不用更慢，故通过 `data-offscreen-md-blocks` 只在非 WebKit 引擎启用（Windows WebView2 等）。

## 4. 实测

4000 个块（含图片）的静态页面，改变容器宽度并强制 layout：

| | 每次重排 |
|---|---|
| 关闭 | ≈16.5ms |
| 开启 | ≈4.9ms |

验证（Chromium）：`scrollIntoView` 到离屏块、向离屏块内放置光标并输入均正常；聚焦时可正常编辑。

## 5. 边界

- **滚动条估算**：首次滚动前，从未渲染过的块按 `4rem` 估算高度，滚动条比例会随渲染逐步校正；`auto` 关键字使已渲染块保持稳定，不反复跳动。
- **聚焦瞬间一次重排**：从阅读态点击进入编辑态会关闭优化并重排一次（离屏，无可见跳动），换来编辑期零风险。
- **WebKit 不启用**：macOS / Linux 保持原行为，不引入潜在回归。
- **不做虚拟化**：不改变 Slate 的 DOM 结构、块选与拖拽锚点，仅借助浏览器原生跳过离屏渲染。
