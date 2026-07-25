// apps/web/scripts/sync-inkprint-design-library.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inkprintAnimation, inkprintKeyframes } from '../inkprint-motion.js';

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = join(webRoot, 'src/lib/styles/inkprint.css');
const outputRoot = join(webRoot, 'static/design-library/inkprint-textures');
const checkOnly = process.argv.includes('--check');
const source = (await readFile(sourcePath, 'utf8')).replaceAll('\r\n', '\n');

const banner = (name) =>
	`/* AUTO-GENERATED from src/lib/styles/inkprint.css — do not edit.\n   Module: ${name}\n*/\n\n`;

function section(title, nextTitle) {
	const titleIndex = source.indexOf(`   ${title}`);
	if (titleIndex === -1) throw new Error(`Missing Inkprint section: ${title}`);
	const start = source.lastIndexOf('/* ============================================', titleIndex);
	if (start === -1) throw new Error(`Missing section boundary before: ${title}`);

	if (!nextTitle) return source.slice(start).trim();
	const nextTitleIndex = source.indexOf(`   ${nextTitle}`, titleIndex + title.length);
	if (nextTitleIndex === -1) throw new Error(`Missing Inkprint section: ${nextTitle}`);
	const end = source.lastIndexOf(
		'/* ============================================',
		nextTitleIndex
	);
	return source.slice(start, end).trim();
}

const joinSections = (...parts) => parts.filter(Boolean).join('\n\n');
const cssProperty = (property) =>
	property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

function renderDeclarations(declarations, indent = '\t') {
	return Object.entries(declarations)
		.map(([property, value]) => `${indent}${cssProperty(property)}: ${value};`)
		.join('\n');
}

function renderMotion() {
	const animation = inkprintAnimation;
	const keyframes = inkprintKeyframes;
	const publicAnimations = ['ink-in', 'ink-out'];
	const publicKeyframes = ['inkIn', 'inkOut'];

	const frameCss = publicKeyframes
		.map((name) => {
			const steps = keyframes[name];
			if (!steps) throw new Error(`Missing Tailwind keyframes: ${name}`);
			const body = Object.entries(steps)
				.map(
					([step, declarations]) =>
						`\t${step} {\n${renderDeclarations(declarations, '\t\t')}\n\t}`
				)
				.join('\n');
			return `@keyframes ${name} {\n${body}\n}`;
		})
		.join('\n\n');

	const utilityCss = publicAnimations
		.map((name) => {
			if (!animation[name]) throw new Error(`Missing Tailwind animation: ${name}`);
			return `.animate-${name} {\n\tanimation: ${animation[name]};\n}`;
		})
		.join('\n\n');

	return `${frameCss}\n\n${utilityCss}\n\n@media (prefers-reduced-motion: reduce) {\n\t.animate-ink-in,\n\t.animate-ink-out {\n\t\tanimation: none;\n\t}\n}`;
}

const shadowUtilities = `.shadow-ink {
	box-shadow: var(--shadow-ink);
}

.shadow-ink-strong {
	box-shadow: var(--shadow-ink-strong);
}

.shadow-ink-inner {
	box-shadow: var(--shadow-ink-inner);
}`;

const modules = {
	'color-system.css': section(
		'CSS Variables - Inkprint Color System',
		'Texture System - Base Classes'
	),
	'textures-core.css': section('Texture System - Base Classes', 'Texture Intensities'),
	'textures-intensities.css': section('Texture Intensities', 'Ink Frame - Carved Inner Border'),
	'shadows.css': joinSections(
		section('Ink Frame - Carved Inner Border', 'Spatial Emphasis - Layout Permission Layer'),
		shadowUtilities
	),
	'atmosphere.css': section(
		'Atmosphere Layer - Depth / Context (Opt-in)',
		'Grid-Break Utilities (Opt-in, Mode B)'
	),
	'interactive.css': section(
		'Rim / Edge Accents (Semantic Presence, Minimal)',
		'Utility Classes'
	),
	'motion.css': renderMotion(),
	'utilities.css': joinSections(
		section(
			'Spatial Emphasis - Layout Permission Layer',
			'Atmosphere Layer - Depth / Context (Opt-in)'
		),
		section(
			'Grid-Break Utilities (Opt-in, Mode B)',
			'Rim / Edge Accents (Semantic Presence, Minimal)'
		),
		section('Utility Classes', 'Weight System - Semantic Mass')
	),
	'weight-system.css': section('Weight System - Semantic Mass')
};

const moduleOrder = [
	'color-system.css',
	'textures-core.css',
	'textures-intensities.css',
	'shadows.css',
	'atmosphere.css',
	'weight-system.css',
	'interactive.css',
	'motion.css',
	'utilities.css'
];

modules['all-textures.css'] = `/* Inkprint Texture Library v1.1.0
   Generated entry point — import individual modules when a smaller surface is preferable.
*/

${moduleOrder.map((name) => `@import './${name}';`).join('\n')}`;

const drifted = [];
for (const [name, body] of Object.entries(modules)) {
	const expected =
		name === 'all-textures.css' ? `${body.trim()}\n` : `${banner(name)}${body.trim()}\n`;
	const outputPath = join(outputRoot, name);
	if (checkOnly) {
		const current = await readFile(outputPath, 'utf8').catch(() => '');
		if (current.replaceAll('\r\n', '\n') !== expected) drifted.push(name);
	} else {
		await writeFile(outputPath, expected);
	}
}

if (drifted.length > 0) {
	console.error(`Inkprint public CSS is stale: ${drifted.join(', ')}`);
	console.error('Run: pnpm --filter @buildos/web styles:sync');
	process.exitCode = 1;
} else if (checkOnly) {
	console.log('Inkprint public CSS matches the canonical runtime source.');
} else {
	console.log(`Synced ${Object.keys(modules).length} Inkprint CSS files.`);
}
