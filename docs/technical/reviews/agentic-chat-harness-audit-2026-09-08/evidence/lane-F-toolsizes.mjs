// docs/technical/reviews/agentic-chat-harness-audit-2026-09-08/evidence/lane-F-toolsizes.mjs
// Raw tool-result sizes by tool name (last 14 days) vs the 6,000-char model
// payload guard in tool-payload-compaction.ts. Read-only.
import { createClient } from '/Users/djwayne/buildos-platform/apps/web/node_modules/@supabase/supabase-js/dist/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
const OUT = path.dirname(new URL(import.meta.url).pathname);
const env = Object.fromEntries(
	fs
		.readFileSync('/Users/djwayne/buildos-platform/apps/web/.env', 'utf8')
		.split('\n')
		.filter((l) => l.includes('=') && !l.trim().startsWith('#'))
		.map((l) => {
			const i = l.indexOf('=');
			return [
				l.slice(0, i).trim(),
				l
					.slice(i + 1)
					.trim()
					.replace(/^"|"$/g, '')
			];
		})
);
const sb = createClient(env.PUBLIC_SUPABASE_URL, env.PRIVATE_SUPABASE_SERVICE_KEY, {
	auth: { persistSession: false }
});
const since = new Date(Date.now() - 14 * 864e5).toISOString();
const pct = (arr, p) => {
	if (!arr.length) return null;
	const s = [...arr].sort((a, b) => a - b);
	return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};
const { data, error } = await sb
	.from('chat_tool_executions')
	.select('tool_name,success,result,created_at,turn_run_id')
	.gte('created_at', since)
	.order('created_at', { ascending: false })
	.limit(1500);
if (error) throw error;
const COMPACTED = new Set([
	'search_email_messages',
	'search_project',
	'search_all_projects',
	'search_ontology',
	'get_onto_document_details',
	'get_onto_project_details',
	'get_document_tree',
	'web_visit',
	'web_search',
	'list_onto_documents',
	'search_onto_documents'
]);
const byTool = {};
for (const row of data) {
	const len = JSON.stringify(row.result ?? null).length;
	const t = (byTool[row.tool_name] ||= { n: 0, sizes: [], over6k: 0, over3500content: 0 });
	t.n += 1;
	t.sizes.push(len);
	if (len > 6000) t.over6k += 1;
	if (row.tool_name === 'get_onto_document_details') {
		const c = row.result?.document?.content ?? row.result?.document?.props?.body_markdown;
		if (typeof c === 'string' && c.length > 3500) t.over3500content += 1;
	}
}
const rows = Object.entries(byTool)
	.map(([tool, t]) => ({
		tool,
		n: t.n,
		p50: pct(t.sizes, 0.5),
		p90: pct(t.sizes, 0.9),
		max: Math.max(...t.sizes),
		over6k: t.over6k,
		over6k_share: +(t.over6k / t.n).toFixed(2),
		has_compactor: COMPACTED.has(tool),
		over3500content: t.over3500content
	}))
	.sort((a, b) => b.over6k - a.over6k || b.n - a.n);
fs.writeFileSync(
	path.join(OUT, 'lane-F-toolsizes.json'),
	JSON.stringify({ since, executions: data.length, rows }, null, 2)
);
console.log('executions', data.length, 'since', since);
console.log(
	'tool'.padEnd(34),
	'n'.padStart(4),
	'p50'.padStart(7),
	'p90'.padStart(7),
	'max'.padStart(7),
	'>6k'.padStart(5),
	'share'.padStart(6),
	'compactor'
);
for (const r of rows)
	console.log(
		r.tool.padEnd(34),
		String(r.n).padStart(4),
		String(r.p50).padStart(7),
		String(r.p90).padStart(7),
		String(r.max).padStart(7),
		String(r.over6k).padStart(5),
		String(r.over6k_share).padStart(6),
		r.has_compactor ? 'yes' : 'NO',
		r.over3500content ? `content>3500: ${r.over3500content}` : ''
	);
