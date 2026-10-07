import { beforeEach, describe, expect, it, vi } from "vitest";

const notifyWarning = vi.fn();
const openSettingsWindow = vi.fn();
const networkSystemProxy = vi.fn();
let mockSettings: { networkProxyEnabled: boolean; networkProxyUrl: string } = {
	networkProxyEnabled: false,
	networkProxyUrl: "",
};

vi.mock("@/lib/core/tauri", () => ({ isTauri: () => true }));
vi.mock("@/lib/core/notify", () => ({
	notifyWarning: (...args: unknown[]) => notifyWarning(...args),
}));
vi.mock("@/lib/shell/settings-window", () => ({
	openSettingsWindow: (...args: unknown[]) => openSettingsWindow(...args),
}));
vi.mock("@/i18n", () => ({ default: { t: (key: string) => key } }));
vi.mock("@/lib/core/bindings", () => ({
	commands: { networkSystemProxy: () => networkSystemProxy() },
}));
vi.mock("@/lib/core/ipc", () => ({
	callApi: (fn: () => unknown) => fn(),
}));
vi.mock("@/lib/settings/react-store", () => ({
	getSettings: () => mockSettings,
}));

async function load() {
	vi.resetModules();
	return import("@/lib/settings/proxy-guard");
}

beforeEach(() => {
	notifyWarning.mockClear();
	openSettingsWindow.mockClear();
	networkSystemProxy.mockReset();
	mockSettings = { networkProxyEnabled: false, networkProxyUrl: "" };
});

describe("download proxy guard", () => {
	it("skips the warning when the app proxy is enabled", async () => {
		mockSettings = {
			networkProxyEnabled: true,
			networkProxyUrl: "http://127.0.0.1:7890",
		};
		const { warnIfNoProxyForDownload } = await load();
		await warnIfNoProxyForDownload();
		expect(notifyWarning).not.toHaveBeenCalled();
		expect(networkSystemProxy).not.toHaveBeenCalled();
	});

	it("skips the warning when a system proxy is detected", async () => {
		networkSystemProxy.mockResolvedValue("http://127.0.0.1:7890");
		const { warnIfNoProxyForDownload } = await load();
		await warnIfNoProxyForDownload();
		expect(notifyWarning).not.toHaveBeenCalled();
	});

	it("warns and offers a settings jump when no proxy is configured", async () => {
		networkSystemProxy.mockResolvedValue(null);
		const { warnIfNoProxyForDownload } = await load();
		await warnIfNoProxyForDownload();
		expect(notifyWarning).toHaveBeenCalledTimes(1);
		const [message, opts] = notifyWarning.mock.calls[0] as [
			string,
			{ action: { label: string; onClick: () => void } },
		];
		expect(message).toContain("downloadProxyNotice.title");
		expect(opts.action.label).toContain("openSettings");
		opts.action.onClick();
		expect(openSettingsWindow).toHaveBeenCalledWith("general");
	});
});
