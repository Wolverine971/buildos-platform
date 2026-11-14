// docs/portfolio/wayne-strategies/validate.mjs
// Isolated, free validation and preview generation; never starts the application.
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const base = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(base, '../../..');
const handoff = path.join(base, 'handoff');
const localRequire = createRequire(path.join(repo, 'apps/web/package.json'));
const { compile } = localRequire('svelte/compiler');
const { render } = await import(pathToFileURL(localRequire.resolve('svelte/server')));
const layers = JSON.parse(await readFile(path.join(handoff, 'layers.json'), 'utf8'));
const source = await readFile(path.join(handoff, 'ProjectVisual.svelte'), 'utf8');
assert(layers.length >= 3 && layers.length <= 7);
assert.equal(layers[0].kind, 'site');
assert.equal(new Set(layers.map((layer) => layer.id)).size, layers.length);
const required = [
	'id',
	'title',
	'caption',
	'kind',
	'eyebrow',
	'headline',
	'insight',
	'steps',
	'branches',
	'evidence'
];
const assets = new Set();
for (const layer of layers) {
	for (const field of required) assert(layer[field]?.length, `${layer.id}: missing ${field}`);
	assert(layer.branches.length >= 2 && layer.branches.length <= 4);
	for (const evidence of layer.evidence) await stat(path.join(repo, evidence.split(': ')[0]));
	for (const asset of layer.gallery ?? []) {
		assert(asset.src.startsWith('/assets/work/projects/buildos/'));
		assets.add(asset.src.split('/').at(-1));
		assert(asset.alt && asset.caption);
	}
}
for (const name of [
	'project-demo.jpg',
	'chat-receipt-demo.jpg',
	'task-board-demo.jpg',
	'schedule-chat-demo.jpg',
	'calendar-demo.jpg',
	'wordmark-paper.webp',
	'wordmark-ink.webp'
])
	assets.add(name);
let assetBytes = 0;
for (const asset of assets) assetBytes += (await stat(path.join(handoff, 'assets', asset))).size;
assert(!source.includes('$lib'));
assert(!source.includes('fetch('));
const built = compile(source, {
	filename: 'ProjectVisual.svelte',
	generate: 'server',
	css: 'external'
});
assert.deepEqual(built.warnings, []);
const browserBuild = compile(source, {
	filename: 'ProjectVisual.svelte',
	generate: 'client',
	css: 'external'
});
assert.deepEqual(browserBuild.warnings, []);
const preview = path.join(base, 'preview');
await mkdir(preview, { recursive: true });
// Resolve the compiler's fixed runtime imports without adding package dependencies.
const moduleCode = built.js.code.replace(
	/from (['"])(svelte[^'"]*)\1/g,
	(_, quote, name) => `from '${pathToFileURL(localRequire.resolve(name)).href}'`
);
const modulePath = path.join(preview, 'compiled.mjs');
await writeFile(modulePath, moduleCode);
const Component = (await import(pathToFileURL(modulePath))).default;
const cards = [];
for (const layer of layers) {
	for (const [width, compact] of [
		[600, false],
		[300, true],
		[150, true]
	]) {
		const output = render(Component, {
			props: { layerId: layer.id, compact, animated: false }
		});
		assert(output.body.includes('role="img"'));
		cards.push(
			`<section><h2>${layer.title} · ${width}px${compact ? ' compact' : ''}</h2><div class="sample" data-layer="${layer.id}" data-width="${width}" style="width:${width}px;height:${width * 0.625}px">${output.body}</div></section>`
		);
	}
}
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>BuildOS portfolio — isolated visual proof</title><style>body{margin:0;padding:32px;background:#d8d5ce;color:#25231f;font-family:Arial,sans-serif}h1{font-size:24px}main{display:grid;grid-template-columns:600px 300px 150px;gap:28px;align-items:start}section>h2{font:12px Arial;margin:0 0 10px}.sample{overflow:hidden;border:1px solid #bbb4a7;box-shadow:0 5px 14px #0001}${built.css.code}</style></head><body><h1>BuildOS / six portfolio layers</h1><p>Actual public demo assets + labeled interface studies. Full and compact variants.</p><main>${cards.join('')}</main></body></html>`;
await writeFile(
	path.join(preview, 'index.html'),
	html.replaceAll('/assets/work/projects/buildos/', '../handoff/assets/')
);
const result = {
	svelte: localRequire('svelte/package.json').version,
	compilerWarnings: 0,
	layers: layers.length,
	renderVariants: cards.length,
	assets: assets.size,
	assetBytes,
	preview: path.join(preview, 'index.html')
};
await writeFile(path.join(preview, 'validation.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
