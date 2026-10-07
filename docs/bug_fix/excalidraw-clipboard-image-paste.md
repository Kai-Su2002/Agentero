# Excalidraw 无法粘贴剪贴板图片

**影响面**：`.excalidraw` 白板 tab。粘贴（或拖入）系统剪贴板里的图片时被静默拒绝，画布上不出现任何内容；即使插入成功，保存后重新打开图片也会丢失。

## 现象

在 Excalidraw 画布上 ⌘V 粘贴截图 / 复制的图片，画布无反应（Excalidraw 内部报 "Images are disabled" 并丢弃粘贴）。

## 原因

三层问题：

1. **粘贴被拒**（`excalidraw-viewer.tsx`）：`UIOptions.tools.image` 被显式设为 `false`。Excalidraw 0.18 的粘贴 / 拖拽入口都会先检查 `isToolSupported("image")`，image 工具被禁用时直接 `return` 并提示 "Images are disabled"，剪贴板图片根本进不了画布。
2. **持久化丢图片**（`excalidraw-viewer.tsx`）：`onChange` 里 `serializeAsJSON(elements, appState, {}, "local")` 的 files 参数传的是空对象。`.excalidraw` 单文件格式把图片二进制（dataURL）放在顶级 `files` 字段，且 `serializeAsJSON` 只序列化**传入 files 中**被未删除元素引用的条目——传空对象意味着即使图片上了画布，保存的 JSON 也不含图片数据。相应地，`initialData` 恢复时也没有解析 seed JSON 的 `files` 字段，重开后图片元素渲染为损坏占位。
3. **⌘V 被全局快捷键吞掉**（`use-app-shortcuts.ts`）：文件树的「粘贴剪切项」把 ⌘V 注册成了**全局**快捷键，在非文本框 target 上一律 `preventDefault()`。Excalidraw 的粘贴靠监听原生 `paste` 事件，keydown 被 `preventDefault` 后浏览器根本不会再派发 `paste`，所以键盘 ⌘V 毫无反应；而系统右键菜单的 **Paste** 走原生命令、不经过这条 keydown 路径，因此只有它能粘贴。⌘X 同理，导致画布内键盘剪切也失效。

## 修复

- `UIOptions.tools.image` 改为 `true`（粘贴 / 拖拽 / 工具栏插入图片共用这个开关）。
- `onChange` 把 Excalidraw 回调的第三个参数 `files`（`BinaryFiles`，含 dataURL）原样传给 `serializeAsJSON`，图片随 800ms 防抖自动保存内嵌进 `.excalidraw` 文件；删除图片元素后再保存，`filterOutDeletedFiles` 会自动清掉孤儿二进制。
- `initialData` 新增 `parseSeedFiles`：从 seed JSON 顶级 `files` 提取有效条目（校验 `dataURL` 为非空字符串，损坏条目丢弃），随 `restoreElements` 一起交给画布，保证重开文件时图片正常显示。
- `use-app-shortcuts.ts`：把文件树专属快捷键（⌘X / ⌘V / ⌘⌫ / ⌘← / ⇧⌘←）收紧到「文件树是最近交互面」时才生效——用 `pointerdown` / `focusin` 记录 `[data-file-tree]` 容器是否为当前面（WebKit 点击 `<button>` 行不聚焦，故不能只看 target/activeElement）。其余界面上 ⌘X/⌘V 不再被 `preventDefault`，原生 `cut`/`paste` 事件正常派发，Excalidraw 画布即可粘贴剪贴板图片/剪切元素。文件树容器补 `data-file-tree` 标记。

## 回归

手动：打开 `.excalidraw` → 粘贴一张截图 → 等 1s 自动保存 → 关闭重开 tab，图片仍在；删除图片 → 保存 → 重开，JSON 中 `files` 为空。

快捷键：在画布上 ⌘V 直接粘入剪贴板图片、⌘X 剪切选中图形；在左栏文件树 ⌘X 剪切项、选中目标目录 ⌘V 粘贴，行为不变。
