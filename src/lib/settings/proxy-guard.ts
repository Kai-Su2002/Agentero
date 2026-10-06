/**
 * Pre-download proxy check for GitHub-backed downloads (CLI install, app
 * update). Mirrors the updater's proxy resolution in `lib/update/service.ts`:
 * the app-level setting when enabled, otherwise the OS-detected system proxy.
 *
 * When neither is present the download runs direct, which commonly fails on
 * restricted networks; surface an actionable toast instead of letting the
 * request fail silently. Advisory only — the download still proceeds.
 */

import i18n from "@/i18n";
import { commands } from "@/lib/core/bindings";
import { callApi } from "@/lib/core/ipc";
import { notifyWarning } from "@/lib/core/notify";
import { isTauri } from "@/lib/core/tauri";
import { getSettings } from "@/lib/settings/react-store";
import { openSettingsWindow } from "@/lib/shell/settings-window";

/** True when the app proxy is on, or the OS reports a system proxy. */
export async function hasEffectiveProxy(): Promise<boolean> {
	const settings = getSettings();
	if (settings.networkProxyEnabled && settings.networkProxyUrl.trim()) {
		return true;
	}
	if (!isTauri()) return false;
	try {
		const url = await callApi(() => commands.networkSystemProxy());
		return Boolean(url);
	} catch {
		return false;
	}
}

/**
 * Warn before a GitHub-backed download when no proxy is configured. No-op when
 * a proxy is already effective (or off desktop). A stable toast id collapses
 * repeats, so clicking download twice does not stack toasts.
 */
export async function warnIfNoProxyForDownload(): Promise<void> {
	if (await hasEffectiveProxy()) return;
	notifyWarning(i18n.t("settings:about.downloadProxyNotice.title"), {
		id: "download-proxy-notice",
		description: i18n.t("settings:about.downloadProxyNotice.description"),
		action: {
			label: i18n.t("settings:about.downloadProxyNotice.openSettings"),
			onClick: () => openSettingsWindow("general"),
		},
	});
}
