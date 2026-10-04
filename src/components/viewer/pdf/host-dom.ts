/** DOM / error predicates the PDF viewer needs outside React state. */

/**
 * PDFium rejects work queued against a document that is already closing (tab
 * switch mid-render). Those rejections are expected, not failures to report.
 */
export function isPdfDocumentCloseRaceError(error: unknown): boolean {
	const message =
		error instanceof Error
			? error.message
			: typeof error === "string"
				? error
				: error && typeof error === "object" && "message" in error
					? String((error as { message?: unknown }).message)
					: "";
	return /document does not open/i.test(message);
}

/** True when a copy/paste target is a real editable field, not page text. */
export function isEditableClipboardTarget(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	const editable = target.closest(
		"input, textarea, select, [role='textbox'], [contenteditable]",
	);
	return (
		editable instanceof HTMLElement &&
		editable.getAttribute("contenteditable") !== "false"
	);
}

/**
 * Space must still activate these rather than being claimed as a bare key — the
 * roles that natively respond to Space, matching the list `index.css` keeps
 * unselectable.
 */
const INTERACTIVE_SELECTOR = [
	"button",
	"a",
	"summary",
	"select",
	"[role='button']",
	"[role='tab']",
	"[role='menuitem']",
	"[role='menuitemcheckbox']",
	"[role='menuitemradio']",
	"[role='option']",
	"[role='radio']",
	"[role='checkbox']",
	"[role='switch']",
	"[role='treeitem']",
].join(", ");

export function isInteractiveTarget(target: EventTarget | null): boolean {
	return (
		target instanceof Element && target.closest(INTERACTIVE_SELECTOR) !== null
	);
}

/**
 * Whether a bare (unmodified) key press belongs to a PDF viewer.
 *
 * The viewer under the pointer wins, whichever panel dockview calls active:
 * focus normally sits on a tab, the sidebar, or the notes pane while reading,
 * and only one viewer can be hovered. Not hovered, it falls back to focus —
 * gated on `active` so two mounted panes cannot both claim one keypress.
 * Editable and button-like targets keep their native key behavior.
 */
export function viewerOwnsBareKey(options: {
	host: HTMLElement | null;
	active: boolean;
	target: EventTarget | null;
}): boolean {
	const { host, active, target } = options;
	if (!host) return false;
	if (isEditableClipboardTarget(target)) return false;
	if (isInteractiveTarget(target)) return false;
	if (host.matches(":hover")) return true;
	if (!active) return false;
	// Clicking a page never moves focus off `body`, so a neutral focus still
	// belongs to the viewer the user last clicked even after the pointer leaves.
	const focused = document.activeElement;
	return (
		!focused ||
		focused === document.body ||
		focused === document.documentElement ||
		host.contains(focused)
	);
}

export function nativeSelectionBelongsToHost(
	host: HTMLElement | null,
): boolean {
	if (!host) return false;
	const selection = window.getSelection();
	if (!selection || selection.isCollapsed || selection.rangeCount === 0)
		return false;
	const node = selection.getRangeAt(0).commonAncestorContainer;
	const el =
		node.nodeType === Node.ELEMENT_NODE
			? (node as Element)
			: node.parentElement;
	return Boolean(el && host.contains(el));
}

/** Drop a DOM selection that lives inside the PDF host. Leave selections elsewhere. */
export function clearDomSelectionInside(host: HTMLElement | null): void {
	if (!host) return;
	const selection = window.getSelection();
	if (!selection || selection.rangeCount === 0) return;
	const node = selection.anchorNode;
	if (!node) return;
	const el = node instanceof Element ? node : node.parentElement;
	if (el && host.contains(el)) selection.removeAllRanges();
}

export function hasNativeSelectionOutsideHost(
	host: HTMLElement | null,
): boolean {
	const selection = window.getSelection();
	if (!selection || selection.isCollapsed || !selection.toString().trim())
		return false;
	return !nativeSelectionBelongsToHost(host);
}
