/**
 * Gate for engine-specific paint optimizations (see `index.css`).
 *
 * `content-visibility: auto` lets Chromium/Gecko skip layout and paint for
 * offscreen content, which is the Slate-recommended way to keep long documents
 * responsive while scrolling or resizing. WebKit is documented to be slower
 * than not using it per element, so the Markdown editor's offscreen-block rule
 * is enabled only on non-WebKit webviews.
 */

import { isWebKitEngine } from "@/lib/core/tauri";

export const OFFSCREEN_MARKDOWN_BLOCKS_ATTR = "data-offscreen-md-blocks";

export function initPaintOptimizations(): void {
	if (typeof document === "undefined") return;
	document.documentElement.toggleAttribute(
		OFFSCREEN_MARKDOWN_BLOCKS_ATTR,
		!isWebKitEngine(),
	);
}
