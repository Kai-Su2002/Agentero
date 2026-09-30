export type { TranslateHighlight } from "@/lib/pdf/translate/highlights";
export {
	translateHighlightsByPage,
	translateHighlightsFingerprint,
} from "@/lib/pdf/translate/highlights";
export {
	createTranslateRecord,
	deletePdfTranslate,
	listPdfTranslates,
	writePdfTranslate,
} from "@/lib/pdf/translate/io";
export type { RunSelectionTranslateOptions } from "@/lib/pdf/translate/run-selection";
export { runSelectionTranslate } from "@/lib/pdf/translate/run-selection";
