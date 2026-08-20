#!/usr/bin/env node
// scripts/docs/check-doc-health.mjs
// Detect documentation that will actively mislead an agent that greps it.
//
// Three checks:
//   1. dead-paths  — doc cites repo file paths that no longer exist
//   2. dead-schema — doc names a database table/function that no longer exists,
//                    asserted positively (negations like "was dropped" are fine)
//   3. unstamped   — point-in-time doc (audit/plan/phase/handoff) with no status
//                    header, so grep cannot tell it from current reference docs
//
// Usage:
//   node scripts/docs/check-doc-health.mjs            # report
//   node scripts/docs/check-doc-health.mjs --strict   # exit 1 on any finding
//   node scripts/docs/check-doc-health.mjs --stamp    # write status banners
//   node scripts/docs/check-doc-health.mjs --json

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, basename } from 'node:path';

const ROOT = process.cwd();
const args = process.argv.slice(2);
const STRICT = args.includes('--strict');
const STAMP = args.includes('--stamp');
const JSON_OUT = args.includes('--json');

// Docs excluded from health checks. Archive and marketing are deliberate
// write-only lanes; generated files are owned by their generators.
const EXCLUDE = [
	/^docs\/archive\//,
	/^docs\/marketing\//,
	/^docs\/research-library\//,
	/^apps\/web\/src\/content\//, // published blog/doc content, renders to users
	/^\.vercel\//,
	/\.svelte-kit\//,
	/^packages\/shared-types\/src\/functions\//, // hand-maintained SQL snapshots; see function-defs.md header
	/node_modules/
];

// Only real documentation trees may receive a status banner. Everything else —
// agent config, shipped skill definitions, published content, task files — is
// either instruction surface or user-facing, where a banner does harm.
const STAMPABLE = /^(docs\/|apps\/(web|worker)\/docs\/|packages\/[^/]+\/docs\/)/;

// Filenames that mark a doc as a point-in-time artifact rather than reference.
const POINT_IN_TIME =
	/(AUDIT|PLAN|PHASE|HANDOFF|PROGRESS|ASSESSMENT|PROPOSAL|REVIEW|FINDINGS|RETEST|EVIDENCE|SESSION|KICKOFF|_20\d\d-\d\d-\d\d)/i;

// A doc counts as stamped if it declares currency near the top.
const STAMP_RE = /^\s*(>?\s*)?(\*\*)?(status|last updated|as of|superseded|state)(\*\*)?\s*[:：]/im;
const STAMP_BANNER = /<!-- doc-status:/;

function tracked() {
	return execSync('git ls-files "*.md"', { maxBuffer: 1 << 28 })
		.toString()
		.trim()
		.split('\n')
		.filter((f) => f && !EXCLUDE.some((re) => re.test(f)));
}

// ---- schema truth -----------------------------------------------------------
const TYPES = 'packages/shared-types/src/database.types.ts';
let schemaText = '';
try {
	schemaText = readFileSync(join(ROOT, TYPES), 'utf8');
} catch {
	console.error(`error: cannot read ${TYPES}; run pnpm gen:types first`);
	process.exit(2);
}
// Tables, views, functions, enums and composite types. Every schema identifier
// sits at exactly six spaces of indentation; what follows the colon varies
// (`{` on the same line, on the next line, or a whole one-line function
// signature), so match the key alone.
const liveIdentifiers = new Set(
	[...schemaText.matchAll(/^ {6}([a-z][a-z0-9_]*):/gm)].map((m) => m[1])
);
// Every column / enum value the schema knows about. A snake_case word that is a
// real column is almost always a CTE or alias when it appears in table position,
// not a dropped table — so it is not worth flagging.
const schemaWords = new Set(
	[...schemaText.matchAll(/^\s{8,}"?([a-z][a-z0-9_]*)"?\??:/gm)].map((m) => m[1])
);

// Only flag identifiers used in TABLE POSITION inside real code — a doc saying
// `FROM foo` inside a ```sql fence, or `.from('foo')` anywhere, is instructing an
// agent to query foo. Prose ("insights from earlier") and bare backticked words
// (usually columns, enum values, job types) are ignored.
// Bare INTO is excluded: plpgsql `SELECT ... INTO v_thing` is a variable, not a table.
const SQL_TABLE_POSITION =
	/\b(?:FROM|JOIN|INSERT\s+INTO|UPDATE|ALTER\s+TABLE|CREATE\s+TABLE|TRUNCATE|ANALYZE|VACUUM)\s+(?:IF\s+(?:NOT\s+)?EXISTS\s+)?(?:public\.)?([a-z][a-z0-9_]{3,})\b/gi;
// `CREATE INDEX ... ON tbl` — matched separately so bare `ON` (JOIN clauses) is not caught.
const INDEX_TABLE_POSITION =
	/CREATE\s+(?:UNIQUE\s+)?INDEX(?:\s+CONCURRENTLY)?(?:\s+IF\s+NOT\s+EXISTS)?\s+[a-z0-9_]+\s+ON\s+(?:public\.)?([a-z][a-z0-9_]{3,})/gis;
const CLIENT_TABLE_POSITION = /(?:\.from|\.rpc|supabase\.from)\(\s*['"`]([a-z][a-z0-9_]{3,})['"`]/g;

// Phrases that make a mention a negation rather than an instruction.
const NEGATED =
	/(dropped|removed|deleted|retired|no longer|does not exist|never existed|deprecated|legacy|formerly|renamed|was replaced|superseded|historical|do not query)/i;

const SQL_NOISE = new Set([
	'select',
	'where',
	'order',
	'group',
	'having',
	'limit',
	'offset',
	'union',
	'lateral',
	'unnest',
	'only',
	'values',
	'exists',
	'dual',
	'temp',
	'temporary',
	'generate_series',
	'jsonb_array_elements',
	'json_array_elements',
	'information_schema',
	'pg_catalog'
]);

// Split a markdown doc into fenced code blocks. Returns [{lang, startLine, text}].
function codeBlocks(lines) {
	const blocks = [];
	let open = null;
	lines.forEach((line, i) => {
		const fence = line.match(/^\s*```+\s*([A-Za-z0-9_+-]*)/);
		if (!fence) {
			if (open) open.body.push([i + 1, line]);
			return;
		}
		if (open) {
			blocks.push(open);
			open = null;
		} else open = { lang: (fence[1] || '').toLowerCase(), body: [] };
	});
	if (open) blocks.push(open);
	return blocks;
}
const SQL_LANGS = new Set(['sql', 'postgres', 'postgresql', 'psql', 'plpgsql']);
function looksLikeSql(body) {
	const t = body.map(([, l]) => l).join('\n');
	return /\b(SELECT|INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|CREATE\s+(TABLE|INDEX|POLICY)|ALTER\s+TABLE)\b/i.test(
		t
	);
}

// ---- path truth -------------------------------------------------------------
const PATH_RE =
	/(?:^|[\s`"'(\[])((?:apps|packages|supabase|scripts|docs|src|static|\.claude|\.github)\/[A-Za-z0-9._\-\/]+\.[A-Za-z0-9]{1,6})/g;
const BASES = ['', 'apps/web/', 'apps/worker/', 'packages/'];
const pathCache = new Map();
function pathResolves(p, docDir) {
	const key = `${p}|${docDir}`;
	if (pathCache.has(key)) return pathCache.get(key);
	const ok = BASES.map((b) => b + p)
		.concat([join(docDir, p)])
		.some((c) => existsSync(join(ROOT, c)));
	pathCache.set(key, ok);
	return ok;
}

// ---- run --------------------------------------------------------------------
const findings = [];
const files = tracked();

for (const file of files) {
	let text;
	try {
		text = readFileSync(join(ROOT, file), 'utf8');
	} catch {
		continue;
	}
	const lines = text.split('\n');
	const docDir = dirname(file);

	// A doc that already declares itself point-in-time has made the stale-path
	// risk explicit to its reader, so dead paths there are not a finding.
	const declaredHistorical =
		/<!--\s*doc-status:\s*(point-in-time|archived|stale-runbook)/.test(text) ||
		/<!--\s*doc-health:\s*ignore-paths/.test(text);

	// 1. dead paths
	const refs = new Set();
	let m;
	PATH_RE.lastIndex = 0;
	while ((m = PATH_RE.exec(text))) refs.add(m[1].replace(/[.,;:)\]]+$/, ''));
	const dead = [...refs].filter((r) => !pathResolves(r, docDir));
	if (refs.size >= 4 && dead.length / refs.size >= 0.6 && !declaredHistorical) {
		findings.push({
			check: 'dead-paths',
			file,
			detail: `${dead.length}/${refs.size} cited paths no longer exist`,
			sample: dead.slice(0, 3)
		});
	}

	// 2. dead schema identifiers in table position, positive assertions only.
	// A doc may opt out with `<!-- doc-health: ignore-schema — why -->` when it
	// deliberately describes a proposed or removed system. The marker is visible
	// to anyone reading the doc, which is the point.
	const ignoreSchema = /<!--\s*doc-health:\s*ignore-schema/.test(text);
	const badIds = new Map();
	const flag = (id, lineNo) => {
		const key = id.toLowerCase();
		// Require a snake_case shape. Every table this repo has dropped is multi-word,
		// and requiring an underscore removes English prose that slipped into a fence.
		if (!key.includes('_')) return;
		// plpgsql local-variable conventions, not tables.
		if (/^(v_|p_|_)/.test(key)) return;
		if (SQL_NOISE.has(key) || key.startsWith('pg_')) return;
		if (liveIdentifiers.has(key)) return;
		if (schemaWords.has(key)) return; // real column used as a CTE/alias name
		if (!badIds.has(key)) badIds.set(key, lineNo);
	};

	// Names the doc defines itself are not rot: CTEs are query-local, and a
	// `CREATE TABLE` in a spec is a proposal, not a claim that the table exists.
	const selfDefined = new Set();
	for (const mm of text.matchAll(/(?:WITH|,)\s+([a-z][a-z0-9_]{3,})\s+AS\s*\(/gi))
		selfDefined.add(mm[1].toLowerCase());
	for (const mm of text.matchAll(
		/CREATE\s+(?:OR\s+REPLACE\s+)?(?:TABLE|VIEW|MATERIALIZED\s+VIEW|FUNCTION)\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?([a-z][a-z0-9_]{3,})/gi
	))
		selfDefined.add(mm[1].toLowerCase());

	// 2a. SQL fences only
	for (const block of codeBlocks(lines)) {
		if (!SQL_LANGS.has(block.lang) && !looksLikeSql(block.body)) continue;
		for (const [lineNo, line] of block.body) {
			if (NEGATED.test(line)) continue;
			for (const re of [SQL_TABLE_POSITION, INDEX_TABLE_POSITION]) {
				re.lastIndex = 0;
				let mm;
				while ((mm = re.exec(line))) {
					if (selfDefined.has(mm[1].toLowerCase())) continue;
					flag(mm[1], lineNo);
				}
			}
		}
	}
	// 2b. supabase client calls, anywhere in the doc
	lines.forEach((line, i) => {
		if (NEGATED.test(line)) return;
		CLIENT_TABLE_POSITION.lastIndex = 0;
		let mm;
		while ((mm = CLIENT_TABLE_POSITION.exec(line))) flag(mm[1], i + 1);
	});

	if (badIds.size && !ignoreSchema) {
		findings.push({
			check: 'dead-schema',
			file,
			detail: `${badIds.size} table(s)/function(s) queried here no longer exist`,
			sample: [...badIds.entries()].slice(0, 4).map(([id, ln]) => `${id} (line ${ln})`)
		});
	}

	// 3. unstamped point-in-time doc. Only documentation trees are checked; a
	// banner inside agent config or shipped content would do harm, not good.
	if (POINT_IN_TIME.test(basename(file)) && STAMPABLE.test(file)) {
		const head = lines.slice(0, 25).join('\n');
		if (!STAMP_RE.test(head) && !STAMP_BANNER.test(head)) {
			findings.push({
				check: 'unstamped',
				file,
				detail: 'point-in-time doc with no status/last-updated header',
				sample: []
			});
		}
	}
}

// ---- stamping ---------------------------------------------------------------
if (STAMP) {
	// Stamp both unstamped point-in-time docs and docs whose cited paths have
	// mostly rotted away — a doc citing files that no longer exist is describing
	// a system that no longer exists, whatever its filename says.
	const seen = new Set();
	const toStamp = findings
		.filter((f) => f.check === 'unstamped' || f.check === 'dead-paths')
		.filter((f) => STAMPABLE.test(f.file))
		.filter((f) => !seen.has(f.file) && seen.add(f.file));
	for (const f of toStamp) {
		const p = join(ROOT, f.file);
		const text = readFileSync(p, 'utf8');
		if (/<!--\s*doc-status:/.test(text)) continue;
		const date =
			execSync(`git log -1 --format=%cs -- "${f.file}"`, { encoding: 'utf8' }).trim() ||
			'unknown';
		const why =
			f.check === 'dead-paths'
				? `Written ${date}. Most of the files it cites no longer exist, so it describes a system that has since changed.`
				: `Written ${date}; describes the state of the system at that moment.`;
		const banner =
			`<!-- doc-status: point-in-time -->\n` +
			`> **Point-in-time document.** ${why}\n` +
			`> It is not a current reference. Verify against code before acting on anything here.\n\n`;
		// Insert after YAML frontmatter first, then after a leading path-label
		// comment, else at the top. Never before frontmatter — that breaks it.
		const fmMatch = text.match(/^---\n[\s\S]*?\n---\n/);
		const labelMatch = text.match(/^<!--\s*\S+\s*-->\n/);
		const offset = fmMatch ? fmMatch[0].length : labelMatch ? labelMatch[0].length : 0;
		const out = offset
			? text.slice(0, offset) + '\n' + banner + text.slice(offset).replace(/^\n+/, '')
			: banner + text;
		writeFileSync(p, out);
	}
	console.log(`stamped ${toStamp.length} point-in-time doc(s).`);
}

// ---- report -----------------------------------------------------------------
if (JSON_OUT) {
	console.log(JSON.stringify({ scanned: files.length, findings }, null, 2));
} else {
	const byCheck = {};
	for (const f of findings) (byCheck[f.check] ??= []).push(f);
	console.log(`doc-health: scanned ${files.length} tracked markdown file(s)\n`);
	for (const check of ['dead-schema', 'dead-paths', 'unstamped']) {
		const rows = byCheck[check] ?? [];
		console.log(`${check}: ${rows.length}`);
		for (const r of rows.slice(0, check === 'unstamped' ? 10 : 25)) {
			console.log(`  ${r.file}`);
			console.log(`    ${r.detail}${r.sample.length ? ` — ${r.sample.join(', ')}` : ''}`);
		}
		if (rows.length > (check === 'unstamped' ? 10 : 25)) {
			console.log(`  ... and ${rows.length - (check === 'unstamped' ? 10 : 25)} more`);
		}
		console.log('');
	}
}

const blocking = findings.filter((f) => f.check !== 'unstamped');
if (STRICT && blocking.length) {
	console.error(`doc-health: ${blocking.length} blocking finding(s) (dead-schema / dead-paths).`);
	process.exit(1);
}
