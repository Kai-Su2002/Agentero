import type { TFunction } from "i18next";
import type { SelectionContext } from "@/lib/agent/selection-store";

/**
 * Code-editor / Markdown selection label — `main.tex line 75` /
 * `main.tex lines 75-77` (zh: `main.tex 75行` / `main.tex 75-77行`).
 * Null when there is no line span (PDF page chips / plain quotes).
 */
export function selectionLineLabel(
	t: TFunction<"agent", undefined>,
	sel: Pick<SelectionContext, "lineFrom" | "lineTo">,
	title: string,
): string | null {
	const { lineFrom, lineTo } = sel;
	if (lineFrom == null) return null;
	if (lineTo != null && lineTo > lineFrom) {
		return t("composer.selectionChipWithLines", {
			title,
			from: lineFrom,
			to: lineTo,
		});
	}
	return t("composer.selectionChipWithLine", { title, from: lineFrom });
}
