// docs/technical/reviews/agentic-chat-harness-audit-2026-09-08/evidence/lane-B-dump-top8.mjs
import { workerOpeningPass } from './lane-B-worker-surface.mjs';
const { admitted } = workerOpeningPass('project');
const names = [
	'get_project_overview',
	'list_onto_tasks',
	'search_project',
	'get_document_outline',
	'read_document_section',
	'create_onto_task',
	'update_onto_task',
	'update_onto_document'
];
for (const n of names) {
	const t = admitted.find((x) => x.function.name === n);
	if (!t) {
		console.log('MISSING', n);
		continue;
	}
	const p = t.function.parameters;
	const props = Object.entries(p.properties || {});
	const req = new Set(p.required || []);
	console.log(
		`\n##### ${n}  (${Buffer.byteLength(JSON.stringify(t))} B; ${props.length} props, ${req.size} required, ${props.length - req.size} optional)`
	);
	console.log('DESC:', t.function.description);
	for (const [k, s] of props) {
		const en = s.enum ? ` enum[${s.enum.length}]=${JSON.stringify(s.enum)}` : '';
		const fmt = s.format ? ` format=${s.format}` : '';
		const pat = s.pattern ? ` pattern=${s.pattern}` : '';
		const def = s.default !== undefined ? ` default=${JSON.stringify(s.default)}` : '';
		const ex = s.examples ? ` examples=${JSON.stringify(s.examples)}` : '';
		const nested =
			s.type === 'object' && s.properties
				? ` nested{${Object.keys(s.properties).join(',')}}`
				: '';
		const items = s.items ? ` items=${JSON.stringify(s.items).slice(0, 120)}` : '';
		console.log(
			`  ${req.has(k) ? '*' : ' '} ${k} : ${JSON.stringify(s.type)}${en}${fmt}${pat}${def}${ex}${nested}${items}`
		);
		if (s.description) console.log(`      "${s.description}"`);
	}
}
