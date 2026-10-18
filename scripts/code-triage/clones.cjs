// Copy-paste detector (jscpd-style): normalized token windows shared across files.
// Usage: node clones.cjs <repoRoot> scan.json clones.json
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(process.argv[2]);
const ts = require(path.join(ROOT, 'apps/web/node_modules/typescript'));
const scan = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const OUT = process.argv[4] || 'clones.json';
const W = 70; // tokens per window

const files = scan.files.filter(
	(f) =>
		!f.test &&
		!f.generated &&
		!f.config &&
		!f.svelte &&
		/\.ts$/.test(f.file) &&
		!/fixture|\/scripts\//.test(f.file)
);
const windows = new Map(); // hash -> [{file,line}]
const fnv = (s) => {
	let h = 2166136261;
	for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
	return h >>> 0;
};
for (const f of files) {
	const text = fs.readFileSync(path.join(ROOT, f.file), 'utf8');
	const sc = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard, text);
	const toks = [];
	let k;
	while ((k = sc.scan()) !== ts.SyntaxKind.EndOfFileToken) {
		if (k === ts.SyntaxKind.ImportKeyword) {
			// skip import lines
		}
		let norm;
		if (k === ts.SyntaxKind.Identifier) norm = 'I';
		else if (
			k === ts.SyntaxKind.StringLiteral ||
			k === ts.SyntaxKind.NoSubstitutionTemplateLiteral ||
			k === ts.SyntaxKind.NumericLiteral
		)
			norm = 'L';
		else norm = String(k);
		toks.push([norm, sc.getTokenPos()]);
	}
	const lineAt = (pos) => text.slice(0, pos).split('\n').length;
	// hash every window, keep every 5th to bound memory, but always compare full set via rolling join
	for (let i = 0; i + W <= toks.length; i += 5) {
		const key = toks
			.slice(i, i + W)
			.map((t) => t[0])
			.join(',');
		// skip windows that are mostly type declarations / object literal punctuation
		const h = fnv(key);
		let arr = windows.get(h);
		if (!arr) windows.set(h, (arr = []));
		if (arr.length < 12) arr.push({ file: f.file, pos: toks[i][1], i });
	}
	f._lineAt = lineAt;
	f._text = text;
}
// aggregate file pairs
const pairs = new Map();
for (const [, arr] of windows) {
	if (arr.length < 2 || arr.length > 6) continue; // >6 = boilerplate pattern
	for (let a = 0; a < arr.length; a++)
		for (let b = a + 1; b < arr.length; b++) {
			const A = arr[a],
				B = arr[b];
			if (A.file === B.file) continue;
			const [x, y] = A.file < B.file ? [A, B] : [B, A];
			const key = x.file + '|' + y.file;
			const p = pairs.get(key) || { a: x.file, b: y.file, hits: 0, aPos: [], bPos: [] };
			p.hits++;
			p.aPos.push(x.pos);
			p.bPos.push(y.pos);
			pairs.set(key, p);
		}
}
const byFile = Object.fromEntries(files.map((f) => [f.file, f]));
const rows = [...pairs.values()]
	.filter((p) => p.hits >= 4)
	.map((p) => {
		const fa = byFile[p.a],
			fb = byFile[p.b];
		const la = p.aPos.map(fa._lineAt),
			lb = p.bPos.map(fb._lineAt);
		return {
			a: p.a,
			b: p.b,
			// each hit ~ 5 tokens of new overlap beyond the first window; estimate duplicated tokens
			dupTokens: W + (p.hits - 1) * 5,
			aLines: [Math.min(...la), Math.max(...la) + 10],
			bLines: [Math.min(...lb), Math.max(...lb) + 10]
		};
	})
	.sort((x, y) => y.dupTokens - x.dupTokens);
fs.writeFileSync(OUT, JSON.stringify(rows));
for (const r of rows.slice(0, 50))
	console.log(
		String(r.dupTokens).padStart(5),
		`${r.a}:${r.aLines.join('-')}`,
		'<=>',
		`${r.b}:${r.bLines.join('-')}`
	);
console.error('pairs', rows.length);
