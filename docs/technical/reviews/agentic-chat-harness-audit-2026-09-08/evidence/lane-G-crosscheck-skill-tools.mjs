// docs/technical/reviews/agentic-chat-harness-audit-2026-09-08/evidence/lane-G-crosscheck-skill-tools.mjs
// Cross-check each allowlisted skill's `## Related Tools` ops (and inline tool mentions)
// against the tools actually mounted on the worker global/project surfaces.
import { readFileSync, readdirSync } from 'node:fs';
const R = '/Users/djwayne/buildos-platform';
const reg = readFileSync(`${R}/packages/agentic-chat-runtime/src/catalog/registry.ts`, 'utf8');
const opToTool = {};
for (const m of reg.matchAll(/^\s*([a-z_]+): \{ op: '([a-z._]+)', kind: '(read|write|control)'/gm))
	opToTool[m[2]] = m[1];
const s = readFileSync(`${R}/packages/agentic-chat-runtime/src/catalog/surfaces.ts`, 'utf8');
const g = [
	...s
		.match(/const GLOBAL_DIRECT_TOOL_NAMES = \[([\s\S]*?)\] as const/)[1]
		.matchAll(/'([a-z_]+)'/g)
]
	.map((m) => m[1])
	.filter((n) => n !== 'declare_read_only_turn');
const pExtra = [
	...s
		.match(/const PROJECT_DIRECT_TOOL_NAMES = \[([\s\S]*?)\] as const/)[1]
		.matchAll(/^\s*'([a-z_]+)'/gm)
].map((m) => m[1]);
const p = [
	...g.filter(
		(n) => !['search_onto_projects', 'search_all_projects', 'create_onto_project'].includes(n)
	),
	...pExtra
];
const wp = readFileSync(`${R}/packages/agentic-chat-runtime/src/worker-tool-policy.ts`, 'utf8');
const execMut = [
	...wp
		.match(/EXECUTABLE_MUTATION_TOOL_NAMES_V1 = Object.freeze\(\[([\s\S]*?)\] as const\)/)[1]
		.matchAll(/'([a-z_]+)'/g)
].map((m) => m[1]);
const unavailable = [
	...wp
		.match(/UNAVAILABLE_TOOL_NAMES_V1 = Object.freeze\(\[([\s\S]*?)\] as const\)/)[1]
		.matchAll(/'([a-z_]+)'/g)
].map((m) => m[1]);
const defs = `${R}/apps/web/src/lib/services/agentic-chat/tools/skills/definitions`;
const ids = process.argv.slice(2);
for (const id of ids) {
	const md = readFileSync(`${defs}/${id}/SKILL.md`, 'utf8');
	const rel = md.split(/\n## Related Tools\n/)[1]?.split(/\n## /)[0] ?? '';
	const ops = [...rel.matchAll(/`([a-z._*]+)`/g)].map((m) => m[1]);
	const inlineTools = [
		...new Set(
			[
				...md.matchAll(
					/\b((?:create|update|list|get|search|move|delete|link|unlink|explore|read|set)_[a-z_]+)\(/g
				)
			].map((m) => m[1])
		)
	];
	const rows = ops.map((op) => {
		const tool = opToTool[op] ?? (op.includes('*') ? '(wildcard)' : '(no registry op)');
		const onGlobal = g.includes(tool),
			onProject = p.includes(tool);
		const status =
			onProject && onGlobal
				? 'mounted:both'
				: onProject
					? 'mounted:project'
					: onGlobal
						? 'mounted:global'
						: unavailable.includes(tool)
							? 'UNAVAILABLE-on-worker'
							: execMut.includes(tool)
								? 'executable-NOT-mounted'
								: 'NOT-mounted';
		return `${op} -> ${tool} [${status}]`;
	});
	const inl = inlineTools.map(
		(t) =>
			`${t} [${p.includes(t) && g.includes(t) ? 'both' : p.includes(t) ? 'project' : g.includes(t) ? 'global' : unavailable.includes(t) ? 'UNAVAILABLE' : 'NOT-mounted'}]`
	);
	const notMounted = rows.filter((r) => !r.includes('mounted:')).length;
	console.log(
		`\n== ${id}: ${ops.length} related ops, ${notMounted} not mounted on any worker surface`
	);
	rows.forEach((r) => console.log('   ' + r));
	console.log('   inline tool mentions: ' + (inl.join(', ') || 'none'));
}
