/**
 * Dark-mode page raster styling.
 *
 * EmbedPDF 2.x only themes viewer chrome (and we build chrome ourselves). Page
 * content has no color-scheme API yet — see embedpdf/embed-pdf-viewer#679.
 * Soft partial invert (not 100%) + slight brightness/contrast so pure white
 * paper does not become pure black and text is not pure white. Hue-rotate
 * keeps figure colors roughly correct.
 *
 * Tuned to keep the inverted paper a muted dark gray and text a soft light
 * gray, reducing the harsh contrast of the earlier values.
 *
 * Apply to raster layers and any overlay that should match inverted paper
 * (e.g. layout-translate cover blocks painted as light-mode paper colors).
 */
export const PDF_PAGE_RASTER_DARK_CLASS =
	"[filter:invert(0.84)_hue-rotate(180deg)_brightness(1.0)_contrast(0.9)]";

/**
 * Dark-mode annotation overlay styling.
 *
 * Highlight annotations keep their stored bright palette colors; in dark mode
 * they sit on top of inverted dark-gray paper and can look glaring. A gentle
 * brightness + saturation reduction keeps them readable without overwhelming
 * the page.
 *
 * Apply to the AnnotationLayer wrapper in PDF dark mode.
 */
export const PDF_ANNOTATION_DARK_CLASS =
	"[filter:brightness(0.88)_saturate(0.85)]";
