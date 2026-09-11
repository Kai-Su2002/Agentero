import type { AnnotationSelectionMenuProps } from "@embedpdf/plugin-annotation/react";
import { useAnnotationCapability } from "@embedpdf/plugin-annotation/react";
import { Pencil, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { PDF_SELECTION_MENU } from "@/components/viewer/pdf/chrome/pdf-chrome-surface";
import { cn } from "@/lib/core/utils";
import {
	highlightColorOf,
	isHighlightObject,
} from "@/lib/pdf/highlight/annotation-store";
import {
	HIGHLIGHT_COLORS,
	type HighlightColor,
	swatchColorClass,
} from "@/lib/pdf/highlight/palette";

type HighlightAnnotationMenuProps = AnnotationSelectionMenuProps & {
	docId: string;
	onEdit: (id: string) => void;
	onDelete: (pageIndex: number, id: string) => void;
	onChangeColor: (pageIndex: number, id: string, color: HighlightColor) => void;
};

/**
 * Selection menu for text-highlight annotations. Appears when a highlight is
 * clicked in the PDF so plain highlights (no comment / no gutter pin) can still
 * be edited, recolored, or deleted without opening the side panel.
 */
export function HighlightAnnotationMenu({
	docId,
	context,
	selected,
	placement,
	menuWrapperProps,
	onEdit,
	onDelete,
	onChangeColor,
}: HighlightAnnotationMenuProps) {
	const { t } = useTranslation("viewer");
	const { provides: annotationCap } = useAnnotationCapability();
	const menuRef = useRef<HTMLDivElement | null>(null);

	const setRef = useCallback(
		(el: HTMLDivElement | null) => {
			menuRef.current = el;
			menuWrapperProps.ref(el);
		},
		[menuWrapperProps.ref],
	);

	// Dismiss the highlight selection when the user clicks anywhere outside the
	// menu. EmbedPDF's own deselect-on-background-click requires the click to
	// land exactly on the pointer-provider surface, which is usually covered by
	// child layers, so we handle it explicitly here.
	useEffect(() => {
		if (!selected || !annotationCap) return;
		const handlePointerDown = (event: PointerEvent) => {
			const target = event.target as Node | null;
			if (!target || !menuRef.current) return;
			if (menuRef.current.contains(target)) return;
			annotationCap.forDocument(docId).deselectAnnotation();
		};
		document.addEventListener("pointerdown", handlePointerDown, true);
		return () => {
			document.removeEventListener("pointerdown", handlePointerDown, true);
		};
	}, [selected, annotationCap, docId]);

	if (!selected || context.type !== "annotation") return null;
	const obj = context.annotation.object;
	if (!isHighlightObject(obj)) return null;
	const activeColor = highlightColorOf(obj);

	return (
		<div {...menuWrapperProps} ref={setRef}>
			<TooltipProvider delayDuration={200}>
				<div
					data-pdf-chrome
					role="toolbar"
					aria-label={t("selection.highlightMenuLabel")}
					className={cn(
						"pointer-events-auto absolute left-1/2 z-10 flex h-10 items-center gap-0.5 px-1",
						PDF_SELECTION_MENU,
						placement.suggestTop ? "top-full mt-1.5" : "bottom-full mb-1.5",
					)}
					style={{ transform: "translateX(-50%)" }}
				>
					{HIGHLIGHT_COLORS.map((color) => (
						<Tooltip key={color}>
							<TooltipTrigger asChild>
								<button
									type="button"
									aria-label={t(`selection.color.${color}`)}
									aria-pressed={activeColor === color}
									className={cn(
										"mx-0.5 size-4 shrink-0 rounded-full ring-1 ring-black/15 transition-transform duration-100 hover:scale-105 active:scale-95 dark:ring-white/25",
										swatchColorClass(color),
										activeColor === color &&
											"ring-2 ring-offset-1 ring-offset-background ring-foreground/70",
									)}
									onClick={() =>
										onChangeColor(context.pageIndex, obj.id, color)
									}
								/>
							</TooltipTrigger>
							<TooltipContent side={placement.suggestTop ? "bottom" : "top"}>
								{t(`selection.color.${color}`)}
							</TooltipContent>
						</Tooltip>
					))}
					<div className="mx-1 h-5 w-px shrink-0 bg-border" />
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								type="button"
								variant="ghost"
								size="icon-sm"
								className="text-muted-foreground hover:text-foreground"
								aria-label={t("selection.editComment")}
								onClick={() => onEdit(obj.id)}
							>
								<Pencil className="size-4" />
							</Button>
						</TooltipTrigger>
						<TooltipContent side={placement.suggestTop ? "bottom" : "top"}>
							{t("selection.editComment")}
						</TooltipContent>
					</Tooltip>
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								type="button"
								variant="ghost"
								size="icon-sm"
								className="text-muted-foreground hover:text-destructive"
								aria-label={t("selection.removeHighlight")}
								onClick={() => onDelete(context.pageIndex, obj.id)}
							>
								<Trash2 className="size-4" />
							</Button>
						</TooltipTrigger>
						<TooltipContent side={placement.suggestTop ? "bottom" : "top"}>
							{t("selection.removeHighlight")}
						</TooltipContent>
					</Tooltip>
				</div>
			</TooltipProvider>
		</div>
	);
}
