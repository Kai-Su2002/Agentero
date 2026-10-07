import { LocateFixed } from "lucide-react";
import { useTranslation } from "react-i18next";
import { selectionLineLabel } from "@/lib/agent/selection-line-label";
import { navigateToSelection } from "@/lib/agent/selection-navigation";
import type { SelectionContext } from "@/lib/agent/selection-store";
export function SelectionSourceButton({
	selection,
}: {
	selection: SelectionContext;
}) {
	const { t } = useTranslation("viewer");
	const { t: tAgent } = useTranslation("agent");
	const pathBase =
		selection.origin === "chat"
			? t("selection.chatSource")
			: selection.sourcePath;
	const pathLabel = selectionLineLabel(tAgent, selection, pathBase) ?? pathBase;
	return (
		<button
			type="button"
			className="mb-2 flex max-w-full items-center gap-1 text-left text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			title={t("selection.locateSource")}
			onClick={() => void navigateToSelection(selection)}
		>
			<LocateFixed className="size-3.5 shrink-0" />
			<span className="truncate">
				{pathLabel}
				{selection.page
					? ` · ${t("selection.sourcePage", { page: selection.page })}`
					: ""}
			</span>
		</button>
	);
}
