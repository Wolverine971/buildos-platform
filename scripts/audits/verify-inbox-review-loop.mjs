// scripts/audits/verify-inbox-review-loop.mjs
// Read-only verification of the AI Inbox / Project Review loop audit baseline.
// See apps/web/docs/technical/audits/AI_INBOX_PROJECT_REVIEW_LOOP_AUDIT_2026-08-13.md
// and tasker/52-ai-inbox-review-loop-remediation.md.
//
// Usage: node scripts/audits/verify-inbox-review-loop.mjs
// Reads PUBLIC_SUPABASE_URL + PRIVATE_SUPABASE_SERVICE_KEY from apps/web/.env.
// SELECT-only; safe to re-run any time to refresh the workload baseline.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(new URL('../../apps/web/package.json', import.meta.url));
const { createClient } = require('@supabase/supabase-js');

const env = {};
for (const line of readFileSync(new URL('../../apps/web/.env', import.meta.url), 'utf8').split(
	'\n'
)) {
	const m = line.match(/^([A-Z_]+)=(.*)$/);
	if (m) env[m[1]] = m[2].replace(/^"|"$/g, '');
}
const supabase = createClient(env.PUBLIC_SUPABASE_URL, env.PRIVATE_SUPABASE_SERVICE_KEY);

// A. Unresolved workload by project (pending/deferred inbox rows for project suggestions)
const { data: inboxRows, error: e1 } = await supabase
	.from('inbox_items')
	.select('id, project_id, status, source_ref_id')
	.eq('source_type', 'project_suggestion')
	.eq('audience', 'project_members')
	.in('status', ['pending', 'deferred'])
	.limit(1000);
if (e1) throw e1;

const byProject = {};
for (const r of inboxRows) {
	byProject[r.project_id] ??= { pending: 0, deferred: 0 };
	byProject[r.project_id][r.status]++;
}
const projectIds = Object.keys(byProject);
const { data: projects } = await supabase
	.from('onto_projects')
	.select('id, name')
	.in('id', projectIds);
const nameOf = Object.fromEntries((projects ?? []).map((p) => [p.id, p.name]));
console.log('=== A. Unresolved workload by project ===');
let tp = 0;
let td = 0;
for (const [pid, c] of Object.entries(byProject)) {
	console.log(
		`${nameOf[pid] ?? pid}: pending=${c.pending} deferred=${c.deferred} total=${c.pending + c.deferred}`
	);
	tp += c.pending;
	td += c.deferred;
}
console.log(`TOTAL: pending=${tp} deferred=${td} total=${tp + td}`);

// B. Composition of visible (pending) queue: kind + executable ops
const pendingRefs = inboxRows.filter((r) => r.status === 'pending').map((r) => r.source_ref_id);
const { data: pendingSugs, error: e2 } = await supabase
	.from('project_suggestions')
	.select('id, kind, operations, title, status')
	.in('id', pendingRefs);
if (e2) throw e2;
console.log('\n=== B. Visible queue composition ===');
const kinds = {};
let zeroOps = 0;
for (const s of pendingSugs) {
	kinds[s.kind] = (kinds[s.kind] ?? 0) + 1;
	const ops = Array.isArray(s.operations) ? s.operations : [];
	if (ops.length === 0) zeroOps++;
}
console.log(kinds, `zero-ops: ${zeroOps}/${pendingSugs.length}`);

// C. The mismatched Instagram/Mood Board proposal
const { data: mood, error: e3 } = await supabase
	.from('project_suggestions')
	.select('id, title, kind, status, preview, operations')
	.ilike('title', '%Mood Board Carousel%')
	.limit(5);
if (e3) throw e3;
const { data: moodInbox, error: e3b } = await supabase
	.from('inbox_items')
	.select('source_ref_id, status, source_status, blocked_reason')
	.eq('source_type', 'project_suggestion')
	.in(
		'source_ref_id',
		(mood ?? []).map((suggestion) => suggestion.id)
	);
if (e3b) throw e3b;
const moodInboxBySuggestion = new Map((moodInbox ?? []).map((row) => [row.source_ref_id, row]));
console.log('\n=== C. Mood Board Carousel proposal(s) ===');
for (const s of mood) {
	const inbox = moodInboxBySuggestion.get(s.id);
	console.log(
		`- [suggestion=${s.status}; inbox=${inbox?.status ?? 'missing'}; source_status=${inbox?.source_status ?? 'missing'}] ${s.title}`
	);
	console.log(`  preview: ${JSON.stringify(s.preview)?.slice(0, 400)}`);
	const ops = Array.isArray(s.operations) ? s.operations : [];
	for (const op of ops) {
		console.log(
			`  op: tool=${op.tool} label=${JSON.stringify(op.label)} args=${JSON.stringify(op.args)?.slice(0, 300)}`
		);
	}
	// Resolve any doc IDs in op args
	const ids = new Set();
	for (const op of ops) {
		const a = op.args ?? {};
		for (const k of ['document_id', 'id', 'new_parent_id', 'target_id', 'doc_id']) {
			if (typeof a[k] === 'string' && a[k].length > 20) ids.add(a[k]);
		}
	}
	if (ids.size) {
		const { data: docs } = await supabase
			.from('onto_documents')
			.select('id, title')
			.in('id', [...ids]);
		for (const d of docs ?? [])
			console.log(`  resolved doc ${d.id.slice(0, 8)}… -> "${d.title}"`);
	}
}

// D. August generation vs consumption (all projects)
const { data: augSugs, error: e4 } = await supabase
	.from('project_suggestions')
	.select('id, kind, status, operations')
	.gte('created_at', '2026-08-01T00:00:00Z')
	.limit(2000);
if (e4) throw e4;
console.log('\n=== D. Since Aug 1 (all projects) ===');
const st = {};
const kd = {};
let zo = 0;
for (const s of augSugs) {
	st[s.status] = (st[s.status] ?? 0) + 1;
	kd[s.kind] = (kd[s.kind] ?? 0) + 1;
	if (!Array.isArray(s.operations) || s.operations.length === 0) zo++;
}
console.log('total:', augSugs.length, 'status:', st, 'kinds:', kd, 'zero-ops:', zo);
