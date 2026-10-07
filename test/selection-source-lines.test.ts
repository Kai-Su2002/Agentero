import { BlockSelectionPlugin } from "@platejs/selection/react";
import { createSlateEditor, type TElement } from "platejs";
import { describe, expect, it } from "vitest";
import { MarkdownKit } from "@/components/editor/plugins/markdown-kit";
import { wrapFrontmatter } from "@/lib/markdown/frontmatter";
import {
	frontmatterLineOffset,
	markdownContentLineCount,
	resolveSelectionSourceLines,
} from "@/lib/markdown/selection-source-lines";

function makeEditor(value: TElement[]) {
	return createSlateEditor({
		plugins: [...MarkdownKit, BlockSelectionPlugin],
		value,
	});
}

describe("selection source lines", () => {
	it("counts frontmatter fence lines for disk offset", () => {
		const fm = wrapFrontmatter("tags:\n  - a");
		expect(fm).toBe("---\ntags:\n  - a\n---\n");
		expect(frontmatterLineOffset(fm)).toBe(4);
		expect(frontmatterLineOffset("")).toBe(0);
	});

	it("maps an inline selection to body lines", () => {
		const editor = makeEditor([
			{ id: "a", type: "p", children: [{ text: "First line" }] },
			{ id: "b", type: "p", children: [{ text: "Second\nhas break" }] },
			{ id: "c", type: "h2", children: [{ text: "Heading" }] },
		]);
		// Select "has break" inside the second paragraph (body lines 3-4).
		editor.tf.select({
			anchor: { path: [1, 0], offset: 7 },
			focus: { path: [1, 0], offset: 16 },
		});
		const span = resolveSelectionSourceLines({ editor });
		expect(span).toEqual({ lineFrom: 4, lineTo: 4 });
	});

	it("adds frontmatter offset so lines match the on-disk file", () => {
		const editor = makeEditor([
			{ id: "a", type: "p", children: [{ text: "Body start" }] },
			{ id: "b", type: "p", children: [{ text: "Quoted" }] },
		]);
		editor.tf.select({
			anchor: { path: [1, 0], offset: 0 },
			focus: { path: [1, 0], offset: 6 },
		});
		const frontmatter = wrapFrontmatter("title: Note");
		// Body: line1 Body start, line2 blank, line3 Quoted → disk = +3 fence lines
		// wrapFrontmatter("title: Note") => ---\ntitle: Note\n---\n → 3 newlines
		expect(frontmatterLineOffset(frontmatter)).toBe(3);
		const span = resolveSelectionSourceLines({ editor, frontmatter });
		expect(span).toEqual({ lineFrom: 6, lineTo: 6 });
	});

	it("covers multi-block selection spans", () => {
		const editor = makeEditor([
			{ id: "a", type: "p", children: [{ text: "First line" }] },
			{ id: "b", type: "p", children: [{ text: "Second" }] },
			{ id: "c", type: "h2", children: [{ text: "Heading" }] },
		]);
		editor.getApi(BlockSelectionPlugin).blockSelection.set(["a", "c"]);
		const span = resolveSelectionSourceLines({ editor });
		// First line @1 … ## Heading @5 (with blank separators)
		expect(span).toEqual({ lineFrom: 1, lineTo: 5 });
	});

	it("returns null for a collapsed selection", () => {
		const editor = makeEditor([
			{ id: "a", type: "p", children: [{ text: "Only" }] },
		]);
		editor.tf.select({
			anchor: { path: [0, 0], offset: 1 },
			focus: { path: [0, 0], offset: 1 },
		});
		expect(resolveSelectionSourceLines({ editor })).toBeNull();
	});

	it("counts serialized markdown content lines", () => {
		expect(markdownContentLineCount("")).toBe(0);
		expect(markdownContentLineCount("one\n")).toBe(1);
		expect(markdownContentLineCount("one\ntwo\n")).toBe(2);
	});
});
