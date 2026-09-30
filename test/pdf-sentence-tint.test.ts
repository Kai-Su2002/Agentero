import { describe, expect, it } from "vitest";

import {
	sentenceIndexesForHighlightTint,
	sentenceIndexesOverlappingHighlight,
} from "@/lib/pdf/highlight/sentence-tint";
import type { PdfHighlightRect } from "@/lib/pdf/highlight/types";
import { sentenceGlyphRects } from "@/lib/pdf/layout/layout-sentence-selection";

const box = (y: number, h = 0.02): PdfHighlightRect => ({
	x: 0.1,
	y,
	w: 0.4,
	h,
});

describe("sentenceIndexesOverlappingHighlight", () => {
	const sentences = [box(0.2), box(0.4), box(0.6)];

	it("tints only the sentence whose box meets the highlight", () => {
		expect(
			sentenceIndexesOverlappingHighlight(
				[[sentences[0]], [sentences[1]], [sentences[2]]],
				[{ x: 0.12, y: 0.4, w: 0.08, h: 0.02 }],
			),
		).toEqual([1]);
	});

	it("keeps every sentence the highlight actually covers", () => {
		expect(
			sentenceIndexesOverlappingHighlight(
				[[sentences[0]], [sentences[1]], [sentences[2]]],
				[
					{ x: 0.1, y: 0.2, w: 0.4, h: 0.02 },
					{ x: 0.1, y: 0.4, w: 0.4, h: 0.02 },
				],
			),
		).toEqual([0, 1]);
	});

	it("drops a sliver that only clips the next sentence", () => {
		expect(
			sentenceIndexesOverlappingHighlight(
				[
					[{ x: 0.1, y: 0.2, w: 0.4, h: 0.04 }],
					[{ x: 0.1, y: 0.24, w: 0.4, h: 0.04 }],
				],
				[{ x: 0.1, y: 0.2, w: 0.4, h: 0.041 }],
			),
		).toEqual([0]);
	});
});

describe("sentenceIndexesForHighlightTint", () => {
	const sentences = [
		{ quote: "Alpha mentions representation once." },
		{ quote: "Beta mentions representation again." },
	];

	it("uses the overlapping sentence even when the word is in both quotes", () => {
		expect(
			sentenceIndexesForHighlightTint({
				sentences,
				quote: "representation",
				sentenceRects: [box(0.2), box(0.5)].map((rect) => [rect]),
				highlightRects: [{ x: 0.2, y: 0.5, w: 0.1, h: 0.02 }],
			}),
		).toEqual([1]);
	});

	it("matches a whole sentence by text until glyph boxes arrive", () => {
		expect(
			sentenceIndexesForHighlightTint({
				sentences,
				quote: "Beta mentions representation again.",
				sentenceRects: undefined,
				highlightRects: [{ x: 0.2, y: 0.5, w: 0.1, h: 0.02 }],
			}),
		).toEqual([1]);
	});

	it("does not spread a fragment across sentences before glyph boxes arrive", () => {
		expect(
			sentenceIndexesForHighlightTint({
				sentences,
				quote: "representation",
				sentenceRects: undefined,
				highlightRects: [{ x: 0.2, y: 0.5, w: 0.1, h: 0.02 }],
			}),
		).toEqual([]);
	});
});

describe("sentenceGlyphRects", () => {
	it("locates each sentence on its own line", () => {
		const glyph = (text: string, y: number) => ({
			text,
			rect: { origin: { x: 40, y }, size: { width: 120, height: 12 } },
		});
		const rects = sentenceGlyphRects({
			sentences: [{ quote: "First sentence." }, { quote: "Second sentence." }],
			source: "First sentence. Second sentence.",
			raw: "First sentence. Second sentence.",
			runs: [glyph("First sentence.", 80), glyph("Second sentence.", 100)],
			pageWidth: 400,
			pageHeight: 500,
			bbox: { x: 0.05, y: 0.1, w: 0.5, h: 0.15 },
		});
		expect(rects[0]?.every((rect) => rect.y === 80 / 500)).toBe(true);
		expect(rects[1]?.every((rect) => rect.y === 100 / 500)).toBe(true);
		expect(rects[0]?.some((rect) => rect.y === 100 / 500)).toBe(false);
	});
});
