import type { KeyboardEvent } from "react";
import { describe, expect, it, vi } from "vitest";
import { applyMarkdownTextareaShortcut } from "@/lib/markdown/textarea-shortcuts";

function textarea(value: string, start: number, end: number) {
	return {
		value,
		selectionStart: start,
		selectionEnd: end,
		setRangeText(replacement: string, from: number, to: number) {
			this.value =
				this.value.slice(0, from) + replacement + this.value.slice(to);
		},
		setSelectionRange(from: number, to: number) {
			this.selectionStart = from;
			this.selectionEnd = to;
		},
	};
}

function keyEvent(
	key: string,
	currentTarget: ReturnType<typeof textarea>,
	options: { ctrlKey?: boolean; isComposing?: boolean } = {},
) {
	return {
		key,
		currentTarget,
		ctrlKey: options.ctrlKey ?? false,
		metaKey: false,
		altKey: false,
		shiftKey: false,
		nativeEvent: { isComposing: options.isComposing ?? false },
		preventDefault: vi.fn(),
	} as unknown as KeyboardEvent<HTMLTextAreaElement>;
}

describe("Markdown textarea shortcuts", () => {
	it("toggles bold around the selected text and keeps it selected", () => {
		const field = textarea("a word here", 2, 6);
		const onChange = vi.fn();
		const event = keyEvent("b", field, { ctrlKey: true });
		expect(applyMarkdownTextareaShortcut(event, onChange)).toBe(true);
		expect(field.value).toBe("a **word** here");
		expect([field.selectionStart, field.selectionEnd]).toEqual([4, 8]);
		expect(onChange).toHaveBeenLastCalledWith(field.value);

		expect(applyMarkdownTextareaShortcut(event, onChange)).toBe(true);
		expect(field.value).toBe("a word here");
		expect([field.selectionStart, field.selectionEnd]).toEqual([2, 6]);
	});

	it("adds italic inside bold without removing the bold markers", () => {
		const field = textarea("**word**", 2, 6);
		expect(
			applyMarkdownTextareaShortcut(
				keyEvent("i", field, { ctrlKey: true }),
				vi.fn(),
			),
		).toBe(true);
		expect(field.value).toBe("***word***");
	});

	it("ignores plain letters and IME composition", () => {
		const field = textarea("word", 0, 4);
		const onChange = vi.fn();
		expect(applyMarkdownTextareaShortcut(keyEvent("b", field), onChange)).toBe(
			false,
		);
		expect(
			applyMarkdownTextareaShortcut(
				keyEvent("b", field, { ctrlKey: true, isComposing: true }),
				onChange,
			),
		).toBe(false);
		expect(field.value).toBe("word");
		expect(onChange).not.toHaveBeenCalled();
	});
});
