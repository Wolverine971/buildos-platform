// Turn scan.json into grades + rankings. Usage: node score.cjs scan.json scored.json
const fs = require('fs');
const d = JSON.parse(fs.readFileSync(process.argv[2] || 'scan.json', 'utf8'));
const OUT = process.argv[3] || 'scored.json';
const FOCUS = (a) => a.startsWith('worker') || a.startsWith('pkg') || a === 'web: agentic chat';
const L = (x) => Math.log2(1 + x);

const src = d.files.filter(
	(f) =>
		!f.test &&
		!f.config &&
		!f.generated &&
		!/fixture|test-harness|test-helpers|test-fakes|__fixtures__/.test(f.file)
);

function pctRank(arr, key) {
	const sorted = [...arr].map((f) => key(f)).sort((a, b) => a - b);
	return (f) => {
		const v = key(f);
		let lo = 0,
			hi = sorted.length;
		while (lo < hi) {
			const m = (lo + hi) >> 1;
			if (sorted[m] < v) lo = m + 1;
			else hi = m;
		}
		return lo / sorted.length;
	};
}

const complexityGrade = (f) =>
	f.maxCC <= 10 ? 'A' : f.maxCC <= 20 ? 'B' : f.maxCC <= 35 ? 'C' : f.maxCC <= 60 ? 'D' : 'F';
function usefulnessGrade(f) {
	if (f.entry) return 'E';
	if (!f.reachProd) return f.reachScript || f.script ? 'D' : 'F';
	if (f.fanIn >= 8) return 'A';
	if (f.fanIn >= 3) return 'B';
	return 'C';
}
for (const f of src) {
	f.concurrency = f.timers + f.promiseCombos + f.aborts + f.newPromise;
	f.typeEscapes = f.any + 2 * f.doubleCast + f.nonNull + 2 * f.tsIgnore;
	f.raw =
		3 * L(f.excessCC) +
		2 * L(f.commits90) +
		1.5 * L(f.concurrency) +
		1.5 * L(2 * f.emptyCatch + f.catchNoRethrow) +
		1 * L(f.typeEscapes) +
		1 * L(f.tables.length + f.rpcs.length) +
		1 * L(f.env.length) +
		1 * L(f.fanIn);
	f.raw *= f.testFanIn === 0 ? 1.25 : 1;
	f.cGrade = complexityGrade(f);
	f.uGrade = usefulnessGrade(f);
}
const pBug = pctRank(src, (f) => f.raw);
const pCx = pctRank(src, (f) => f.sumCC);
const pChurn = pctRank(src, (f) => f.lines90);
for (const f of src) {
	f.bugSurface = Math.round(100 * pBug(f));
	f.hotspot = Math.round(100 * pCx(f) * pChurn(f));
}

// ---- area summary ----
const areas = {};
for (const f of src) {
	const a = (areas[f.area] ||= {
		area: f.area,
		files: 0,
		loc: 0,
		fnsOver20: 0,
		fnsOver50: 0,
		tested: 0,
		unreachLoc: 0,
		unusedExports: 0,
		commits90: 0,
		envFlags: new Set(),
		cGrades: {},
		hot: 0
	});
	a.files++;
	a.loc += f.loc;
	a.fnsOver20 += f.fnsOver20;
	a.fnsOver50 += f.topFns.filter((x) => x.cc > 50).length;
	if (f.testFanIn > 0) a.tested++;
	if (!f.reachProd && !f.reachScript && !f.script && !f.entry) a.unreachLoc += f.loc;
	a.unusedExports += f.unusedExports.length;
	a.commits90 += f.commits90;
	f.env.forEach((e) => a.envFlags.add(e));
	a.cGrades[f.cGrade] = (a.cGrades[f.cGrade] || 0) + 1;
	if (f.bugSurface >= 90) a.hot++;
}
const areaRows = Object.values(areas).map((a) => ({
	...a,
	envFlags: a.envFlags.size,
	testedPct: Math.round((100 * a.tested) / a.files)
}));

// ---- env flags ----
const env = {};
for (const f of src)
	for (const e of f.env)
		((env[e] ||= { name: e, files: [], areas: new Set() }),
			env[e].files.push(f.file),
			env[e].areas.add(f.area));
const envRows = Object.values(env).map((e) => ({
	name: e.name,
	files: e.files.length,
	areas: [...e.areas],
	sample: e.files.slice(0, 4)
}));

// ---- functions ----
const fnRows = [];
for (const f of src) for (const fn of f.topFns) fnRows.push({ file: f.file, area: f.area, ...fn });
fnRows.sort((a, b) => b.cc - a.cc);

const slim = (f) => ({
	file: f.file,
	area: f.area,
	loc: f.loc,
	fnCount: f.fnCount,
	maxCC: f.maxCC,
	sumCC: f.sumCC,
	excessCC: f.excessCC,
	fnsOver20: f.fnsOver20,
	maxDepth: f.maxDepth,
	longestFn: f.longestFn,
	topFns: f.topFns.slice(0, 3),
	fanIn: f.fanIn,
	testFanIn: f.testFanIn,
	fanOut: f.fanOut,
	reachProd: f.reachProd,
	entry: f.entry,
	commits90: f.commits90,
	commits30: f.commits30,
	lines90: f.lines90,
	daysSinceTouch: f.daysSinceTouch,
	concurrency: f.concurrency,
	emptyCatch: f.emptyCatch,
	catchNoRethrow: f.catchNoRethrow,
	catches: f.catches,
	typeEscapes: f.typeEscapes,
	any: f.any,
	regex: f.regex,
	env: f.env,
	tables: f.tables,
	rpcs: f.rpcs,
	unusedExports: f.unusedExports,
	testOnlyExports: f.testOnlyExports,
	cGrade: f.cGrade,
	uGrade: f.uGrade,
	bugSurface: f.bugSurface,
	hotspot: f.hotspot
});

const focus = src.filter((f) => FOCUS(f.area));
fs.writeFileSync(
	OUT,
	JSON.stringify({
		head: d.head,
		generatedAt: d.generatedAt,
		areas: areaRows,
		files: focus.map(slim),
		allFilesCount: src.length,
		env: envRows,
		topFns: fnRows.filter((r) => FOCUS(r.area)).slice(0, 80)
	})
);

// ---- console report ----
const T = (rows, cols) =>
	console.table(rows.map((r) => Object.fromEntries(cols.map((c) => [c, r[c]]))));
console.log('HEAD', d.head);
T(
	areaRows.sort((a, b) => b.loc - a.loc),
	[
		'area',
		'files',
		'loc',
		'fnsOver20',
		'fnsOver50',
		'testedPct',
		'unreachLoc',
		'unusedExports',
		'commits90',
		'envFlags',
		'hot'
	]
);
console.log('\nTOP HOTSPOTS (complexity x churn), focus areas');
T(
	[...focus]
		.sort((a, b) => b.hotspot - a.hotspot || b.raw - a.raw)
		.slice(0, 45)
		.map((f) => ({ ...f, file: f.file.replace(/^apps\/|^packages\//, '').slice(0, 78) })),
	[
		'file',
		'loc',
		'maxCC',
		'sumCC',
		'commits90',
		'lines90',
		'testFanIn',
		'fanIn',
		'bugSurface',
		'hotspot'
	]
);
console.log('\nTOP BUG SURFACE, focus areas');
T(
	[...focus]
		.sort((a, b) => b.raw - a.raw)
		.slice(0, 45)
		.map((f) => ({ ...f, file: f.file.replace(/^apps\/|^packages\//, '').slice(0, 70) })),
	[
		'file',
		'loc',
		'maxCC',
		'commits90',
		'concurrency',
		'emptyCatch',
		'catchNoRethrow',
		'typeEscapes',
		'testFanIn',
		'fanIn',
		'bugSurface'
	]
);
console.log('\nTOP FUNCTIONS BY CC');
T(
	fnRows
		.filter((r) => FOCUS(r.area))
		.slice(0, 35)
		.map((r) => ({ ...r, file: r.file.replace(/^apps\/|^packages\//, '').slice(0, 64) })),
	['file', 'name', 'line', 'len', 'cc', 'depth']
);
