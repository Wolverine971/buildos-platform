// Generate every deployed raster Brainbolt icon from the approved master.
// Run: pnpm --filter @buildos/web exec node scripts/generate-brand-icons.mjs
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

sharp.concurrency(1);
const web = fileURLToPath(new URL('..', import.meta.url));
const root = path.resolve(web, '../..');
const staticDir = path.join(web, 'static');
const master = await readFile(path.join(web, 'brand-source/brain-bolt-refined.png'));
const transparent = { r: 0, g: 0, b: 0, alpha: 0 };
let generated = 0;

async function icon(file, width, height = width) {
	const pipeline = sharp(master).resize(width, height, {
		fit: 'contain',
		background: transparent
	});
	const bytes = file.endsWith('.webp')
		? await pipeline.webp({ quality: 90, alphaQuality: 100 }).toBuffer()
		: await pipeline.png({ compressionLevel: 9 }).toBuffer();
	await writeFile(file, bytes);
	generated++;
}

// Keep the deployed URLs, so email templates, connector metadata, and old links
// receive the new mark without a separate path migration.
for (const [name, size] of [
	['brain-bolt.png', 256],
	['brain-bolt.webp', 256],
	['s-brain-bolt.png', 256],
	['s-brain-bolt.webp', 512],
	['brain-bolt-80.png', 80],
	['brain-bolt-electric-poster.webp', 160],
	['favicon-16x16.png', 16],
	['favicon-32x32.png', 32],
	['apple-touch-icon.png', 180],
	['apple-touch-icon-120x120.png', 120],
	['apple-touch-icon-120x120-precomposed.png', 120],
	['android-chrome-192x192.png', 192],
	['android-chrome-512x512.png', 512],
	['web-app-manifest-192x192.png', 192],
	['web-app-manifest-192x192.webp', 192],
	['web-app-manifest-512x512.png', 512],
	['web-app-manifest-512x512.webp', 512]
]) {
	await icon(path.join(staticDir, name), size);
}

// Retain the platform-specific dimensions, including rectangular Windows tiles.
for (const platform of ['android', 'ios', 'windows11']) {
	const dir = path.join(staticDir, 'AppImages', platform);
	for (const name of (await readdir(dir)).sort()) {
		if (!name.endsWith('.png')) continue;
		const file = path.join(dir, name);
		const { width, height } = await sharp(file).metadata();
		await icon(file, width, height);
	}
}
await icon(path.join(root, 'plugins/buildos/assets/buildos-logo.png'), 512);

// ICO supports PNG frames. Include small native sizes for browser tabs plus
// the large frame used by desktop shortcuts, preserving transparency.
const sizes = [16, 32, 48, 64, 128, 256];
const frames = [];
for (const size of sizes) {
	frames.push(await sharp(master).resize(size, size).png().toBuffer());
}
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
for (const [index, size] of sizes.entries()) {
	const entry = 6 + index * 16;
	header[entry] = header[entry + 1] = size === 256 ? 0 : size;
	header.writeUInt16LE(1, entry + 4);
	header.writeUInt16LE(32, entry + 6);
	header.writeUInt32LE(frames[index].length, entry + 8);
	header.writeUInt32LE(offset, entry + 12);
	offset += frames[index].length;
}
await writeFile(path.join(staticDir, 'favicon.ico'), Buffer.concat([header, ...frames]));

// Rebuild the social preview with the same copy and layout and the refined mark.
// Keep this composition editable rather than painting over the old raster logo.
const socialMark = await sharp(master).resize(400, 400).png().toBuffer();
const social =
	Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="628" viewBox="0 0 1200 628">
<defs><linearGradient id="paper"><stop stop-color="#fcf9f5"/><stop offset=".5" stop-color="#f8f5f1"/><stop offset="1" stop-color="#fcf9f5"/></linearGradient><linearGradient id="accent"><stop stop-color="#e07830" stop-opacity=".1"/><stop offset="1" stop-color="#e07830" stop-opacity="0"/></linearGradient></defs>
<rect width="1200" height="628" fill="url(#paper)"/>
<rect width="1200" height="3" fill="#e07830" opacity=".8"/>
<ellipse cx="100" cy="528" rx="300" ry="200" fill="url(#accent)"/>
<rect x="40" y="40" width="1120" height="548" rx="12" fill="none" stroke="#dbd8d2"/>
<image href="data:image/png;base64,${socialMark.toString('base64')}" x="422" y="-17" width="356" height="356"/>
<g text-anchor="middle" font-family="Georgia, serif" fill="#17171a">
<text x="600" y="376" font-size="76" font-weight="700">Turn chaos into clarity</text>
<text x="600" y="437" font-size="40">AI-powered productivity for the</text>
<text x="600" y="491" font-size="40">messy mind</text>
<text x="600" y="548" font-size="46" fill="#f07824">build-os.com</text>
</g></svg>`);
for (const name of [
	'twitter_card_light.png',
	'twitter_card_light.webp',
	'twitter-card-1200x628.png',
	'twitter-card-1200x628.webp',
	'twitter-card-1200x628.jpg'
]) {
	const pipeline = sharp(social);
	const bytes = name.endsWith('.webp')
		? await pipeline.webp({ quality: 90 }).toBuffer()
		: name.endsWith('.jpg')
			? await pipeline.jpeg({ quality: 92 }).toBuffer()
			: await pipeline.png().toBuffer();
	await writeFile(path.join(staticDir, name), bytes);
}
console.log(
	`Generated ${generated} raster icons, a ${sizes.length}-size favicon, and social previews from the approved refined master.`
);
