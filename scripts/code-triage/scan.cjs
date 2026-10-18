// Code triage scanner: per-file complexity, risk patterns, import graph,
// reachability from live entry points, dead exports, and git churn.
// Usage: node scan.cjs <repoRoot> <outJson>
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(process.argv[2] || '.');
const OUT = process.argv[3] || 'scan.json';
const ts = require(path.join(ROOT, 'apps/web/node_modules/typescript'));

const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const sh = (cmd) => execSync(cmd, { cwd: ROOT, maxBuffer: 1 << 30 }).toString();

// ---------- file inventory ----------
const allFiles = sh('git ls-files -co --exclude-standard apps packages scripts')
	.split('\n')
	.filter((f) => /\.(ts|svelte|js|mjs|cjs|mts)$/.test(f))
	.filter((f) => !/node_modules|\/dist\/|\.svelte-kit|\/build\/|\.d\.ts$/.test(f))
	.filter((f) => fs.existsSync(path.join(ROOT, f)));
const fileSet = new Set(allFiles);

const isTest = (f) =>
	/(\.test|\.spec|\.live\.test|\.bench)\.(ts|js)$/.test(f) ||
	/(^|\/)(tests?|__tests__|__mocks__|test-utils|fixtures)\//.test(f) ||
	/\/lib\/tests\//.test(f) ||
	/vitest|playwright/.test(path.basename(f));
const isScript = (f) =>
	/^scripts\//.test(f) ||
	/^apps\/[^/]+\/scripts\//.test(f) ||
	/^apps\/worker\/src\/scripts\//.test(f) ||
	/^packages\/[^/]+\/scripts\//.test(f);
const isConfig = (f) =>
	/(^|\/)[^/]*\.config\.(ts|js|mjs|cjs)$/.test(f) ||
	/eslint|tsup|svelte\.config/.test(path.basename(f));

function area(f) {
	if (f.startsWith('apps/worker/src/workers/agentic-chat/')) return 'worker: agentic chat';
	if (f.startsWith('apps/worker/src/workers/')) return 'worker: jobs';
	if (f.startsWith('apps/worker/')) return 'worker: core';
	if (f.startsWith('packages/')) return 'pkg: ' + f.split('/')[1];
	if (
		/^apps\/web\/src\/lib\/services\/(agentic-chat|context-finder|agent-|chat-)/.test(f) ||
		/^apps\/web\/src\/lib\/components\/agent\//.test(f) ||
		/^apps\/web\/src\/routes\/api\/agent\//.test(f) ||
		/^apps\/web\/src\/lib\/stores\/agent/.test(f)
	)
		return 'web: agentic chat';
	if (f.startsWith('apps/web/')) return 'web: other';
	return 'other';
}

// ---------- package export maps ----------
const pkgMap = {}; // name -> { dir, sub: { './x': 'src/x.ts' } }
for (const dir of fs.readdirSync(path.join(ROOT, 'packages'))) {
	const pj = path.join(ROOT, 'packages', dir, 'package.json');
	if (!fs.existsSync(pj)) continue;
	const p = JSON.parse(fs.readFileSync(pj, 'utf8'));
	const sub = {};
	const toSrc = (target) => {
		if (!target) return null;
		let t =
			typeof target === 'string'
				? target
				: target.development || target.import || target.require || target.types;
		if (typeof t !== 'string') return null;
		t = t
			.replace(/^\.\//, '')
			.replace(/^dist\//, 'src/')
			.replace(/\.(d\.ts|mjs|js|cjs)$/, '');
		for (const c of [t + '.ts', t + '/index.ts', t.replace(/^src\//, 'src/') + '.ts']) {
			const full = `packages/${dir}/${c}`;
			if (fileSet.has(full)) return full;
		}
		return null;
	};
	if (p.exports && typeof p.exports === 'object') {
		for (const [k, v] of Object.entries(p.exports)) sub[k] = toSrc(v);
	}
	if (!sub['.'])
		sub['.'] =
			toSrc(p.main) ||
			(fileSet.has(`packages/${dir}/src/index.ts`) ? `packages/${dir}/src/index.ts` : null);
	pkgMap[p.name] = { dir, sub };
}

const EXTS = ['', '.ts', '.svelte.ts', '.js', '.svelte', '/index.ts', '/index.js', '/+page.svelte'];
function tryFile(base) {
	const b = base.replace(/\.js$/, '');
	for (const e of EXTS) {
		for (const cand of [b + e, base + e]) {
			const r = rel(cand);
			if (fileSet.has(r)) return r;
		}
	}
	return null;
}
function resolve(fromFile, spec) {
	if (spec.startsWith('.')) return tryFile(path.join(ROOT, path.dirname(fromFile), spec));
	const app = fromFile.split('/').slice(0, 2).join('/');
	if (spec.startsWith('$lib/') || spec === '$lib')
		return tryFile(path.join(ROOT, 'apps/web/src/lib', spec.slice(5)));
	if (spec.startsWith('$components/'))
		return tryFile(path.join(ROOT, 'apps/web/src/lib/components', spec.slice(12)));
	if (spec.startsWith('$ui/'))
		return tryFile(path.join(ROOT, 'apps/web/src/lib/components/ui', spec.slice(4)));
	if (spec.startsWith('$utils/'))
		return tryFile(path.join(ROOT, 'apps/web/src/lib/utils', spec.slice(7)));
	if (spec.startsWith('@/') && app === 'apps/worker')
		return tryFile(path.join(ROOT, 'apps/worker/src', spec.slice(2)));
	const m = spec.match(/^(@buildos\/[^/]+)(\/.*)?$/);
	if (m && pkgMap[m[1]]) {
		const { dir, sub } = pkgMap[m[1]];
		const key = m[2] ? '.' + m[2] : '.';
		if (sub[key]) return sub[key];
		return tryFile(path.join(ROOT, 'packages', dir, 'src', m[2] || 'index'));
	}
	return null;
}

// ---------- per-file analysis ----------
const FN_KINDS = new Set([
	ts.SyntaxKind.FunctionDeclaration,
	ts.SyntaxKind.MethodDeclaration,
	ts.SyntaxKind.ArrowFunction,
	ts.SyntaxKind.FunctionExpression,
	ts.SyntaxKind.Constructor,
	ts.SyntaxKind.GetAccessor,
	ts.SyntaxKind.SetAccessor
]);
const NEST_KINDS = new Set([
	ts.SyntaxKind.IfStatement,
	ts.SyntaxKind.ForStatement,
	ts.SyntaxKind.ForInStatement,
	ts.SyntaxKind.ForOfStatement,
	ts.SyntaxKind.WhileStatement,
	ts.SyntaxKind.DoStatement,
	ts.SyntaxKind.SwitchStatement,
	ts.SyntaxKind.TryStatement,
	ts.SyntaxKind.CatchClause
]);

function fnName(node, sf) {
	if (node.name && node.name.getText) return node.name.getText(sf);
	const p = node.parent;
	if (p && ts.isVariableDeclaration(p) && p.name) return p.name.getText(sf);
	if (p && ts.isPropertyAssignment(p) && p.name) return p.name.getText(sf);
	if (p && ts.isPropertyDeclaration(p) && p.name) return p.name.getText(sf);
	if (p && ts.isCallExpression(p)) {
		const callee = p.expression.getText(sf).slice(0, 40);
		return `<cb:${callee}>`;
	}
	return '<anon>';
}

function analyze(file) {
	let text = fs.readFileSync(path.join(ROOT, file), 'utf8');
	const isSvelte = file.endsWith('.svelte');
	let scriptText = text;
	let lineOffset = 0;
	if (isSvelte) {
		const blocks = [...text.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)];
		scriptText = blocks.map((b) => b[1]).join('\n');
		const first = blocks[0];
		lineOffset = first ? text.slice(0, first.index).split('\n').length - 1 : 0;
	}
	const generated = /auto-?generated|generated by|do not edit/i.test(text.slice(0, 600));
	const sf = ts.createSourceFile(
		file,
		scriptText,
		ts.ScriptTarget.Latest,
		true,
		file.endsWith('.js') ? ts.ScriptKind.JS : ts.ScriptKind.TS
	);
	const lineOf = (n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1 + lineOffset;

	const lines = text.split('\n');
	const loc = lines.filter((l) => l.trim() && !/^\s*(\/\/|\*|\/\*)/.test(l)).length;

	const r = {
		file,
		area: area(file),
		test: isTest(file),
		script: isScript(file),
		config: isConfig(file),
		svelte: isSvelte,
		generated,
		loc,
		fns: [],
		any: 0,
		doubleCast: 0,
		nonNull: 0,
		tsIgnore: (text.match(/@ts-(ignore|expect-error|nocheck)/g) || []).length,
		eslintDisable: (text.match(/eslint-disable/g) || []).length,
		todo: (text.match(/\b(TODO|FIXME|HACK|XXX)\b/g) || []).length,
		catches: 0,
		emptyCatch: 0,
		catchNoRethrow: 0,
		timers: 0,
		promiseCombos: 0,
		aborts: 0,
		newPromise: 0,
		regex: 0,
		env: new Set(),
		tables: new Set(),
		rpcs: new Set(),
		imports: [], // {spec, target, names:[], typeOnly, kind}
		exports: new Set(),
		reexports: [], // {target, map:{exported:orig}|null(star)}
		globs: []
	};
	if (isSvelte) r.exports.add('default');

	function cc(fnNode) {
		let c = 1;
		let maxDepth = 0;
		function walk(n, depth) {
			if (n !== fnNode && FN_KINDS.has(n.kind)) return; // nested fn scored separately
			let d = depth;
			switch (n.kind) {
				case ts.SyntaxKind.IfStatement:
				case ts.SyntaxKind.ConditionalExpression:
				case ts.SyntaxKind.CaseClause:
				case ts.SyntaxKind.ForStatement:
				case ts.SyntaxKind.ForInStatement:
				case ts.SyntaxKind.ForOfStatement:
				case ts.SyntaxKind.WhileStatement:
				case ts.SyntaxKind.DoStatement:
				case ts.SyntaxKind.CatchClause:
					c++;
					break;
				case ts.SyntaxKind.BinaryExpression: {
					const op = n.operatorToken.kind;
					if (
						op === ts.SyntaxKind.AmpersandAmpersandToken ||
						op === ts.SyntaxKind.BarBarToken ||
						op === ts.SyntaxKind.QuestionQuestionToken
					)
						c++;
					break;
				}
			}
			if (
				NEST_KINDS.has(n.kind) &&
				!(
					n.kind === ts.SyntaxKind.IfStatement &&
					n.parent &&
					ts.isIfStatement(n.parent) &&
					n.parent.elseStatement === n
				)
			) {
				d = depth + 1;
				if (d > maxDepth) maxDepth = d;
			}
			ts.forEachChild(n, (ch) => walk(ch, d));
		}
		walk(fnNode, 0);
		return { c, maxDepth };
	}

	function hasExportMod(n) {
		return !!((ts.canHaveModifiers(n) && ts.getModifiers(n)) || []).some(
			(m) => m.kind === ts.SyntaxKind.ExportKeyword
		);
	}
	function hasDefaultMod(n) {
		return !!((ts.canHaveModifiers(n) && ts.getModifiers(n)) || []).some(
			(m) => m.kind === ts.SyntaxKind.DefaultKeyword
		);
	}
	function addImport(spec, names, typeOnly, kind) {
		const target = resolve(file, spec);
		r.imports.push({ spec, target, names, typeOnly, kind });
	}

	function visit(n) {
		if (FN_KINDS.has(n.kind) && n.body) {
			const { c, maxDepth } = cc(n);
			const start = lineOf(n);
			const end = sf.getLineAndCharacterOfPosition(n.getEnd()).line + 1 + lineOffset;
			r.fns.push({
				name: fnName(n, sf),
				line: start,
				len: end - start + 1,
				cc: c,
				depth: maxDepth
			});
		}
		switch (n.kind) {
			case ts.SyntaxKind.AnyKeyword:
				r.any++;
				break;
			case ts.SyntaxKind.NonNullExpression:
				r.nonNull++;
				break;
			case ts.SyntaxKind.AsExpression:
				if (
					ts.isAsExpression(n.expression) &&
					n.expression.type.kind === ts.SyntaxKind.UnknownKeyword
				)
					r.doubleCast++;
				break;
			case ts.SyntaxKind.RegularExpressionLiteral:
				r.regex++;
				break;
			case ts.SyntaxKind.CatchClause: {
				r.catches++;
				const stmts = n.block.statements;
				if (stmts.length === 0) r.emptyCatch++;
				let rethrow = false;
				(function f(x) {
					if (rethrow) return;
					if (ts.isThrowStatement(x)) rethrow = true;
					else if (!FN_KINDS.has(x.kind)) ts.forEachChild(x, f);
				})(n.block);
				if (!rethrow) r.catchNoRethrow++;
				break;
			}
			case ts.SyntaxKind.NewExpression: {
				const e = n.expression.getText(sf);
				if (e === 'AbortController') r.aborts++;
				if (e === 'Promise') r.newPromise++;
				if (e === 'RegExp') r.regex++;
				break;
			}
			case ts.SyntaxKind.CallExpression: {
				const e = n.expression;
				const et = e.getText(sf);
				if (
					et === 'setTimeout' ||
					et === 'setInterval' ||
					et.endsWith('.setTimeout') ||
					et.endsWith('.setInterval')
				)
					r.timers++;
				if (/^Promise\.(race|all|allSettled|any)$/.test(et)) r.promiseCombos++;
				const a0 = n.arguments[0];
				if (ts.isPropertyAccessExpression(e) && a0 && ts.isStringLiteralLike(a0)) {
					const prop = e.name.text;
					if (
						prop === 'from' &&
						!/^Array$|^Buffer$|^Object$/.test(e.expression.getText(sf))
					)
						r.tables.add(a0.text);
					if (prop === 'rpc') r.rpcs.add(a0.text);
				}
				if (e.kind === ts.SyntaxKind.ImportKeyword && a0 && ts.isStringLiteralLike(a0))
					addImport(a0.text, ['*'], false, 'dynamic');
				if (ts.isIdentifier(e) && e.text === 'require' && a0 && ts.isStringLiteralLike(a0))
					addImport(a0.text, ['*'], false, 'require');
				if (et === 'import.meta.glob' && a0) {
					const pats = ts.isArrayLiteralExpression(a0) ? a0.elements : [a0];
					for (const p of pats) if (ts.isStringLiteralLike(p)) r.globs.push(p.text);
				}
				break;
			}
			case ts.SyntaxKind.PropertyAccessExpression: {
				const t = n.expression.getText(sf);
				if (t === 'process.env' || t === 'env' || t === 'privateEnv' || t === 'publicEnv')
					r.env.add(n.name.text);
				break;
			}
			case ts.SyntaxKind.ElementAccessExpression: {
				if (
					n.expression.getText(sf) === 'process.env' &&
					ts.isStringLiteralLike(n.argumentExpression)
				)
					r.env.add(n.argumentExpression.text);
				break;
			}
			case ts.SyntaxKind.ImportDeclaration: {
				const spec = n.moduleSpecifier.text;
				const names = [];
				const ic = n.importClause;
				if (ic) {
					if (ic.name) names.push('default');
					if (ic.namedBindings) {
						if (ts.isNamespaceImport(ic.namedBindings)) names.push('*');
						else
							for (const el of ic.namedBindings.elements)
								names.push((el.propertyName || el.name).text);
					}
				} else names.push('*side-effect');
				if (spec.startsWith('$env/'))
					names.forEach((x) => x !== 'default' && x !== '*' && r.env.add(x));
				addImport(spec, names, !!(ic && ic.isTypeOnly), 'static');
				break;
			}
			case ts.SyntaxKind.ExportDeclaration: {
				if (n.moduleSpecifier) {
					const spec = n.moduleSpecifier.text;
					const target = resolve(file, spec);
					if (!n.exportClause) {
						r.reexports.push({ target, map: null });
						r.imports.push({
							spec,
							target,
							names: [],
							typeOnly: n.isTypeOnly,
							kind: 'reexport'
						});
					} else if (ts.isNamespaceExport(n.exportClause)) {
						r.exports.add(n.exportClause.name.text);
						r.imports.push({
							spec,
							target,
							names: ['*'],
							typeOnly: n.isTypeOnly,
							kind: 'reexport'
						});
					} else {
						const map = {};
						for (const el of n.exportClause.elements) {
							map[el.name.text] = (el.propertyName || el.name).text;
							r.exports.add(el.name.text);
						}
						r.reexports.push({ target, map });
						r.imports.push({
							spec,
							target,
							names: [],
							typeOnly: n.isTypeOnly,
							kind: 'reexport'
						});
					}
				} else if (n.exportClause && ts.isNamedExports(n.exportClause)) {
					for (const el of n.exportClause.elements) r.exports.add(el.name.text);
				}
				break;
			}
			case ts.SyntaxKind.ExportAssignment:
				r.exports.add('default');
				break;
			case ts.SyntaxKind.FunctionDeclaration:
			case ts.SyntaxKind.ClassDeclaration:
			case ts.SyntaxKind.InterfaceDeclaration:
			case ts.SyntaxKind.TypeAliasDeclaration:
			case ts.SyntaxKind.EnumDeclaration:
				if (hasExportMod(n))
					r.exports.add(hasDefaultMod(n) ? 'default' : n.name ? n.name.text : 'default');
				break;
			case ts.SyntaxKind.VariableStatement:
				if (hasExportMod(n))
					for (const d of n.declarationList.declarations) {
						if (ts.isIdentifier(d.name)) r.exports.add(d.name.text);
						else
							d.name.elements?.forEach(
								(e) =>
									e.name && ts.isIdentifier(e.name) && r.exports.add(e.name.text)
							);
					}
				break;
		}
		ts.forEachChild(n, visit);
	}
	visit(sf);
	if (isSvelte) {
		// Lazy component loads in markup: {#await import('...')}
		const markup = text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '');
		for (const m of markup.matchAll(/import\(\s*['"`]([^'"`]+)['"`]\s*\)/g))
			addImport(m[1], ['*'], false, 'dynamic');
	}
	r.env = [...r.env].filter((x) => /^[A-Z][A-Z0-9_]{2,}$/.test(x));
	r.tables = [...r.tables];
	r.rpcs = [...r.rpcs];
	r.exports = [...r.exports];
	return r;
}

const t0 = Date.now();
const files = {};
for (const f of allFiles) {
	try {
		files[f] = analyze(f);
	} catch (e) {
		console.error('parse fail', f, e.message);
	}
}
console.error(`parsed ${Object.keys(files).length} files in ${Date.now() - t0}ms`);

// globs -> imports
function globToRe(g) {
	return new RegExp(
		'^' +
			g
				.replace(/[.+^${}()|[\]\\]/g, '\\$&')
				.replace(/\*\*\//g, '(?:.*/)?')
				.replace(/\*\*/g, '.*')
				.replace(/\*/g, '[^/]*') +
			'$'
	);
}
for (const r of Object.values(files)) {
	for (const g of r.globs) {
		const base = g.startsWith('/')
			? path.join(ROOT, 'apps/web', g)
			: path.join(ROOT, path.dirname(r.file), g);
		const re = globToRe(rel(base));
		for (const f of allFiles)
			if (re.test(f))
				r.imports.push({ spec: g, target: f, names: ['*'], typeOnly: false, kind: 'glob' });
	}
}

// ---------- entry points ----------
const isEntry = (f) =>
	/^apps\/worker\/src\/(index|chat-worker|libri-worker|worker|scheduler)\.ts$/.test(f) ||
	/^apps\/web\/src\/routes\/.*\/?\+[^/]+\.(ts|svelte|js)$/.test(f) ||
	/^apps\/web\/src\/(hooks\.(server|client)|service-worker|app\.d)\.ts$/.test(f) ||
	/^apps\/web\/src\/params\//.test(f) ||
	/^packages\/buildos-mcp-server\/src\/index\.ts$/.test(f);

// ---------- graph ----------
const importers = {}; // target -> Set(importer)
for (const r of Object.values(files)) {
	for (const im of r.imports) {
		if (!im.target || im.target === r.file) continue;
		(importers[im.target] ||= new Set()).add(r.file);
	}
}
function reach(starts, filterFrom) {
	const seen = new Set(starts);
	const q = [...starts];
	while (q.length) {
		const f = q.pop();
		const r = files[f];
		if (!r) continue;
		for (const im of r.imports) {
			if (im.target && !seen.has(im.target)) {
				seen.add(im.target);
				q.push(im.target);
			}
		}
	}
	return seen;
}
const prodEntries = allFiles.filter((f) => isEntry(f) && !isTest(f));
const scriptEntries = allFiles.filter((f) => isScript(f) && !isTest(f));
const reachProd = reach(prodEntries);
const reachScript = reach(scriptEntries);
const testEntries = allFiles.filter(isTest);
const reachTest = reach(testEntries);

// ---------- export usage ----------
const used = {}; // file -> {prod:Set, test:Set}
const mark = (f, name, who) => {
	const u = (used[f] ||= { prod: new Set(), test: new Set() });
	u[who].add(name);
};
function resolveName(f, name, who, depth = 0) {
	const r = files[f];
	if (!r || depth > 12) return;
	if (name === '*') {
		for (const e of r.exports) mark(f, e, who);
		for (const re of r.reexports) if (re.target) resolveName(re.target, '*', who, depth + 1);
		return;
	}
	mark(f, name, who);
	for (const re of r.reexports) {
		if (!re.target) continue;
		if (re.map) {
			if (re.map[name]) resolveName(re.target, re.map[name], who, depth + 1);
		} else if (name !== 'default') {
			const tr = files[re.target];
			if (tr && (tr.exports.includes(name) || tr.reexports.length))
				resolveName(re.target, name, who, depth + 1);
		}
	}
}
for (const r of Object.values(files)) {
	const who = r.test ? 'test' : 'prod';
	for (const im of r.imports) {
		if (!im.target) continue;
		for (const n of im.names) if (n !== '*side-effect') resolveName(im.target, n, who);
	}
}

// ---------- git churn ----------
function churn(since) {
	const out = sh(
		`git log --since=${since} --numstat --no-renames --format=__C__%ct -- apps packages scripts`
	);
	const m = {};
	for (const line of out.split('\n')) {
		if (!line || line.startsWith('__C__')) continue;
		const [a, d, f] = line.split('\t');
		if (!f) continue;
		const x = (m[f] ||= { commits: 0, added: 0, deleted: 0 });
		x.commits++;
		x.added += +a || 0;
		x.deleted += +d || 0;
	}
	return m;
}
const ch90 = churn('90.days');
const ch30 = churn('30.days');
const lastTouched = {};
{
	const out = sh(
		`git log --since=365.days --name-only --no-renames --format=__C__%ct -- apps packages scripts`
	);
	let ts0 = 0;
	for (const line of out.split('\n')) {
		if (line.startsWith('__C__')) ts0 = +line.slice(5);
		else if (line && !(line in lastTouched)) lastTouched[line] = ts0;
	}
}
const now = Date.now() / 1000;

// ---------- assemble ----------
const result = [];
for (const r of Object.values(files)) {
	const imp = [...(importers[r.file] || [])];
	const prodImporters = imp.filter((x) => !files[x]?.test);
	const testImporters = imp.filter((x) => files[x]?.test);
	const u = used[r.file] || { prod: new Set(), test: new Set() };
	const entry = isEntry(r.file);
	const unusedExports =
		entry || r.svelte || r.test || r.config
			? []
			: r.exports.filter((e) => !u.prod.has(e) && !u.test.has(e));
	const testOnlyExports =
		entry || r.svelte || r.test || r.config
			? []
			: r.exports.filter((e) => !u.prod.has(e) && u.test.has(e));
	const ccs = r.fns.map((f) => f.cc);
	const top = [...r.fns].sort((a, b) => b.cc - a.cc).slice(0, 5);
	result.push({
		file: r.file,
		area: r.area,
		test: r.test,
		script: r.script,
		config: r.config,
		svelte: r.svelte,
		generated: r.generated,
		entry,
		loc: r.loc,
		fnCount: r.fns.length,
		maxCC: ccs.length ? Math.max(...ccs) : 0,
		sumCC: ccs.reduce((a, b) => a + b, 0),
		excessCC: ccs.reduce((a, b) => a + Math.max(0, b - 10), 0),
		fnsOver20: ccs.filter((c) => c > 20).length,
		maxDepth: r.fns.reduce((a, f) => Math.max(a, f.depth), 0),
		longestFn: r.fns.reduce((a, f) => Math.max(a, f.len), 0),
		topFns: top,
		any: r.any,
		doubleCast: r.doubleCast,
		nonNull: r.nonNull,
		tsIgnore: r.tsIgnore,
		eslintDisable: r.eslintDisable,
		todo: r.todo,
		catches: r.catches,
		emptyCatch: r.emptyCatch,
		catchNoRethrow: r.catchNoRethrow,
		timers: r.timers,
		promiseCombos: r.promiseCombos,
		aborts: r.aborts,
		newPromise: r.newPromise,
		regex: r.regex,
		env: r.env,
		tables: r.tables,
		rpcs: r.rpcs,
		fanIn: prodImporters.length,
		testFanIn: testImporters.length,
		fanOut: new Set(r.imports.filter((i) => i.target).map((i) => i.target)).size,
		reachProd: reachProd.has(r.file),
		reachScript: reachScript.has(r.file),
		reachTest: reachTest.has(r.file),
		exports: r.exports.length,
		unusedExports,
		testOnlyExports,
		commits90: ch90[r.file]?.commits || 0,
		lines90: (ch90[r.file]?.added || 0) + (ch90[r.file]?.deleted || 0),
		commits30: ch30[r.file]?.commits || 0,
		daysSinceTouch: lastTouched[r.file] ? Math.round((now - lastTouched[r.file]) / 86400) : null
	});
}
fs.writeFileSync(
	OUT,
	JSON.stringify({
		generatedAt: new Date().toISOString(),
		head: sh('git rev-parse --short HEAD').trim(),
		files: result
	})
);
console.error(`wrote ${result.length} rows to ${OUT} in ${Date.now() - t0}ms`);
