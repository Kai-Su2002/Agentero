// Synthetic text only; labels and geometry exercise the crop boundaries.
import { describe, expect, it } from "vitest";
import { pickDestinationRegion } from "@/lib/pdf/destination-crop";
import type { PdfLayoutRegion } from "@/lib/pdf/layout/types";

function region(
	pageIndex: number,
	kind: PdfLayoutRegion["kind"],
	bbox: PdfLayoutRegion["bbox"],
	title?: string,
	id = "r",
): PdfLayoutRegion {
	return { pageIndex, kind, bbox, score: 1, id, title };
}

function textRect(
	x: number,
	y: number,
	width: number,
	height: number,
	content: string,
) {
	return { rect: { origin: { x, y }, size: { width, height } }, content };
}

describe("pickDestinationRegion", () => {
	it("isolates single reference entry from [N] marker until the next marker [N+1]", () => {
		const textRects = [
			textRect(50, 72, 240, 9, "[1] Sample reference."),
			textRect(65, 82, 220, 9, "Sample continuation."),
			textRect(65, 92, 40, 9, "2025."),

			textRect(50, 104, 240, 9, "[2] Sample reference."),
		];

		const result = pickDestinationRegion({
			pageIndex: 11,
			pdfX: 50,
			pdfY: 722,
			pageWidthPt: 612,
			pageHeightPt: 792,
			textRects,
		});

		expect(result.pageIndex).toBe(11);

		expect(result.bbox.y).toBeLessThanOrEqual(72 / 792);

		const bottomPt = (result.bbox.y + result.bbox.h) * 792;
		expect(bottomPt).toBeLessThan(104);
	});

	it("clamps full-width layout regions to a single column when the document is two-column", () => {
		const regions = [
			region(8, "text", { x: 0.52, y: 0.1, w: 0.42, h: 0.4 }),

			region(8, "text", { x: 0.05, y: 0.1, w: 0.88, h: 0.8 }),
		];

		const result = pickDestinationRegion({
			pageIndex: 8,
			pdfX: 45,
			pdfY: 554.4,
			pageWidthPt: 612,
			pageHeightPt: 792,
			regions,
		});

		expect(result.bbox.w).toBeLessThanOrEqual(0.46);
		expect(result.bbox.x + result.bbox.w).toBeLessThanOrEqual(0.5);
	});

	it("aligns to layout text regions when textRects are absent", () => {
		const regions = [
			region(
				8,
				"text",
				{ x: 0.06, y: 0.1, w: 0.42, h: 0.8 },
				undefined,
				"col-1",
			),
			region(
				8,
				"text",
				{ x: 0.52, y: 0.1, w: 0.42, h: 0.8 },
				undefined,
				"col-2",
			),
		];

		const result = pickDestinationRegion({
			pageIndex: 8,
			pdfX: 324,
			pdfY: 554.4,
			pageWidthPt: 612,
			pageHeightPt: 792,
			regions,
		});
		expect(result.pageIndex).toBe(8);
		expect(result.bbox.x).toBe(0.52);
		expect(result.bbox.w).toBe(0.42);
		expect(result.bbox.y).toBeCloseTo(0.3 - 0.015, 2);
	});

	it("uses column geometry heuristic when regions and textRects are absent", () => {
		const left = pickDestinationRegion({
			pageIndex: 5,
			pdfX: 40,
			pdfY: 400,
			pageWidthPt: 612,
			pageHeightPt: 792,
		});
		expect(left.pageIndex).toBe(5);
		expect(left.bbox.x).toBeLessThan(0.4);
		expect(left.bbox.w).toBeLessThanOrEqual(0.46);

		const right = pickDestinationRegion({
			pageIndex: 5,
			pdfX: 320,
			pdfY: 400,
			pageWidthPt: 612,
			pageHeightPt: 792,
		});
		expect(right.pageIndex).toBe(5);
		expect(right.bbox.x).toBeGreaterThanOrEqual(0.48);
		expect(right.bbox.x + right.bbox.w).toBeLessThanOrEqual(0.98);
	});

	it("does not hijack distant entryIndex when far from destination anchor", () => {
		const textRects = [
			textRect(50, 72, 240, 9, "[4] Sample reference."),

			textRect(50, 400, 240, 9, "[18] Sample reference."),
		];

		const result = pickDestinationRegion({
			pageIndex: 11,
			pdfX: 50,
			pdfY: 792 - 400,
			pageWidthPt: 612,
			pageHeightPt: 792,
			textRects,
			entryIndex: 4,
		});

		expect(result.bbox.y * 792).toBeGreaterThanOrEqual(390);
	});
	it("reports entryMatched only when the [N] / N. line is found", () => {
		const textRects = [
			textRect(50, 72, 240, 9, "[7] Sample reference."),
			textRect(50, 84, 240, 9, "8.  Sample reference."),
		];
		const base = {
			pageIndex: 3,
			pdfX: 50,
			pdfY: 792 - 72,
			pageWidthPt: 612,
			pageHeightPt: 792,
			textRects,
		};
		expect(pickDestinationRegion({ ...base, entryIndex: 7 }).entryMatched).toBe(
			true,
		);
		expect(pickDestinationRegion({ ...base, entryIndex: 8 }).entryMatched).toBe(
			true,
		);

		expect(pickDestinationRegion({ ...base, entryIndex: 2 }).entryMatched).toBe(
			false,
		);
		expect(pickDestinationRegion(base).entryMatched).toBe(false);

		expect(
			pickDestinationRegion({ ...base, textRects: undefined, entryIndex: 7 })
				.entryMatched,
		).toBe(false);
	});

	it("keeps a minimum-width crop on the page instead of shrinking it at the right edge", () => {
		const textRects = [textRect(560, 300, 30, 9, "[3] Sample reference.")];
		const result = pickDestinationRegion({
			pageIndex: 0,
			pdfX: 560,
			pdfY: 792 - 300,
			pageWidthPt: 612,
			pageHeightPt: 792,
			textRects,
			entryIndex: 3,
		});
		expect(result.bbox.w).toBeGreaterThanOrEqual(0.18);
		expect(result.bbox.x + result.bbox.w).toBeLessThanOrEqual(0.98 + 1e-9);
	});

	it("does not read a labelled entry's continuation line as an author-year start", () => {
		const textRects = [
			textRect(330, 382, 172, 8, "Sample continuation."),
			textRect(317, 391, 246, 8, "[5] Sample reference."),
			textRect(330, 400, 234, 8, "Sample continuation."),
			textRect(330, 409, 95, 8, "Writer, 2025. Sample details."),
			textRect(317, 418, 246, 8, "[6] Sample reference."),
			textRect(330, 427, 116, 8, "Sample continuation."),
			textRect(317, 436, 246, 8, "[7] Sample reference."),
			textRect(330, 445, 231, 8, "Sample continuation."),

			textRect(59, 404, 241, 8, "Sample continuation."),
			textRect(49, 413, 251, 8, "Sample continuation."),
		];
		const base = {
			pageIndex: 10,
			pdfX: 312,
			pdfY: 381,
			pageWidthPt: 612,
			pageHeightPt: 792,
			textRects,
		};

		for (const entryIndex of [null, 6]) {
			const result = pickDestinationRegion({ ...base, entryIndex });
			expect(result.bbox.y * 792).toBeGreaterThan(409);
			expect(result.bbox.y * 792).toBeLessThanOrEqual(418);
			expect((result.bbox.y + result.bbox.h) * 792).toBeLessThan(436);
		}
	});

	it('does not take IEEE\'s "[Online]. Available:" line for an entry start', () => {
		const textRects = [
			textRect(317, 481, 246, 8, "[9] Sample reference."),
			textRect(
				331,
				490,
				232,
				8,
				"[Online]. Available: https://example.org/sample",
			),
			textRect(330, 499, 36, 8, "Sample continuation."),
			textRect(313, 508, 250, 8, "[10] Sample reference."),
			textRect(330, 517, 233, 8, "Sample continuation."),
			textRect(330, 526, 120, 8, "Writer, 2025. Sample details."),
			textRect(313, 535, 250, 8, "[11] Sample reference."),
			textRect(
				331,
				544,
				200,
				8,
				"[Online]. Available: https://example.org/sample",
			),
			textRect(49, 500, 251, 8, "Sample continuation."),
			textRect(49, 509, 251, 8, "Sample continuation."),
		];
		const base = {
			pdfX: 312,
			pageWidthPt: 612,
			pageHeightPt: 792,
			pageIndex: 10,
			textRects,
		};

		const ten = pickDestinationRegion({ ...base, pdfY: 792 - 499 });
		expect(ten.bbox.y * 792).toBeGreaterThan(499);
		expect(ten.bbox.y * 792).toBeLessThanOrEqual(508);
		expect((ten.bbox.y + ten.bbox.h) * 792).toBeLessThan(535);

		const eleven = pickDestinationRegion({ ...base, pdfY: 792 - 534 });
		expect((eleven.bbox.y + eleven.bbox.h) * 792).toBeGreaterThan(550);
	});

	it("stops the last entry at the appendix heading after it", () => {
		const textRects = [
			textRect(70, 320, 33, 7, "Sample continuation."),
			textRect(102, 321, 69, 6, "Sample continuation."),
			textRect(55, 328, 10, 7, "[56] "),
			textRect(69, 328, 225, 7, "Sample continuation."),
			textRect(69, 336, 225, 7, "Sample continuation."),
			textRect(69, 344, 98, 7, "Sample continuation."),
			textRect(169, 344, 126, 7, "Sample continuation."),
			textRect(70, 352, 33, 7, "Sample continuation."),
			textRect(102, 352, 193, 7, "Sample continuation."),
			textRect(54, 373, 113, 11, "Sample continuation."),
			textRect(54, 389, 116, 8, "Sample continuation."),
			textRect(64, 405, 25, 6, "Proof. "),
			textRect(93, 404, 175, 9, "Sample continuation."),
		];
		const result = pickDestinationRegion({
			pageIndex: 14,
			pdfX: 54,
			pdfY: 792 - 324.8,
			pageWidthPt: 612,
			pageHeightPt: 792,
			textRects,
		});
		const bottom = (result.bbox.y + result.bbox.h) * 792;
		expect(result.bbox.y * 792).toBeLessThanOrEqual(328);
		expect(bottom).toBeGreaterThanOrEqual(359);
		expect(bottom).toBeLessThan(373);
	});

	it("stops at a centred heading a line-height gap below the entry", () => {
		const textRects = [
			textRect(312, 148, 14, 9, "[63] "),
			textRect(334, 148, 230, 9, "Sample continuation."),
			textRect(334, 160, 60, 7, "Sample continuation."),
			textRect(396, 160, 166, 9, "Sample continuation."),
			textRect(334, 172, 20, 7, "2025."),
			textRect(408, 192, 22, 7, "Sample continuation."),
			textRect(431, 194, 34, 6, "Sample continuation."),
			textRect(322, 207, 248, 9, "Sample continuation."),
			textRect(312, 219, 258, 9, "https://example.org/sample"),
		];
		const result = pickDestinationRegion({
			pageIndex: 15,
			pdfX: 312,
			pdfY: 792 - 148,
			pageWidthPt: 612,
			pageHeightPt: 792,
			textRects,
		});
		const bottom = (result.bbox.y + result.bbox.h) * 792;
		expect(bottom).toBeGreaterThanOrEqual(179);
		expect(bottom).toBeLessThan(192);
	});

	it("keeps left-column text that overhangs the gutter out of the right column", () => {
		const left = [298, 306, 314, 322, 330, 338, 346].map((y) =>
			textRect(54, y, 246, 7, "Sample continuation."),
		);
		const textRects = [
			...left,
			textRect(300, 344, 2, 6, ","),
			textRect(320, 322, 12, 7, "[33] "),
			textRect(340, 322, 231, 7, "Sample continuation."),
			textRect(340, 330, 231, 7, "Sample continuation."),
			textRect(341, 340, 95, 7, "Sample continuation."),
			textRect(436, 340, 22, 7, ", 2025."),
			textRect(320, 351, 12, 7, "[34] "),
			textRect(340, 351, 231, 7, "Sample continuation."),
		];
		const result = pickDestinationRegion({
			pageIndex: 14,
			pdfX: 320,
			pdfY: 792 - 320,
			pageWidthPt: 612,
			pageHeightPt: 792,
			textRects,
		});
		const bottom = (result.bbox.y + result.bbox.h) * 792;
		expect(result.bbox.x * 612).toBeGreaterThanOrEqual(306);
		expect(bottom).toBeGreaterThanOrEqual(347);
		expect(bottom).toBeLessThan(351);
	});
});
