/**
 * Turn a DOM selection on the full-document translation overlay into the same
 * floating menu the English text layer uses.
 *
 * The menu's quote is the English sentence (or the whole block when that block
 * has no sentence pairs). Copy stays the visible translation. Listeners attach
 * only while layout translation is painted on the main viewer.
 */

import type { PdfEngine, Rect } from "@embedpdf/models";
import type { useDocumentManagerCapability } from "@embedpdf/plugin-document-manager/react";
import type { FormattedSelection } from "@embedpdf/plugin-selection/react";
import { type RefObject, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
	anchorFromEmbedSelection,
	pageElByIndex,
	rectTopCenterScreen,
} from "@/components/viewer/pdf/coords";
import type { SelectionMenuState } from "@/components/viewer/pdf/types";
import { publishSelection } from "@/lib/agent/selection-store";
import {
	bboxToPageRect,
	locateQuoteGlyphs,
	type TranslationPagePick,
	type TranslationSelection,
	translationHitsFromRange,
	translationSelectionFromHits,
	unionPageRect,
} from "@/lib/pdf/layout/layout-sentence-selection";
import type { LayoutTranslateItem } from "@/lib/pdf/layout/types";
import { loadSettings } from "@/lib/settings/store";
import { langsFromSettings } from "@/lib/translate/lang";

type DocumentManagerCapability = ReturnType<
	typeof useDocumentManagerCapability
>["provides"];

export type UsePdfTranslationSelectionOptions = {
	/** Main viewer with the translation overlay painted. */
	enabled: boolean;
	hostRef: RefObject<HTMLDivElement | null>;
	zoomRef: RefObject<number>;
	engineRef: RefObject<PdfEngine | null>;
	docCapRef: RefObject<DocumentManagerCapability>;
	docId: string;
	itemsByPage: ReadonlyMap<number, readonly LayoutTranslateItem[]>;
	selectionMenu: SelectionMenuState | null;
	setSelectionMenu: (menu: SelectionMenuState | null) => void;
	closeSelectionMenu: () => void;
	paperRelPath: string | null;
	paperAbsPath: string | null;
};

function caretInsideLayoutItem(host: HTMLElement | null): boolean {
	if (!host) return false;
	const selection = window.getSelection();
	const node = selection?.anchorNode;
	if (!node) return false;
	const el = node instanceof Element ? node : node.parentElement;
	return Boolean(el && host.contains(el) && el.closest("[data-layout-item]"));
}

function hostRange(host: HTMLElement): Range | null {
	const selection = window.getSelection();
	if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
		return null;
	}
	const range = selection.getRangeAt(0);
	const node = range.commonAncestorContainer;
	const el = node instanceof Element ? node : node.parentElement;
	if (!el || !host.contains(el)) return null;
	return range;
}

async function locatePages(
	engine: PdfEngine | null,
	docCap: DocumentManagerCapability,
	docId: string,
	selection: TranslationSelection,
	generation: () => boolean,
): Promise<FormattedSelection[] | null> {
	const doc = docCap?.getDocument(docId);
	const grouped = new Map<number, TranslationPagePick[]>();
	for (const pick of selection.pages) {
		const list = grouped.get(pick.pageIndex) ?? [];
		list.push(pick);
		grouped.set(pick.pageIndex, list);
	}
	const formatted: FormattedSelection[] = [];
	for (const [pageIndex, picks] of grouped) {
		if (!generation()) return null;
		const page = doc?.pages[pageIndex];
		const size = page?.size;
		if (!page || !size || size.width <= 0 || size.height <= 0) continue;
		let glyphs: { content: string; rect: Rect }[] = [];
		if (engine && doc) {
			try {
				const raw = await engine.getPageTextRects(doc, page).toPromise();
				glyphs = raw ?? [];
			} catch {
				glyphs = [];
			}
		}
		if (!generation()) return null;
		const rects = picks.flatMap((pick) =>
			glyphs.length
				? locateQuoteGlyphs({
						quote: pick.locateText,
						glyphs,
						pageWidth: size.width,
						pageHeight: size.height,
						bbox: pick.bbox,
					})
				: [bboxToPageRect(pick.bbox, size.width, size.height)],
		);
		if (!rects.length) continue;
		formatted.push({
			pageIndex,
			rect: unionPageRect(rects),
			segmentRects: rects,
		});
	}
	return formatted;
}

export function usePdfTranslationSelection({
	enabled,
	hostRef,
	zoomRef,
	engineRef,
	docCapRef,
	docId,
	itemsByPage,
	selectionMenu,
	setSelectionMenu,
	closeSelectionMenu,
	paperRelPath,
	paperAbsPath,
}: UsePdfTranslationSelectionOptions): void {
	const { i18n } = useTranslation();
	const itemsRef = useRef(itemsByPage);
	itemsRef.current = itemsByPage;
	const menuRef = useRef(selectionMenu);
	menuRef.current = selectionMenu;
	const langRef = useRef(i18n.language);
	langRef.current = i18n.language;
	const genRef = useRef(0);
	const pointerDownRef = useRef(false);

	useEffect(() => {
		if (enabled || !menuRef.current?.fromTranslation) return;
		closeSelectionMenu();
	}, [enabled, closeSelectionMenu]);

	useEffect(() => {
		if (!enabled) return;
		const host = hostRef.current;
		if (!host) return;

		const commit = () => {
			const generation = ++genRef.current;
			const alive = () => genRef.current === generation;
			const root = hostRef.current;
			if (!root) return;
			const range = hostRange(root);
			if (!range) {
				if (menuRef.current?.fromTranslation && caretInsideLayoutItem(root)) {
					closeSelectionMenu();
				}
				return;
			}
			const hits = translationHitsFromRange(range, root);
			if (!hits.length) return;
			const items = [...itemsRef.current.values()].flat();
			const targetLang = langsFromSettings(
				loadSettings().translate,
				langRef.current ?? "en",
			).targetLang;
			const resolved = translationSelectionFromHits(
				hits,
				items,
				targetLang,
				range.toString(),
			);
			if (!resolved) return;
			void (async () => {
				const pages = await locatePages(
					engineRef.current,
					docCapRef.current,
					docId,
					resolved,
					alive,
				);
				if (!pages?.length || !alive()) return;
				const live = hostRange(root);
				if (
					!live ||
					translationHitsFromRange(live, root).length === 0 ||
					!alive()
				) {
					return;
				}
				const doc = docCapRef.current?.getDocument(docId);
				const anchorPage = pages[pages.length - 1];
				if (!anchorPage) return;
				const anchor = anchorFromEmbedSelection(
					pages,
					resolved.quote,
					(pageIndex) => doc?.pages[pageIndex]?.size ?? null,
					"selection",
					anchorPage.pageIndex,
				);
				const pageEl = pageElByIndex(root, anchorPage.pageIndex);
				const screen = pageEl
					? rectTopCenterScreen(pageEl, anchorPage.rect, zoomRef.current)
					: null;
				if (!anchor || !screen || !alive()) return;
				setSelectionMenu({
					screen,
					anchor,
					pages,
					copyText: resolved.copyText,
					fromTranslation: true,
					pairedTranslation: resolved.paired || undefined,
				});
				publishSelection({
					text: resolved.quote,
					sourcePath: paperRelPath ?? paperAbsPath ?? "PDF",
					origin: "pdf",
					page: anchor.page,
					rects: anchor.rects,
					paperAbsPath: paperAbsPath ?? undefined,
					context: resolved.paired
						? { status: "unavailable", translation: resolved.paired }
						: undefined,
				});
			})();
		};

		const onPointerDown = () => {
			pointerDownRef.current = true;
		};
		const onPointerUp = (event: PointerEvent) => {
			pointerDownRef.current = false;
			const range = hostRange(host);
			if (range && translationHitsFromRange(range, host).length > 0) {
				event.stopPropagation();
			}
			commit();
		};
		const onSelectionChange = () => {
			if (pointerDownRef.current) return;
			commit();
		};

		host.addEventListener("pointerdown", onPointerDown);
		host.addEventListener("pointerup", onPointerUp, true);
		document.addEventListener("selectionchange", onSelectionChange);
		return () => {
			genRef.current += 1;
			host.removeEventListener("pointerdown", onPointerDown);
			host.removeEventListener("pointerup", onPointerUp, true);
			document.removeEventListener("selectionchange", onSelectionChange);
		};
	}, [
		enabled,
		hostRef,
		zoomRef,
		engineRef,
		docCapRef,
		docId,
		setSelectionMenu,
		closeSelectionMenu,
		paperRelPath,
		paperAbsPath,
	]);
}
