// Lane B: actual tool call outcomes across the four *runs.json battery artifacts (09-04 postdeploy + failed-cases)
const fs = require('fs');
const dir = '/Users/djwayne/buildos-platform/artifacts';
const files = fs.readdirSync(dir).filter((f) => f.endsWith('runs.json'));
const agg = new Map();
const errs = new Map();
let turns = 0;
const byCtx = {};
for (const f of files) {
	const d = JSON.parse(fs.readFileSync(dir + '/' + f, 'utf8'));
	for (const r of Array.isArray(d) ? d : []) {
		turns++;
		byCtx[r.context_type] = (byCtx[r.context_type] || 0) + 1;
		for (const o of r.tool_outcomes || []) {
			const e = agg.get(o.tool) || { calls: 0, fail: 0, ctx: new Set() };
			e.calls++;
			if (!o.success) e.fail++;
			e.ctx.add(r.context_type);
			agg.set(o.tool, e);
			if (!o.success && o.error) {
				const k = o.tool + ' :: ' + String(o.error).slice(0, 140);
				errs.set(k, (errs.get(k) || 0) + 1);
			}
		}
	}
}
console.log('files:', files.join(', '));
console.log('turns:', turns, JSON.stringify(byCtx));
console.log('\ntool                             calls fail contexts');
[...agg.entries()]
	.sort((a, b) => b[1].calls - a[1].calls)
	.forEach(([k, v]) =>
		console.log(
			k.padEnd(32),
			String(v.calls).padStart(4),
			String(v.fail).padStart(4),
			' ',
			[...v.ctx].join('/')
		)
	);
console.log('\nfailure messages:');
[...errs.entries()]
	.sort((a, b) => b[1] - a[1])
	.forEach(([k, v]) => console.log(String(v).padStart(3), k));
