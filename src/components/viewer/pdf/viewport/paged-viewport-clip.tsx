/**
 * Clips the viewport to a single page/spread while the "paged" reading mode is
 * active.
 *
 * `FitPage` fits a whole page/spread, but on a wide window a two-page spread is
 * width-bound: its scaled height is shorter than the viewport, so the continuous
 * scroller (which places rows one after another) shows the neighbouring row
 * above/below. EmbedPDF has no "one item per screen" layout, so instead of
 * touching its scroll math we clip the viewport to a centered window the size of
 * the current item. Only the scroll axis is clipped, so the comment rail that
 * overflows the page to the right is left alone in the default vertical layout.
 *
 * Must render inside `DockviewViewport` (ViewportElementContext).
 */

import { useScroll } from "@embedpdf/plugin-scroll/react";
import { useViewportElement } from "@embedpdf/plugin-viewport/react";
import { useZoom } from "@embedpdf/plugin-zoom/react";
import { useEffect } from "react";
import { EMBED_PAGE_ATTR } from "@/components/viewer/pdf/coords";
import { useSettings } from "@/hooks/use-app-stores";

/** Kept around the item so its ring / shadow is not clipped. */
const CLIP_PAD_PX = 4;

type PagedViewportClipProps = {
	docId: string;
	/** Only clips while the "paged" reading mode is selected. */
	paged: boolean;
};

export function PagedViewportClip({ docId, paged }: PagedViewportClipProps) {
	const viewportRef = useViewportElement();
	const { state: scrollState } = useScroll(docId);
	const { state: zoomState } = useZoom(docId);
	const horizontal = useSettings((s) => s.pdfScrollStrategy) === "horizontal";
	const spreadMode = useSettings((s) => s.pdfSpreadMode);
	const currentPage = scrollState.currentPage || 1;
	const zoom = zoomState.currentZoomLevel || 1;

	// biome-ignore lint/correctness/useExhaustiveDependencies: zoom / spreadMode relayout the item so the clip window is re-measured
	useEffect(() => {
		const viewport = viewportRef?.current;
		if (!viewport) return;
		if (!paged) {
			viewport.style.clipPath = "";
			return;
		}

		let raf: number | null = null;
		const apply = () => {
			raf = null;
			// A virtual item's row is the page wrapper's flex parent.
			const page = viewport.querySelector<HTMLElement>(
				`[${EMBED_PAGE_ATTR}="${currentPage - 1}"]`,
			);
			const rect = page?.parentElement?.getBoundingClientRect();
			if (!rect || rect.width <= 0 || rect.height <= 0) return;
			const view = viewport.getBoundingClientRect();
			if (horizontal) {
				const left = Math.max(0, rect.left - view.left - CLIP_PAD_PX);
				const right = Math.max(0, view.right - rect.right - CLIP_PAD_PX);
				if (left + right >= view.width - 1) return;
				viewport.style.clipPath = `inset(0px ${right}px 0px ${left}px)`;
			} else {
				const top = Math.max(0, rect.top - view.top - CLIP_PAD_PX);
				const bottom = Math.max(0, view.bottom - rect.bottom - CLIP_PAD_PX);
				if (top + bottom >= view.height - 1) return;
				viewport.style.clipPath = `inset(${top}px 0px ${bottom}px 0px)`;
			}
		};

		const schedule = () => {
			if (raf == null) raf = requestAnimationFrame(apply);
		};

		apply();
		const observer = new ResizeObserver(schedule);
		observer.observe(viewport);
		// The clip window tracks the item as it scrolls; a page/spread switch
		// relayouts the scroller without resizing the viewport.
		viewport.addEventListener("scroll", schedule, { passive: true });
		return () => {
			observer.disconnect();
			viewport.removeEventListener("scroll", schedule);
			if (raf != null) cancelAnimationFrame(raf);
			viewport.style.clipPath = "";
		};
	}, [paged, currentPage, zoom, horizontal, spreadMode, viewportRef]);

	return null;
}
