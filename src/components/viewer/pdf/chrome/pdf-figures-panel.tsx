import { FiguresPanel } from "@/components/viewer/panels/figures-panel";
import { PDF_SIDE_PANEL } from "@/components/viewer/pdf/chrome/pdf-chrome-surface";
import { cn } from "@/lib/core/utils";
import type { PdfLayoutRegion } from "@/lib/pdf/layout";

type PdfFiguresPanelProps = {
	documentId: string;
	showFigures: boolean;
	analyzing?: boolean;
	onAnalyze: () => void;
	onJump: (region: PdfLayoutRegion) => void;
	onRenderThumb: (region: PdfLayoutRegion) => Promise<{
		mimeType: string;
		data: string;
	} | null>;
};

/** Left-side layout analysis panel. The toggle button lives in PdfLeftToolbar. */
export function PdfFiguresPanel({
	documentId,
	showFigures,
	analyzing,
	onAnalyze,
	onJump,
	onRenderThumb,
}: PdfFiguresPanelProps) {
	if (!showFigures) return null;

	return (
		<aside data-pdf-chrome className={cn("overflow-hidden", PDF_SIDE_PANEL)}>
			<FiguresPanel
				documentId={documentId}
				viewerReady
				analyzing={analyzing}
				onAnalyze={onAnalyze}
				onJump={onJump}
				onRenderThumb={onRenderThumb}
				className="h-full"
				compact
			/>
		</aside>
	);
}
