// scripts/marketing/atom/new-atom.mjs
//
// Scaffold a new weekly "atom" folder from the proof-content-harness templates.
//
// Same spirit as scripts/marketing/ops/status.mjs: zero dependencies, plain ESM,
// runs with bare `node` locally AND in a fresh clone (no tsx, no pnpm install).
// This is the "make the repeatable part cheap" half of the durability fix — one
// command stamps the week's folder so producing content never starts from a blank page.
//
// Usage:
//   node scripts/marketing/atom/new-atom.mjs <slug> ["Optional Title"]
//   node scripts/marketing/atom/new-atom.mjs eighteen-projects "18 projects, one shared context"
//
// After scaffolding: fill BRIEF.md from a REAL BuildOS project, draft the four
// surface files in DJ's voice, then register the atom in the ops queue via /marketing.

import fs from 'fs';
import path from 'path';

const HARNESS_DIR = path.join(process.cwd(), 'docs/marketing/proof-content-harness');
const TEMPLATES_DIR = path.join(HARNESS_DIR, 'TEMPLATES');
const ATOMS_DIR = path.join(HARNESS_DIR, 'atoms');

const SURFACES = ['BRIEF', 'linkedin-post', 'x-post', 'instagram-reel', 'brand-proof'];

function fail(msg) {
	process.stderr.write(`new-atom: ${msg}\n`);
	process.exit(1);
}

function todayStamp() {
	// Local date as YYYY-MM-DD. Bare `node` allows Date here (unlike workflow scripts).
	const d = new Date();
	const p = (n) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function slugify(s) {
	return String(s)
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

const rawSlug = process.argv[2];
if (!rawSlug)
	fail('missing <slug>. Usage: node scripts/marketing/atom/new-atom.mjs <slug> ["Title"]');
const slug = slugify(rawSlug);
const title = process.argv[3] || slug.replace(/-/g, ' ');
const date = todayStamp();

if (!fs.existsSync(TEMPLATES_DIR)) fail(`templates not found at ${TEMPLATES_DIR}`);

const atomDir = path.join(ATOMS_DIR, `${date}-${slug}`);
if (fs.existsSync(atomDir)) fail(`atom folder already exists: ${atomDir}`);

fs.mkdirSync(path.join(atomDir, 'assets'), { recursive: true });

for (const surface of SURFACES) {
	const tpl = path.join(TEMPLATES_DIR, `${surface}.template.md`);
	if (!fs.existsSync(tpl)) fail(`missing template: ${tpl}`);
	const filled = fs
		.readFileSync(tpl, 'utf-8')
		.replaceAll('{{DATE}}', date)
		.replaceAll('{{SLUG}}', slug)
		.replaceAll('{{TITLE}}', title);
	const out = surface === 'BRIEF' ? 'BRIEF.md' : `${surface}.md`;
	fs.writeFileSync(path.join(atomDir, out), filled);
}

const rel = path.relative(process.cwd(), atomDir);
process.stdout.write(
	[
		'',
		`  ✅ Scaffolded atom: ${rel}`,
		'',
		'  Next:',
		'    1. Fill BRIEF.md from a REAL BuildOS project (the demonstration).',
		'    2. Draft the four surface files in DJ voice (LinkedIn primary).',
		'    3. DJ records the 15s hook + screen capture → assets/.',
		'    4. Register in the ops queue via /marketing (do not hand-edit queue.json).',
		`    5. node scripts/marketing/ops/status.mjs   # see the new picture`,
		''
	].join('\n') + '\n'
);
