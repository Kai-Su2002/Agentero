/** Shared pin geometry for ask / annotate / translate anchors. */

import type { PdfTextRectObject, Size } from "@embedpdf/models";

import { clamp01 } from "@/lib/core/math";

export type NormalizedRect = {
	x: number;
	y: number;
	w: number;
	h: number;
};

export type PinSide = "left" | "right";

export type PinPlacement = {
	x: number;
	y: number;
	/** Which side of the selection the pin sits on. */
	side: PinSide;
};

/** Gap between selection edge and pin anchor (page fraction). */
const PIN_GAP = 0.014;
/** Pill size in page-normalized units (~24px on ~700px page). */
const PIN_W = 0.04;
const PIN_H = 0.032;
/** Keep side-anchored pins fully visible inside the page. */
const PIN_EDGE_MARGIN = 0.01;
const PIN_RENDER_GAP = 0.003;
/** Min fraction of the pin area that must cover glyphs to count as over text. */
const MIN_TEXT_COVERAGE = 0.12;

/**
 * Convert EmbedPDF page text rects (PDF points) into 0–1 page fractions.
 * Skips empty / whitespace-only runs.
 */
export function normalizePageTextRects(
	rects: readonly PdfTextRectObject[],
	pageSize: Size,
): NormalizedRect[] {
	const pw = pageSize.width || 1;
	const ph = pageSize.height || 1;
	const out: NormalizedRect[] = [];
	for (const tr of rects) {
		const content = tr.content?.replace(/\s+/g, "") ?? "";
		if (!content) continue;
		const w = tr.rect.size.width / pw;
		const h = tr.rect.size.height / ph;
		if (w <= 0 || h <= 0) continue;
		out.push({
			x: clamp01(tr.rect.origin.x / pw),
			y: clamp01(tr.rect.origin.y / ph),
			w: clamp01(w),
			h: clamp01(h),
		});
	}
	return out;
}

/** Visual footprint of a side-anchored pin (matches SelectionGutter transform). */
function pinFootprint(pin: {
	x: number;
	y: number;
	side?: PinSide;
}): NormalizedRect {
	const y = pin.y - PIN_H / 2;
	if (pin.side === "left") {
		return {
			x: pin.x - PIN_W - PIN_RENDER_GAP,
			y,
			w: PIN_W,
			h: PIN_H,
		};
	}
	return { x: pin.x + PIN_RENDER_GAP, y, w: PIN_W, h: PIN_H };
}

function overlapArea(a: NormalizedRect, b: NormalizedRect): number {
	const ol = Math.max(a.x, b.x);
	const or_ = Math.min(a.x + a.w, b.x + b.w);
	const ot = Math.max(a.y, b.y);
	const ob = Math.min(a.y + a.h, b.y + b.h);
	const ow = or_ - ol;
	const oh = ob - ot;
	if (ow <= 0 || oh <= 0) return 0;
	return ow * oh;
}

/**
 * True when the pin's visual footprint covers real page glyphs
 * (from PDFium `getPageTextRects`). No page text → false (solid default).
 */
export function pinObscuresBodyText(
	pin: { x: number; y: number; side?: PinSide },
	pageText?: readonly NormalizedRect[],
): boolean {
	if (!pageText?.length) return false;
	const foot = pinFootprint(pin);
	const pinArea = Math.max(foot.w * foot.h, 1e-9);
	let covered = 0;
	for (const t of pageText) {
		covered += overlapArea(foot, t);
		if (covered / pinArea >= MIN_TEXT_COVERAGE) return true;
	}
	return false;
}

/**
 * Place a pin beside the last selected line so a multi-line paragraph does not
 * force its marker to the left edge of the whole text block. Prefer right; if
 * that side covers glyphs (and page text is known), try left.
 */
export function pinFromRects(
	rects: NormalizedRect[],
	pageText?: readonly NormalizedRect[],
): PinPlacement {
	if (!rects.length) return { x: 0.5, y: 0.12, side: "right" };

	let last = rects[0];
	for (const r of rects) {
		if (r.y + r.h > last.y + last.h + 1e-6) {
			last = r;
		} else if (
			Math.abs(r.y + r.h - (last.y + last.h)) <= 1e-6 &&
			r.x + r.w > last.x + last.w
		) {
			last = r;
		}
	}

	const y = Math.min(0.98, Math.max(0.02, last.y + last.h / 2));
	const minLeftX = PIN_EDGE_MARGIN + PIN_W + PIN_RENDER_GAP;
	const maxRightX = 1 - PIN_EDGE_MARGIN - PIN_W - PIN_RENDER_GAP;
	const rightCandidate = last.x + last.w + PIN_GAP;
	const leftCandidate = last.x - PIN_GAP;
	const rightX = Math.min(maxRightX, Math.max(0.02, rightCandidate));
	const leftX = Math.min(0.98, Math.max(minLeftX, leftCandidate));
	const rightPin: PinPlacement = { x: rightX, y, side: "right" };
	const leftPin: PinPlacement = { x: leftX, y, side: "left" };

	const canRight = rightCandidate <= maxRightX;
	const canLeft = leftCandidate >= minLeftX;

	if (!pageText?.length) {
		return canRight ? rightPin : canLeft ? leftPin : rightPin;
	}
	if (canRight && !pinObscuresBodyText(rightPin, pageText)) return rightPin;
	if (canLeft && !pinObscuresBodyText(leftPin, pageText)) return leftPin;
	return canRight ? rightPin : canLeft ? leftPin : rightPin;
}
