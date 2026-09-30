import { beforeEach, describe, expect, it, vi } from "vitest";

const notifyReminder = vi.fn();
const openSettingsWindow = vi.fn();

vi.mock("@/lib/core/tauri", () => ({
	isTauri: () => true,
}));
vi.mock("@/lib/core/notify", () => ({
	notifyReminder: (...args: unknown[]) => notifyReminder(...args),
	setNetworkFailureReporter: vi.fn(),
}));
vi.mock("@/lib/shell/settings-window", () => ({
	openSettingsWindow: (...args: unknown[]) => openSettingsWindow(...args),
}));
vi.mock("@/i18n", () => ({
	default: { t: (key: string) => key },
}));

type ReminderModule = typeof import("@/lib/settings/reminders");

async function load(): Promise<{
	settingsStore: typeof import("@/lib/settings/react-store").settingsStore;
	reminders: ReminderModule;
}> {
	vi.resetModules();
	const { settingsStore } = await import("@/lib/settings/react-store");
	const reminders = await import("@/lib/settings/reminders");
	return { settingsStore, reminders };
}

beforeEach(() => {
	notifyReminder.mockClear();
	openSettingsWindow.mockClear();
});

describe("layout reminder firing", () => {
	it("fires once per session for the local backend", async () => {
		const { settingsStore, reminders } = await load();
		const s = settingsStore.getState();
		settingsStore.setState(
			{
				...s,
				layout: { ...s.layout, backend: "local" },
				dismissedReminders: [],
			},
			true,
		);

		reminders.maybeShowLayoutLocalModelReminder();
		expect(notifyReminder).toHaveBeenCalledTimes(1);
		reminders.maybeShowLayoutLocalModelReminder();
		expect(notifyReminder).toHaveBeenCalledTimes(1);
	});

	it("skips a remote backend and a dismissed reminder", async () => {
		const { settingsStore, reminders } = await load();
		const s = settingsStore.getState();
		settingsStore.setState(
			{
				...s,
				layout: { ...s.layout, backend: "paddle" },
				dismissedReminders: [],
			},
			true,
		);
		reminders.maybeShowLayoutLocalModelReminder();
		expect(notifyReminder).not.toHaveBeenCalled();

		settingsStore.setState(
			{
				...settingsStore.getState(),
				layout: { ...s.layout, backend: "local" },
				dismissedReminders: ["network-proxy"],
			},
			true,
		);
		reminders.reportNetworkFailure();
		expect(notifyReminder).not.toHaveBeenCalled();
	});
});
