"use client";

import { RangeApi } from "platejs";
import type { PlateEditor } from "platejs/react";
import { type RefObject, useEffect, useRef } from "react";
import { useDebouncedCallback } from "@/hooks/use-debounce";
import {
	clearActiveSelection,
	publishSelection,
} from "@/lib/agent/selection-store";
import { scheduleIdle } from "@/lib/core/idle";
import {
	hasSelectedBlocks,
	serializeSelectedBlocksAsMarkdown,
} from "@/lib/markdown/block-selection";
import { wrapFrontmatter } from "@/lib/markdown/frontmatter";
import {
	createSelectionSourceLinesCache,
	resolveSelectionSourceLines,
} from "@/lib/markdown/selection-source-lines";

const PUBLISH_DEBOUNCE_MS = 300;

/**
 * Mirror the live text selection into the Agent composer as an ephemeral
 * context chip. Debounced because dragging a selection fires continuously;
 * a collapsed selection clears the chip instead of publishing an empty one.
 *
 * Returns the scheduler to call whenever the selection may have moved.
 */
export function useSelectionContextPublish({
	editor,
	filePathRef,
	frontmatterYamlRef,
	docVersionRef,
}: {
	editor: PlateEditor;
	filePathRef: RefObject<string | null>;
	/** YAML interior (no fences); wrapped when computing disk line offsets. */
	frontmatterYamlRef: RefObject<string>;
	/** Incremented on document / frontmatter edits for line-prefix cache. */
	docVersionRef: RefObject<number>;
}): () => void {
	const linesCacheRef = useRef(createSelectionSourceLinesCache());
	const cancelIdleRef = useRef<(() => void) | null>(null);

	const publishNow = () => {
		const path = filePathRef.current;
		if (!path) {
			clearActiveSelection("markdown");
			return;
		}
		const frontmatter = wrapFrontmatter(frontmatterYamlRef.current ?? "");
		const lines = resolveSelectionSourceLines({
			editor,
			frontmatter,
			docVersion: docVersionRef.current,
			cache: linesCacheRef.current,
		});
		const lineFields =
			lines != null ? { lineFrom: lines.lineFrom, lineTo: lines.lineTo } : {};

		if (hasSelectedBlocks(editor)) {
			publishSelection({
				text: serializeSelectedBlocksAsMarkdown(editor),
				sourcePath: path,
				origin: "markdown",
				...lineFields,
			});
			return;
		}
		const selection = editor.selection;
		if (!selection || RangeApi.isCollapsed(selection)) {
			clearActiveSelection("markdown");
			return;
		}
		publishSelection({
			text: editor.api.string(selection),
			sourcePath: path,
			origin: "markdown",
			...lineFields,
		});
	};

	const schedule = useDebouncedCallback(() => {
		cancelIdleRef.current?.();
		cancelIdleRef.current = scheduleIdle(() => {
			cancelIdleRef.current = null;
			publishNow();
		}, PUBLISH_DEBOUNCE_MS);
	}, PUBLISH_DEBOUNCE_MS);

	useEffect(() => {
		return () => {
			schedule.cancel();
			cancelIdleRef.current?.();
			cancelIdleRef.current = null;
			clearActiveSelection("markdown");
		};
	}, [schedule]);

	return schedule;
}
