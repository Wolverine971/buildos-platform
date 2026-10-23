// apps/web/src/lib/components/people/qr-code.test.ts
import { describe, expect, it } from 'vitest';
import QRCode from 'qrcode';
import { QR_MARGIN, qrDrawing, qrFileName } from './qr-code';

describe('qrDrawing', () => {
	it('draws exactly the dark modules of the code, inside a quiet zone', () => {
		const url = 'https://build-os.com/join/AbCdEfGhIjKlMnOpQrStUvWxYz012345';
		const drawing = qrDrawing(url);
		const { size, data } = QRCode.create(url, { errorCorrectionLevel: 'M' }).modules;

		expect(drawing.size).toBe(size);
		expect(drawing.viewSize).toBe(size + QR_MARGIN * 2);

		// Re-paint the path onto a grid and compare it with the encoder's modules.
		const painted = new Uint8Array(size * size);
		for (const match of drawing.path.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
			const x = Number(match[1]) - QR_MARGIN;
			const y = Number(match[2]) - QR_MARGIN;
			for (let i = 0; i < Number(match[3]); i += 1) painted[y * size + x + i] = 1;
		}
		expect(Array.from(painted)).toEqual(Array.from(data, (bit) => (bit ? 1 : 0)));
	});
});

describe('qrFileName', () => {
	it('names the PNG after the project', () => {
		expect(qrFileName('9takes')).toBe('buildos-invite-9takes.png');
		expect(qrFileName('Plan & Ship!')).toBe('buildos-invite-plan-ship.png');
		expect(qrFileName('')).toBe('buildos-invite.png');
	});
});
