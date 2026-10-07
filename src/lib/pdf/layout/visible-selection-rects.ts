/**
 * Page-fraction boxes of a translation-overlay selection.
 *
 * The saved annotation keeps the English glyph boxes and, when the selection
 * was made on a translation, these boxes too. The toolbar, the right-rail
 * note chip, and the tint drawn while that chip is open follow these boxes.
 */

import { clamp01 } from "@/lib/core/math";
import type { PdfAskNormalizedRect } from "@/lib/pdf/ask/types";

export type ClientRectLike = {
	left: number;
	top: number;
	width: number;
	height: number;
};

export type PageFrame = {
	pageIndex: number;
	left: number;
	top: number;
	width: number;
	height: number;
};

export type VisibleSelectionPage = {
	/** 0-based page index, same as EmbedPDF. */
	pageIndex: number;
	rects: PdfAskNormalizedRect[];
};

const MIN_CLIENT_PX = 0.5;

function roundFraction(value: number): number {
	return Math.round(value * 1e6) / 1e6;
}

/**
 * Bucket client rects into the page whose box contains each rect's center.
 * Rects that hang off the page are clipped to it.
 */
export function visiblePagesFromClientRects(
	clientRects: readonly ClientRectLike[],
	pages: readonly PageFrame[],
): VisibleSelectionPage[] {
	const buckets = new Map<number, PdfAskNormalizedRect[]>();
	for (const rect of clientRects) {
		if (rect.width < MIN_CLIENT_PX || rect.height < MIN_CLIENT_PX) continue;
		const cx = rect.left + rect.width / 2;
		const cy = rect.top + rect.height / 2;
		const page = pages.find(
			(frame) =>
				frame.width > 0 &&
				frame.height > 0 &&
				cx >= frame.left &&
				cx <= frame.left + frame.width &&
				cy >= frame.top &&
				cy <= frame.top + frame.height,
		);
		if (!page) continue;
		const x0 = clamp01((rect.left - page.left) / page.width);
		const y0 = clamp01((rect.top - page.top) / page.height);
		const x1 = clamp01((rect.left + rect.width - page.left) / page.width);
		const y1 = clamp01((rect.top + rect.height - page.top) / page.height);
		const w = roundFraction(x1 - x0);
		const h = roundFraction(y1 - y0);
		if (w < 0.001 || h < 0.001) continue;
		const list = buckets.get(page.pageIndex) ?? [];
		list.push({
			x: roundFraction(x0),
			y: roundFraction(y0),
			w,
			h,
		});
		buckets.set(page.pageIndex, list);
	}
	return [...buckets.entries()]
		.sort((a, b) => a[0] - b[0])
		.map(([pageIndex, rects]) => ({ pageIndex, rects }));
}

/** Last visible page, and the top of its rects. Page number is 1-based. */
export function selectionAnchorFromVisible(
	pages: readonly VisibleSelectionPage[],
): { page: number; anchorY: number } | null {
	const chip = pages[pages.length - 1];
	if (!chip?.rects.length) return null;
	return {
		page: chip.pageIndex + 1,
		anchorY: Math.min(...chip.rects.map((rect) => rect.y)),
	};
}

/** Union top-center in page fractions. */
export function visibleTopCenter(
	rects: readonly PdfAskNormalizedRect[],
): { x: number; y: number } | null {
	if (!rects.length) return null;
	let minX = 1;
	let minY = 1;
	let maxX = 0;
	for (const rect of rects) {
		minX = Math.min(minX, rect.x);
		minY = Math.min(minY, rect.y);
		maxX = Math.max(maxX, rect.x + rect.w);
	}
	return { x: (minX + maxX) / 2, y: minY };
}

/**
 * Screen point for the floating toolbar. Prefers `preferredPageIndex` when
 * that page has visible rects; otherwise the last page.
 */
export function visibleMenuPoint(
	pages: readonly VisibleSelectionPage[],
	preferredPageIndex: number,
	pageBox: (pageIndex: number) => PageFrame | null,
): { x: number; y: number } | null {
	if (!pages.length) return null;
	const page =
		pages.find((item) => item.pageIndex === preferredPageIndex) ??
		pages[pages.length - 1];
	if (!page) return null;
	const point = visibleTopCenter(page.rects);
	const box = pageBox(page.pageIndex);
	if (!point || !box || box.width <= 0 || box.height <= 0) return null;
	return {
		x: box.left + point.x * box.width,
		y: box.top + point.y * box.height,
	};
}
