import { cn } from "@/lib/core/utils";

/**
 * Pointer nub on a link preview card, aimed at the hovered link: on the top
 * edge when the card opens below the link, on the bottom edge when above.
 */
export function PreviewArrow({
	placement,
	left,
}: {
	placement: "bottom" | "top";
	left: number;
}) {
	return (
		<span
			aria-hidden
			className={cn(
				"absolute z-10 size-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 border-border/60 bg-background",
				placement === "bottom"
					? "top-0 rounded-tl-[1.5px] border-t border-l"
					: "top-full rounded-br-[1.5px] border-r border-b",
			)}
			style={{ left: `${left}px` }}
		/>
	);
}
