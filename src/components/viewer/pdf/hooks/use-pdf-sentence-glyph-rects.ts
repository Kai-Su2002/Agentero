/**
 * English glyph boxes for each translated sentence, on pages that have an
 * English highlight waiting to be tinted.
 *
 * Text runs are read once per page. The boxes are not written into the
 * translation sidecar. Until a page's runs arrive, the overlay falls back to
 * an exact quote match.
 */

import type { PdfEngine, Rect } from "@embedpdf/models";
import type { useDocumentManagerCapability } from "@embedpdf/plugin-document-manager/react";
import { type RefObject, useEffect, useRef, useState } from "react";
import type { HighlightQuoteTint } from "@/lib/pdf/highlight/translated-geometry";
import type { PdfHighlightRect } from "@/lib/pdf/highlight/types";
import { sentenceGlyphRects } from "@/lib/pdf/layout/layout-sentence-selection";
import type { LayoutTranslateItem } from "@/lib/pdf/layout/types";

type DocumentManagerCapability = ReturnType<
	typeof useDocumentManagerCapability
>["provides"];

type TextRun = { text: string; rect: Rect };

export type UseSentenceGlyphRectsOptions = {
	engine: PdfEngine | null;
	docCapRef: RefObject<DocumentManagerCapability>;
	docId: string;
	itemsByPage: ReadonlyMap<number, readonly LayoutTranslateItem[]>;
	highlightQuotesByPage: ReadonlyMap<number, readonly HighlightQuoteTint[]>;
};

function pagesToLocate(
	itemsByPage: ReadonlyMap<number, readonly LayoutTranslateItem[]>,
	highlightQuotesByPage: ReadonlyMap<number, readonly HighlightQuoteTint[]>,
): number[] {
	const pages: number[] = [];
	for (const pageNumber of highlightQuotesByPage.keys()) {
		const pageIndex = pageNumber - 1;
		const items = itemsByPage.get(pageIndex);
		if (!items?.some((item) => item.sentences?.length)) continue;
		pages.push(pageIndex);
	}
	pages.sort((a, b) => a - b);
	return pages;
}

function rectsSignature(
	rects: ReadonlyMap<string, readonly PdfHighlightRect[][]>,
): string {
	const parts: string[] = [];
	for (const [id, sentences] of rects) {
		const boxes = sentences
			.map((sentence) =>
				sentence
					.map((rect) => `${rect.x},${rect.y},${rect.w},${rect.h}`)
					.join("|"),
			)
			.join(";");
		parts.push(`${id}=${boxes}`);
	}
	return parts.join("\n");
}

export function useSentenceGlyphRects({
	engine,
	docCapRef,
	docId,
	itemsByPage,
	highlightQuotesByPage,
}: UseSentenceGlyphRectsOptions): ReadonlyMap<
	string,
	readonly PdfHighlightRect[][]
> {
	const [rectsByItemId, setRectsByItemId] = useState(
		() => new Map<string, readonly PdfHighlightRect[][]>(),
	);
	const runsCacheRef = useRef(new Map<string, TextRun[]>());
	const signatureRef = useRef("");

	const pageKey = pagesToLocate(itemsByPage, highlightQuotesByPage).join(",");

	useEffect(() => {
		const pageIndexes = pageKey
			? pageKey.split(",").map((value) => Number(value))
			: [];
		if (!engine || pageIndexes.length === 0) {
			if (signatureRef.current !== "") {
				signatureRef.current = "";
				setRectsByItemId(new Map());
			}
			return;
		}
		const doc = docCapRef.current?.getDocument(docId);
		if (!doc) return;

		let cancelled = false;
		void (async () => {
			const runsByPage = new Map<number, TextRun[]>();
			for (const pageIndex of pageIndexes) {
				if (cancelled) return;
				const cacheKey = `${docId}:${pageIndex}`;
				const cached = runsCacheRef.current.get(cacheKey);
				if (cached) {
					runsByPage.set(pageIndex, cached);
					continue;
				}
				const page = doc.pages[pageIndex];
				if (!page) continue;
				let runs: TextRun[] = [];
				try {
					const pageRuns = await engine.getPageTextRuns(doc, page).toPromise();
					runs = (pageRuns?.runs ?? []).map((run) => ({
						text: run.text ?? "",
						rect: run.rect,
					}));
				} catch {
					runs = [];
				}
				if (cancelled) return;
				runsCacheRef.current.set(cacheKey, runs);
				runsByPage.set(pageIndex, runs);
			}
			if (cancelled) return;
			const next = new Map<string, readonly PdfHighlightRect[][]>();
			for (const pageIndex of pageIndexes) {
				const runs = runsByPage.get(pageIndex);
				const size = doc.pages[pageIndex]?.size;
				if (!runs?.length || !size || size.width <= 0 || size.height <= 0) {
					continue;
				}
				for (const item of itemsByPage.get(pageIndex) ?? []) {
					if (!item.sentences?.length) continue;
					next.set(
						item.id,
						sentenceGlyphRects({
							sentences: item.sentences,
							raw: item.raw,
							source: item.source,
							runs,
							pageWidth: size.width,
							pageHeight: size.height,
							bbox: item.bbox,
						}),
					);
				}
			}
			const signature = rectsSignature(next);
			if (signature === signatureRef.current) return;
			signatureRef.current = signature;
			setRectsByItemId(next);
		})();

		return () => {
			cancelled = true;
		};
	}, [docCapRef, docId, engine, itemsByPage, pageKey]);

	return rectsByItemId;
}
