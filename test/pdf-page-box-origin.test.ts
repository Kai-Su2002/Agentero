/** Keeps annotation and text coordinates aligned to the visible page box. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PdfiumNative } from "@embedpdf/engines/pdfium";
import type { PdfLinkAnnoObject, Rect } from "@embedpdf/models";
import { PdfAnnotationSubtype } from "@embedpdf/models";
import { init } from "@embedpdf/pdfium";
import { PDFDocument, PDFName, StandardFonts } from "pdf-lib";
import { beforeAll, describe, expect, it } from "vitest";

function taskToPromise<T>(task: {
	wait: (ok: (v: T) => void, err: (e: unknown) => void) => void;
}): Promise<T> {
	return new Promise((resolve, reject) => {
		task.wait(resolve, reject);
	});
}

/** One page with a linked "[5]" at user-space (182.5, 702). */
async function offsetBoxPdf(): Promise<ArrayBuffer> {
	const doc = await PDFDocument.create();
	const page = doc.addPage([595, 842]);
	page.setMediaBox(82.5, 90, 430, 660);
	page.setCropBox(0, 0, 595, 842);
	const font = await doc.embedFont(StandardFonts.Helvetica);
	page.drawText("[5]", { x: 182.5, y: 702, size: 10, font });
	const context = doc.context;
	const link = context.obj({
		Type: "Annot",
		Subtype: "Link",
		Rect: [182.5, 700, 194.5, 710],
		Border: [0, 0, 0],
		A: { S: "URI", URI: "https://example.org" },
	});
	page.node.set(PDFName.of("Annots"), context.obj([link]));
	const bytes = await doc.save();
	return bytes.buffer.slice(
		bytes.byteOffset,
		bytes.byteOffset + bytes.byteLength,
	) as ArrayBuffer;
}

function centerOf(rect: Rect) {
	return {
		x: rect.origin.x + rect.size.width / 2,
		y: rect.origin.y + rect.size.height / 2,
	};
}

function contains(rect: Rect, point: { x: number; y: number }): boolean {
	return (
		point.x >= rect.origin.x &&
		point.x <= rect.origin.x + rect.size.width &&
		point.y >= rect.origin.y &&
		point.y <= rect.origin.y + rect.size.height
	);
}

describe("pdfium page origin with a CropBox larger than the MediaBox", () => {
	let pdf: PdfiumNative;

	beforeAll(async () => {
		pdf = new PdfiumNative(
			await init({
				wasmBinary: readFileSync(
					fileURLToPath(import.meta.resolve("@embedpdf/pdfium/pdfium.wasm")),
				),
			}),
			{ fontFallback: null },
		);
	});

	it("places link rects over the text they annotate", async () => {
		const doc = await taskToPromise(
			pdf.openDocumentBuffer({
				id: "offset-box",
				content: await offsetBoxPdf(),
			}),
		);
		const page = doc.pages[0];
		// The visible box is the MediaBox, not the A4 CropBox.
		expect(page.size).toEqual({ width: 430, height: 660 });

		const annotations = await taskToPromise(pdf.getPageAnnotations(doc, page));
		const links = annotations.filter(
			(a): a is PdfLinkAnnoObject => a.type === PdfAnnotationSubtype.LINK,
		);
		expect(links).toHaveLength(1);
		// Relative to the visible box: x = 182.5 − 82.5, y = (90 + 660) − 710.
		expect(links[0].rect.origin.x).toBeCloseTo(100, 3);
		expect(links[0].rect.origin.y).toBeCloseTo(40, 3);
		expect(links[0].rect.size.width).toBeCloseTo(12, 3);
		expect(links[0].rect.size.height).toBeCloseTo(10, 3);

		const text = (await taskToPromise(pdf.getPageTextRects(doc, page))).find(
			(t) => t.content.includes("[5]"),
		);
		if (!text) throw new Error("missing text run for [5]");
		expect(contains(links[0].rect, centerOf(text.rect))).toBe(true);

		await taskToPromise(pdf.closeDocument(doc));
	});
});
