import type { KeyboardEvent } from "react";
import { isImeKeyboardEvent } from "@/lib/core/ime";

/** Handle ⌘/Ctrl+B and ⌘/Ctrl+I in plain Markdown textareas. */
export function applyMarkdownTextareaShortcut(
	event: KeyboardEvent<HTMLTextAreaElement>,
	onChange: (value: string) => void,
): boolean {
	if (
		!(event.metaKey || event.ctrlKey) ||
		event.altKey ||
		event.shiftKey ||
		isImeKeyboardEvent(event)
	) {
		return false;
	}
	const marker =
		event.key.toLowerCase() === "b"
			? "**"
			: event.key.toLowerCase() === "i"
				? "*"
				: null;
	if (!marker) return false;

	event.preventDefault();
	const textarea = event.currentTarget;
	const start = textarea.selectionStart;
	const end = textarea.selectionEnd;
	const value = textarea.value;
	const selected = value.slice(start, end);
	const before = value.slice(0, start).match(/\*+$/)?.[0].length ?? 0;
	const after = value.slice(end).match(/^\*+/)?.[0].length ?? 0;
	const wrapped =
		marker === "*"
			? before % 2 === 1 && after % 2 === 1
			: before >= 2 && after >= 2;
	if (wrapped) {
		textarea.setRangeText(selected, start - marker.length, end + marker.length);
		textarea.setSelectionRange(start - marker.length, end - marker.length);
	} else {
		textarea.setRangeText(`${marker}${selected}${marker}`, start, end);
		textarea.setSelectionRange(start + marker.length, end + marker.length);
	}
	onChange(textarea.value);
	return true;
}
