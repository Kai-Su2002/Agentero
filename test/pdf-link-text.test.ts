// Placeholder lengths preserve the positions of numbers within each text run.
import { describe, expect, it } from "vitest";
import {
	linkLabelText,
	type PageTextRect,
	parseBracketCitation,
} from "@/lib/pdf/link-text";

function text(
	x: number,
	y: number,
	width: number,
	content: string,
	height = 9,
): PageTextRect {
	return { rect: { origin: { x, y }, size: { width, height } }, content };
}

function link(x: number, y: number, width: number, height = 9) {
	return { origin: { x, y }, size: { width, height } };
}

describe("parseBracketCitation", () => {
	it("disambiguates numbers inside one bracket by link position", () => {
		const line = [text(50, 100, 25, "[1,2],", 10)];
		expect(parseBracketCitation(line, link(52, 100, 8, 10))).toEqual({
			entry: 1,
		});
		expect(parseBracketCitation(line, link(63, 100, 8, 10))).toEqual({
			entry: 2,
		});
	});

	it("reads fragmented runs where only the numbers are linked", () => {
		const line = [
			text(46, 627, 72, "cloud playground [", 10),
			text(118, 628, 8, "10", 8),
			text(127, 631, 5, "–", 3),
			text(133, 628, 8, "12", 8),
			text(142, 633, 2, ", ", 3),
			text(147, 628, 9, "31", 8),
			text(156, 633, 2, ", ", 3),
			text(161, 628, 9, "45", 8),
			text(170, 627, 3, "]", 10),
		];
		expect(parseBracketCitation(line, link(118, 628, 8, 8))).toEqual({
			entry: 10,
		});
		expect(parseBracketCitation(line, link(133, 628, 8, 8))).toEqual({
			entry: 12,
		});
		expect(parseBracketCitation(line, link(161, 628, 9, 8))).toEqual({
			entry: 45,
		});
	});

	it("follows a bracket group wrapped onto the next line", () => {
		const lines = [
			text(50, 100, 200, "as cloud in orchard blue [3, 6–", 10),
			text(50, 112, 200, "8] cloud waterfall sky garden.", 10),
		];
		expect(parseBracketCitation(lines, link(235, 100, 6, 10))).toEqual({
			entry: 6,
		});
		expect(parseBracketCitation(lines, link(50, 112, 6, 10))).toEqual({
			entry: 8,
		});
	});

	it("rejects numbers that are not inside a numeric bracket group", () => {
		const cases: [PageTextRect[], ReturnType<typeof link>][] = [
			[[text(50, 100, 44, "Theorem"), text(97, 100, 6, "2")], link(96, 100, 8)],
			[[text(50, 100, 34, "Listing"), text(87, 100, 6, "5")], link(86, 100, 8)],
			[
				[text(50, 100, 34, "Lemma"), text(87, 100, 16, "4.1")],
				link(86, 100, 18),
			],
			[[text(50, 100, 40, "Figure"), text(93, 100, 6, "3")], link(92, 100, 8)],
			[[text(50, 100, 70, "an Cloud 16 sky 19")], link(97, 100, 8)],
			[[text(50, 100, 60, "in Section 6.6.")], link(98, 100, 14)],

			[[text(50, 100, 5, "7", 6)], link(50, 100, 5, 6)],

			[[text(50, 100, 60, "(a3, a4, [a21])")], link(92, 100, 8)],

			[[text(50, 100, 40, "[Sky84]")], link(52, 100, 36)],

			[[text(50, 100, 40, "[3, 4 sky")], link(52, 100, 5)],
		];
		for (const [rects, hover] of cases) {
			expect(parseBracketCitation(rects, hover)).toBeNull();
		}
	});

	it("does not bridge into the other column", () => {
		const line = [
			text(50, 100, 200, "orchard cloud [3"),
			text(320, 100, 200, "4] sky blue"),
		];
		expect(parseBracketCitation(line, link(244, 100, 6))).toBeNull();
	});

	it("never fuses separate numeric runs into one number", () => {
		const line = [
			text(50, 100, 5, "["),
			text(55, 100, 5, "5"),
			text(64, 100, 5, "8"),
			text(69, 100, 5, "]"),
		];
		expect(parseBracketCitation(line, link(55, 100, 5))).toBeNull();
	});
});

describe("linkLabelText", () => {
	it("adds the word before a linked number", () => {
		const line = [
			text(50, 100, 60, "cloud in"),
			text(114, 100, 30, "Figure"),
			text(147, 100, 5, "3"),
		];
		expect(linkLabelText(line, link(147, 100, 5))).toBe("Figure 3");
	});

	it("keeps a fully linked label", () => {
		const line = [text(50, 100, 110, "as garden in Table 2 cloud")];

		expect(linkLabelText(line, link(50 + 13 * 4.2, 100, 7 * 4.2))).toBe(
			"in Table 2",
		);
	});

	it("does not pick labels elsewhere in a long run", () => {
		const line = [
			text(
				50,
				100,
				250,
				"waterfall cloud of Table 4 sky sky playground blue Section 5.3.",
			),
		];

		const step = 250 / 63;
		const out = linkLabelText(line, link(50 + 59 * step, 100, 3 * step));
		expect(out).toBe("Section 5.3");
	});
});
