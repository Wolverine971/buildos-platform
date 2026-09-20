// docs/technical/reviews/agentic-chat-harness-audit-2026-09-08/evidence/lane-F-pull2.mjs
// Lane F second pull (2026-09-09): RPC payload size + latency, START HERE sizes
// vs the 2,400-char prompt excerpt, per-project task counts vs the 6-ref index
// cap, session summary presence, prepared-admission miss reasons from the
// request payload, and materialized-snapshot state. Read-only (select + STABLE
// RPC calls only).
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
const since = '2026-09-04T17:14:00.000Z';
const pct = (arr, p) => {
	if (!arr.length) return null;
	const s = [...arr].sort((a, b) => a - b);
	return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};
const count = (arr, f) =>
	arr.reduce((m, x) => {
		const k = f(x) ?? 'null';
		m[k] = (m[k] || 0) + 1;
		return m;
	}, {});
const out = {};

// 1. Turns in window: user ids, sessions, request_payload prepared lease metadata
const { data: turns, error: e1 } = await sb
	.from('chat_turn_runs')
	.select(
		'id,user_id,session_id,context_type,entity_id,started_at,prepared_prompt_hit,request_payload,history_strategy,raw_history_count,history_for_model_count'
	)
	.gte('started_at', since)
	.order('started_at', { ascending: false })
	.limit(200);
if (e1) throw e1;
const leaseMeta = turns.map((t) => t.request_payload?.preparedAdmissionLease ?? null);
out.prepared_admission_lease = {
	turns: turns.length,
	requested: count(leaseMeta, (m) => String(m?.requested)),
	hit: count(leaseMeta, (m) => String(m?.hit)),
	miss_reason: count(
		leaseMeta.filter((m) => m && !m.hit),
		(m) => m.missReason
	),
	inspection_ms: {
		p50: pct(
			leaseMeta.filter(Boolean).map((m) => m.inspectionMs ?? 0),
			0.5
		),
		p90: pct(
			leaseMeta.filter(Boolean).map((m) => m.inspectionMs ?? 0),
			0.9
		)
	},
	skill_preload: count(turns, (t) => t.request_payload?.skillPreload?.skillId ?? 'none')
};

// 2. Session summary presence for sessions with turns in window
const sessionIds = [...new Set(turns.map((t) => t.session_id).filter(Boolean))];
const { data: sessions } = await sb
	.from('chat_sessions')
	.select('id,summary,message_count,status,last_classified_at,created_at')
	.in('id', sessionIds);
out.sessions = {
	n: sessions?.length ?? 0,
	with_summary: (sessions ?? []).filter((s) => s.summary).length,
	status: count(sessions ?? [], (s) => s.status),
	message_count: {
		p50: pct(
			(sessions ?? []).map((s) => s.message_count ?? 0),
			0.5
		),
		max: Math.max(0, ...(sessions ?? []).map((s) => s.message_count ?? 0))
	}
};

// 3. RPC payload size + latency (DJ's user; global + 3 project ids from the window)
const userIds = count(turns, (t) => t.user_id);
const primaryUser = Object.entries(userIds).sort((a, b) => b[1] - a[1])[0][0];
out.primary_user_turn_share = userIds[primaryUser] / turns.length;
async function timeRpc(args) {
	const t0 = performance.now();
	const { data, error } = await sb.rpc('load_fastchat_context', args);
	const ms = Math.round(performance.now() - t0);
	if (error) return { ms, error: error.message };
	const json = JSON.stringify(data);
	const sizes = {};
	for (const [k, v] of Object.entries(data ?? {})) {
		sizes[k] = {
			chars: JSON.stringify(v).length,
			len: Array.isArray(v) ? v.length : undefined
		};
	}
	const pi = data?.project_intelligence ?? {};
	const piSizes = {};
	for (const [k, v] of Object.entries(pi))
		piSizes[k] = {
			chars: JSON.stringify(v).length,
			len: Array.isArray(v) ? v.length : undefined
		};
	return {
		ms,
		total_chars: json.length,
		top: sizes,
		project_intelligence: piSizes,
		pi_timezone: pi.timezone ?? null,
		pi_windows: pi.windows ?? null
	};
}
const rpcRuns = [];
for (let i = 0; i < 3; i++)
	rpcRuns.push(await timeRpc({ p_context_type: 'global', p_user_id: primaryUser }));
out.rpc_global = { runs_ms: rpcRuns.map((r) => r.ms), sample: rpcRuns[0] };
const projectIds = [
	...new Set(
		turns.filter((t) => t.context_type === 'project' && t.entity_id).map((t) => t.entity_id)
	)
].slice(0, 3);
out.rpc_project = [];
for (const pid of projectIds) {
	const runs = [];
	for (let i = 0; i < 2; i++)
		runs.push(
			await timeRpc({ p_context_type: 'project', p_user_id: primaryUser, p_project_id: pid })
		);
	out.rpc_project.push({ project_id: pid, runs_ms: runs.map((r) => r.ms), sample: runs[0] });
}
// invalidation token RPC latency
{
	const t0 = performance.now();
	const { data, error } = await sb.rpc('get_agentic_chat_context_invalidation_token', {
		p_context_type: 'global',
		p_user_id: primaryUser,
		p_project_id: null
	});
	out.invalidation_token_rpc = {
		ms: Math.round(performance.now() - t0),
		error: error?.message ?? null,
		token_len: typeof data === 'string' ? data.length : null
	};
}

// 4. START HERE document sizes for the primary user's projects vs 2,400 / 12,000 caps
const { data: actorRow } = await sb
	.from('onto_actors')
	.select('id')
	.eq('user_id', primaryUser)
	.maybeSingle();
const { data: memberRows } = await sb
	.from('onto_project_members')
	.select('project_id')
	.eq('actor_id', actorRow?.id ?? '00000000-0000-0000-0000-000000000000')
	.limit(500);
const memberProjectIds = [...new Set((memberRows ?? []).map((r) => r.project_id))];
const { data: startHereDocs } = await sb
	.from('onto_documents')
	.select('id,project_id,content,updated_at')
	.in('project_id', memberProjectIds)
	.eq('type_key', 'document.context.project')
	.is('deleted_at', null)
	.is('archived_at', null)
	.limit(500);
const shLens = (startHereDocs ?? []).map((d) => (d.content ?? '').length);
out.start_here = {
	projects_with_membership: memberProjectIds.length,
	docs: shLens.length,
	chars: { p50: pct(shLens, 0.5), p90: pct(shLens, 0.9), max: Math.max(0, ...shLens) },
	over_2400: shLens.filter((n) => n > 2400).length,
	over_12000: shLens.filter((n) => n > 12000).length
};

// 5. Per-project open task counts vs the 18-fetch / 6-index caps
const { data: taskRows } = await sb
	.from('onto_tasks')
	.select('project_id,state_key,due_at,completed_at,deleted_at')
	.in('project_id', memberProjectIds)
	.is('deleted_at', null)
	.limit(5000);
const byProject = {};
for (const t of taskRows ?? []) {
	const b = (byProject[t.project_id] ||= { total: 0, open: 0, open_undated: 0 });
	b.total += 1;
	const done =
		t.completed_at ||
		['done', 'completed', 'closed', 'archived', 'cancelled', 'canceled'].includes(
			String(t.state_key ?? '').toLowerCase()
		);
	if (!done) {
		b.open += 1;
		if (!t.due_at) b.open_undated += 1;
	}
}
const openCounts = Object.values(byProject).map((b) => b.open);
out.tasks_per_project = {
	projects_with_tasks: openCounts.length,
	open: { p50: pct(openCounts, 0.5), p90: pct(openCounts, 0.9), max: Math.max(0, ...openCounts) },
	projects_open_gt_6: openCounts.filter((n) => n > 6).length,
	projects_open_gt_18: openCounts.filter((n) => n > 18).length,
	open_undated_share: (() => {
		const o = Object.values(byProject).reduce((s, b) => s + b.open, 0);
		const u = Object.values(byProject).reduce((s, b) => s + b.open_undated, 0);
		return o ? +(u / o).toFixed(2) : null;
	})()
};

// 6. Materialized snapshots + prepared rows now
const { count: snapCount } = await sb
	.from('agentic_chat_context_snapshots')
	.select('user_id', { count: 'exact', head: true });
const { data: preparedRows } = await sb
	.from('agentic_chat_prepared_prompts')
	.select('id,created_at,consumed_at,expires_at,context_type')
	.gte('created_at', since)
	.order('created_at', { ascending: false })
	.limit(500);
out.materialized_snapshot_rows_now = snapCount;
out.prepared_rows = {
	n: preparedRows?.length ?? 0,
	consumed: (preparedRows ?? []).filter((r) => r.consumed_at).length,
	by_context: count(preparedRows ?? [], (r) => r.context_type)
};

// 7. Interrupted-turn / continuity-hint / skill-ledger rows in history (from artifacts)
const { data: arts } = await sb
	.from('chat_turn_input_artifacts')
	.select('turn_run_id,history')
	.gte('created_at', since)
	.limit(200);
const sysKinds = {};
let sysChars = 0;
let allChars = 0;
for (const a of arts ?? []) {
	for (const m of a.history ?? []) {
		allChars += (m.content ?? '').length;
		if (m.role !== 'system') continue;
		sysChars += (m.content ?? '').length;
		const c = m.content ?? '';
		const kind = c.startsWith('Conversation continuity hint')
			? 'continuity_hint'
			: c.startsWith('Conversation memory (compressed)')
				? 'compressed_memory'
				: c.startsWith('Previous interrupted assistant turn tool results')
					? 'interrupted_tool_receipts'
					: c.startsWith('Previously loaded skills')
						? 'loaded_skills_ledger'
						: c.includes('pending_turn_contract')
							? 'pending_contract'
							: c.slice(0, 40);
		sysKinds[kind] = (sysKinds[kind] || 0) + 1;
	}
}
out.history_system_rows = {
	kinds: sysKinds,
	system_chars_share: allChars ? +(sysChars / allChars).toFixed(2) : null,
	artifacts: arts?.length ?? 0
};

fs.writeFileSync(path.join(OUT, 'lane-F-evidence2.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
