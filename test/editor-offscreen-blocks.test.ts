import { describe, expect, it } from "vitest";
import { isWebKitEngine } from "@/lib/core/tauri";

const WEBVIEW2 =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0";
const WK_WEBVIEW =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const WEBKIT_GTK =
	"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const FIREFOX =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0";
const CHROME_IOS =
	"Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1";

describe("isWebKitEngine", () => {
	it("treats Chromium webviews as non-WebKit", () => {
		expect(isWebKitEngine(WEBVIEW2)).toBe(false);
		expect(isWebKitEngine(CHROME_IOS)).toBe(false);
		expect(
			isWebKitEngine(
				"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 OPR/106.0.0.0",
			),
		).toBe(false);
	});

	it("detects Apple WebKit webviews", () => {
		expect(isWebKitEngine(WK_WEBVIEW)).toBe(true);
		expect(isWebKitEngine(WEBKIT_GTK)).toBe(true);
	});

	it("treats Gecko as non-WebKit", () => {
		expect(isWebKitEngine(FIREFOX)).toBe(false);
	});
});
