/**
 * Start the low-frequency config reminders (#658) in the main window.
 *
 * - `layout-local-model`: every app launch (once onboarding is done, whether
 *   or not a vault is open), delayed so it does not collide with first-paint
 *   work. Shown at most once per session until the user dismisses it.
 * - `network-proxy`: event hook — this hook registers `reportNetworkFailure`
 *   with the global notify funnel, which fires it on a network-ish failure.
 *
 * Registering here (not in a module side effect) keeps it out of the separate
 * Settings / doc windows.
 */

import { useEffect } from "react";
import { useSettings } from "@/hooks/use-app-stores";
import { setNetworkFailureReporter } from "@/lib/core/notify";
import {
	maybeShowLayoutLocalModelReminder,
	reportNetworkFailure,
} from "@/lib/settings/reminders";

/** Let boot settle before the toast appears. */
const STARTUP_DELAY_MS = 5000;

export function useConfigReminders(): void {
	const onboardingDone = useSettings((s) => s.onboardingDone);

	useEffect(() => {
		setNetworkFailureReporter(reportNetworkFailure);
		return () => setNetworkFailureReporter(null);
	}, []);

	// Every app launch after onboarding; a vault is not required. The reminder
	// module caps this at once per session and honors "don't remind again".
	useEffect(() => {
		if (!onboardingDone) return;
		const timer = window.setTimeout(
			maybeShowLayoutLocalModelReminder,
			STARTUP_DELAY_MS,
		);
		return () => window.clearTimeout(timer);
	}, [onboardingDone]);
}
