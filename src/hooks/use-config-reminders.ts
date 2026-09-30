/**
 * Start the low-frequency config reminders (#658) in the main window.
 *
 * - `layout-local-model`: every app launch, delayed so it does not collide with
 *   first-paint work. Suspended only while the first-run wizard overlay is up
 *   (the wizard already covers the layout choice); fires at most once per
 *   session until the user dismisses it.
 * - `network-proxy`: event hook — this hook registers `reportNetworkFailure`
 *   with the global notify funnel, which fires it on a network-ish failure.
 *
 * Registering here (not in a module side effect) keeps it out of the separate
 * Settings / doc windows.
 */

import { useEffect } from "react";
import { useStore } from "zustand";
import { onboardingStore } from "@/components/onboarding/onboarding-store";
import { setNetworkFailureReporter } from "@/lib/core/notify";
import {
	maybeShowLayoutLocalModelReminder,
	reportNetworkFailure,
} from "@/lib/settings/reminders";

/** Let boot settle before the toast appears. */
const STARTUP_DELAY_MS = 5000;

export function useConfigReminders(): void {
	const wizardOpen = useStore(onboardingStore, (s) => s.open);

	useEffect(() => {
		setNetworkFailureReporter(reportNetworkFailure);
		return () => setNetworkFailureReporter(null);
	}, []);

	// Every app launch; only held back while the onboarding overlay is visible.
	useEffect(() => {
		if (wizardOpen) return;
		const timer = window.setTimeout(() => {
			// The wizard can auto-open a tick after mount; re-check at fire time.
			if (onboardingStore.getState().open) return;
			maybeShowLayoutLocalModelReminder();
		}, STARTUP_DELAY_MS);
		return () => window.clearTimeout(timer);
	}, [wizardOpen]);
}
