// docs/technical/reviews/agentic-chat-harness-audit-2026-09-08/evidence/lane-D-graph.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = '/Users/djwayne/buildos-platform';
const mode = process.argv[2] || 'loop';
const dirs =
	mode === 'supervisor'
		? ['packages/agentic-chat-runtime/src/supervisor']
		: mode === 'root'
			? ['packages/agentic-chat-runtime/src']
			: ['packages/agentic-chat-runtime/src/loop'];

const exportRe =
	/^export\s+(?:async\s+)?(?:function|const|class|type|interface|enum|let)\s+([A-Za-z0-9_$]+)/gm;
const exportListRe = /^export\s+(?:type\s+)?\{([^}]*)\}/gm;

function listFiles(d) {
	return fs
		.readdirSync(path.join(ROOT, d), { withFileTypes: true })
		.filter(
			(e) =>
				e.isFile() &&
				e.name.endsWith('.ts') &&
				!e.name.endsWith('.test.ts') &&
				e.name !== 'index.ts'
		)
		.map((e) => path.join(d, e.name));
}

function grepCount(sym) {
	try {
		const out = execFileSync(
			'grep',
			[
				'-rwc',
				'--include=*.ts',
				'--include=*.svelte',
				'--include=*.js',
				'--include=*.mjs',
				'--exclude-dir=node_modules',
				'--exclude-dir=dist',
				'--exclude-dir=.svelte-kit',
				sym,
				'apps/worker/src',
				'apps/web/src',
				'packages'
			],
			{ cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
		);
		return out
			.trim()
			.split('\n')
			.filter(Boolean)
			.map((l) => {
				const i = l.lastIndexOf(':');
				return [l.slice(0, i), Number(l.slice(i + 1))];
			})
			.filter(([, c]) => c > 0);
	} catch (e) {
		return [];
	}
}

const results = [];
for (const d of dirs) {
	for (const file of listFiles(d)) {
		const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
		const syms = new Set();
		let m;
		while ((m = exportRe.exec(src))) syms.add(m[1]);
		while ((m = exportListRe.exec(src))) {
			for (const part of m[1].split(',')) {
				const name = part
					.trim()
					.split(/\s+as\s+/)
					.pop()
					?.replace(/^type\s+/, '')
					.trim();
				if (name && /^[A-Za-z0-9_$]+$/.test(name)) syms.add(name);
			}
		}
		for (const sym of syms) {
			const rows = grepCount(sym);
			let worker = 0,
				web = 0,
				rt = 0,
				tests = 0,
				self = 0,
				otherPkg = 0;
			const workerFiles = [],
				webFiles = [],
				rtFiles = [];
			for (const [f, c] of rows) {
				if (f === file) {
					self += c;
					continue;
				}
				if (f.endsWith('.test.ts') || f.includes('/tests/') || f.includes('/__tests__/')) {
					tests += c;
					continue;
				}
				if (f.startsWith('apps/worker/src')) {
					worker += c;
					workerFiles.push(path.basename(f));
				} else if (f.startsWith('apps/web/src')) {
					web += c;
					webFiles.push(path.basename(f));
				} else if (f.startsWith('packages/agentic-chat-runtime/src')) {
					rt += c;
					rtFiles.push(path.basename(f));
				} else if (f.startsWith('packages/')) otherPkg += c;
			}
			const bucket =
				worker > 0
					? 'WORKER-LIVE'
					: web > 0
						? 'WEB-ONLY'
						: rt > 0 || otherPkg > 0
							? 'RUNTIME-INTERNAL'
							: tests > 0
								? 'TEST-ONLY'
								: 'DEAD';
			results.push({
				file: path.basename(file),
				sym,
				worker,
				web,
				rt,
				otherPkg,
				tests,
				bucket,
				workerFiles: [...new Set(workerFiles)],
				webFiles: [...new Set(webFiles)],
				rtFiles: [...new Set(rtFiles)]
			});
		}
	}
}
const outPath = process.argv[3] || '/dev/stdout';
fs.writeFileSync(outPath, JSON.stringify(results, null, 1));
const byBucket = {};
for (const r of results) byBucket[r.bucket] = (byBucket[r.bucket] || 0) + 1;
console.log('symbols:', results.length, JSON.stringify(byBucket));
