import { useViewportElement } from "@embedpdf/plugin-viewport/react";
import { type RefObject, useEffect, useRef } from "react";
import {
	isEditableClipboardTarget,
	viewerOwnsBareKey,
} from "@/components/viewer/pdf/host-dom";
import { bindPanDragGesture } from "@/lib/pdf/pan-drag";

/** Cursor feedback classes; the stylesheet overrides EmbedPDF's inline cursor. */
const PAN_READY_CLASS = "agentero-pdf-pan-ready";
const PANNING_CLASS = "agentero-pdf-panning";

type PanDragHandlerProps = {
	/** Gates the focus fallback for the bare Space key; hover claims without it. */
	active: boolean;
	/** PDF host; Space is claimed with the same ownership rule as `⌘F`. */
	hostRef: RefObject<HTMLDivElement | null>;
	/** False while `⌘.` region select owns the left button. */
	allowLeftDrag: boolean;
};

/**
 * Momentary hand tool: middle-button drag always pans, and holding Space arms
 * the left button to behave exactly the same.
 *
 * Space is a bare key with no modifier, so claiming it needs an ownership rule:
 * the hovered viewer wins (focus usually sits on a tab, the sidebar or the notes
 * pane while reading), otherwise the active viewer when focus is inside its host
 * or still neutral on `body` after a page click. Editable and button-like targets
 * always keep their native behavior. The pointer gesture is not gated on
 * ownership at all — a drag starts on whatever viewport the pointer is actually
 * on, which matters in split panes.
 *
 * Must render inside `DockviewViewport` (ViewportElementContext).
 */
export function PanDragHandler({
	active,
	hostRef,
	allowLeftDrag,
}: PanDragHandlerProps) {
	const viewportRef = useViewportElement();
	const armedRef = useRef(false);
	const activeRef = useRef(active);
	activeRef.current = active;
	const allowLeftDragRef = useRef(allowLeftDrag);
	allowLeftDragRef.current = allowLeftDrag;

	useEffect(() => {
		const viewport = viewportRef?.current;
		if (!viewport) return;

		const setArmed = (armed: boolean) => {
			if (armedRef.current === armed) return;
			armedRef.current = armed;
			viewport.classList.toggle(PAN_READY_CLASS, armed);
		};

		const binding = bindPanDragGesture({
			target: viewport,
			isLeftDragArmed: () => armedRef.current,
			// Armed, the left button is a hand tool exactly like the middle button and
			// pans from anywhere — including over toolbar buttons and in-page citation
			// links, whose click the held Space has already suspended. Only editors
			// keep their own pointer behavior.
			isExcludedTarget: isEditableClipboardTarget,
			onStateChange: (state) => {
				viewport.classList.toggle(PANNING_CLASS, state === "panning");
			},
		});

		const disarm = () => {
			setArmed(false);
			binding.cancel();
		};

		// Pointer capture is best-effort (WebKit drops it after a default-prevented
		// pointerdown), so a release outside the viewport never reaches the binding's
		// own listeners. This net keeps the drag from sticking with `grabbing` on;
		// cancel() is a no-op when nothing is in flight.
		const endDragAnywhere = () => binding.cancel();
		document.addEventListener("pointerup", endDragAnywhere, true);
		document.addEventListener("pointercancel", endDragAnywhere, true);

		/** Whether this viewer owns a bare Space keydown. */
		const ownsSpaceKey = (target: EventTarget | null): boolean =>
			viewerOwnsBareKey({
				host: hostRef.current,
				active: activeRef.current,
				target,
			});

		const isSpaceKey = (event: KeyboardEvent) =>
			event.key === " " || event.code === "Space";

		const onKeyDown = (event: KeyboardEvent) => {
			if (event.repeat || armedRef.current || !isSpaceKey(event)) return;
			if (event.metaKey || event.ctrlKey || event.altKey) return;
			if (!allowLeftDragRef.current) return;
			if (!ownsSpaceKey(event.target)) return;
			// Stop the viewport's native Space page-scroll while panning is armed.
			event.preventDefault();
			setArmed(true);
		};

		const onKeyUp = (event: KeyboardEvent) => {
			if (isSpaceKey(event)) setArmed(false);
		};

		window.addEventListener("keydown", onKeyDown);
		window.addEventListener("keyup", onKeyUp);
		window.addEventListener("blur", disarm);
		document.addEventListener("visibilitychange", disarm);

		return () => {
			window.removeEventListener("keydown", onKeyDown);
			window.removeEventListener("keyup", onKeyUp);
			window.removeEventListener("blur", disarm);
			document.removeEventListener("visibilitychange", disarm);
			document.removeEventListener("pointerup", endDragAnywhere, true);
			document.removeEventListener("pointercancel", endDragAnywhere, true);
			binding.dispose();
			armedRef.current = false;
			viewport.classList.remove(PAN_READY_CLASS, PANNING_CLASS);
		};
	}, [viewportRef, hostRef]);

	return null;
}
