/**
 * Map a Plate editor selection to 1-based Markdown **source** line numbers
 * (on-disk coordinates, including YAML frontmatter offset).
 *
 * DOM measurement is unreliable (offscreen block rendering); we derive lines
 * from `serializeBlocksAsMarkdown` + in-block text offsets instead.
 */

import {
	NodeApi,
	PathApi,
	RangeApi,
	type SlateEditor,
	type TElement,
	type TRange,
} from "platejs";
import {
	hasSelectedBlocks,
	selectedBlockNodes,
	serializeBlocksAsMarkdown,
} from "@/lib/markdown/block-selection";

export type SourceLineSpan = {
	lineFrom: number;
	lineTo: number;
};

type PrefixCache = {
	version: number;
	/** Body-relative 1-based start line for each top-level block index. */
	blockStarts: Map<number, number>;
};

/** Content line count of a serialized Markdown fragment (trailing `\n` ignored). */
export function markdownContentLineCount(md: string): number {
	if (!md) return 0;
	return md.replace(/\n$/, "").split("\n").length;
}

/** Lines occupied by a preserved frontmatter block (0 when absent). */
export function frontmatterLineOffset(frontmatter: string): number {
	if (!frontmatter) return 0;
	return (frontmatter.match(/\n/g) ?? []).length;
}

function contentLineCount(md: string): number {
	return markdownContentLineCount(md);
}

/**
 * Body-relative 1-based start line of the top-level block at `blockIndex`.
 * Uses serialize(prefix+block) − serialize(block) so inter-block blank lines
 * from the Markdown serializer are included.
 */
export function bodyStartLineOfBlock(
	editor: SlateEditor,
	blockIndex: number,
	cache?: PrefixCache,
	docVersion = 0,
): number | null {
	const children = editor.children as TElement[];
	if (blockIndex < 0 || blockIndex >= children.length) return null;

	if (cache) {
		if (cache.version !== docVersion) {
			cache.version = docVersion;
			cache.blockStarts.clear();
		}
		const hit = cache.blockStarts.get(blockIndex);
		if (hit != null) return hit;
	}

	let start: number;
	if (blockIndex === 0) {
		start = 1;
	} else {
		const prefixAndBlock = serializeBlocksAsMarkdown(
			editor,
			children.slice(0, blockIndex + 1),
		);
		const blockMd = serializeBlocksAsMarkdown(editor, [children[blockIndex]]);
		const prefixLines = contentLineCount(prefixAndBlock);
		const blockLines = contentLineCount(blockMd);
		if (blockLines <= 0 || prefixLines < blockLines) return null;
		start = prefixLines - blockLines + 1;
	}

	cache?.blockStarts.set(blockIndex, start);
	return start;
}

function pointAtBlockStart(
	editor: SlateEditor,
	blockIndex: number,
): { path: number[]; offset: number } | null {
	const start = editor.api.start([blockIndex]);
	if (!start) return null;
	return { path: start.path as number[], offset: start.offset };
}

/** Newlines from the start of the top-level block up to `point` (exclusive). */
function inBlockNewlineOffset(
	editor: SlateEditor,
	point: { path: number[]; offset: number },
): number | null {
	const blockIndex = point.path[0];
	if (typeof blockIndex !== "number") return null;
	const start = pointAtBlockStart(editor, blockIndex);
	if (!start) return null;
	if (PathApi.equals(start.path, point.path) && start.offset === point.offset) {
		return 0;
	}
	// Prefer range string so mid-text offsets and nested blocks are covered.
	try {
		const text = editor.api.string({
			anchor: start,
			focus: point,
		} as TRange);
		return (text.match(/\n/g) ?? []).length;
	} catch {
		return null;
	}
}

function isPointAtLineStart(
	editor: SlateEditor,
	point: { path: number[]; offset: number },
): boolean {
	const blockIndex = point.path[0];
	if (typeof blockIndex !== "number") return false;
	const start = pointAtBlockStart(editor, blockIndex);
	if (!start) return false;
	if (PathApi.equals(start.path, point.path) && point.offset === 0) {
		return true;
	}
	try {
		const before = editor.api.string({
			anchor: start,
			focus: point,
		} as TRange);
		return before.length === 0 || before.endsWith("\n");
	} catch {
		return false;
	}
}

function bodyLineForPoint(
	editor: SlateEditor,
	point: { path: number[]; offset: number },
	cache: PrefixCache | undefined,
	docVersion: number,
): number | null {
	const blockIndex = point.path[0];
	if (typeof blockIndex !== "number") return null;
	const blockStart = bodyStartLineOfBlock(
		editor,
		blockIndex,
		cache,
		docVersion,
	);
	if (blockStart == null) return null;
	const offset = inBlockNewlineOffset(editor, point);
	if (offset == null) return null;
	return blockStart + offset;
}

function bodyEndLineOfBlock(
	editor: SlateEditor,
	blockIndex: number,
	cache: PrefixCache | undefined,
	docVersion: number,
): number | null {
	const children = editor.children as TElement[];
	const block = children[blockIndex];
	if (!block) return null;
	const start = bodyStartLineOfBlock(editor, blockIndex, cache, docVersion);
	if (start == null) return null;
	const blockMd = serializeBlocksAsMarkdown(editor, [block]);
	const lines = contentLineCount(blockMd);
	if (lines <= 0) {
		// Void / unsérializable: fall back to plain text newlines inside the node.
		const textLines = (NodeApi.string(block).match(/\n/g) ?? []).length + 1;
		return start + textLines - 1;
	}
	return start + lines - 1;
}

function normalizeSpan(from: number, to: number): SourceLineSpan {
	return from <= to
		? { lineFrom: from, lineTo: to }
		: { lineFrom: to, lineTo: from };
}

export type ResolveSelectionSourceLinesOptions = {
	editor: SlateEditor;
	/** Verbatim frontmatter block from {@link splitFrontmatter} / wrapFrontmatter. */
	frontmatter?: string;
	/** Bumped on document edits; keys the prefix-line cache. */
	docVersion?: number;
	/** Optional mutable cache (reuse across publishes for the same editor). */
	cache?: PrefixCache;
};

/**
 * Resolve 1-based on-disk line span for the current Plate selection.
 * Returns `null` when the span cannot be determined uniquely/reliably.
 */
export function resolveSelectionSourceLines(
	options: ResolveSelectionSourceLinesOptions,
): SourceLineSpan | null {
	const {
		editor,
		frontmatter = "",
		docVersion = 0,
		cache = { version: -1, blockStarts: new Map() },
	} = options;
	const fmOffset = frontmatterLineOffset(frontmatter);

	try {
		if (hasSelectedBlocks(editor)) {
			const nodes = selectedBlockNodes(editor);
			if (nodes.length === 0) return null;
			const indices: number[] = [];
			for (const node of nodes) {
				const path = editor.api.findPath(node);
				if (!path || typeof path[0] !== "number") return null;
				indices.push(path[0]);
			}
			indices.sort((a, b) => a - b);
			const fromBody = bodyStartLineOfBlock(
				editor,
				indices[0],
				cache,
				docVersion,
			);
			const toBody = bodyEndLineOfBlock(
				editor,
				indices[indices.length - 1],
				cache,
				docVersion,
			);
			if (fromBody == null || toBody == null) return null;
			const span = normalizeSpan(fromBody + fmOffset, toBody + fmOffset);
			return span.lineFrom > 0 ? span : null;
		}

		const selection = editor.selection;
		if (!selection || RangeApi.isCollapsed(selection)) return null;

		const anchor = RangeApi.isBackward(selection)
			? selection.focus
			: selection.anchor;
		const focus = RangeApi.isBackward(selection)
			? selection.anchor
			: selection.focus;

		const fromBody = bodyLineForPoint(editor, anchor, cache, docVersion);
		let toBody = bodyLineForPoint(editor, focus, cache, docVersion);
		if (fromBody == null || toBody == null) return null;

		// Mirror CodeMirror: focus at a line start excludes that line.
		if (toBody > fromBody && isPointAtLineStart(editor, focus)) {
			toBody -= 1;
		}

		const span = normalizeSpan(fromBody + fmOffset, toBody + fmOffset);
		return span.lineFrom > 0 ? span : null;
	} catch {
		return null;
	}
}

/** Create an empty prefix cache for one editor instance. */
export function createSelectionSourceLinesCache(): PrefixCache {
	return { version: -1, blockStarts: new Map() };
}
