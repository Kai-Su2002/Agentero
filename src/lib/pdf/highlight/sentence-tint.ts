/**
 * Which translated sentence an English highlight should color.
 *
 * The highlight already stores the English glyph boxes the reader marked.
 * Each sentence can be located to its own English glyph boxes. Overlap picks
 * the sentence. Text is only a stand-in until those boxes have been read.
 */

import type { PdfHighlightRect } from "@/lib/pdf/highlight/types";
import { sentenceIndexesCoveredByQuote } from "@/lib/pdf/layout/layout-sentences";

/** A sentence this much smaller than the best overlap is a border sliver. */
const MIN_SHARE_OF_BEST = 0.2;

function intersectionArea(a: PdfHighlightRect, b: PdfHighlightRect): number {
	const width = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
	const height = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
	if (width <= 0 || height <= 0) return 0;
	return width * height;
}

/**
 * Sentence indexes whose English boxes meet the highlight.
 * A box that only clips the neighbor's edge stays out.
 */
export function sentenceIndexesOverlappingHighlight(
	sentenceRects: readonly (readonly PdfHighlightRect[])[],
	highlightRects: readonly PdfHighlightRect[],
): number[] {
	if (!highlightRects.length) return [];
	const areas = sentenceRects.map((rects) => {
		let area = 0;
		for (const sentence of rects) {
			for (const highlight of highlightRects) {
				area += intersectionArea(sentence, highlight);
			}
		}
		return area;
	});
	const best = areas.reduce((max, area) => Math.max(max, area), 0);
	if (best <= 0) return [];
	const cutoff = best * MIN_SHARE_OF_BEST;
	const indexes: number[] = [];
	areas.forEach((area, index) => {
		if (area >= cutoff) indexes.push(index);
	});
	return indexes;
}

/**
 * Prefer glyph-box overlap. Fall back to an exact quote match when this
 * block's sentences have not been located on the text layer yet.
 */
export function sentenceIndexesForHighlightTint(options: {
	sentences: readonly { quote: string }[] | undefined;
	quote: string;
	sentenceRects: readonly (readonly PdfHighlightRect[])[] | undefined;
	highlightRects: readonly PdfHighlightRect[] | undefined;
}): number[] {
	const sentences = options.sentences ?? [];
	const highlightRects = options.highlightRects ?? [];
	const located =
		options.sentenceRects?.some((rects) => rects.length > 0) ?? false;
	if (located && highlightRects.length > 0 && options.sentenceRects) {
		return sentenceIndexesOverlappingHighlight(
			options.sentenceRects,
			highlightRects,
		);
	}
	return sentenceIndexesCoveredByQuote(sentences, options.quote);
}
