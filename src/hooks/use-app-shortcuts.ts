import { useEffect, useRef } from "react";
import { useNativeSelectAllGuard } from "@/hooks/use-native-select-all-guard";
import {
	resolveShortcutId,
	type ShortcutId,
	shortcutBelongsToTextField,
} from "@/lib/shell/shortcuts";

/** One handler per global keyboard shortcut. */
export type ShortcutHandlers = Record<ShortcutId, () => void>;

/**
 * Bind the global keyboard shortcuts once and dispatch each to its handler.
 * Handlers are read from a ref so the listener never needs to re-bind.
 *
 * @param modalOverlayOpen - a modal app overlay/sheet is open (settings, dialogs, palette…).
 *   Gates `whenSettingsOpen` / `whenSettingsClosed` shortcut rules. Docked, non-modal
 *   surfaces such as the Agent ask-user form do not gate shortcuts.
 */
export function useAppShortcuts(
	modalOverlayOpen: boolean,
	handlers: ShortcutHandlers,
): void {
	useNativeSelectAllGuard();

	const modalOverlayOpenRef = useRef(modalOverlayOpen);
	modalOverlayOpenRef.current = modalOverlayOpen;
	const handlersRef = useRef(handlers);
	handlersRef.current = handlers;

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			const id = resolveShortcutId(event, {
				settingsOpen: modalOverlayOpenRef.current,
			});
			if (!id) return;

			if (shortcutBelongsToTextField(id, event)) return;

			event.preventDefault();
			handlersRef.current[id]();
		};
		window.addEventListener("keydown", onKeyDown, true);
		return () => window.removeEventListener("keydown", onKeyDown, true);
	}, []);
}
