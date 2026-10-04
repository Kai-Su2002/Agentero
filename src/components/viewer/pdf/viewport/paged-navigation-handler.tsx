/**
 * Page-by-page navigation for the "paged" reading mode.
 *
 * EmbedPDF only exposes continuous scroll strategies, so this turns the
 * continuous scroller into a paginated one: a plain wheel gesture, PageUp/Down
 * or the arrow keys flip exactly one virtual item. In `odd` / `even` layout a
 * virtual item is a two-page spread, so the same code flips a whole spread;
 * `usePdfReadingMode` keeps the window sized with FitPage so one item fills the
 * screen.
 *
 * The wheel listener captures on the host so it runs before the viewport's own
 * wheel listener (which cancels pending programmatic scrolls) — without that,
 * the momentum ticks after a flick would cancel the page turn we just queued.
 */

import { useScroll } from "@embedpdf/plugin-scroll/react";
import { useViewportElement } from "@embedpdf/plugin-viewport/react";
import { type RefObject, useEffect, useRef } from "react";
import { viewerOwnsBareKey } from "@/components/viewer/pdf/host-dom";

/** Wheel delta accumulated before a gesture flips one page/spread. */
const WHEEL_TURN_THRESHOLD = 42;
/** Wheel stream must be silent this long before the next gesture can flip. */
const WHEEL_GESTURE_IDLE_MS = 140;

type PagedNavigationHandlerProps = {
	docId: string;
	/** Only active while the "paged" reading mode is selected. */
	paged: boolean;
	/** Gates the focus fallback for keyboard ownership (see PanDragHandler). */
	active: boolean;
	hostRef: RefObject<HTMLDivElement | null>;
};

export function PagedNavigationHandler({
	docId,
	paged,
	active,
	hostRef,
}: PagedNavigationHandlerProps) {
	const viewportRef = useViewportElement();
	const { provides: scroll } = useScroll(docId);
	const scrollRef = useRef(scroll);
	scrollRef.current = scroll;
	const pagedRef = useRef(paged);
	pagedRef.current = paged;
	const activeRef = useRef(active);
	activeRef.current = active;

	useEffect(() => {
		const host = hostRef.current;
		if (!host) return;

		let accum = 0;
		let consumed = false;
		let idleTimer: ReturnType<typeof setTimeout> | null = null;

		const armIdle = () => {
			if (idleTimer) clearTimeout(idleTimer);
			idleTimer = setTimeout(() => {
				accum = 0;
				consumed = false;
			}, WHEEL_GESTURE_IDLE_MS);
		};

		const onWheel = (event: WheelEvent) => {
			if (!pagedRef.current) return;
			// Ctrl/Cmd+wheel and trackpad pinch are the zoom gesture; leave them be.
			if (event.ctrlKey || event.metaKey) return;
			// Chrome overlays (toolbar, comment cards) live outside the scroller.
			const viewport = viewportRef?.current;
			if (!viewport?.contains(event.target as Node | null)) return;
			event.preventDefault();
			// Keep the viewport's own wheel listener from cancelling the page turn.
			event.stopPropagation();
			armIdle();
			const primary =
				Math.abs(event.deltaY) >= Math.abs(event.deltaX)
					? event.deltaY
					: event.deltaX;
			accum += primary;
			if (consumed || Math.abs(accum) < WHEEL_TURN_THRESHOLD) return;
			consumed = true;
			const scope = scrollRef.current;
			if (!scope) return;
			if (accum > 0) scope.scrollToNextPage("smooth");
			else scope.scrollToPreviousPage("smooth");
		};

		host.addEventListener("wheel", onWheel, {
			capture: true,
			passive: false,
		});
		return () => {
			host.removeEventListener("wheel", onWheel, true);
			if (idleTimer) clearTimeout(idleTimer);
		};
	}, [hostRef, viewportRef]);

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (!pagedRef.current) return;
			if (event.metaKey || event.ctrlKey || event.altKey) return;
			const key = event.key;
			const next =
				key === "PageDown" || key === "ArrowDown" || key === "ArrowRight";
			const prev = key === "PageUp" || key === "ArrowUp" || key === "ArrowLeft";
			const first = key === "Home";
			const last = key === "End";
			if (!next && !prev && !first && !last) return;
			if (
				!viewerOwnsBareKey({
					host: hostRef.current,
					active: activeRef.current,
					target: event.target,
				})
			)
				return;
			event.preventDefault();
			// Held keys should not race the smooth scroll; one flip per press.
			if (event.repeat) return;
			const scope = scrollRef.current;
			if (!scope) return;
			if (next) scope.scrollToNextPage("smooth");
			else if (prev) scope.scrollToPreviousPage("smooth");
			else
				scope.scrollToPage({
					pageNumber: first ? 1 : scope.getTotalPages(),
					behavior: "smooth",
				});
		};

		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [hostRef]);

	return null;
}
