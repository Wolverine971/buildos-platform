// apps/web/scripts/generate-marketing-assets.mjs
// Rebuild the downloadable brand package from existing BuildOS artwork.
// Run: pnpm --filter @buildos/web exec node scripts/generate-marketing-assets.mjs
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';
import { zipSync } from 'fflate';

const web = fileURLToPath(new URL('..', import.meta.url));
const root = path.resolve(web, '../..');
const out = path.join(web, 'static/marketing-assets');
await mkdir(out, { recursive: true });
const ink = '#18181b';
const paper = '#faf9f6';
const orange = '#f97316';
const archive = {};
const assets = [];
const embedded = async (file) =>
	`data:image/png;base64,${(await readFile(file)).toString('base64')}`;
const electricSource = path.join(web, 'brand-source/brain-bolt-big.png');
const electricOriginal = await embedded(electricSource);
// 800px exceeds the largest placed mark (588px); retain the full standalone source.
const electric = `data:image/png;base64,${(await sharp(electricSource).resize({ width: 800 }).png().toBuffer()).toString('base64')}`;
const outline = await embedded(path.join(web, 'brand-source/brain-bolt-icon.png'));
const xml = (value) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;');
const text = (value, x, y, size, fill = ink, weight = 700, extra = '') =>
	`<text x="${x}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}" ${extra}>${xml(value)}</text>`;
const mark = (x, y, size, src = electric) =>
	`<image href="${src}" x="${x}" y="${y}" width="${size}" height="${size}"/>`;
const word = (x, y, size, color = ink, accent = orange) =>
	text('Build', x, y, size, color, 900, 'letter-spacing="-2"') +
	text('OS', x + size * 2.3, y, size, accent, 900, 'letter-spacing="-2"');
const lockup = (x, y, scale = 1, color = ink, src = electric) =>
	`<g transform="translate(${x} ${y}) scale(${scale})">${mark(0, 0, 180, src)}${word(214, 128, 106, color)}</g>`;
const grid = (width, height, dark = false) =>
	`<defs><pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="${dark ? '#ffffff' : ink}" stroke-opacity=".065" stroke-width="1"/></pattern></defs><rect width="${width}" height="${height}" fill="url(#grid)"/>`;
const cross = (x, y, color = '#a8a29e') =>
	`<path d="M${x - 8} ${y}h16M${x} ${y - 8}v16" stroke="${color}" stroke-width="1"/>`;
const svg = (width, height, body, background) =>
	`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${background ? `<rect width="${width}" height="${height}" fill="${background}"/>` : ''}${body}</svg>`;

async function save({
	id,
	name,
	category,
	width,
	height,
	body,
	background,
	description,
	theme = 'paper'
}) {
	const source = svg(width, height, body, background);
	const svgBytes = Buffer.from(source);
	const png = await sharp(svgBytes).png().toBuffer();
	const preview = await sharp(png)
		.resize({ width: Math.min(width, 1200), withoutEnlargement: true })
		.webp({ quality: 88 })
		.toBuffer();
	for (const [extension, bytes] of [
		['svg', svgBytes],
		['png', png],
		['webp', preview]
	]) {
		await writeFile(path.join(out, `${id}.${extension}`), bytes);
		if (extension !== 'webp') archive[`${category}/${id}.${extension}`] = bytes;
	}
	assets.push({
		id,
		name,
		category,
		width,
		height,
		description,
		theme,
		transparent: !background,
		preview: `/marketing-assets/${id}.webp`,
		files: [
			{ label: 'PNG', url: `/marketing-assets/${id}.png`, bytes: png.length },
			{ label: 'SVG', url: `/marketing-assets/${id}.svg`, bytes: svgBytes.length }
		]
	});
}

for (const dark of [false, true]) {
	const theme = dark ? 'ink' : 'paper';
	const foreground = dark ? paper : ink;
	await save({
		id: `lockup-horizontal-${theme}`,
		name: `Horizontal · ${dark ? 'light ink' : 'dark ink'}`,
		category: 'logos',
		width: 1600,
		height: 480,
		body: lockup(110, 55, 2, foreground),
		theme,
		description: 'Primary lockup for websites, slides, and email signatures.'
	});
	await save({
		id: `lockup-stacked-${theme}`,
		name: `Stacked · ${dark ? 'light ink' : 'dark ink'}`,
		category: 'logos',
		width: 1080,
		height: 1080,
		body: mark(330, 140, 420) + word(230, 765, 180, foreground),
		theme,
		description: 'Centered composition for covers and square placements.'
	});
	await save({
		id: `wordmark-${theme}`,
		name: `Wordmark · ${dark ? 'light ink' : 'dark ink'}`,
		category: 'logos',
		width: 1200,
		height: 360,
		body: word(85, 258, 280, foreground),
		theme,
		description: 'BuildOS lettering, separate from the Brainbolt.'
	});
	await save({
		id: `build-${theme}`,
		name: `Build · ${dark ? 'light ink' : 'dark ink'}`,
		category: 'elements',
		width: 760,
		height: 360,
		body: text('Build', 45, 258, 280, foreground, 900, 'letter-spacing="-2"'),
		theme,
		description: 'Independent Build lettering for the disrupted composition.'
	});
}
await save({
	id: 'os-orange',
	name: 'OS · signal orange',
	category: 'elements',
	width: 560,
	height: 360,
	body: text('OS', 42, 258, 280, orange, 900, 'letter-spacing="-2"'),
	description: 'Independent OS lettering, ready to position.'
});
await save({
	id: 'brainbolt-electric',
	name: 'Brainbolt · electric',
	category: 'elements',
	width: 1582,
	height: 1380,
	body: `<image href="${electricOriginal}" width="1582" height="1380"/>`,
	theme: 'ink',
	description: 'The original electric Brainbolt on a transparent canvas.'
});
await save({
	id: 'brainbolt-outline',
	name: 'Brainbolt · outline',
	category: 'elements',
	width: 512,
	height: 512,
	body: mark(16, 16, 480, outline),
	description: 'Original single-color artwork for quieter applications.'
});
await save({
	id: 'lockup-outline',
	name: 'Horizontal · outline',
	category: 'logos',
	width: 1600,
	height: 480,
	body: lockup(110, 55, 2, ink, outline),
	description: 'A restrained lockup using the original outline Brainbolt.'
});

for (const dark of [false, true]) {
	const theme = dark ? 'ink' : 'paper';
	const fg = dark ? paper : ink;
	const muted = dark ? '#aaa6a0' : '#66625d';
	const bg = dark ? ink : paper;
	const explode = `${grid(1920, 1080, dark)}${cross(80, 80)}${cross(1840, 1000)}${text('THE BUILDBLOCKS / 01', 100, 118, 22, muted, 500, 'letter-spacing="4"')}${text('Build', 120, 595, 260, fg, 900, 'letter-spacing="-8"')}${mark(835, 280, 455)}${text('OS', 1430, 650, 290, orange, 900, 'letter-spacing="-8"')}<g stroke="${muted}" stroke-dasharray="5 8" fill="none"><path d="M385 675V790H1720M1060 745v45M1630 705v85"/></g>${text('01 / THE WORK', 205, 845, 22, muted, 500, 'letter-spacing="3"')}${text('02 / THE THINKING', 916, 845, 22, muted, 500, 'letter-spacing="3"')}${text('03 / THE SYSTEM', 1470, 845, 22, muted, 500, 'letter-spacing="3"')}${text('Separate pieces. Connected thinking.', 100, 995, 30, fg, 500)}${text('build-os.com', 1580, 995, 26, muted, 500)}`;
	await save({
		id: `disrupted-${theme}`,
		name: `Disrupted · ${theme}`,
		category: 'compositions',
		width: 1920,
		height: 1080,
		body: explode,
		background: bg,
		theme,
		description: 'Build, Brainbolt, and OS pulled apart into independent layers.'
	});
	const banner = `${grid(1584, 396, dark)}${cross(34, 34)}${cross(1550, 362)}${mark(84, 12, 265)}${word(465, 123, 90, fg)}${text('Turn messy thinking', 465, 215, 52, fg, 700, 'letter-spacing="-1"')}${text('into structured work.', 465, 279, 52, fg, 700, 'letter-spacing="-1"')}<rect x="1360" y="92" width="5" height="185" fill="${orange}"/>${text('build-os.com', 1190, 347, 24, muted, 500)}`;
	await save({
		id: `linkedin-profile-${theme}`,
		name: `LinkedIn profile · ${theme}`,
		category: 'social',
		width: 1584,
		height: 396,
		body: banner,
		background: bg,
		theme,
		description: 'Profile cover with the message clear of the lower-left avatar.'
	});
	const company = `<g transform="scale(2.1)">${grid(2000, 334, dark)}${mark(185, 16, 280)}${word(570, 115, 90, fg)}${text('Turn messy thinking into structured work.', 570, 209, 49, fg, 700, 'letter-spacing="-1"')}${text('build-os.com', 1580, 291, 22, muted, 500)}<rect x="1900" y="65" width="5" height="180" fill="${orange}"/></g>`;
	await save({
		id: `linkedin-company-${theme}`,
		name: `LinkedIn company · ${theme}`,
		category: 'social',
		width: 4200,
		height: 700,
		body: company,
		background: bg,
		theme,
		description: 'Wide company-page cover with a clear center message.'
	});
}

for (const [id, name, width, height, theme] of [
	['social-square', 'Square post', 1080, 1080, 'paper'],
	['social-portrait', 'Portrait post', 1080, 1350, 'paper'],
	['social-story', 'Story / vertical cover', 1080, 1920, 'ink'],
	['presentation-cover', 'Presentation cover', 1920, 1080, 'ink']
]) {
	const dark = theme === 'ink';
	const fg = dark ? paper : ink;
	const wide = width > 1080;
	const top = height > 1500 ? 260 : 100;
	const headline = top + (wide ? 315 : 255);
	const body = `${grid(width, height, dark)}${word(90, top + 30, 67, fg)}${text('Turn messy', 90, headline, wide ? 120 : 92, fg, 700, 'letter-spacing="-4"')}${text('thinking into', 90, headline + 112, wide ? 120 : 92, fg, 700, 'letter-spacing="-4"')}${text('structured work.', 90, headline + 224, wide ? 120 : 92, orange, 700, 'letter-spacing="-4"')}${mark(wide ? 1230 : 580, wide ? 245 : height - (height > 1500 ? 745 : 465), wide ? 560 : 410)}${text('The project remembers what matters.', 90, height - (height > 1500 ? 310 : 105), 30, fg, 500)}${text('build-os.com', 90, height - (height > 1500 ? 250 : 55), 23, fg, 500)}${cross(width - 60, height - 60)}`;
	await save({
		id,
		name,
		category: 'social',
		width,
		height,
		body,
		background: dark ? ink : paper,
		theme,
		description: wide
			? 'A 16:9 opening slide for talks, demos, and decks.'
			: 'Ready-to-use brand card with the core BuildOS promise.'
	});
}
await save({
	id: 'profile-avatar',
	name: 'Profile avatar',
	category: 'social',
	width: 800,
	height: 800,
	body: mark(150, 150, 500),
	background: ink,
	theme: 'ink',
	description: 'Generous clear space for square and circular profile crops.'
});

// Source artwork stays intact. The blueprint images include their original paper treatment.
for (const [id, name, file] of [
	['brain-blueprint', 'Brain · blueprint', 'brain-blueprint-transparent.png'],
	['bolt-blueprint', 'Bolt · blueprint', 'bolt-blueprint-transparent.png']
]) {
	const bytes = await readFile(path.join(root, 'videos/brain-bolt-reel/assets', file));
	const { width, height } = await sharp(bytes).metadata();
	await writeFile(path.join(out, `${id}.png`), bytes);
	archive[`elements/${id}.png`] = bytes;
	assets.push({
		id,
		name,
		category: 'elements',
		width,
		height,
		description: 'Original blueprint artwork with its paper background.',
		theme: 'paper',
		transparent: false,
		preview: `/marketing-assets/${id}.png`,
		files: [{ label: 'PNG', url: `/marketing-assets/${id}.png`, bytes: bytes.length }]
	});
}

for (const [key, name, description] of [
	['electric', 'Electric', 'A quick spark for product reveals and energetic transitions.'],
	['consistent-pulse', 'Steady pulse', 'An even rhythm for ambient brand moments.'],
	['pulse', 'Pulse', 'A pronounced pulse for intros and emphasis.']
]) {
	const files = [];
	for (const [label, suffix] of [
		['WebM · alpha', '-transparent.webm'],
		['MP4', '.mp4']
	]) {
		const filename = `brain-bolt-${key}${suffix}`;
		const bytes = await readFile(
			path.join(web, 'static/onboarding-assets/animations', filename)
		);
		archive[`motion/${filename}`] = [bytes, { level: 0 }];
		files.push({
			label,
			url: `/onboarding-assets/animations/${filename}`,
			bytes: bytes.length
		});
	}
	assets.push({
		id: `motion-${key}`,
		name,
		category: 'motion',
		description,
		preview: '/brain-bolt-electric-poster.webp',
		theme: 'ink',
		files
	});
}

const guide = `# BuildOS marketing package\n\nThe original Brainbolt artwork, reusable logo compositions, social graphics, and existing motion loops.\n\n## Start here\n- Use logos/lockup-horizontal-paper.png on light backgrounds; the ink version uses light lettering for dark backgrounds.\n- Transparent PNGs drop into slides, documents, websites, and email signatures.\n- SVG compositions contain editable Arial text and embedded raster Brainbolt artwork. They are NOT fully vector masters. Use PNG for consistent typography across devices.\n- The standalone electric mark retains the existing 1582 × 1380 pixel source. Compositions embed an 800-pixel version, above their largest placed mark size, to keep files lighter. For oversized print, commission a fully vector master.\n- Elements contains the Brainbolt, Build, and OS separately. Blueprint brain and bolt include the original paper treatment.\n- Disrupted compositions intentionally pull the identity apart; use the intact horizontal lockup for routine identification.\n\n## Formats\n- LinkedIn profile: 1584 × 396 PNG, under 8 MB. Main copy avoids the lower-left profile photo. Preview the crop on LinkedIn before applying.\n- LinkedIn company: 4200 × 700 PNG. Preview the company cover crop before applying.\n- Square: 1080 × 1080; portrait: 1080 × 1350; story: 1080 × 1920; presentation: 1920 × 1080.\n- Story copy stays away from the top and bottom interface areas.\n- Motion: transparent WebM for compatible browsers/editors, original MP4 for broad support. MP4 includes the original background; it is not transparent.\n\n## Brand\nSignal orange #F97316. Ink #18181B. Paper #FAF9F6. Use deep orange #B85214 for small orange text on paper.\nKeep at least one quarter of the Brainbolt width clear around an intact logo. Do not stretch or crop the Brainbolt.\nUse a dark background behind light lettering. Keep the electric artwork in its original colors.\n\n## Messaging\nCategory: Thinking environment for people making complex things.\nPromise: Turn messy thinking into structured work.\nDifferentiator: The project remembers what matters.\n\n## Sources\nExisting repository assets; no new generated imagery or footage.\nBrand guide: docs/marketing/brand/brand-guide-1-pager.md.\nLinkedIn profile specifications: https://www.linkedin.com/help/linkedin/answer/a568217/add-or-change-the-background-photo-on-your-profile\n\nRebuild: pnpm --filter @buildos/web exec node scripts/generate-marketing-assets.mjs\n`;
await writeFile(path.join(out, 'README.md'), guide);
archive['README.md'] = Buffer.from(guide);
const manifest = {
	assets,
	archive: {
		url: '/marketing-assets/buildos-marketing-kit.zip',
		fileCount: Object.keys(archive).length
	}
};
const zip = zipSync(archive, { level: 6 });
manifest.archive.bytes = zip.length;
await writeFile(path.join(out, 'buildos-marketing-kit.zip'), zip);
await writeFile(
	path.join(web, 'src/lib/marketing/assets.json'),
	JSON.stringify(manifest, null, '\t') + '\n'
);
console.log(
	`Created ${assets.length} assets, ${manifest.archive.fileCount} packaged files, ${(zip.length / 1048576).toFixed(1)} MB ZIP.`
);
