// docs/technical/reviews/agentic-chat-harness-audit-2026-09-08/evidence/lane-B-measure-catalog.mjs
// Lane B: serialized JSON bytes per tool per catalog surface, from the built dist (newer than every catalog source).
const m = await import(
	'/Users/djwayne/buildos-platform/packages/agentic-chat-runtime/dist/catalog/index.mjs'
);
const bytes = (t) => Buffer.byteLength(JSON.stringify(t), 'utf8');
const descBytes = (t) => Buffer.byteLength(t.function?.description ?? '', 'utf8');
const paramBytes = (t) => Buffer.byteLength(JSON.stringify(t.function?.parameters ?? {}), 'utf8');
const countProps = (t) => Object.keys(t.function?.parameters?.properties ?? {}).length;
const countReq = (t) => (t.function?.parameters?.required ?? []).length;
function countEnums(obj, acc = { n: 0, values: 0 }) {
	if (!obj || typeof obj !== 'object') return acc;
	if (Array.isArray(obj)) {
		obj.forEach((o) => countEnums(o, acc));
		return acc;
	}
	if (Array.isArray(obj.enum)) {
		acc.n++;
		acc.values += obj.enum.length;
	}
	for (const v of Object.values(obj)) countEnums(v, acc);
	return acc;
}
const all = new Map();
for (const p of ['global', 'project', 'project_create']) {
	const tools = m.getGatewaySurfaceForProfile(p);
	let total = 0;
	console.log(`\n=== catalog ${p} (${tools.length} tools) ===`);
	for (const t of tools) {
		const b = bytes(t);
		total += b;
		all.set(t.function.name, t);
		const e = countEnums(t.function.parameters);
		console.log(
			`${t.function.name.padEnd(34)} ${String(b).padStart(6)}B  desc=${String(descBytes(t)).padStart(5)}  params=${String(paramBytes(t)).padStart(5)}  props=${String(countProps(t)).padStart(2)}  req=${countReq(t)}  enums=${e.n}/${e.values}`
		);
	}
	console.log(`TOTAL ${total} bytes (sum of tools)`);
}
console.log('\n=== email group ===');
let et = 0;
for (const n of m.GATEWAY_EMAIL_SURFACE_TOOL_NAMES) {
	const t = m.extractTools([n])[0];
	const b = bytes(t);
	et += b;
	console.log(
		`${n.padEnd(34)} ${String(b).padStart(6)}B desc=${descBytes(t)} params=${paramBytes(t)} props=${countProps(t)} req=${countReq(t)}`
	);
}
console.log('EMAIL TOTAL', et);
console.log('\n=== full vocabulary ===');
for (const k of [
	'CHAT_TOOL_DEFINITIONS',
	'ONTOLOGY_READ_TOOLS',
	'ONTOLOGY_WRITE_TOOLS',
	'UTILITY_TOOL_DEFINITIONS',
	'CALENDAR_TOOL_DEFINITIONS',
	'EMAIL_TOOL_DEFINITIONS',
	'GATEWAY_TOOL_DEFINITIONS',
	'AGENTIC_CHAT_STANDARD_CONTROL_TOOL_DEFINITIONS_V1',
	'AGENTIC_CHAT_TOTAL_TOOL_VOCABULARY'
])
	console.log(k.padEnd(50), m[k].length, 'tools', bytes(m[k]), 'B');
