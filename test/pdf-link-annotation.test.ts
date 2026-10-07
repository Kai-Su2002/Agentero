import { PluginRegistry, startLoadingDocument } from "@embedpdf/core";
import {
	PdfActionType,
	PdfAnnotationBorderStyle,
	PdfAnnotationSubtype,
	type PdfEngine,
	type PdfHighlightAnnoObject,
	type PdfLinkAnnoObject,
} from "@embedpdf/models";
import {
	AnnotationPlugin,
	AnnotationPluginPackage,
} from "@embedpdf/plugin-annotation";
import { InteractionManagerPluginPackage } from "@embedpdf/plugin-interaction-manager";
import { SelectionPluginPackage } from "@embedpdf/plugin-selection";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
	PASSIVE_LINK_RENDERER,
	PDF_LINK_ANNOTATION_CONFIG,
} from "@/components/viewer/pdf/layers/link-annotation";

const rect = { origin: { x: 10, y: 20 }, size: { width: 100, height: 12 } };
const link: PdfLinkAnnoObject = {
	id: "link",
	type: PdfAnnotationSubtype.LINK,
	pageIndex: 0,
	rect,
	target: {
		type: "action",
		action: { type: PdfActionType.URI, uri: "https://example.com" },
	},
};
const highlight: PdfHighlightAnnoObject = {
	id: "highlight",
	type: PdfAnnotationSubtype.HIGHLIGHT,
	pageIndex: 0,
	rect,
	segmentRects: [rect],
	strokeColor: "#fcd34d",
};

describe("PDF reading link annotations", () => {
	it("blocks link selection in EmbedPDF while retaining editable highlights", async () => {
		// No PDFium calls: exercise the real plugin/store with auto-commit off.
		const registry = new PluginRegistry({} as PdfEngine);
		registry.registerPlugin(InteractionManagerPluginPackage);
		registry.registerPlugin(SelectionPluginPackage);
		registry.registerPlugin(AnnotationPluginPackage, {
			...PDF_LINK_ANNOTATION_CONFIG,
			autoCommit: false,
		});
		try {
			await registry.initialize();
			const plugin = registry.getPlugin<AnnotationPlugin>(AnnotationPlugin.id);
			if (!plugin) throw new Error("Annotation plugin did not initialize");
			for (const docId of ["original", "reloaded"]) {
				registry.getStore().dispatchToCore(startLoadingDocument(docId));
				const scope = plugin.provides().forDocument(docId);
				scope.createAnnotation(0, link);
				scope.createAnnotation(0, { ...link, id: "orphan", target: undefined });
				scope.createAnnotation(0, highlight);
				expect(scope.getAnnotations()).toHaveLength(3);
				expect(scope.isAnnotationInteractive(link)).toBe(false);
				expect(scope.isAnnotationInteractive(highlight)).toBe(true);
				scope.selectAnnotation(0, "link");
				scope.toggleSelection(0, "orphan");
				expect(scope.getSelectedAnnotationIds()).toEqual([]);
				scope.selectAnnotation(0, "highlight");
				expect(scope.getSelectedAnnotationIds()).toEqual(["highlight"]);
				scope.updateAnnotation(0, "highlight", { strokeColor: "#ff0000" });
				expect(scope.getAnnotationById("highlight")?.object.strokeColor).toBe(
					"#ff0000",
				);
				if (!link.target) throw new Error("Link fixture has no target");
				const result = await scope.navigateTarget(link.target).toPromise();
				expect(result).toEqual({ outcome: "uri", uri: "https://example.com" });
			}
		} finally {
			await registry.destroy();
		}
	});

	it("retains link borders in locked mode without rendering a navigation hit area", () => {
		const bordered = {
			...link,
			strokeStyle: PdfAnnotationBorderStyle.DASHED,
			strokeWidth: 1,
			strokeDashArray: [3, 2],
		};
		const props = {
			annotation: { object: bordered, commitState: "synced" as const },
			currentObject: bordered,
			scale: 2,
			isSelected: false,
			isEditing: false,
			pageIndex: 0,
			documentId: "original",
			appearanceActive: false,
		};
		const html = renderToStaticMarkup(
			PASSIVE_LINK_RENDERER.renderLocked?.(props),
		);
		expect(html).toContain("pointer-events-none");
		expect(html).toContain('stroke-dasharray="3,2"');
		expect(html).toContain('width="200"');
		expect(html).not.toContain("button");
		expect(html).not.toContain('fill="transparent"');
	});
});
