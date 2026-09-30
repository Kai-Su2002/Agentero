import { describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "@/lib/settings/defaults";
import { applyExternalSettings, loadSettings } from "@/lib/settings/store";
import type { AppSettings } from "@/lib/settings/types";

vi.mock("@/lib/core/tauri", () => ({
	isTauri: () => false,
	isMacOS: () => false,
	isMobileApp: () => false,
	getPlatformOS: () => "other",
}));

function normalize(reminders: unknown): string[] {
	applyExternalSettings({
		...DEFAULT_SETTINGS,
		dismissedReminders: reminders,
	} as AppSettings);
	return loadSettings().dismissedReminders;
}

describe("dismissed config reminders", () => {
	it("defaults to empty", () => {
		expect(normalize(undefined)).toEqual([]);
		expect(normalize("nope")).toEqual([]);
	});

	it("keeps known ids, drops unknown ones and duplicates", () => {
		expect(normalize(["layout-local-model", "network-proxy"])).toEqual([
			"layout-local-model",
			"network-proxy",
		]);
		expect(
			normalize(["layout-local-model", "layout-local-model", "unknown", 42]),
		).toEqual(["layout-local-model"]);
	});
});
