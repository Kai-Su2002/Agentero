/**
 * Resolve a translation-overlay selection to English sentence quotes and the
 * PDF text-layer boxes that should carry the annotation.
 *
 * The overlay selection stays on the translated spans. Highlight, note, and
 * chat store the English sentences. Copy keeps the visible translation.
 */

import type { Rect } from "@embedpdf/models";
import {
	joinTranslatedDisplays,
	normalizeSentenceKey,
} from "@/lib/pdf/layout/layout-sentences";
import type { LayoutTranslateSentence } from "@/lib/pdf/layout/types";

export type TranslationBlockRef = {
	id: string;
	pageIndex: number;
	bbox: { x: number; y: number; w: number; h: number };
	source: string;
	raw?: string;
	translated?: string;
	sentences?: LayoutTranslateSentence[];
};

/** One selected span, or a whole block when it has no sentence spans. */
export type TranslationSpanHit = {
	itemId: string;
	sentenceIndex: number | null;
};

export type TranslationPagePick = {
	pageIndex: number;
	bbox: TranslationBlockRef["bbox"];
	/** Text-layer slice to search on this page. */
	locateText: string;
};

export type TranslationSelection = {
	copyText: string;
	quote: string;
	paired: string;
	pages: TranslationPagePick[];
};

type Glyph = {
	content: string;
	rect: Rect;
};

type CharRef = { glyph: number; offset: number };

function memberLocateText(
	item: TranslationBlockRef,
	quotes: readonly string[],
): string {
	const raw = normalizeSentenceKey(item.raw || item.source);
	const parts = quotes.map((quote) => {
		const key = normalizeSentenceKey(quote);
		if (!key) return "";
		if (!raw || raw.includes(key)) return key;
		if (key.includes(raw)) return raw;
		for (let len = Math.min(raw.length, key.length); len >= 8; len--) {
			const suffix = raw.slice(raw.length - len);
			if (key.startsWith(suffix)) return suffix;
			const prefix = raw.slice(0, len);
			if (key.endsWith(prefix)) return prefix;
		}
		return raw;
	});
	return parts.filter(Boolean).join(" ");
}

/**
 * Turn span hits into the English quote, the paired translation, and one
 * locate request per layout block. Identical sentence quotes are kept once.
 */
export function translationSelectionFromHits(
	hits: readonly TranslationSpanHit[],
	items: readonly TranslationBlockRef[],
	targetLang: string,
	copyText: string,
): TranslationSelection | null {
	if (!hits.length || !copyText.trim()) return null;
	const byId = new Map(items.map((item) => [item.id, item]));
	const groups: { itemId: string; indexes: (number | null)[] }[] = [];
	for (const hit of hits) {
		const last = groups[groups.length - 1];
		if (last?.itemId === hit.itemId) last.indexes.push(hit.sentenceIndex);
		else groups.push({ itemId: hit.itemId, indexes: [hit.sentenceIndex] });
	}
	const sentenceQuotes: string[] = [];
	const pairedParts: string[] = [];
	const pages: TranslationPagePick[] = [];
	for (const group of groups) {
		const item = byId.get(group.itemId);
		if (!item) continue;
		const chosen = group.indexes.includes(null)
			? []
			: group.indexes
					.map((index) => (index == null ? undefined : item.sentences?.[index]))
					.filter((sentence): sentence is LayoutTranslateSentence =>
						Boolean(sentence?.quote),
					);
		const quotes = chosen.length
			? chosen.map((sentence) => sentence.quote)
			: item.source.trim()
				? [item.source]
				: [];
		if (!quotes.length) continue;
		const paired = chosen.length
			? chosen.map((sentence) => sentence.translated)
			: item.translated?.trim()
				? [item.translated]
				: [];
		for (const quote of quotes) {
			if (!sentenceQuotes.includes(quote)) sentenceQuotes.push(quote);
		}
		for (const part of paired) {
			const text = part.trim();
			if (text && !pairedParts.includes(text)) pairedParts.push(text);
		}
		const locateText = memberLocateText(item, quotes);
		if (!locateText) continue;
		pages.push({ pageIndex: item.pageIndex, bbox: item.bbox, locateText });
	}
	const quote = sentenceQuotes.join(" ");
	if (!quote || pages.length === 0) return null;
	return {
		copyText: copyText.trim(),
		quote,
		paired: joinTranslatedDisplays(pairedParts, targetLang),
		pages,
	};
}

/** Span hits inside `root` covered by `range`, in document order. */
export function translationHitsFromRange(
	range: Range,
	root: ParentNode,
): TranslationSpanHit[] {
	if (range.collapsed) return [];
	const hits: TranslationSpanHit[] = [];
	const seenBlocks = new Set<string>();
	const spans = root.querySelectorAll<HTMLElement>(
		"[data-layout-item] [data-sentence]",
	);
	for (const span of spans) {
		if (!rangeIntersects(range, span)) continue;
		const block = span.closest<HTMLElement>("[data-layout-item]");
		const itemId = block?.getAttribute("data-layout-item");
		const sentenceIndex = Number(span.getAttribute("data-sentence"));
		if (!itemId || !Number.isInteger(sentenceIndex)) continue;
		hits.push({ itemId, sentenceIndex });
		seenBlocks.add(itemId);
	}
	const blocks = root.querySelectorAll<HTMLElement>("[data-layout-item]");
	for (const block of blocks) {
		const itemId = block.getAttribute("data-layout-item");
		if (!itemId || seenBlocks.has(itemId)) continue;
		if (block.querySelector("[data-sentence]")) continue;
		if (!rangeIntersects(range, block)) continue;
		hits.push({ itemId, sentenceIndex: null });
	}
	return hits;
}

function rangeIntersects(range: Range, node: Node): boolean {
	try {
		return range.intersectsNode(node);
	} catch {
		return false;
	}
}

function buildCorpus(
	glyphs: readonly Glyph[],
	insertGaps: boolean,
): { raw: string; refs: CharRef[] } {
	let raw = "";
	const refs: CharRef[] = [];
	glyphs.forEach((glyph, index) => {
		const content = glyph.content ?? "";
		if (
			insertGaps &&
			raw &&
			content &&
			!/\s$/.test(raw) &&
			!/^\s/.test(content)
		) {
			raw += " ";
			refs.push({ glyph: index, offset: -1 });
		}
		for (let offset = 0; offset < content.length; offset++) {
			raw += content[offset] ?? "";
			refs.push({ glyph: index, offset });
		}
	});
	return { raw, refs };
}

function collapseCorpus(
	raw: string,
	refs: readonly CharRef[],
): { text: string; refs: CharRef[] } {
	const text: string[] = [];
	const out: CharRef[] = [];
	let index = 0;
	while (index < raw.length && /\s/.test(raw[index] ?? "")) index += 1;
	while (index < raw.length) {
		const ch = raw[index] ?? "";
		if (/\s/.test(ch)) {
			let next = index;
			while (next < raw.length && /\s/.test(raw[next] ?? "")) next += 1;
			if (next >= raw.length) break;
			text.push(" ");
			out.push(refs[index] ?? { glyph: 0, offset: -1 });
			index = next;
			continue;
		}
		text.push(ch);
		out.push(refs[index] ?? { glyph: 0, offset: -1 });
		index += 1;
	}
	return { text: text.join(""), refs: out };
}

function sliceGlyphRect(glyph: Glyph, start: number, end: number): Rect {
	const length = glyph.content.length;
	if (length <= 0 || (start <= 0 && end >= length)) return glyph.rect;
	const unit = glyph.rect.size.width / length;
	const from = Math.max(0, start);
	const to = Math.min(length, end);
	return {
		origin: {
			x: glyph.rect.origin.x + from * unit,
			y: glyph.rect.origin.y,
		},
		size: {
			width: Math.max(unit * (to - from), 0.4),
			height: glyph.rect.size.height,
		},
	};
}

function rectsForMatch(
	glyphs: readonly Glyph[],
	refs: readonly CharRef[],
	start: number,
	end: number,
): Rect[] {
	const covered = new Map<number, { start: number; end: number }>();
	for (let index = start; index < end; index++) {
		const ref = refs[index];
		if (!ref || ref.offset < 0) continue;
		const current = covered.get(ref.glyph);
		if (!current)
			covered.set(ref.glyph, { start: ref.offset, end: ref.offset + 1 });
		else {
			current.start = Math.min(current.start, ref.offset);
			current.end = Math.max(current.end, ref.offset + 1);
		}
	}
	const rects: Rect[] = [];
	for (const [glyphIndex, range] of covered) {
		const glyph = glyphs[glyphIndex];
		if (!glyph) continue;
		rects.push(sliceGlyphRect(glyph, range.start, range.end));
	}
	return rects;
}

function overlapArea(
	a: { x: number; y: number; w: number; h: number },
	b: { x: number; y: number; w: number; h: number },
): number {
	const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
	const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
	if (w <= 0 || h <= 0) return 0;
	return w * h;
}

function rectToBbox(
	rect: Rect,
	pageWidth: number,
	pageHeight: number,
): { x: number; y: number; w: number; h: number } {
	return {
		x: rect.origin.x / pageWidth,
		y: rect.origin.y / pageHeight,
		w: rect.size.width / pageWidth,
		h: rect.size.height / pageHeight,
	};
}

function matchQuote(
	glyphs: readonly Glyph[],
	quote: string,
	insertGaps: boolean,
): { start: number; refs: CharRef[]; rects: Rect[] }[] {
	const corpus = buildCorpus(glyphs, insertGaps);
	const collapsed = collapseCorpus(corpus.raw, corpus.refs);
	const needle = normalizeSentenceKey(quote);
	if (!needle || !collapsed.text) return [];
	const found: { start: number; refs: CharRef[]; rects: Rect[] }[] = [];
	let from = 0;
	while (from <= collapsed.text.length) {
		const start = collapsed.text.indexOf(needle, from);
		if (start < 0) break;
		const rects = rectsForMatch(
			glyphs,
			collapsed.refs,
			start,
			start + needle.length,
		);
		if (rects.length > 0) found.push({ start, refs: collapsed.refs, rects });
		from = start + Math.max(1, needle.length);
	}
	return found;
}

function scoreRects(
	rects: readonly Rect[],
	bbox: { x: number; y: number; w: number; h: number },
	pageWidth: number,
	pageHeight: number,
): number {
	return rects.reduce(
		(sum, rect) =>
			sum + overlapArea(rectToBbox(rect, pageWidth, pageHeight), bbox),
		0,
	);
}

function glyphsOverlapping(
	glyphs: readonly Glyph[],
	bboxes: readonly { x: number; y: number; w: number; h: number }[],
	pageWidth: number,
	pageHeight: number,
): Rect[] {
	const rects: Rect[] = [];
	for (const glyph of glyphs) {
		if (!glyph.content.trim()) continue;
		const box = rectToBbox(glyph.rect, pageWidth, pageHeight);
		if (bboxes.some((bbox) => overlapArea(box, bbox) > 0))
			rects.push(glyph.rect);
	}
	return rects;
}

export function bboxToPageRect(
	bbox: { x: number; y: number; w: number; h: number },
	pageWidth: number,
	pageHeight: number,
): Rect {
	return {
		origin: { x: bbox.x * pageWidth, y: bbox.y * pageHeight },
		size: { width: bbox.w * pageWidth, height: bbox.h * pageHeight },
	};
}

/**
 * Glyph boxes for `quote` on one page. Prefer the hit that overlaps `bbox`.
 * When the quote is not in the text layer, use glyphs that overlap `bbox`.
 * The bbox itself is the last resort so the annotation still has geometry.
 */
export function locateQuoteGlyphs(options: {
	quote: string;
	glyphs: readonly Glyph[];
	pageWidth: number;
	pageHeight: number;
	bbox: { x: number; y: number; w: number; h: number };
}): Rect[] {
	const { quote, glyphs, pageWidth, pageHeight, bbox } = options;
	if (!(pageWidth > 0) || !(pageHeight > 0)) return [];
	let best: Rect[] | null = null;
	let bestScore = -1;
	for (const insertGaps of [false, true]) {
		for (const match of matchQuote(glyphs, quote, insertGaps)) {
			const score = scoreRects(match.rects, bbox, pageWidth, pageHeight);
			if (score > bestScore) {
				best = match.rects;
				bestScore = score;
			}
		}
		if (best && bestScore > 0) break;
	}
	if (best && best.length > 0) return best;
	const inside = glyphsOverlapping(glyphs, [bbox], pageWidth, pageHeight);
	if (inside.length > 0) return inside;
	return [bboxToPageRect(bbox, pageWidth, pageHeight)];
}

export function unionPageRect(rects: readonly Rect[]): Rect {
	let minX = Number.POSITIVE_INFINITY;
	let minY = Number.POSITIVE_INFINITY;
	let maxX = Number.NEGATIVE_INFINITY;
	let maxY = Number.NEGATIVE_INFINITY;
	for (const rect of rects) {
		minX = Math.min(minX, rect.origin.x);
		minY = Math.min(minY, rect.origin.y);
		maxX = Math.max(maxX, rect.origin.x + rect.size.width);
		maxY = Math.max(maxY, rect.origin.y + rect.size.height);
	}
	return {
		origin: { x: minX, y: minY },
		size: { width: Math.max(0, maxX - minX), height: Math.max(0, maxY - minY) },
	};
}
