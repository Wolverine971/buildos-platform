#!/usr/bin/env node
// scripts/docs/check-doc-health.mjs
// Detect documentation that will actively mislead an agent that greps it.
//
// Five checks:
//   1. dead-paths   — doc cites repo file paths that no longer exist
//   2. dead-schema  — doc names a database table/function that no longer exists,
//                     asserted positively (negations like "was dropped" are fine)
//   3. broken-links — a markdown link in a current doc points at a file that is
//                     not in the repo (or at a path on one person's machine)
//   4. unstamped    — point-in-time doc (audit/plan/phase/handoff) with no status
//                     header, so grep cannot tell it from current reference docs
//   5. unreferenced — doc older than 90 days that no doc or code file mentions;
//                     a delete candidate, or a doc that needs a link from an index
//
// 1-3 block `--strict`; 4-5 are reported only.
//
// Usage:
//   node scripts/docs/check-doc-health.mjs            # report
//   node scripts/docs/check-doc-health.mjs --strict   # exit 1 on any finding
//   node scripts/docs/check-doc-health.mjs --stamp    # write status banners
//   node scripts/docs/check-doc-health.mjs --json

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, normalize, basename, extname } from 'node:path';

const ROOT = process.cwd();
const args = process.argv.slice(2);
const STRICT = args.includes('--strict');
const STAMP = args.includes('--stamp');
const JSON_OUT = args.includes('--json');

// Docs excluded from health checks. Marketing is a deliberate write-only lane;
// generated files are owned by their generators.
const EXCLUDE = [
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

// The working tree, not the index: tracked files that still exist plus new
// files git would add. A doc moved or deleted but not yet committed is checked
// (or skipped) as it is on disk, so the gate matches what the commit will hold.
const repoFiles = execSync('git ls-files --cached --others --exclude-standard', {
	maxBuffer: 1 << 28
})
	.toString()
	.split('\n')
	.filter((f) => f && !f.includes('node_modules/') && existsSync(join(ROOT, f)));
const repoFileSet = new Set(repoFiles);
const repoDirSet = new Set();
for (const f of repoFiles) {
	for (let d = dirname(f); d && d !== '.'; d = dirname(d)) {
		if (repoDirSet.has(d)) break;
		repoDirSet.add(d);
	}
}
const inRepo = (p) => repoFileSet.has(p) || repoDirSet.has(p);

function tracked() {
	return repoFiles.filter((f) => f.endsWith('.md') && !EXCLUDE.some((re) => re.test(f)));
}

// ---- link truth -------------------------------------------------------------
// Links are checked in documentation trees and the root/app instruction files.
const LINK_CHECKED =
	/^(docs\/|apps\/(web|worker)\/docs\/|packages\/[^/]+\/docs\/|(README|CLAUDE|AGENTS)\.md$|apps\/[^/]+\/(README|AGENTS)\.md$)/;
const MD_LINK = /\[(?:[^\]\[]|\[[^\]]*\])*\]\(((?:[^()\s]|\([^()\s]*\))+)(?:\s+"[^"]*")?\)/g;
// A leading-slash link is a repo path only when it starts at a real top-level
// folder; `/blogs/x` or `/r/sub/wiki` are site routes, not files.
const REPO_TOP = new Set(
	repoFiles.filter((f) => f.includes('/')).map((f) => f.slice(0, f.indexOf('/')))
);
REPO_TOP.add('thoughts'); // retired 2026-08-19; a link there is always dead

// Returns [{ href, line }] for links whose target is not in the repo.
function findBrokenLinks(lines, docDir) {
	const broken = [];
	let inFence = false;
	lines.forEach((raw, i) => {
		if (/^\s*(```|~~~)/.test(raw)) {
			inFence = !inFence;
			return;
		}
		if (inFence) return;
		const line = raw.replace(/`[^`]*`/g, ''); // links inside code spans are examples
		MD_LINK.lastIndex = 0;
		let m;
		while ((m = MD_LINK.exec(line))) {
			const href = m[1];
			if (/^(https?:|mailto:|#|tel:|data:|<)/.test(href)) continue;
			if (/^\/(Users|home)\//.test(href)) {
				broken.push({ href, line: i + 1, why: 'path on one machine' });
				continue;
			}
			let p = href.split('#')[0].split('?')[0];
			try {
				p = decodeURIComponent(p);
			} catch {
				/* keep the raw path */
			}
			p = p.replace(/^(.*\.[A-Za-z0-9]+):\d+(?::\d+)?$/, '$1'); // file.ts:42
			if (!p) continue;
			if (p.startsWith('/')) {
				if (!REPO_TOP.has(p.split('/')[1])) continue;
				const bare = p.slice(1).replace(/\/$/, '');
				if (inRepo(bare)) continue;
				// An extensionless root link that is not a folder is a site route.
				if (!/\.[A-Za-z0-9]{1,6}$/.test(p) && !p.endsWith('/')) continue;
				broken.push({ href, line: i + 1 });
				continue;
			}
			const target = normalize(join(docDir, p)).replace(/\/$/, '');
			if (target === '.' || inRepo(target)) continue;
			broken.push({ href, line: i + 1 });
		}
	});
	return broken;
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
const BASES = ['', 'apps/web/', 'apps/worker/', 'apps/mobile/', 'packages/'];
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

	// 3. broken links. Same exemption as dead paths: a doc that declares itself
	// historical has already told its reader not to trust what it points at.
	// Opt out with `<!-- doc-health: ignore-links — why -->` (e.g. link templates).
	if (
		LINK_CHECKED.test(file) &&
		!declaredHistorical &&
		!/<!--\s*doc-health:\s*ignore-links/.test(text)
	) {
		const brokenLinks = findBrokenLinks(lines, docDir);
		if (brokenLinks.length) {
			findings.push({
				check: 'broken-links',
				file,
				detail: `${brokenLinks.length} link(s) point at files that are not in the repo`,
				sample: brokenLinks
					.slice(0, 3)
					.map((b) => `${b.href} (line ${b.line}${b.why ? `, ${b.why}` : ''})`)
			});
		}
	}

	// 4. unstamped point-in-time doc. Only documentation trees are checked; a
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

// ---- unreferenced docs ------------------------------------------------------
// A doc nobody links to and no code names is either dead (delete it; git
// history is the archive) or missing from its index (link it). Only docs older
// than 90 days are reported, so work in progress is left alone.
{
	const INDEX_LIKE = /(^|\/)(README|INDEX|NAVIGATION_INDEX|START-HERE|START_HERE)\.md$/i;
	const candidates = files.filter(
		(f) =>
			STAMPABLE.test(f) &&
			!INDEX_LIKE.test(f) &&
			!/^docs\/founder\//.test(f) && // personal working material, not product docs
			!/<!--\s*doc-health:\s*keep-unreferenced/.test(readFileSync(join(ROOT, f), 'utf8'))
	);
	const byBase = new Map();
	for (const f of candidates) {
		const b = basename(f);
		if (!byBase.has(b)) byBase.set(b, []);
		byBase.get(b).push(f);
	}
	const candidateSet = new Set(candidates);
	const referenced = new Set();
	const mark = (target, source) => {
		if (target !== source && candidateSet.has(target)) referenced.add(target);
	};
	const TEXT_EXT = new Set(
		'.md .ts .js .mjs .cjs .svelte .json .yml .yaml .toml .sql .sh .py'.split(' ')
	);
	const SKIP = /pnpm-lock|database\.(types|schema)|supabase\.openapi|^artifacts\/|\/dist\//;
	const PATHISH = /(?:^|[\s`'"(<\[])((?:\.{1,2}\/|\/)?(?:[\w@.()\-]+\/)+[\w@.()\-]+\.md)\b/g;
	const BARE = /([\w@.\-]+\.md)\b/g;
	for (const source of repoFiles) {
		if (!TEXT_EXT.has(extname(source)) || SKIP.test(source)) continue;
		let text;
		try {
			text = readFileSync(join(ROOT, source), 'utf8');
		} catch {
			continue;
		}
		if (text.length > 3_000_000 || !text.includes('.md')) continue;
		const dir = dirname(source);
		let m;
		PATHISH.lastIndex = 0;
		while ((m = PATHISH.exec(text))) {
			const fromRoot = normalize(m[1].replace(/^\//, ''));
			const fromDoc = normalize(join(dir, m[1]));
			if (candidateSet.has(fromRoot)) mark(fromRoot, source);
			else if (candidateSet.has(fromDoc)) mark(fromDoc, source);
			else {
				// a partial path such as `features/x/SPEC.md`
				const tail = '/' + fromRoot.replace(/^(\.\.\/)+/, '');
				const hits = (byBase.get(basename(m[1])) ?? []).filter((d) => d.endsWith(tail));
				if (hits.length === 1) mark(hits[0], source);
			}
		}
		// a bare filename counts only when one doc has that name
		BARE.lastIndex = 0;
		while ((m = BARE.exec(text))) {
			const hits = byBase.get(m[1]);
			if (hits?.length === 1) mark(hits[0], source);
		}
	}
	// First-commit date for every doc, in one pass (newest first, so the last
	// write per path is the oldest commit). Uncommitted docs have no date and are new.
	const created = new Map();
	let cur = null;
	const log = execSync(
		'git log --diff-filter=A --format=@%cs --name-only -- docs apps/web/docs apps/worker/docs packages',
		{ maxBuffer: 1 << 28, encoding: 'utf8' }
	);
	for (const line of log.split('\n')) {
		if (line.startsWith('@')) cur = line.slice(1);
		else if (line) created.set(line, cur);
	}
	const cutoff = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
	for (const f of candidates) {
		if (referenced.has(f)) continue;
		const born = created.get(f);
		if (!born || born > cutoff) continue;
		findings.push({
			check: 'unreferenced',
			file: f,
			detail: `first committed ${born}; no doc or code file mentions it`,
			sample: []
		});
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
	console.log(`doc-health: scanned ${files.length} markdown file(s)\n`);
	const ADVISORY = new Set(['unstamped', 'unreferenced']);
	for (const check of [
		'dead-schema',
		'dead-paths',
		'broken-links',
		'unstamped',
		'unreferenced'
	]) {
		const rows = byCheck[check] ?? [];
		const shown = ADVISORY.has(check) ? 10 : 25;
		console.log(`${check}: ${rows.length}`);
		for (const r of rows.slice(0, shown)) {
			console.log(`  ${r.file}`);
			console.log(`    ${r.detail}${r.sample.length ? ` — ${r.sample.join(', ')}` : ''}`);
		}
		if (rows.length > shown) {
			console.log(`  ... and ${rows.length - shown} more (--json lists all)`);
		}
		console.log('');
	}
}

const blocking = findings.filter((f) => f.check !== 'unstamped' && f.check !== 'unreferenced');
if (STRICT && blocking.length) {
	console.error(
		`doc-health: ${blocking.length} blocking finding(s) (dead-schema / dead-paths / broken-links).`
	);
	process.exit(1);
}
