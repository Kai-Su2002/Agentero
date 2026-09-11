/**
 * Contenteditable composer field: @mention / $skill / /command markers render
 * as compact inline chips at the insertion point (same look for all three).
 */
import {
	type ClipboardEvent,
	type FormEvent,
	type HTMLAttributes,
	type KeyboardEvent,
	type MouseEvent,
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
} from "react";
import { useTranslation } from "react-i18next";
import { useImeGuard } from "@/hooks/use-ime-guard";
import { AGENT_COMPOSER_INPUT_ATTR } from "@/lib/agent/composer-focus";
import {
	encodeCommandToken,
	encodeMentionToken,
	encodeSkillToken,
	parseInlineTokenParts,
	stripInlineTokens,
} from "@/lib/agent/composer-inline-tokens";
import { basenameOf } from "@/lib/core/path";
import { cn } from "@/lib/core/utils";

const CHIP_ATTR = "data-composer-chip";

const INLINE_CHIP_CLASS =
	"composer-inline-chip mx-0.5 inline-flex max-w-[7rem] shrink-0 items-center gap-0.5 rounded-md border border-border/80 bg-muted/40 px-1 align-baseline text-[0.8125em] leading-[1.25] text-foreground hover:bg-muted";

function serializeEditor(root: HTMLElement): string {
	let out = "";
	const walk = (node: Node) => {
		if (node.nodeType === Node.TEXT_NODE) {
			out += node.textContent ?? "";
			return;
		}
		if (node.nodeType !== Node.ELEMENT_NODE) return;
		const el = node as HTMLElement;
		const chip = el.getAttribute(CHIP_ATTR);
		if (chip === "mention") {
			const path = el.dataset.path ?? "";
			if (path) out += encodeMentionToken(path);
			return;
		}
		if (chip === "skill") {
			const skillId = el.dataset.skillId ?? "";
			if (skillId) out += encodeSkillToken(skillId);
			return;
		}
		if (chip === "command") {
			const name = el.dataset.commandName ?? "";
			if (name) out += encodeCommandToken(name);
			return;
		}
		if (el.tagName === "BR") {
			out += "\n";
			return;
		}
		// Chromium often wraps lines in <div>.
		if (
			(el.tagName === "DIV" || el.tagName === "P") &&
			out.length > 0 &&
			!out.endsWith("\n")
		) {
			out += "\n";
		}
		for (const child of el.childNodes) walk(child);
	};
	for (const child of root.childNodes) walk(child);
	return out;
}

function appendPrefixLabel(
	chip: HTMLElement,
	prefix: string,
	labelText: string,
	title?: string,
) {
	const prefixEl = document.createElement("span");
	prefixEl.className = "font-mono text-muted-foreground";
	prefixEl.textContent = prefix;
	const label = document.createElement("span");
	label.className = "min-w-0 truncate";
	label.textContent = labelText;
	if (title) label.title = title;
	chip.append(prefixEl, label);
}

/** Strip trigger / "skill :" chrome — chip shows the bare skill name. */
function cleanSkillDisplayName(name: string): string {
	return name
		.trim()
		.replace(/^[/$]+/, "")
		.replace(/^skill\s*:\s*/i, "");
}

/** Lucide `sparkles` glyph (skill affordance) for contenteditable chips. */
function appendSkillIcon(chip: HTMLElement) {
	const ns = "http://www.w3.org/2000/svg";
	const svg = document.createElementNS(ns, "svg");
	svg.setAttribute("viewBox", "0 0 24 24");
	svg.setAttribute("fill", "none");
	svg.setAttribute("stroke", "currentColor");
	svg.setAttribute("stroke-width", "2");
	svg.setAttribute("stroke-linecap", "round");
	svg.setAttribute("stroke-linejoin", "round");
	svg.setAttribute("class", "size-3 shrink-0 text-muted-foreground");
	svg.setAttribute("aria-hidden", "true");
	const paths = [
		"M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z",
		"M20 3v4",
		"M22 5h-4",
		"M4 17v2",
		"M5 18H3",
	];
	for (const d of paths) {
		const path = document.createElementNS(ns, "path");
		path.setAttribute("d", d);
		svg.appendChild(path);
	}
	chip.appendChild(svg);
}

function appendSkillLabel(chip: HTMLElement, name: string, skillId: string) {
	appendSkillIcon(chip);
	const label = document.createElement("span");
	label.className = "min-w-0 truncate";
	label.textContent = cleanSkillDisplayName(name);
	label.title = skillId;
	chip.appendChild(label);
}

function placeCaretAtEnd(el: HTMLElement) {
	const selection = window.getSelection();
	if (!selection) return;
	const range = document.createRange();
	range.selectNodeContents(el);
	range.collapse(false);
	selection.removeAllRanges();
	selection.addRange(range);
}

function deleteChipElement(chip: HTMLElement) {
	const parent = chip.parentNode;
	if (!parent) return;
	const selection = window.getSelection();
	const range = document.createRange();
	range.setStartBefore(chip);
	range.collapse(true);
	chip.remove();
	selection?.removeAllRanges();
	selection?.addRange(range);
}

export type ComposerInlineInputProps = {
	value: string;
	onValueChange: (value: string) => void;
	onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
	disabled?: boolean;
	compact?: boolean;
	placeholder?: string;
	autoFocus?: boolean;
	labelForPath: (path: string) => string;
	skillLabel: (skillId: string) => string;
	"aria-expanded"?: boolean | undefined;
	"aria-autocomplete"?: HTMLAttributes<HTMLDivElement>["aria-autocomplete"];
	"aria-controls"?: string | undefined;
	"aria-activedescendant"?: string | undefined;
	className?: string;
};

export function ComposerInlineInput({
	value,
	onValueChange,
	onKeyDown,
	disabled,
	compact = false,
	placeholder,
	autoFocus,
	labelForPath,
	skillLabel,
	className,
	...aria
}: ComposerInlineInputProps) {
	const { t } = useTranslation("agent");
	const editorRef = useRef<HTMLDivElement>(null);
	/** null until first paint so the initial `value` always hydrates into the DOM. */
	const lastValueRef = useRef<string | null>(null);
	const { isBlockedByIme, compositionProps } = useImeGuard();

	const emitFromDom = useCallback(() => {
		const root = editorRef.current;
		if (!root) return;
		const next = serializeEditor(root);
		lastValueRef.current = next;
		onValueChange(next);
	}, [onValueChange]);

	const renderValue = useCallback(
		(text: string) => {
			const root = editorRef.current;
			if (!root) return;
			root.replaceChildren();
			const parts = parseInlineTokenParts(text);
			if (parts.length === 0) {
				return;
			}
			for (const part of parts) {
				if (part.type === "text") {
					if (!part.value) continue;
					// Preserve newlines as <br> between text runs.
					const lines = part.value.split("\n");
					lines.forEach((line, index) => {
						if (index > 0) root.appendChild(document.createElement("br"));
						if (line) root.appendChild(document.createTextNode(line));
					});
					continue;
				}
				const chip = document.createElement("span");
				chip.setAttribute(CHIP_ATTR, part.type);
				chip.contentEditable = "false";
				chip.className = INLINE_CHIP_CLASS;
				if (part.type === "mention") {
					chip.dataset.path = part.path;
					const short =
						basenameOf(part.path) || labelForPath(part.path) || part.path;
					appendPrefixLabel(chip, "@", short, part.path);
					chip.setAttribute(
						"aria-label",
						t("composer.removeContext", { path: part.path }),
					);
				} else if (part.type === "skill") {
					chip.dataset.skillId = part.skillId;
					const name = skillLabel(part.skillId);
					appendSkillLabel(chip, name, part.skillId);
					chip.setAttribute(
						"aria-label",
						t("composer.removeSkill", {
							skill: cleanSkillDisplayName(name),
						}),
					);
				} else {
					chip.dataset.commandName = part.name;
					const commandLabel = cleanSkillDisplayName(part.name);
					appendPrefixLabel(chip, "/", commandLabel);
					chip.setAttribute("aria-label", `/${commandLabel}`);
				}
				root.appendChild(chip);
			}
		},
		[labelForPath, skillLabel, t],
	);

	useLayoutEffect(() => {
		if (value === lastValueRef.current) return;
		lastValueRef.current = value;
		renderValue(value);
		const root = editorRef.current;
		if (root && document.activeElement === root) {
			placeCaretAtEnd(root);
		}
	}, [renderValue, value]);

	useEffect(() => {
		if (!autoFocus) return;
		editorRef.current?.focus();
	}, [autoFocus]);

	const handleInput = (_event: FormEvent<HTMLDivElement>) => {
		emitFromDom();
	};

	const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		if (event.key === "Enter" && isBlockedByIme(event)) {
			return;
		}

		// Backspace against an atomic chip deletes the whole chip.
		if (event.key === "Backspace" && !isBlockedByIme(event)) {
			const selection = window.getSelection();
			if (selection?.isCollapsed && selection.rangeCount === 1) {
				const range = selection.getRangeAt(0);
				if (range.startOffset === 0) {
					const node = range.startContainer;
					const prev =
						node.nodeType === Node.TEXT_NODE
							? node.previousSibling
							: (node as HTMLElement).previousSibling;
					const chip =
						prev &&
						prev.nodeType === Node.ELEMENT_NODE &&
						(prev as HTMLElement).getAttribute(CHIP_ATTR)
							? (prev as HTMLElement)
							: null;
					if (chip) {
						event.preventDefault();
						deleteChipElement(chip);
						emitFromDom();
						return;
					}
				} else if (
					range.startContainer.nodeType === Node.ELEMENT_NODE &&
					range.startOffset > 0
				) {
					const parent = range.startContainer as HTMLElement;
					const prev = parent.childNodes[range.startOffset - 1];
					if (
						prev?.nodeType === Node.ELEMENT_NODE &&
						(prev as HTMLElement).getAttribute(CHIP_ATTR)
					) {
						event.preventDefault();
						deleteChipElement(prev as HTMLElement);
						emitFromDom();
						return;
					}
				}
			}
		}

		onKeyDown?.(event);
		if (event.defaultPrevented) return;

		if (event.key === "Enter" && !event.shiftKey) {
			event.preventDefault();
			const form = event.currentTarget.closest("form");
			const submitButton = form?.querySelector(
				'button[type="submit"]',
			) as HTMLButtonElement | null;
			if (submitButton?.disabled) return;
			form?.requestSubmit();
		}
	};

	const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
		event.preventDefault();
		const text = event.clipboardData.getData("text/plain");
		if (!text) return;
		document.execCommand("insertText", false, text);
		emitFromDom();
	};

	const handleChipClick = (event: MouseEvent<HTMLDivElement>) => {
		const target = event.target as HTMLElement | null;
		const chip = target?.closest?.(`[${CHIP_ATTR}]`) as HTMLElement | null;
		if (!chip || !editorRef.current?.contains(chip)) return;
		event.preventDefault();
		event.stopPropagation();
		deleteChipElement(chip);
		emitFromDom();
		editorRef.current?.focus();
	};

	const isVisuallyEmpty =
		stripInlineTokens(value).length === 0 && !/\{\{(?:m|s):/.test(value);

	return (
		<>
			{/* Keep PromptInput FormData happy; controlled submit prefers React state. */}
			<textarea
				name="message"
				className="sr-only"
				tabIndex={-1}
				readOnly
				aria-hidden
				value={stripInlineTokens(value)}
			/>
			<div
				className={cn(
					"relative min-h-0",
					compact ? "min-w-0 flex-1" : "flex-1",
				)}
			>
				{isVisuallyEmpty && placeholder ? (
					<div
						aria-hidden
						className={cn(
							"pointer-events-none absolute inset-0 px-0 text-muted-foreground/80",
							compact ? "py-0 text-sm leading-5" : "py-1 text-[15px] leading-5",
						)}
					>
						{placeholder}
					</div>
				) : null}
				{/* Contenteditable is required for inline chip DOM; not a plain textarea. */}
				{/* biome-ignore lint/a11y/useSemanticElements: chips must live inside the editable surface */}
				<div
					ref={editorRef}
					{...{ [AGENT_COMPOSER_INPUT_ATTR]: "" }}
					role="textbox"
					aria-multiline="true"
					tabIndex={disabled ? -1 : 0}
					contentEditable={!disabled}
					suppressContentEditableWarning
					data-slot="input-group-control"
					className={cn(
						"agentero-scroll relative min-h-0 overflow-y-auto px-0 text-foreground outline-none",
						compact
							? "h-6 max-h-none min-w-0 flex-1 py-0 text-sm leading-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
							: "min-h-0 flex-1 py-1 text-[15px] leading-5",
						disabled && "opacity-60",
						className,
					)}
					onInput={handleInput}
					onKeyDown={handleKeyDown}
					onPaste={handlePaste}
					onClick={handleChipClick}
					{...compositionProps}
					{...aria}
				/>
			</div>
		</>
	);
}
