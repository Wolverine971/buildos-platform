// apps/web/src/lib/components/layout/brain-bolt-hevc-alpha.test.ts
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const ANIMATIONS_DIR = new URL('../../../../static/onboarding-assets/animations/', import.meta.url);

// HEVC alpha_channel_info SEI: prefix SEI NAL header (type 39, layer 0) + payloadType 165.
const ALPHA_INFO_SEI = Buffer.from([0x4e, 0x01, 0xa5]);

describe('Brain Bolt HEVC-with-alpha videos', () => {
	const movFiles = readdirSync(ANIMATIONS_DIR).filter((name) => name.endsWith('.mov'));

	it('ships at least one Safari alpha video', () => {
		expect(movFiles.length).toBeGreaterThan(0);
	});

	// ffmpeg's hevc_videotoolbox tags straight-alpha pixels as premultiplied (use_idc = 1), and
	// iOS Safari then draws the soft glow as a solid disc. Encode with Apple's avconvert
	// (PresetHEVCHighestQualityWithAlpha), which tags straight alpha (use_idc = 0).
	it.each(movFiles)('%s declares straight alpha', (name) => {
		const bytes = readFileSync(new URL(name, ANIMATIONS_DIR));
		const seiStart = bytes.indexOf(ALPHA_INFO_SEI);
		expect(seiStart, 'alpha_channel_info SEI missing').toBeGreaterThanOrEqual(0);

		// Skip the SEI payloadSize byte; the next byte carries cancel_flag(1) + use_idc(3).
		const alphaChannelUseIdc = (bytes[seiStart + ALPHA_INFO_SEI.length + 1] >> 4) & 0b111;
		expect(alphaChannelUseIdc).toBe(0);
	});
});
