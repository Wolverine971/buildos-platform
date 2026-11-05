// apps/web/src/lib/utils/svg-icon-mask.ts
/**
 * Turn a stored project icon SVG (onto_projects.icon_svg) into a CSS mask-image value.
 *
 * The stored markup is user-writable, so it must never reach the DOM through {@html}.
 * An SVG used as a CSS mask is loaded as an image: it cannot run script or load other
 * resources. Painting the masked box with `background-color: currentColor` keeps the
 * old look of the stroke="currentColor" icons (they follow the surrounding text color).
 */

const MAX_ICON_SVG_LENGTH = 50_000;

export function svgIconMaskImage(raw: string | null | undefined): string | null {
	if (typeof raw !== 'string') return null;
	const svg = raw.trim();
	if (!svg || svg.length > MAX_ICON_SVG_LENGTH) return null;
	if (!svg.startsWith('<svg') || !svg.endsWith('</svg>')) return null;

	// encodeURIComponent leaves ' ( ) unescaped; escape them too so the value can't leave
	// the CSS url("...") token.
	const encoded = encodeURIComponent(svg).replace(
		/['()]/g,
		(c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
	);
	return `url("data:image/svg+xml,${encoded}")`;
}
