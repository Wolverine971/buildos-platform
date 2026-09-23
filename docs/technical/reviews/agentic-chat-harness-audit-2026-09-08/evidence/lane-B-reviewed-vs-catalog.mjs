// docs/technical/reviews/agentic-chat-harness-audit-2026-09-08/evidence/lane-B-reviewed-vs-catalog.mjs
const cat = await import(
	'/Users/djwayne/buildos-platform/packages/agentic-chat-runtime/dist/catalog/index.mjs'
);
const mc = await import(
	'/Users/djwayne/buildos-platform/apps/worker/src/workers/agentic-chat/mutations/tool-catalog.ts'
);
const SPECS = mc.AGENTIC_CHAT_REVIEWED_MUTATION_SPECS_V1;
const bytes = (t) => Buffer.byteLength(JSON.stringify(t), 'utf8');
const mounted = new Set([
	...cat.getGatewayDirectToolNamesForProfile('global'),
	...cat.getGatewayDirectToolNamesForProfile('project'),
	...cat.getGatewayDirectToolNamesForProfile('project_create')
]);
console.log(
	'tool | on surface | catalog props | reviewed props | dropped props | catalog desc B | override desc B'
);
for (const [name, spec] of Object.entries(SPECS)) {
	const def = cat.extractTools([name])[0];
	if (!def) {
		console.log(name, 'NO CATALOG DEF');
		continue;
	}
	const props = Object.keys(def.function.parameters.properties || {});
	const reviewed = new Set(spec.reviewedArgumentNames);
	const dropped = props.filter((p) => !reviewed.has(p));
	console.log(
		`${name.padEnd(26)} | ${mounted.has(name) ? 'YES' : 'no '} | ${String(props.length).padStart(2)} | ${String(reviewed.size).padStart(2)} | ${dropped.join(',') || '-'} | ${def.function.description.length} | ${spec.descriptionOverride ? spec.descriptionOverride.length : '-'}`
	);
}
console.log(
	'\nReviewed specs NOT on any surface:',
	Object.keys(SPECS)
		.filter((n) => !mounted.has(n))
		.join(', ')
);
console.log('\nCatalog write tools (TOOL_METADATA category=write) not reviewed and not deferred:');
const meta = cat.TOOL_METADATA;
const writes = Object.entries(meta)
	.filter(([, m]) => m.category === 'write')
	.map(([n]) => n);
console.log('write-signed total:', writes.length);
console.log('Read tools in catalog (non-write) that are NOT on any surface:');
const reads = Object.entries(meta)
	.filter(([, m]) => m.category !== 'write')
	.map(([n]) => n);
console.log(
	reads
		.filter((n) => !mounted.has(n) && !cat.GATEWAY_EMAIL_SURFACE_TOOL_NAMES.includes(n))
		.join(', ')
);
console.log(
	'count',
	reads.filter((n) => !mounted.has(n) && !cat.GATEWAY_EMAIL_SURFACE_TOOL_NAMES.includes(n))
		.length,
	'of',
	reads.length
);
