// apps/web/src/lib/components/people/qr-code.ts
//
// QR codes for invite links, drawn in the browser from the link itself (the `qrcode`
// library does the encoding; nothing is fetched or generated anywhere else).
//
// Colors are fixed ink-on-paper rather than theme tokens on purpose: scanners need
// dark modules on a light ground, so the code looks like a printed card in dark mode
// too. The values are Inkprint's ink and paper.

import QRCode from 'qrcode';

export const QR_INK = '#1A1A1D';
export const QR_PAPER = '#FFFFFF';
/** Quiet zone around the code, in modules (the spec asks for 4). */
export const QR_MARGIN = 4;

export type QrDrawing = {
	/** Modules per side, without the quiet zone. */
	size: number;
	/** SVG path of the dark modules, one unit per module, offset by the quiet zone. */
	path: string;
	/** viewBox side: size plus the quiet zone on both sides. */
	viewSize: number;
};

/** Encodes `text` (error correction M) as one SVG path, merging runs of dark modules. */
export function qrDrawing(text: string): QrDrawing {
	const { size, data } = QRCode.create(text, { errorCorrectionLevel: 'M' }).modules;
	let path = '';
	for (let y = 0; y < size; y += 1) {
		let x = 0;
		while (x < size) {
			if (!data[y * size + x]) {
				x += 1;
				continue;
			}
			let run = 1;
			while (x + run < size && data[y * size + x + run]) run += 1;
			path += `M${x + QR_MARGIN} ${y + QR_MARGIN}h${run}v1h-${run}z`;
			x += run;
		}
	}
	return { size, path, viewSize: size + QR_MARGIN * 2 };
}

/** A PNG of the code for saving or printing (browser only: it draws on a canvas). */
export function qrPngDataUrl(text: string, width = 1024): Promise<string> {
	return QRCode.toDataURL(text, {
		errorCorrectionLevel: 'M',
		margin: QR_MARGIN,
		width,
		color: { dark: QR_INK, light: QR_PAPER }
	});
}

/** "buildos-invite-9takes.png" */
export function qrFileName(projectName: string | null | undefined): string {
	const slug = (projectName ?? '')
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 40);
	return `buildos-invite${slug ? `-${slug}` : ''}.png`;
}
