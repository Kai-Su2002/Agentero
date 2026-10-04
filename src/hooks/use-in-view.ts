import { type RefObject, useEffect, useState } from "react";

/**
 * True once `ref`'s element is within `rootMargin` of the viewport (or
 * immediately when `enabled` is false / IntersectionObserver is unavailable).
 *
 * Used to defer expensive leaf work (image bytes, Mermaid, KaTeX) until the
 * block is about to be seen, so a long document does not pay for every heavy
 * node on first paint. The observer disconnects after the first hit.
 */
export function useInView(
	ref: RefObject<Element | null>,
	options?: { enabled?: boolean; rootMargin?: string },
): boolean {
	const enabled = options?.enabled ?? true;
	const rootMargin = options?.rootMargin ?? "800px 0px";
	const [inView, setInView] = useState(!enabled);

	useEffect(() => {
		if (!enabled) {
			setInView(true);
			return;
		}
		const element = ref.current;
		if (!element || typeof IntersectionObserver === "undefined") {
			setInView(true);
			return;
		}
		if (inView) return;
		// A zero-area target (e.g. an empty placeholder) cannot be observed
		// reliably; treat it as visible so its content is never stuck unrendered.
		const rect = element.getBoundingClientRect();
		if (rect.width === 0 && rect.height === 0) {
			setInView(true);
			return;
		}
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) {
					setInView(true);
					observer.disconnect();
				}
			},
			{ rootMargin },
		);
		observer.observe(element);
		return () => observer.disconnect();
	}, [enabled, inView, ref, rootMargin]);

	return inView;
}
