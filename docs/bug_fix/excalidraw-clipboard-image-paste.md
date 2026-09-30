# Excalidraw 无法粘贴剪贴板图片

**影响面**：`.excalidraw` 白板 tab。粘贴（或拖入）系统剪贴板里的图片时被静默拒绝，画布上不出现任何内容；即使插入成功，保存后重新打开图片也会丢失。

## 现象

在 Excalidraw 画布上 ⌘V 粘贴截图 / 复制的图片，画布无反应（Excalidraw 内部报 "Images are disabled" 并丢弃粘贴）。

## 原因

两层问题，都在 `excalidraw-viewer.tsx`：

1. **粘贴被拒**：`UIOptions.tools.image` 被显式设为 `false`。Excalidraw 0.18 的粘贴 / 拖拽入口都会先检查 `isToolSupported("image")`，image 工具被禁用时直接 `return` 并提示 "Images are disabled"，剪贴板图片根本进不了画布。
2. **持久化丢图片**：`onChange` 里 `serializeAsJSON(elements, appState, {}, "local")` 的 files 参数传的是空对象。`.excalidraw` 单文件格式把图片二进制（dataURL）放在顶级 `files` 字段，且 `serializeAsJSON` 只序列化**传入 files 中**被未删除元素引用的条目——传空对象意味着即使图片上了画布，保存的 JSON 也不含图片数据。相应地，`initialData` 恢复时也没有解析 seed JSON 的 `files` 字段，重开后图片元素渲染为损坏占位。

## 修复

- `UIOptions.tools.image` 改为 `true`（粘贴 / 拖拽 / 工具栏插入图片共用这个开关）。
- `onChange` 把 Excalidraw 回调的第三个参数 `files`（`BinaryFiles`，含 dataURL）原样传给 `serializeAsJSON`，图片随 800ms 防抖自动保存内嵌进 `.excalidraw` 文件；删除图片元素后再保存，`filterOutDeletedFiles` 会自动清掉孤儿二进制。
- `initialData` 新增 `parseSeedFiles`：从 seed JSON 顶级 `files` 提取有效条目（校验 `dataURL` 为非空字符串，损坏条目丢弃），随 `restoreElements` 一起交给画布，保证重开文件时图片正常显示。

## 回归

手动：打开 `.excalidraw` → 粘贴一张截图 → 等 1s 自动保存 → 关闭重开 tab，图片仍在；删除图片 → 保存 → 重开，JSON 中 `files` 为空。
