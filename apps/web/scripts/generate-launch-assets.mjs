// apps/web/scripts/generate-launch-assets.mjs
// Generate the installed app's launch artwork from the approved Brain Bolt master:
//   - static/launch/brain-bolt.webp: the Brain Bolt the service worker's launch screen shows
//   - static/splash/*.png: iOS splash images (light + dark) for every current iPhone/iPad
// The splash bolt is drawn at exactly the launch screen's size (120pt) and centered on
// the screen, so tap → splash → launch screen reads as one continuous image.
// After running, keep IOSSplashScreens.svelte in sync with the DEVICES list below.
// Run: pnpm --filter @buildos/web exec node scripts/generate-launch-assets.mjs
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

sharp.concurrency(1);
const web = fileURLToPath(new URL('..', import.meta.url));
const staticDir = path.join(web, 'static');
const master = await readFile(path.join(web, 'brand-source/brain-bolt-refined.png'));

// Must match the launch screen in static/sw.js (.bolt width) and the app background.
const BOLT_POINTS = 120;
const BACKGROUNDS = {
	light: { r: 0xfb, g: 0xfa, b: 0xf9, alpha: 1 }, // Inkprint --background, light
	dark: { r: 0x1d, g: 0x1c, b: 0x1b, alpha: 1 } // Inkprint --background, dark
};

/** Portrait CSS size + pixel ratio for each device class iOS matches exactly. */
export const DEVICES = [
	{ label: 'iPhone 16/17 Pro Max', width: 440, height: 956, ratio: 3 },
	{ label: 'iPhone Air', width: 420, height: 912, ratio: 3 },
	{ label: 'iPhone 16 Pro, 17, 17 Pro', width: 402, height: 874, ratio: 3 },
	{ label: 'iPhone 14 Pro Max, 15 Plus/Pro Max, 16 Plus', width: 430, height: 932, ratio: 3 },
	{ label: 'iPhone 14 Pro, 15, 15 Pro, 16', width: 393, height: 852, ratio: 3 },
	{ label: 'iPhone 12/13 Pro Max, 14 Plus', width: 428, height: 926, ratio: 3 },
	{ label: 'iPhone 12, 13, 14, 16e', width: 390, height: 844, ratio: 3 },
	{ label: 'iPhone X, XS, 11 Pro, 12/13 mini', width: 375, height: 812, ratio: 3 },
	{ label: 'iPhone XS Max, 11 Pro Max', width: 414, height: 896, ratio: 3 },
	{ label: 'iPhone XR, 11', width: 414, height: 896, ratio: 2 },
	{ label: 'iPhone 8 Plus', width: 414, height: 736, ratio: 3 },
	{ label: 'iPhone SE, 8', width: 375, height: 667, ratio: 2 },
	{ label: 'iPad Pro 13" (M4)', width: 1032, height: 1376, ratio: 2 },
	{ label: 'iPad Pro 12.9", iPad Air 13"', width: 1024, height: 1366, ratio: 2 },
	{ label: 'iPad Pro 11" (M4)', width: 834, height: 1210, ratio: 2 },
	{ label: 'iPad Pro 11"', width: 834, height: 1194, ratio: 2 },
	{ label: 'iPad Air 11", iPad 10th gen', width: 820, height: 1180, ratio: 2 },
	{ label: 'iPad 9th gen', width: 810, height: 1080, ratio: 2 },
	{ label: 'iPad mini', width: 744, height: 1133, ratio: 2 }
];

export function splashFileName(theme, device) {
	return `brain-bolt-${theme}-${device.width * device.ratio}x${device.height * device.ratio}.png`;
}

async function launchIcon() {
	const dir = path.join(staticDir, 'launch');
	await mkdir(dir, { recursive: true });
	const size = BOLT_POINTS * 3;
	const bytes = await sharp(master)
		.resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
		.webp({ quality: 90, alphaQuality: 100 })
		.toBuffer();
	await writeFile(path.join(dir, 'brain-bolt.webp'), bytes);
}

async function splash(theme, device) {
	const width = device.width * device.ratio;
	const height = device.height * device.ratio;
	const boltSize = BOLT_POINTS * device.ratio;
	const bolt = await sharp(master)
		.resize(boltSize, boltSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
		.png()
		.toBuffer();
	const bytes = await sharp({
		create: { width, height, channels: 4, background: BACKGROUNDS[theme] }
	})
		.composite([
			{
				input: bolt,
				left: Math.round((width - boltSize) / 2),
				top: Math.round((height - boltSize) / 2)
			}
		])
		.flatten({ background: BACKGROUNDS[theme] })
		.png({ compressionLevel: 9, palette: false })
		.toBuffer();
	await writeFile(path.join(staticDir, 'splash', splashFileName(theme, device)), bytes);
}

if (import.meta.url === `file://${process.argv[1]}`) {
	await launchIcon();
	const splashDir = path.join(staticDir, 'splash');
	await mkdir(splashDir, { recursive: true });
	// Replace the old images wholesale so no stale size lingers.
	for (const name of await readdir(splashDir)) {
		if (name.endsWith('.png')) await rm(path.join(splashDir, name));
	}
	for (const theme of ['light', 'dark']) {
		for (const device of DEVICES) await splash(theme, device);
	}
	console.log(`Generated launch icon + ${DEVICES.length * 2} splash images.`);
}
