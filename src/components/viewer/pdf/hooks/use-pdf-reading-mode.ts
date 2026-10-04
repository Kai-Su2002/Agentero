/**
 * Applies the PDF reading preferences (scroll direction, page layout, reading
 * mode) to one EmbedPDF viewer.
 *
 * The preferences live in Host settings and are broadcast across windows, so a
 * change here re-applies without a reload. The document has already loaded by
 * the time the inner viewers mount, so the scroll/spread scopes exist; the
 * `totalPages` dependency retries the no-op that `setScrollStrategy` /
 * `setSpreadMode` perform if the document state is not ready yet.
 *
 * Paged mode forces `FitPage` so one page/spread fills the screen (the page
 * flipping itself is driven by `PagedNavigationHandler`). Applied to both the
 * main viewer and the dual-pane companion so their content scale — and thus the
 * scroll sync — stays aligned.
 */

import { ScrollStrategy, useScroll } from "@embedpdf/plugin-scroll/react";
import { SpreadMode, useSpread } from "@embedpdf/plugin-spread/react";
import { useZoom, ZoomMode } from "@embedpdf/plugin-zoom/react";
import { useEffect, useRef } from "react";
import { useSettings } from "@/hooks/use-app-stores";
import type { PdfScrollStrategy, PdfSpreadMode } from "@/lib/settings/types";

const SCROLL_STRATEGY: Record<PdfScrollStrategy, ScrollStrategy> = {
	vertical: ScrollStrategy.Vertical,
	horizontal: ScrollStrategy.Horizontal,
};

const SPREAD_MODE: Record<PdfSpreadMode, SpreadMode> = {
	none: SpreadMode.None,
	odd: SpreadMode.Odd,
	even: SpreadMode.Even,
};

export function usePdfReadingMode(docId: string): void {
	const strategy = useSettings((s) => s.pdfScrollStrategy);
	const spreadMode = useSettings((s) => s.pdfSpreadMode);
	const readingMode = useSettings((s) => s.pdfReadingMode);
	const { provides: scroll, state: scrollState } = useScroll(docId);
	const { provides: spread } = useSpread(docId);
	const { provides: zoom } = useZoom(docId);

	// EmbedPDF returns a fresh scope object every render; keep it out of deps and
	// key the effects on primitives (+ totalPages as the layout-ready signal).
	const scrollRef = useRef(scroll);
	scrollRef.current = scroll;
	const spreadRef = useRef(spread);
	spreadRef.current = spread;
	const zoomRef = useRef(zoom);
	zoomRef.current = zoom;

	const totalPages = scrollState.totalPages || 0;

	// biome-ignore lint/correctness/useExhaustiveDependencies: totalPages retries the no-op applied before the document layout was ready
	useEffect(() => {
		scrollRef.current?.setScrollStrategy(SCROLL_STRATEGY[strategy]);
	}, [strategy, totalPages]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: totalPages retries the no-op applied before the document layout was ready
	useEffect(() => {
		spreadRef.current?.setSpreadMode(SPREAD_MODE[spreadMode]);
	}, [spreadMode, totalPages]);

	// Paged mode fits one page/spread per screen; leaving it returns to the app
	// default fit-width. Act only on the transition so a manual zoom in one mode
	// is not reset by unrelated re-renders.
	const wasPagedRef = useRef(false);
	useEffect(() => {
		if (readingMode === "paged") {
			wasPagedRef.current = true;
			zoomRef.current?.requestZoom(ZoomMode.FitPage);
		} else if (wasPagedRef.current) {
			wasPagedRef.current = false;
			zoomRef.current?.requestZoom(ZoomMode.FitWidth);
		}
	}, [readingMode]);
}
