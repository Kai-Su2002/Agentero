import {
	PdfAnnotationBorderStyle,
	type PdfLinkAnnoObject,
} from "@embedpdf/models";
import {
	type AnnotationPluginConfig,
	createRenderer,
	LockModeType,
} from "@embedpdf/plugin-annotation/react";
import { isLinkObject } from "@/components/viewer/pdf/layers/citation-links";

/** Lock only links; markup/highlight annotations must remain editable. */
export const PDF_LINK_ANNOTATION_CONFIG = {
	tools: [{ id: "link", categories: ["annotation", "markup", "link"] }],
	locked: { type: LockModeType.Include, categories: ["link"] },
	// CitationLinkLayer opens URI results through the host's URL opener.
	autoOpenLinks: false,
} satisfies Pick<AnnotationPluginConfig, "tools" | "locked" | "autoOpenLinks">;

/** Preserve EmbedPDF's link border appearance without an editable hit area. */
function LinkAppearance({
	link,
	scale,
}: {
	link: PdfLinkAnnoObject;
	scale: number;
}) {
	const { width, height } = link.rect.size;
	const strokeWidth = link.strokeWidth ?? 2;
	const strokeStyle = link.strokeStyle ?? PdfAnnotationBorderStyle.UNDERLINE;
	const dashArray =
		strokeStyle === PdfAnnotationBorderStyle.DASHED
			? (link.strokeDashArray?.join(",") ?? `${strokeWidth * 3},${strokeWidth}`)
			: undefined;
	return (
		<svg
			aria-hidden="true"
			className="pointer-events-none absolute"
			width={width * scale}
			height={height * scale}
			viewBox={`0 0 ${width} ${height}`}
			fill="none"
			stroke={link.strokeColor ?? "#0000FF"}
			strokeWidth={strokeWidth}
			strokeDasharray={dashArray}
		>
			{strokeStyle === PdfAnnotationBorderStyle.UNDERLINE ? (
				<line x1={1} y1={height - 1} x2={width - 1} y2={height - 1} />
			) : (
				<rect
					x={strokeWidth / 2}
					y={strokeWidth / 2}
					width={Math.max(width - strokeWidth, 0)}
					height={Math.max(height - strokeWidth, 0)}
				/>
			)}
		</svg>
	);
}

/**
 * Navigation belongs to CitationLinkLayer. Overriding renderLocked also avoids
 * EmbedPDF's default locked-link navigator bypassing previews and jump history.
 */
export const PASSIVE_LINK_RENDERER = createRenderer<PdfLinkAnnoObject>({
	id: "link",
	matches: isLinkObject,
	render: ({ currentObject, scale }) => (
		<LinkAppearance link={currentObject} scale={scale} />
	),
	renderLocked: ({ currentObject, scale }) => (
		<LinkAppearance link={currentObject} scale={scale} />
	),
	useAppearanceStream: false,
});
