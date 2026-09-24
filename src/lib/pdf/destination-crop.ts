/**
 * Crop region for an in-text citation's destination — the bibliography entry a
 * `[N]` link jumps to — shown as an in-place preview when no structured
 * sidecar metadata is available.
 *
 * Prefers the destination page's text rects: cluster them into lines inside
 * the target column, find the line that opens entry N, and extend until the
 * next entry starts. Falls back to the layout region containing the anchor,
 * then to plain column geometry.
 */

import { clamp01 } from "@/lib/core/math";
import type { PdfLayoutRegion } from "@/lib/pdf/layout/types";
import type { PageTextRect } from "@/lib/pdf/link-text";

export type PickDestinationRegionOptions = {
	pageIndex: number;
	pdfX: number | null;
	pdfY: number;
	pageWidthPt: number;
	pageHeightPt: number;
	regions?: readonly PdfLayoutRegion[];
	textRects?: readonly PageTextRect[];
	/** Bibliography number the link cites, when known. */
	entryIndex?: number | null;
};

export type DestinationCropRegion = {
	pageIndex: number;
	bbox: { x: number; y: number; w: number; h: number };
	/**
	 * True when a line opening entry `entryIndex` (`[N]` / `N.`) was found near
	 * the destination — proof the link really lands on a bibliography entry.
	 */
	entryMatched: boolean;
};

/** US Letter, used when the page size is unavailable. */
const DEFAULT_PAGE_WIDTH_PT = 612;
const DEFAULT_PAGE_HEIGHT_PT = 792;

// Empirical thresholds (PDF points unless noted), tuned on IEEE / ACM /
// USENIX / Springer bibliographies.
/** Rect centres closer than this share a text line. */
const LINE_CLUSTER_TOLERANCE_PT = 4;
/** Rects may start this far left of the column edge (hanging `[N]` labels). */
const COLUMN_EDGE_SLACK_PT = 6;
/** Search radius around the destination y for the `[N]` / `N.` line. */
const ENTRY_SEARCH_RADIUS_PT = 120;
/** Without a marker, the nearest line must lie within this of the anchor. */
const ANCHOR_LINE_RADIUS_PT = 60;
/** Window above / below the anchor scanned for any entry-start line. */
const ANCHOR_WINDOW_ABOVE_PT = 16;
const ANCHOR_WINDOW_BELOW_PT = 24;
/** Hard cap on one entry's height (~12–14 lines). */
const ENTRY_MAX_HEIGHT_PT = 160;
/** Lines this close to the entry's first-line x count as "back at margin". */
const HANGING_INDENT_SLACK_PT = 3;
/** Padding around the entry's text bounds. */
const CROP_PAD_X_PT = 6;
const CROP_PAD_Y_PT = 5;

// Normalized (0–1 of the page) limits.
const CROP_MIN_W = 0.18;
const CROP_MAX_W = 0.96;
const CROP_MIN_H = 0.02;
const CROP_MAX_H = 0.3;
/** Crops stay inside this page margin. */
const PAGE_EDGE = 0.98;
/** Height of the geometry-only fallback crop. */
const FALLBACK_H = 0.12;

/**
 * Labelled bibliography entry starts:
 * - [1], [ 1 ], [12] (bracketed numbers)
 * - [ABC24], [DEF+25], [Ghi26] (bracketed alphanumeric keys — always with
 *   year digits, so IEEE's "[Online]. Available: …" continuation is not one)
 * - 1., 12. (dot-numbered)
 */
const LABELLED_ENTRY_START_REGEX =
	/^\s*(?:\[\s*\d+\s*\]|\[[A-Za-z+]*\d[A-Za-z0-9+]*\]|\d{1,3}\s?\.\s)/;
/**
 * Author-year entry starts: "Author et al., 2024", "Writer (2025)". Only used
 * in bibliographies without labels — in a labelled one, continuation lines
 * such as "USA, 2017, pp. 2123–2138." would match too.
 */
const AUTHOR_YEAR_ENTRY_START_REGEX =
	/^\s*[A-Z][A-Za-z]+(?:\s+et\s+al\.)?,?\s+(?:\(?\s*(?:19|20)\d{2}\)?)/;

/** Entry-start test for one column's lines, by its bibliography style. */
function entryStartTest(lines: readonly TextLine[]): (text: string) => boolean {
	const labelled = lines.some((l) => LABELLED_ENTRY_START_REGEX.test(l.text));
	return labelled
		? (text) => LABELLED_ENTRY_START_REGEX.test(text)
		: (text) => AUTHOR_YEAR_ENTRY_START_REGEX.test(text);
}

/**
 * Line that opens bibliography entry `n`: `[n]`, `[n:` or `n. `. Rects are
 * joined with spaces, so the number and its dot may arrive as `n .`.
 */
function entryMarkerRegex(n: number): RegExp {
	return new RegExp(`^\\s*(?:\\[\\s*${n}\\s*[\\]:]|${n}\\s?\\.\\s)`);
}

/** Whether layout regions show a narrow right-hand column. */
function hasTwoColumnRegions(
	regions: readonly PdfLayoutRegion[] | undefined,
): boolean {
	return regions?.some((r) => r.bbox.x >= 0.48 && r.bbox.w < 0.5) ?? false;
}

type TextLine = {
	minY: number;
	maxY: number;
	minX: number;
	maxX: number;
	text: string;
};

/** Cluster rects into lines, top to bottom. */
function clusterLines(rects: readonly PageTextRect[]): TextLine[] {
	const sorted = [...rects].sort((a, b) => a.rect.origin.y - b.rect.origin.y);
	const clusters: { yCenter: number; rects: PageTextRect[] }[] = [];
	for (const r of sorted) {
		const centre = r.rect.origin.y + r.rect.size.height / 2;
		const line = clusters.find(
			(c) => Math.abs(c.yCenter - centre) <= LINE_CLUSTER_TOLERANCE_PT,
		);
		if (line) {
			line.rects.push(r);
			line.yCenter =
				(line.yCenter * (line.rects.length - 1) + centre) / line.rects.length;
		} else {
			clusters.push({ yCenter: centre, rects: [r] });
		}
	}
	return clusters
		.map((line) => {
			line.rects.sort((a, b) => a.rect.origin.x - b.rect.origin.x);
			return {
				minY: Math.min(...line.rects.map((r) => r.rect.origin.y)),
				maxY: Math.max(
					...line.rects.map((r) => r.rect.origin.y + r.rect.size.height),
				),
				minX: Math.min(...line.rects.map((r) => r.rect.origin.x)),
				maxX: Math.max(
					...line.rects.map((r) => r.rect.origin.x + r.rect.size.width),
				),
				text: line.rects.map((r) => r.content).join(" "),
			};
		})
		.sort((a, b) => a.minY - b.minY);
}

function nearestLine(lines: readonly TextLine[], y: number): TextLine {
	return lines.reduce((best, l) =>
		Math.abs(l.minY - y) < Math.abs(best.minY - y) ? l : best,
	);
}

/** Clamp a normalized crop so it keeps its size and stays on the page. */
function clampCrop(
	x: number,
	y: number,
	w: number,
	h: number,
): { x: number; y: number; w: number; h: number } {
	const width = Math.min(w, PAGE_EDGE);
	const height = Math.min(h, PAGE_EDGE);
	return {
		x: Math.min(clamp01(x), PAGE_EDGE - width),
		y: Math.min(clamp01(y), PAGE_EDGE - height),
		w: width,
		h: height,
	};
}

/** Crop the entry from the destination page's text lines, or null. */
function cropFromText(
	textRects: readonly PageTextRect[],
	options: {
		wPt: number;
		hPt: number;
		targetYPt: number;
		normX: number | null;
		regions?: readonly PdfLayoutRegion[];
		entryIndex?: number | null;
	},
): { bbox: DestinationCropRegion["bbox"]; entryMatched: boolean } | null {
	const { wPt, hPt, targetYPt, normX, regions, entryIndex } = options;
	// Detect whether this page has a multi-column (e.g. 2-column) layout.
	const inBody = (r: PageTextRect) =>
		r.rect.origin.y > 0.08 * hPt && r.rect.origin.y < 0.92 * hPt;
	const hasRightColumnText = textRects.some(
		(r) => inBody(r) && r.rect.origin.x >= 0.51 * wPt,
	);
	const hasLeftColumnText = textRects.some(
		(r) => inBody(r) && r.rect.origin.x < 0.45 * wPt,
	);
	const isTwoColumn =
		(hasRightColumnText && hasLeftColumnText) || hasTwoColumnRegions(regions);

	// Column bounds: in a two-column paper the page centre divides the columns.
	let minColX = 0;
	let maxColX = wPt;
	if (isTwoColumn) {
		if (normX != null && normX >= 0.48) minColX = 0.5 * wPt;
		else maxColX = 0.5 * wPt;
	}

	// Keep only the target column, never spilling into the adjacent one. A
	// right-column run must also cross the divide: left-column text that
	// overhangs into the gutter (a trailing ",") starts inside the slack too.
	const colRects = textRects.filter((r) => {
		const x = r.rect.origin.x;
		return (
			r.content?.trim() &&
			x >= minColX - COLUMN_EDGE_SLACK_PT &&
			x <= maxColX &&
			(minColX === 0 || x + r.rect.size.width > minColX)
		);
	});
	if (colRects.length === 0) return null;
	const lines = clusterLines(colRects);
	const isEntryStart = entryStartTest(lines);

	const marker = entryIndex != null ? entryMarkerRegex(entryIndex) : null;
	const exactCandidates = marker
		? lines.filter(
				(l) =>
					marker.test(l.text) &&
					Math.abs(l.minY - targetYPt) <= ENTRY_SEARCH_RADIUS_PT,
			)
		: [];
	const entryMatched = exactCandidates.length > 0;

	let startLine: TextLine;
	if (entryMatched) {
		startLine = nearestLine(exactCandidates, targetYPt);
	} else {
		const markerCandidates = lines.filter(
			(l) =>
				l.maxY >= targetYPt - ANCHOR_WINDOW_ABOVE_PT &&
				l.minY <= targetYPt + ANCHOR_WINDOW_BELOW_PT &&
				isEntryStart(l.text),
		);
		startLine = nearestLine(
			markerCandidates.length > 0 ? markerCandidates : lines,
			targetYPt,
		);
	}

	const startIdx = lines.indexOf(startLine);
	if (
		startIdx < 0 ||
		(!entryMatched &&
			Math.abs(startLine.minY - targetYPt) > ANCHOR_LINE_RADIUS_PT)
	) {
		return null;
	}

	const entryLines = [startLine];
	const startHasMarker = isEntryStart(startLine.text);
	const baseLeftX = startLine.minX;
	for (let i = startIdx + 1; i < lines.length; i++) {
		const prev = lines[i - 1];
		const curr = lines[i];
		if (!prev || !curr) break;
		// The next entry starts.
		if (isEntryStart(curr.text)) break;
		// Wrapped lines of one entry sit tight (≤ ~half a line apart); a gap
		// over a full line ends the bibliography.
		if (curr.minY - prev.maxY > startLine.maxY - startLine.minY) break;
		// Without a marker the entry uses a hanging indent; back at the
		// margin means a new paragraph / entry.
		if (
			!startHasMarker &&
			curr.minX <= baseLeftX + HANGING_INDENT_SLACK_PT &&
			i > startIdx + 1
		) {
			break;
		}
		// With a marker, continuation lines hang right of it; a line back at
		// the marker column is the text after the bibliography.
		if (startHasMarker && curr.minX <= baseLeftX + HANGING_INDENT_SLACK_PT) {
			break;
		}
		if (curr.maxY - startLine.minY > ENTRY_MAX_HEIGHT_PT) break;
		entryLines.push(curr);
	}

	const minX = Math.min(...entryLines.map((l) => l.minX));
	const maxX = Math.max(...entryLines.map((l) => l.maxX));
	const minY = Math.min(...entryLines.map((l) => l.minY));
	const maxY = Math.max(...entryLines.map((l) => l.maxY));

	// Pad, but never into the neighbouring lines.
	const nextLine = lines[startIdx + entryLines.length];
	const prevLine = startIdx > 0 ? lines[startIdx - 1] : undefined;
	const rawCropTop = Math.max(0, minY - CROP_PAD_Y_PT);
	const rawCropBottom = Math.min(hPt, maxY + CROP_PAD_Y_PT);
	const cropTop =
		prevLine != null
			? Math.min(minY, Math.max(prevLine.maxY + 1, rawCropTop))
			: rawCropTop;
	const cropBottom =
		nextLine != null
			? Math.max(maxY, Math.min(nextLine.minY - 1, rawCropBottom))
			: rawCropBottom;
	const cropLeft = Math.max(minColX, minX - CROP_PAD_X_PT);
	const cropRight = Math.min(maxColX, maxX + CROP_PAD_X_PT);

	const w = Math.max(
		CROP_MIN_W,
		Math.min(CROP_MAX_W, (cropRight - cropLeft) / wPt),
	);
	// The minimum height must not reach into the next entry.
	const maxBottom = nextLine != null ? nextLine.minY - 1 : hPt;
	const h = Math.min(
		Math.max(CROP_MIN_H, Math.min(CROP_MAX_H, (cropBottom - cropTop) / hPt)),
		Math.max(cropBottom, maxBottom) / hPt - cropTop / hPt,
	);
	return {
		bbox: clampCrop(cropLeft / wPt, cropTop / hPt, w, h),
		entryMatched,
	};
}

/** Crop the layout region containing the anchor, clamped to one column. */
function cropFromLayout(
	pageIndex: number,
	regions: readonly PdfLayoutRegion[] | undefined,
	normX: number | null,
	normY: number,
): DestinationCropRegion["bbox"] | null {
	const containing = (regions ?? []).filter((r) => {
		if (r.pageIndex !== pageIndex) return false;
		const inY = normY >= r.bbox.y - 0.02 && normY <= r.bbox.y + r.bbox.h + 0.02;
		if (!inY) return false;
		if (normX == null) return true;
		return normX >= r.bbox.x - 0.02 && normX <= r.bbox.x + r.bbox.w + 0.02;
	});
	const region =
		normX != null && containing.length > 1
			? containing.reduce((best, r) =>
					Math.abs(r.bbox.x - normX) < Math.abs(best.bbox.x - normX) ? r : best,
				)
			: containing[0];
	if (!region || region.bbox.w < 0.2) return null;

	let x = region.bbox.x;
	let w = region.bbox.w;
	// A full-width region on a two-column page: keep the anchor's column only.
	if (hasTwoColumnRegions(regions) && w > 0.52) {
		if (normX != null && normX >= 0.48) {
			x = 0.5;
			w = 0.46;
		} else {
			x = Math.max(0.04, region.bbox.x);
			w = Math.min(0.44, 0.5 - x);
		}
	}
	const y = Math.max(0.01, normY - 0.015);
	return { x, y, w, h: Math.min(FALLBACK_H, PAGE_EDGE - y) };
}

/** Last resort: a strip below the anchor in its (guessed) column. */
function cropFromGeometry(
	regions: readonly PdfLayoutRegion[] | undefined,
	normX: number | null,
	normY: number,
): DestinationCropRegion["bbox"] {
	const y = Math.max(0.01, normY - 0.015);
	const h = Math.min(FALLBACK_H, PAGE_EDGE - y);
	let x = 0.06;
	let w = 0.88;
	if (normX != null) {
		if (normX >= 0.45) {
			x = Math.max(0.48, normX - 0.02);
			w = Math.min(0.46, PAGE_EDGE - x);
		} else if (hasTwoColumnRegions(regions) || normX > 0.05) {
			x = Math.max(0.04, normX - 0.02);
			w = Math.min(0.46, 0.48 - x + 0.02);
		}
	}
	return { x, y, w, h };
}

/**
 * Normalized crop for an internal link destination (an in-text citation whose
 * structured metadata lookup failed). Text rects isolate exactly the entry;
 * layout regions and column geometry are fallbacks.
 */
export function pickDestinationRegion({
	pageIndex,
	pdfX,
	pdfY,
	pageWidthPt,
	pageHeightPt,
	regions,
	textRects,
	entryIndex,
}: PickDestinationRegionOptions): DestinationCropRegion {
	const wPt = pageWidthPt > 0 ? pageWidthPt : DEFAULT_PAGE_WIDTH_PT;
	const hPt = pageHeightPt > 0 ? pageHeightPt : DEFAULT_PAGE_HEIGHT_PT;
	// pdfY is PDF space (origin bottom-left); text rects and renderPageRect use
	// device space (origin top-left).
	const targetYPt = hPt - (pdfY > 0 ? pdfY : hPt * 0.9);
	const normX = pdfX != null && pdfX > 0 ? clamp01(pdfX / wPt) : null;
	const normY = clamp01(targetYPt / hPt);

	if (textRects && textRects.length > 0) {
		const fromText = cropFromText(textRects, {
			wPt,
			hPt,
			targetYPt,
			normX,
			regions,
			entryIndex,
		});
		if (fromText) return { pageIndex, ...fromText };
	}
	const bbox =
		cropFromLayout(pageIndex, regions, normX, normY) ??
		cropFromGeometry(regions, normX, normY);
	return { pageIndex, bbox, entryMatched: false };
}
