import { Check, Copy, Languages, MessageSquare } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AgentLogo } from "@/components/agent/agent-logo";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ScreenPoint } from "@/components/viewer/pdf/types";
import { useSettings, useUiStore } from "@/hooks/use-app-stores";
import { type AgentTemplate, listAgents } from "@/lib/agent";
import { cn } from "@/lib/core/utils";
import {
	HIGHLIGHT_COLORS,
	type HighlightColor,
	swatchColorClass,
} from "@/lib/pdf/highlight/palette";
import { resolveTranslateAgent } from "@/lib/translate";

type SelectionMenuProps = {
	/** Screen point near the top-center of the selection (toolbar anchor) */
	screen: ScreenPoint;
	/** Screen point at the bottom-right of the last selected line (pill anchor) */
	bottomRight: ScreenPoint;
	/** Create a highlight in the chosen color */
	onHighlight: (color: HighlightColor) => void;
	/** Copy the selected text to the clipboard */
	onCopy: () => void;
	onAsk: () => void;
	/** Pin the selection as an Agent composer context chip and open the chat. */
	onAddToChat: () => void;
	onTranslate: () => void;
	/** Hide highlight / translate (need marks/); keep Copy / Ask. */
	readOnly?: boolean;
};

const BAR_W_NORMAL = 268;
const BAR_W_READONLY = 112;
const BAR_H = 40;
const PILL_H = 24;
const PILL_GAP = 4;
const COPIED_FLASH_MS = 1500;

/**
 * Floating action bar shown next to a text selection: a row of color swatches
 * (highlight), then Copy / Ask / Translate. Annotate lives on the right-rail
 * selection comment chip instead. Add-to-chat is a small text pill at the
 * selection's bottom-right corner. Ask uses the configured PDF-Ask agent logo.
 * Copy keeps the bar open and swaps the copy icon for a check briefly.
 * Remote papers are read-only: they keep Copy / Ask but hide persistent
 * highlight / translate actions.
 */
export function SelectionMenu({
	screen,
	bottomRight,
	onHighlight,
	onCopy,
	onAsk,
	onAddToChat,
	onTranslate,
	readOnly = false,
}: SelectionMenuProps) {
	const { t } = useTranslation("viewer");
	const [copied, setCopied] = useState(false);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const pdfAskAgentId = useSettings((s) => s.pdfAsk.agentId);
	const [askTemplate, setAskTemplate] = useState<AgentTemplate | null>(null);
	// Add-to-chat only when the Agent surface is already visible (rail or popout).
	const showAddToChat = useUiStore(
		(s) =>
			(s.rightSidebarOpen && s.rightSidebarTab === "agent") ||
			s.featurePoppedOut.agent === true,
	);

	useEffect(() => {
		return () => {
			if (timerRef.current) clearTimeout(timerRef.current);
		};
	}, []);

	// Resolve the PDF-Ask agent logo so the Ask button mirrors Settings → PDF Ask.
	useEffect(() => {
		let cancelled = false;
		void listAgents()
			.then((registry) => {
				if (cancelled) return;
				const { agentId } = resolveTranslateAgent(
					{ agentId: pdfAskAgentId, modelId: "" },
					registry,
				);
				const agent = registry.agents.find((a) => a.id === agentId);
				setAskTemplate(agent?.template ?? null);
			})
			.catch(() => {
				if (!cancelled) setAskTemplate(null);
			});
		return () => {
			cancelled = true;
		};
	}, [pdfAskAgentId]);

	const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
	const vh = typeof window !== "undefined" ? window.innerHeight : 800;
	const barW = readOnly ? BAR_W_READONLY : BAR_W_NORMAL;
	let left = screen.x - barW / 2;
	left = Math.min(Math.max(12, left), vw - barW - 12);
	// Prefer just above the selection; flip below if near the top edge.
	let top = screen.y - BAR_H - 10;
	let overContent = false;
	if (top < 12) {
		top = Math.min(vh - BAR_H - 12, screen.y + 18);
		// Menu sits below the selection and may cover body text.
		overContent = true;
	}
	// Keep the toolbar on-screen when the selection scrolls out of view; dim it
	// so it does not look glued to an off-screen anchor.
	const clampedTop = Math.max(12, Math.min(vh - BAR_H - 12, top));
	const scrolledAway = clampedTop !== top;
	top = clampedTop;
	const dimmed = overContent || scrolledAway;

	// Pill sits just outside the selection's bottom-right corner; if that would
	// overflow the viewport, flip to the left of the corner instead.
	const pillW = 96;
	let pillLeft = bottomRight.x + PILL_GAP;
	if (pillLeft + pillW > vw - 12) {
		pillLeft = Math.max(12, bottomRight.x - pillW - PILL_GAP);
	} else {
		pillLeft = Math.max(12, pillLeft);
	}
	const pillTop = Math.min(
		Math.max(12, bottomRight.y + PILL_GAP),
		vh - PILL_H - 12,
	);

	const handleCopy = useCallback(() => {
		onCopy();
		setCopied(true);
		if (timerRef.current) clearTimeout(timerRef.current);
		timerRef.current = setTimeout(() => {
			timerRef.current = null;
			setCopied(false);
		}, COPIED_FLASH_MS);
	}, [onCopy]);

	const colorLabel = (c: HighlightColor): string => {
		switch (c) {
			case "yellow":
				return t("selection.color.yellow");
			case "green":
				return t("selection.color.green");
			case "blue":
				return t("selection.color.blue");
			case "pink":
				return t("selection.color.pink");
			default:
				return t("selection.color.purple");
		}
	};

	return (
		<>
			<div
				className={cn(
					"fixed z-50 flex h-10 items-center gap-0.5 rounded-xl border border-border/80 bg-background px-1 shadow-2xl ring-1 ring-black/5 transition-[background-color,opacity] duration-150 dark:ring-white/10",
					// Dim when covering body text or when the selection scrolled away.
					dimmed &&
						"bg-background/80 opacity-70 backdrop-blur-sm hover:bg-background hover:opacity-100",
				)}
				style={{ left, top }}
				role="toolbar"
				aria-label={t("selection.menuLabel")}
				onMouseDown={(e) => e.stopPropagation()}
			>
				<TooltipProvider delayDuration={200}>
					{!readOnly ? (
						<>
							{HIGHLIGHT_COLORS.map((c) => (
								<Tooltip key={c}>
									<TooltipTrigger asChild>
										{/*
										 * 16px dot, 24px hit area (WCAG 2.5.8): the target is padded
										 * out rather than the dot enlarged.
										 */}
										<button
											type="button"
											aria-label={colorLabel(c)}
											className="group inline-flex size-6 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
											onClick={() => onHighlight(c)}
										>
											<span
												className={cn(
													"size-4 rounded-full ring-1 ring-black/15 transition-transform group-hover:scale-110 dark:ring-white/25",
													swatchColorClass(c),
												)}
												aria-hidden
											/>
										</button>
									</TooltipTrigger>
									<TooltipContent side="top">{colorLabel(c)}</TooltipContent>
								</Tooltip>
							))}
							<div className="mx-1 h-5 w-px shrink-0 bg-border" />
						</>
					) : null}
					<div className="relative">
						{copied ? (
							<span
								className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded-md border border-border/80 bg-background px-1.5 py-0.5 text-caption text-foreground shadow-sm ring-1 ring-black/5 dark:ring-white/10"
								role="status"
								aria-live="polite"
							>
								{t("selection.copied")}
							</span>
						) : null}
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									type="button"
									variant="ghost"
									size="icon-sm"
									aria-label={
										copied ? t("selection.copied") : t("selection.copy")
									}
									onClick={handleCopy}
								>
									{copied ? (
										<Check className="size-4 text-foreground" aria-hidden />
									) : (
										<Copy className="size-4" />
									)}
								</Button>
							</TooltipTrigger>
							{!copied ? (
								<TooltipContent side="top">
									{t("selection.copy")}
								</TooltipContent>
							) : null}
						</Tooltip>
					</div>
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								type="button"
								variant="ghost"
								size="icon-sm"
								aria-label={t("selection.ask")}
								onClick={onAsk}
							>
								{askTemplate ? (
									<AgentLogo
										template={askTemplate}
										plain
										iconClassName="size-4"
									/>
								) : (
									<MessageSquare className="size-4" />
								)}
							</Button>
						</TooltipTrigger>
						<TooltipContent side="top">{t("selection.ask")}</TooltipContent>
					</Tooltip>
					{!readOnly ? (
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									type="button"
									variant="ghost"
									size="icon-sm"
									aria-label={t("selection.translate")}
									onClick={onTranslate}
								>
									<Languages className="size-4" />
								</Button>
							</TooltipTrigger>
							<TooltipContent side="top">
								{t("selection.translate")}
							</TooltipContent>
						</Tooltip>
					) : null}
				</TooltipProvider>
			</div>

			{showAddToChat ? (
				<button
					type="button"
					className={cn(
						"fixed z-50 inline-flex h-6 max-w-[10rem] items-center truncate rounded-full border border-border/80 bg-background px-2 text-caption font-medium text-foreground shadow-md ring-1 ring-black/5 transition-[colors,opacity] hover:bg-accent hover:text-accent-foreground dark:ring-white/10",
						"active:scale-[0.97] motion-reduce:active:scale-100",
						scrolledAway && "opacity-70 hover:opacity-100",
					)}
					style={{ left: pillLeft, top: pillTop }}
					aria-label={t("selection.addToChat")}
					onMouseDown={(e) => e.stopPropagation()}
					onClick={onAddToChat}
				>
					{t("selection.addToChat")}
				</button>
			) : null}
		</>
	);
}
