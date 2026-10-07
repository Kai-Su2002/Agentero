import { describe, expect, it } from "vitest";
import { rectBottomCenterScreen } from "@/components/viewer/pdf/coords";
import {
	computePreviewPlacement,
	PREVIEW_ARROW_MARGIN,
	PREVIEW_CHROME_HEIGHT,
	PREVIEW_GAP,
	PREVIEW_VIEWPORT_PADDING,
} from "@/components/viewer/pdf/preview-placement";

const VW = 1200;
const VH = 800;

describe("computePreviewPlacement", () => {
	it("positions the card centered directly below the link bottom-center with arrow pointing at it", () => {
		// Link occupies [480, 520] horizontally and [280, 300] vertically
		const screen = {
			x: 500, // horizontal center
			y: 300, // bottom
			top: 280,
			bottom: 300,
		};
		const cardWidth = 340;
		const cardEstimatedHeight = 200;

		const result = computePreviewPlacement({
			screen,
			cardWidth,
			cardEstimatedHeight,
			viewportWidth: VW,
			viewportHeight: VH,
		});

		expect(result.placement).toBe("bottom");
		// Card horizontal center aligns with link center: left + cardWidth / 2 = screen.x
		expect(result.left).toBe(500 - 340 / 2); // 330
		// Arrow relative offset matches screen.x - left = cardWidth / 2
		expect(result.arrowLeft).toBe(170);
		// Card top is placed below link bottom by gap
		expect(result.top).toBe(screen.bottom + PREVIEW_GAP); // 300 + 10 = 310
		expect(result.bottom).toBeUndefined();
	});

	it("flips the card to be above the link top when space below is insufficient", () => {
		// Link is near the bottom: top 700, bottom 720
		const screen = {
			x: 500,
			y: 720,
			top: 700,
			bottom: 720,
		};
		const cardWidth = 340;
		const cardEstimatedHeight = 200;

		const result = computePreviewPlacement({
			screen,
			cardWidth,
			cardEstimatedHeight,
			viewportWidth: VW,
			viewportHeight: VH,
		});

		expect(result.placement).toBe("top");
		expect(result.top).toBeUndefined();
		// Card bottom is placed above link top by gap:
		// bottom in viewport coords = VH - (screen.top - gap)
		expect(result.bottom).toBe(VH - (screen.top - PREVIEW_GAP)); // 800 - (700 - 10) = 110
		// Arrow relative offset still points directly at link horizontal center
		expect(result.arrowLeft).toBe(170);
	});

	it("shrinks the content instead of sliding the card over the link", () => {
		// 390 px below the link, 380 px above: stays below, but a 600 px card
		// does not fit — the content shrinks and the card keeps clear of the link.
		const screen = { x: 500, y: 398, top: 380, bottom: 398 };
		const result = computePreviewPlacement({
			screen,
			cardWidth: 340,
			cardEstimatedHeight: 600,
			viewportWidth: VW,
			viewportHeight: VH,
		});
		expect(result.placement).toBe("bottom");
		expect(result.top).toBe(screen.bottom + PREVIEW_GAP);
		expect(result.maxContentHeight).toBe(
			VH -
				screen.bottom -
				PREVIEW_VIEWPORT_PADDING -
				PREVIEW_GAP -
				PREVIEW_CHROME_HEIGHT,
		);
	});

	it("clamps the card when link is near the left edge and slides the arrow to track link center", () => {
		const screen = { x: 60, y: 300, top: 285, bottom: 300 };
		const cardWidth = 340;
		const cardEstimatedHeight = 200;

		const result = computePreviewPlacement({
			screen,
			cardWidth,
			cardEstimatedHeight,
			viewportWidth: VW,
			viewportHeight: VH,
		});

		expect(result.placement).toBe("bottom");
		// Card cannot go off the left screen edge
		expect(result.left).toBe(PREVIEW_VIEWPORT_PADDING);
		// Arrow slides to point right at the link center
		expect(result.arrowLeft).toBe(screen.x - PREVIEW_VIEWPORT_PADDING); // 60 - 12 = 48
		expect(result.arrowLeft).toBeGreaterThanOrEqual(PREVIEW_ARROW_MARGIN);
	});

	it("clamps the card when link is near the right edge and slides the arrow to track link center", () => {
		const screen = { x: VW - 50, y: 300, top: 285, bottom: 300 }; // 1150
		const cardWidth = 340;
		const cardEstimatedHeight = 200;

		const result = computePreviewPlacement({
			screen,
			cardWidth,
			cardEstimatedHeight,
			viewportWidth: VW,
			viewportHeight: VH,
		});

		expect(result.placement).toBe("bottom");
		// Card clamped to right edge with viewport padding
		expect(result.left).toBe(VW - cardWidth - PREVIEW_VIEWPORT_PADDING); // 1200 - 340 - 12 = 848
		// Arrow slides toward right side of card to point at link center
		expect(result.arrowLeft).toBe(screen.x - result.left); // 1150 - 848 = 302
		expect(result.arrowLeft).toBeLessThanOrEqual(
			cardWidth - PREVIEW_ARROW_MARGIN,
		);
	});
});

describe("rectBottomCenterScreen", () => {
	it("maps PDF rect to bottom center, top, and bottom in screen coordinates", () => {
		const mockPageEl = {
			getBoundingClientRect: () => ({
				left: 50,
				top: 100,
				width: 600,
				height: 800,
			}),
		} as unknown as HTMLElement;

		const rect = {
			origin: { x: 40, y: 80 },
			size: { width: 100, height: 20 },
		};
		const zoom = 1.5;

		const pt = rectBottomCenterScreen(mockPageEl, rect, zoom);
		// x = 50 + (40 + 50) * 1.5 = 50 + 135 = 185
		// bottom = 100 + (80 + 20) * 1.5 = 100 + 150 = 250
		// top = 100 + 80 * 1.5 = 100 + 120 = 220
		expect(pt).toEqual({
			x: 185,
			y: 250,
			top: 220,
			bottom: 250,
		});
	});
});
