// apps/web/src/lib/server/builder-profile/builder-share-card.ts
//
// The link preview image for a builder page (build-os.com/@handle): 1200×630 PNG with the
// person's photo, name, headline, what they're building and their last 6 months of active
// days. Drawn from code, never by an image model: satori lays the card out and turns all
// text into vector paths using the bundled Inter font (so the server needs no system
// fonts), then resvg (WebAssembly) rasterizes the SVG. Colors are Inkprint's light "paper" tokens.

import satori from 'satori';
import { initWasm, Resvg } from '@resvg/resvg-wasm';
import resvgWasm from '@resvg/resvg-wasm/index_bg.wasm?inline';
import decodeWebp, { init as initWebpDecoder } from '@jsquash/webp/decode.js';
import webpDecoderWasm from '@jsquash/webp/codec/dec/webp_dec.wasm?inline';
import { deflateSync } from 'node:zlib';
import { env as publicEnv } from '$env/dynamic/public';
import inter400 from './fonts/inter-latin-400-normal.woff?inline';
import inter700 from './fonts/inter-latin-700-normal.woff?inline';
import type { BuilderProfileView } from '$lib/builder-profile/types';
import { buildLogGrid, buildLogTotals, initialsOf } from '$lib/builder-profile/format';

export const SHARE_CARD_WIDTH = 1200;
export const SHARE_CARD_HEIGHT = 630;

// Inkprint light tokens (src/lib/styles/inkprint.css) as hex, for the image.
const INK = '#17171c';
const MUTED_INK = '#65656f';
const PAPER = '#fbfaf8';
const CARD = '#f2f0ec';
const MUTED = '#e8e5df';
const BORDER = '#d6d2cb';
const ACCENT = '#b85614';

/** Weeks of the build log on the card (about 6 months). */
const WEEKS = 26;

type Node = {
	type: string;
	props: Record<string, unknown> & { children?: Node | string | (Node | string | null)[] };
};

function h(
	type: string,
	style: Record<string, unknown>,
	children?: Node | string | (Node | string | null)[] | null,
	extra: Record<string, unknown> = {}
): Node {
	return { type, props: { style, ...extra, ...(children == null ? {} : { children }) } };
}

let fonts: { name: string; data: ArrayBuffer; weight: 400 | 700; style: 'normal' }[] | null = null;

function dataUriBytes(uri: string): ArrayBuffer {
	const base64 = uri.slice(uri.indexOf(',') + 1);
	const buffer = Buffer.from(base64, 'base64');
	return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

function loadFonts() {
	fonts ??= [
		{ name: 'Inter', data: dataUriBytes(inter400), weight: 400, style: 'normal' },
		{ name: 'Inter', data: dataUriBytes(inter700), weight: 700, style: 'normal' }
	];
	return fonts;
}

function clip(text: string | null | undefined, max: number): string {
	const clean = (text ?? '').replace(/\s+/g, ' ').trim();
	if (clean.length <= max) return clean;
	const cut = clean.slice(0, max - 1);
	const space = cut.lastIndexOf(' ');
	return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[,;:.\s]+$/, '')}…`;
}

/** Hosts a photo may be fetched from: our storage bucket and Google sign-in photos. */
export function avatarHostAllowed(url: string, supabaseUrl: string | undefined): boolean {
	try {
		const parsed = new URL(url);
		if (parsed.protocol !== 'https:') return false;
		const host = parsed.hostname.toLowerCase();
		const ours = supabaseUrl ? new URL(supabaseUrl).hostname.toLowerCase() : null;
		return host === ours || host.endsWith('.googleusercontent.com');
	} catch {
		return false;
	}
}

/** The photo's image type from its first bytes. */
export function avatarImageType(
	bytes: Uint8Array
): 'image/png' | 'image/jpeg' | 'image/webp' | null {
	if (
		bytes.length > 8 &&
		bytes[0] === 0x89 &&
		bytes[1] === 0x50 &&
		bytes[2] === 0x4e &&
		bytes[3] === 0x47
	)
		return 'image/png';
	if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
		return 'image/jpeg';
	if (
		bytes.length > 12 &&
		String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' &&
		String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP'
	)
		return 'image/webp';
	return null;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
	let c = n;
	for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
	return c >>> 0;
});

function pngChunk(type: string, data: Buffer): Buffer {
	const head = Buffer.alloc(8);
	head.writeUInt32BE(data.length, 0);
	head.write(type, 4, 'ascii');
	let crc = 0xffffffff;
	for (const byte of Buffer.concat([head.subarray(4), data]))
		crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
	const tail = Buffer.alloc(4);
	tail.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 0);
	return Buffer.concat([head, data, tail]);
}

/** RGBA pixels → PNG (8-bit RGBA, no filtering). The renderer can't draw WebP itself. */
export function encodeRgbaPng(
	rgba: Uint8Array | Uint8ClampedArray,
	width: number,
	height: number
): Buffer {
	const header = Buffer.alloc(13);
	header.writeUInt32BE(width, 0);
	header.writeUInt32BE(height, 4);
	header[8] = 8; // bit depth
	header[9] = 6; // RGBA
	const raw = Buffer.alloc((width * 4 + 1) * height);
	for (let y = 0; y < height; y++) {
		raw[y * (width * 4 + 1)] = 0; // filter: none
		Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(
			raw,
			y * (width * 4 + 1) + 1
		);
	}
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		pngChunk('IHDR', header),
		pngChunk('IDAT', deflateSync(raw)),
		pngChunk('IEND', Buffer.alloc(0))
	]);
}

let webpDecoder: Promise<void> | null = null;
async function webpToPng(bytes: Buffer): Promise<Buffer | null> {
	webpDecoder ??= initWebpDecoder(new WebAssembly.Module(dataUriBytes(webpDecoderWasm))).catch(
		(error) => {
			webpDecoder = null;
			throw error;
		}
	);
	await webpDecoder;
	const image = await decodeWebp(Uint8Array.from(bytes).buffer);
	if (!image?.width || !image.height || image.width * image.height > 2048 * 2048) return null;
	return encodeRgbaPng(image.data, image.width, image.height);
}

/** The photo as a PNG or JPEG data URI, or null (then the card shows initials). */
async function avatarDataUri(url: string | undefined): Promise<string | null> {
	if (!url || !avatarHostAllowed(url, publicEnv.PUBLIC_SUPABASE_URL)) return null;
	try {
		const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
		if (!res.ok) return null;
		const length = Number(res.headers.get('content-length') ?? 0);
		if (length > 2_000_000) return null;
		const bytes = Buffer.from(await res.arrayBuffer());
		if (bytes.byteLength > 2_000_000) return null;
		const type = avatarImageType(bytes);
		if (type === 'image/webp') {
			const png = await webpToPng(bytes);
			return png ? `data:image/png;base64,${png.toString('base64')}` : null;
		}
		return type ? `data:${type};base64,${bytes.toString('base64')}` : null;
	} catch {
		return null;
	}
}

/** What the card says, from the page as anyone sees it. Pure, for tests. */
export function shareCardContent(view: BuilderProfileView) {
	const name = view.profile.name || `@${view.profile.handle}`;
	const building = view.projects
		.filter((p) => p.audience === 'anyone')
		.slice(0, 3)
		.map((p) => clip(p.name, 28));
	let log: {
		weeks: { level: number; agentPercent: number }[][];
		activeDays: number;
		updates: number;
		agentPercent: number;
		split: boolean;
	} | null = null;
	if (view.activity) {
		const grid = buildLogGrid(view.activity);
		const weeks = grid.weeks.slice(-WEEKS);
		const totals = buildLogTotals(weeks);
		log = {
			weeks: weeks.map((week) =>
				week.map((cell) => ({
					level: cell.future ? -1 : cell.level,
					agentPercent: cell.agentPercent
				}))
			),
			activeDays: totals.activeDays,
			updates: totals.changes,
			agentPercent: totals.agentPercent,
			split: view.activity.show_agent_split
		};
	}
	return {
		name: clip(name, 40),
		handle: view.profile.handle,
		initials: initialsOf(view.profile.name, view.profile.handle),
		location: clip(view.profile.location, 40) || null,
		headline: clip(view.profile.headline, 70) || null,
		line: clip(view.profile.now_text || view.profile.bio, 110) || null,
		building,
		log
	};
}

const LEVEL_MIX = [0, 0.32, 0.52, 0.74, 0.96];

function mix(a: string, b: string, t: number): string {
	const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
	const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
	return `#${pa
		.map((v, i) => Math.round(v * t + (pb[i] ?? 0) * (1 - t)))
		.map((v) => v.toString(16).padStart(2, '0'))
		.join('')}`;
}

function cellColor(level: number, agentPercent: number): string {
	if (level < 0) return 'transparent';
	if (level === 0) return MUTED;
	const ink = mix(ACCENT, INK, agentPercent / 100);
	return mix(ink, MUTED, LEVEL_MIX[level] ?? 1);
}

export function shareCardTree(
	content: ReturnType<typeof shareCardContent>,
	avatar: string | null,
	host = 'build-os.com'
): Node {
	const photo = avatar
		? h(
				'img',
				{ width: 168, height: 168, borderRadius: 84, border: `6px solid ${PAPER}` },
				null,
				{
					src: avatar,
					width: 168,
					height: 168
				}
			)
		: h(
				'div',
				{
					display: 'flex',
					width: 168,
					height: 168,
					borderRadius: 84,
					background: INK,
					color: PAPER,
					fontSize: 64,
					fontWeight: 700,
					alignItems: 'center',
					justifyContent: 'center'
				},
				content.initials
			);

	const meta = [`@${content.handle}`, content.location].filter(Boolean).join('  ·  ');

	const log = content.log;
	const logBlock = log
		? h('div', { display: 'flex', flexDirection: 'column', gap: 12, flexShrink: 0 }, [
				h(
					'div',
					{ display: 'flex', gap: 3 },
					log.weeks.map((week) =>
						h(
							'div',
							{ display: 'flex', flexDirection: 'column', gap: 3 },
							week.map((cell) =>
								h('div', {
									width: 13,
									height: 13,
									borderRadius: 3,
									background: cellColor(
										cell.level,
										log.split ? cell.agentPercent : 0
									)
								})
							)
						)
					)
				),
				h(
					'div',
					{
						display: 'flex',
						gap: 22,
						fontSize: 22,
						color: MUTED_INK,
						whiteSpace: 'nowrap'
					},
					[
						h('div', { display: 'flex', gap: 7, flexShrink: 0 }, [
							h('span', { color: INK, fontWeight: 700 }, String(log.activeDays)),
							h('span', {}, 'active days')
						]),
						h('div', { display: 'flex', gap: 7, flexShrink: 0 }, [
							h(
								'span',
								{ color: INK, fontWeight: 700 },
								log.updates.toLocaleString('en-US')
							),
							h('span', {}, 'updates')
						]),
						log.split && log.updates > 0
							? h('div', { display: 'flex', gap: 7, flexShrink: 0 }, [
									h(
										'span',
										{ color: ACCENT, fontWeight: 700 },
										`${log.agentPercent}%`
									),
									h('span', {}, 'by AI agents')
								])
							: null
					].filter(Boolean) as Node[]
				),
				h('div', { display: 'flex', fontSize: 20, color: MUTED_INK }, 'Last 6 months')
			])
		: null;

	return h(
		'div',
		{
			display: 'flex',
			position: 'relative',
			width: SHARE_CARD_WIDTH,
			height: SHARE_CARD_HEIGHT,
			background: CARD,
			fontFamily: 'Inter'
		},
		h(
			'div',
			{
				display: 'flex',
				flexDirection: 'column',
				justifyContent: 'space-between',
				position: 'absolute',
				top: 40,
				left: 40,
				right: 40,
				bottom: 40,
				background: PAPER,
				borderRadius: 28,
				border: `2px solid ${BORDER}`,
				padding: '48px 56px'
			},
			[
				h('div', { display: 'flex', gap: 40, alignItems: 'center' }, [
					photo,
					h('div', { display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }, [
						h(
							'div',
							{
								display: 'flex',
								fontSize: 64,
								fontWeight: 700,
								color: INK,
								lineHeight: 1.05
							},
							content.name
						),
						h('div', { display: 'flex', fontSize: 28, color: MUTED_INK }, meta),
						content.headline
							? h(
									'div',
									{
										display: 'flex',
										fontSize: 34,
										fontWeight: 700,
										color: INK,
										marginTop: 6
									},
									content.headline
								)
							: null,
						content.line
							? h(
									'div',
									{
										display: 'flex',
										fontSize: 26,
										color: MUTED_INK,
										lineHeight: 1.35
									},
									content.line
								)
							: null
					])
				]),
				h(
					'div',
					{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' },
					[
						logBlock ?? h('div', { display: 'flex' }),
						h(
							'div',
							{
								display: 'flex',
								flexDirection: 'column',
								alignItems: 'flex-end',
								gap: 10
							},
							[
								content.building.length
									? h(
											'div',
											{
												display: 'flex',
												flexDirection: 'column',
												alignItems: 'flex-end',
												gap: 6,
												maxWidth: 360
											},
											[
												h(
													'div',
													{
														display: 'flex',
														fontSize: 18,
														letterSpacing: 2,
														color: MUTED_INK
													},
													'BUILDING'
												),
												h(
													'div',
													{
														display: 'flex',
														fontSize: 28,
														fontWeight: 700,
														color: INK,
														textAlign: 'right',
														justifyContent: 'flex-end'
													},
													content.building.join('  ·  ')
												)
											]
										)
									: null,
								h(
									'div',
									{
										display: 'flex',
										fontSize: 24,
										color: ACCENT,
										fontWeight: 700
									},
									[`${host}/@${content.handle}`]
								)
							].filter(Boolean) as Node[]
						)
					]
				)
			]
		)
	);
}

/** The PNG for a builder page as anyone sees it. */
export async function renderBuilderShareCard(
	view: BuilderProfileView,
	host = 'build-os.com'
): Promise<Buffer> {
	const content = shareCardContent(view);
	const avatar = await avatarDataUri(view.profile.avatar_url);
	const svg = await satori(shareCardTree(content, avatar, host) as never, {
		width: SHARE_CARD_WIDTH,
		height: SHARE_CARD_HEIGHT,
		fonts: loadFonts()
	});
	await loadRasterizer();
	const png = new Resvg(svg, { fitTo: { mode: 'width', value: SHARE_CARD_WIDTH } })
		.render()
		.asPng();
	return Buffer.from(png);
}

// SVG → PNG in WebAssembly. A native rasterizer (sharp) can't load on Vercel: its libvips
// shared library isn't bundled into the function. The wasm is inlined like the fonts.
let rasterizer: Promise<void> | null = null;
function loadRasterizer(): Promise<void> {
	rasterizer ??= initWasm(dataUriBytes(resvgWasm)).catch((error) => {
		rasterizer = null;
		throw error;
	});
	return rasterizer;
}
