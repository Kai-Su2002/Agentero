/**
 * CLI install status and PATH shim management (Settings → About).
 * Install may use a local/dev binary or download the same app version from GitHub Releases.
 */

import { commands } from "@/lib/core/bindings";
import { callApi } from "@/lib/core/ipc";
import { isTauri } from "@/lib/core/tauri";

export type CliInstallStatus = {
	appVersion: string;
	bundledVersion: string | null;
	bundledPath: string | null;
	/** `bundled` | `managed` | `dev` when a binary is resolved */
	source: string | null;
	cliVersion: string | null;
	downloadUrl: string | null;
	releasePageUrl: string;
	canInstall: boolean;
	installed: boolean;
	installPath: string | null;
	shimCurrent: boolean;
	preferredBinDir: string;
	preferredBinOnPath: boolean;
	/** `brew` executable detected (PATH or standard Homebrew roots) */
	brewAvailable: boolean;
	/** Command users type after install (`agentero-cli` on Windows, `agentero` elsewhere) */
	commandName: string;
	message: string | null;
};

export type CliInstallResult = {
	status: CliInstallStatus;
	action: string;
};

export function fetchCliInstallStatus(): Promise<CliInstallStatus> {
	return callApi(() => commands.cliInstallStatus(), {
		fallback: "Failed to read CLI install status",
	});
}

export function installCliCommand(): Promise<CliInstallResult> {
	return callApi(() => commands.cliInstallCommand(), {
		fallback: "Failed to install CLI command",
	});
}

export function uninstallCliCommand(): Promise<CliInstallResult> {
	return callApi(() => commands.cliUninstallCommand(), {
		fallback: "Failed to remove CLI command",
	});
}

export type FinderServiceStatus = {
	/** Quick Action integration exists only on macOS */
	supported: boolean;
	installed: boolean;
	installPath: string | null;
	appBundlePath: string | null;
	/** installed && baked-in bundle matches the current app bundle */
	current: boolean;
	message: string | null;
};

export function fetchFinderServiceStatus(): Promise<FinderServiceStatus> {
	return callApi(() => commands.finderServiceStatus(), {
		fallback: "Failed to read Finder service status",
	});
}

export function installFinderService(): Promise<FinderServiceStatus> {
	return callApi(() => commands.finderServiceInstall(), {
		fallback: "Failed to install Finder service",
	});
}

export function uninstallFinderService(): Promise<FinderServiceStatus> {
	return callApi(() => commands.finderServiceUninstall(), {
		fallback: "Failed to remove Finder service",
	});
}

/** Consume Host-queued vault path from a cold-start deep link (null if none). */
export async function takePendingVaultOpen(): Promise<string | null> {
	if (!isTauri()) return null;
	const res = await commands.vaultOpenTakePending();
	if (!res.ok) return null;
	// `data: null` means no pending path (not a failure).
	return res.data ?? null;
}
