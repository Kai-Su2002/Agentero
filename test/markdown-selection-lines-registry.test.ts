import { afterEach, describe, expect, it } from "vitest";
import {
	registerMarkdownSelectionLinesProvider,
	resolveMarkdownSelectionLinesForPath,
} from "@/lib/markdown/markdown-selection-lines-registry";

describe("markdown-selection-lines-registry", () => {
	const cleanups: Array<() => void> = [];

	afterEach(() => {
		while (cleanups.length) cleanups.pop()?.();
	});

	it("resolves by normalized path key (trim + rel normalize)", () => {
		cleanups.push(
			registerMarkdownSelectionLinesProvider("notes/a.md", {
				resolve: () => ({ lineFrom: 3, lineTo: 5 }),
			}),
		);
		expect(resolveMarkdownSelectionLinesForPath("notes/a.md")).toEqual({
			lineFrom: 3,
			lineTo: 5,
		});
		expect(resolveMarkdownSelectionLinesForPath(" notes/a.md ")).toEqual({
			lineFrom: 3,
			lineTo: 5,
		});
		expect(resolveMarkdownSelectionLinesForPath("./notes/a.md")).toEqual({
			lineFrom: 3,
			lineTo: 5,
		});
		expect(resolveMarkdownSelectionLinesForPath("notes/other.md")).toBeNull();
	});

	it("unregisters so later lookups miss", () => {
		const unregister = registerMarkdownSelectionLinesProvider("notes/b.md", {
			resolve: () => ({ lineFrom: 1, lineTo: 1 }),
		});
		expect(resolveMarkdownSelectionLinesForPath("notes/b.md")?.lineFrom).toBe(
			1,
		);
		unregister();
		expect(resolveMarkdownSelectionLinesForPath("notes/b.md")).toBeNull();
	});
});
