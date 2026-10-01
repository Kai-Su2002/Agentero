import { describe, expect, it } from "vitest";

import {
	locateQuoteGlyphs,
	translationSelectionFromHits,
} from "@/lib/pdf/layout/layout-sentence-selection";
import type { LayoutTranslateSentence } from "@/lib/pdf/layout/types";

function glyph(content: string, x: number, y: number, width = 80) {
	return {
		content,
		rect: { origin: { x, y }, size: { width, height: 12 } },
	};
}

const sentence = (
	quote: string,
	translated: string,
): LayoutTranslateSentence => ({ quote, source: quote, translated });

describe("translationSelectionFromHits", () => {
	const block = {
		id: "a",
		pageIndex: 0,
		bbox: { x: 0.1, y: 0.2, w: 0.4, h: 0.1 },
		source: "First sentence. Second sentence. Third sentence.",
		sentences: [
			sentence("First sentence.", "第一句。"),
			sentence("Second sentence.", "第二句。"),
			sentence("Third sentence.", "第三句。"),
		],
	};

	it("expands a partial sentence to that whole English sentence", () => {
		const selection = translationSelectionFromHits(
			[{ itemId: "a", sentenceIndex: 0 }],
			[block],
			"zh-CN",
			"第一",
		);
		expect(selection?.quote).toBe("First sentence.");
		expect(selection?.copyText).toBe("第一");
		expect(selection?.paired).toBe("第一句。");
		expect(selection?.pages).toHaveLength(1);
	});

	it("keeps consecutive sentences and drops the one outside the selection", () => {
		const selection = translationSelectionFromHits(
			[
				{ itemId: "a", sentenceIndex: 0 },
				{ itemId: "a", sentenceIndex: 1 },
			],
			[block],
			"zh-CN",
			"第一句。第二句。",
		);
		expect(selection?.quote).toBe("First sentence. Second sentence.");
		expect(selection?.paired).toBe("第一句。第二句。");
		expect(selection?.quote).not.toContain("Third");
	});

	it("uses one English sentence when both boxes of a chain are selected", () => {
		const quote =
			"the agent queries the environment and then updates its policy.";
		const left = {
			id: "left",
			pageIndex: 0,
			bbox: { x: 0.1, y: 0.2, w: 0.3, h: 0.1 },
			source: "the agent queries the",
			raw: "the agent queries the",
			sentences: [
				{
					quote,
					source: quote,
					translated: "智能体查询环境。随后它更新自己的策略。",
					display: "智能体查询环境。",
				},
			],
		};
		const right = {
			...left,
			id: "right",
			pageIndex: 1,
			source: "environment and then updates its policy.",
			raw: "environment and then updates its policy.",
		};
		const selection = translationSelectionFromHits(
			[
				{ itemId: "left", sentenceIndex: 0 },
				{ itemId: "right", sentenceIndex: 0 },
			],
			[left, right],
			"zh-CN",
			"智能体查询环境。随后",
		);
		expect(selection?.quote).toBe(quote);
		expect(selection?.pages.map((page) => page.locateText)).toEqual([
			"the agent queries the",
			"environment and then updates its policy.",
		]);
	});

	it("anchors a block without sentence pairs to its whole English source", () => {
		const selection = translationSelectionFromHits(
			[{ itemId: "bare", sentenceIndex: null }],
			[
				{
					id: "bare",
					pageIndex: 2,
					bbox: { x: 0.1, y: 0.2, w: 0.4, h: 0.1 },
					source: "Whole block source.",
					translated: "整段。",
				},
			],
			"zh-CN",
			"整段",
		);
		expect(selection?.quote).toBe("Whole block source.");
		expect(selection?.paired).toBe("整段。");
		expect(selection?.pages[0]?.locateText).toBe("Whole block source.");
	});
});

describe("locateQuoteGlyphs", () => {
	const page = { pageWidth: 600, pageHeight: 800 };

	it("returns the glyph run that contains the quote", () => {
		const rects = locateQuoteGlyphs({
			quote: "the agent queries the",
			glyphs: [
				glyph("the agent queries the ", 40, 100, 120),
				glyph("environment.", 40, 120, 90),
			],
			...page,
			bbox: { x: 0.05, y: 0.1, w: 0.4, h: 0.05 },
		});
		expect(rects).toHaveLength(1);
		expect(rects[0]?.origin.y).toBe(100);
	});

	it("prefers the hit that overlaps the layout block", () => {
		const rects = locateQuoteGlyphs({
			quote: "Hello.",
			glyphs: [glyph("Hello. ", 40, 40), glyph("Hello.", 40, 400)],
			...page,
			bbox: { x: 0.05, y: 0.48, w: 0.3, h: 0.05 },
		});
		expect(rects[0]?.origin.y).toBe(400);
	});

	it("highlights only the sentence, not the other lines in the block", () => {
		const rects = locateQuoteGlyphs({
			quote: "Second sentence.",
			glyphs: [
				glyph("First sentence.", 40, 80, 140),
				glyph("Second sentence.", 40, 100, 150),
				glyph("Third sentence.", 40, 120, 130),
			],
			...page,
			bbox: { x: 0.05, y: 0.08, w: 0.4, h: 0.1 },
		});
		expect(rects).toHaveLength(1);
		expect(rects[0]?.origin.y).toBe(100);
		expect(rects[0]?.size.width).toBe(150);
	});

	it("does not paint the whole block when the quote is missing", () => {
		const rects = locateQuoteGlyphs({
			quote: "not on this page",
			glyphs: [
				glyph("First sentence.", 40, 80, 140),
				glyph("Second sentence.", 40, 100, 150),
			],
			...page,
			bbox: { x: 0.05, y: 0.08, w: 0.4, h: 0.08 },
			blockText: "First sentence. Second sentence.",
		});
		expect(rects).toEqual([]);
	});

	it("slices the block by the sentence instead of filling it", () => {
		const rects = locateQuoteGlyphs({
			quote: "Second sentence.",
			glyphs: [
				glyph("AAAA", 40, 80, 80),
				glyph("BBBB", 40, 100, 80),
				glyph("CCCC", 40, 120, 80),
			],
			...page,
			bbox: { x: 0.05, y: 0.08, w: 0.4, h: 0.1 },
			blockText: "First sentence. Second sentence. Third sentence.",
		});
		expect(rects.length).toBeGreaterThan(0);
		expect(rects.every((rect) => rect.origin.y === 100)).toBe(true);
	});

	it("places a hyphenated sentence on the runs that contain it", () => {
		const rects = locateQuoteGlyphs({
			quote: "representation stays.",
			glyphs: [
				glyph("Earlier words.", 40, 80, 100),
				glyph("repre-", 40, 100, 40),
				glyph("sentation stays.", 84, 100, 110),
			],
			...page,
			bbox: { x: 0.05, y: 0.08, w: 0.5, h: 0.08 },
		});
		expect(rects.map((rect) => rect.origin.y)).toEqual([100, 100]);
		expect(rects.some((rect) => rect.origin.y === 80)).toBe(false);
	});
});
