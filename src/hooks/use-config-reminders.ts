/**
 * Start the low-frequency config reminders (#658) in the main window.
 *
 * - `layout-local-model`: startup hint (once the user has finished onboarding
 *   and opened a vault), delayed so it does not collide with first-paint work.
 * - `network-proxy`: event hook — this hook registers `reportNetworkFailure`
 *   with the global notify funnel, which fires it on a network-ish failure.
 *
 * Registering here (not in a module side effect) keeps it out of the separate
 * Settings / doc windows.
 */

import { useEffect } from "react";
import { useSettings, useVaultStore } from "@/hooks/use-app-stores";
import { setNetworkFailureReporter } from "@/lib/core/notify";
import {
	maybeShowLayoutLocalModelReminder,
	reportNetworkFailure,
} from "@/lib/settings/reminders";

/** Let boot / vault loading settle before the toast appears. */
const STARTUP_DELAY_MS = 5000;

export function useConfigReminders(): void {
	const onboardingDone = useSettings((s) => s.onboardingDone);
	const vaultPath = useVaultStore((s) => s.vaultPath);

	useEffect(() => {
		setNetworkFailureReporter(reportNetworkFailure);
		return () => setNetworkFailureReporter(null);
	}, []);

	useEffect(() => {
		if (!onboardingDone || !vaultPath) return;
		const timer = window.setTimeout(
			maybeShowLayoutLocalModelReminder,
			STARTUP_DELAY_MS,
		);
		return () => window.clearTimeout(timer);
	}, [onboardingDone, vaultPath]);
}
