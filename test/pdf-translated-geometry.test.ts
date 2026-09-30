import { describe, expect, it } from "vitest";

import {
	partitionHighlightPaint,
	sanitizeTranslatedRects,
} from "@/lib/pdf/highlight/translated-geometry";
import type { PdfHighlight } from "@/lib/pdf/highlight/types";

function highlight(
	partial: Partial<PdfHighlight> & Pick<PdfHighlight, "id" | "quote">,
): PdfHighlight {
	return {
		version: 1,
		kind: "highlight",
		paperPath: "papers/test",
		createdAt: "2026-09-30T00:00:00Z",
		updatedAt: "2026-09-30T00:00:00Z",
		page: 1,
		rects: [{ x: 0.1, y: 0.4, w: 0.5, h: 0.08 }],
		...partial,
	};
}

describe("sanitizeTranslatedRects", () => {
	it("keeps finite positive boxes and drops the rest", () => {
		expect(
			sanitizeTranslatedRects([
				{ x: 0.2, y: 0.3, w: 0.1, h: 0.02 },
				{ x: 0, y: 0, w: 0, h: 0.1 },
				{ x: Number.NaN, y: 0, w: 0.1, h: 0.1 },
				null,
				"nope",
			]),
		).toEqual([{ x: 0.2, y: 0.3, w: 0.1, h: 0.02 }]);
	});
});

describe("partitionHighlightPaint", () => {
	it("paints a recorded translation from its own boxes, not the sentence tint", () => {
		const { quotesByPage, translatedByPage } = partitionHighlightPaint([
			highlight({
				id: "cn",
				quote: "Our work has three contributions.",
				color: "yellow",
				translatedRects: [{ x: 0.22, y: 0.31, w: 0.18, h: 0.02 }],
			}),
			highlight({
				id: "en",
				quote: "Earlier English sentence.",
				page: 2,
			}),
		]);
		expect(quotesByPage.get(1)).toBeUndefined();
		expect(quotesByPage.get(2)).toEqual([
			{ quote: "Earlier English sentence.", color: "yellow" },
		]);
		expect(translatedByPage.get(1)).toEqual([
			{
				id: "cn",
				color: "yellow",
				rects: [{ x: 0.22, y: 0.31, w: 0.18, h: 0.02 }],
			},
		]);
	});
});
