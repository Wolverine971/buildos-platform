// docs/technical/reviews/agentic-chat-harness-audit-2026-09-08/evidence/analyze-h.mjs
// Lane H analysis over the raw scratchpad pull (pull-h-raw.mjs). Reads only local JSON.
// Writes anonymized aggregates + per-turn rows into this evidence directory. No message text,
// emails, or keys are written; turn ids are truncated to 8 chars.
import fs from 'node:fs';
import path from 'node:path';
const RAW = process.env.RAW_DIR;
const OUT = path.dirname(new URL(import.meta.url).pathname);
const L = (n) => JSON.parse(fs.readFileSync(path.join(RAW, n + '.json'), 'utf8'));
const turns = L('turns'),
	usage = L('usage'),
	tools = L('tools'),
	events = L('events'),
	obs = L('obs'),
	snaps = L('snaps'),
	msgs = L('messages'),
	jobs = L('jobs'),
	userClass = L('user-class');
const count = (a, f) =>
	a.reduce((m, x) => {
		const k = f(x) ?? 'null';
		m[k] = (m[k] || 0) + 1;
		return m;
	}, {});
const pct = (a, p) => {
	if (!a.length) return null;
	const s = [...a].sort((x, y) => x - y);
	return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};
const stats = (a, d = 1) => ({
	n: a.length,
	p50: r(pct(a, 0.5), d),
	p90: r(pct(a, 0.9), d),
	max: r(pct(a, 1), d),
	sum: r(
		a.reduce((x, y) => x + y, 0),
		d
	)
});
const r = (v, d = 1) => (v == null ? null : Number(Number(v).toFixed(d)));
const short = (id) => (id || '').slice(0, 8);
// strip quoted strings and uuids from validator messages so no user-supplied text lands in evidence
const scrub = (v) =>
	v
		.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/g, '<uuid>')
		.replace(/"[^"]*"/g, '"…"')
		.replace(/“[^”]*”/g, '“…”');

// cohorts: 09-04 battery turn ids come from artifacts/agentic-chat-postdeploy-6d787284c-runs.json
const battery = new Set(
	JSON.parse(
		fs.readFileSync(
			'/Users/djwayne/buildos-platform/artifacts/agentic-chat-postdeploy-6d787284c-runs.json',
			'utf8'
		)
	).map((x) => x.id)
);
const QA_PROJECTS = new Set([
	'5e97b8d7-d7f2-43e8-8382-da5915b96f86',
	'e256363c-2da0-4313-abaf-fea4fcc6da87'
]);
const QA_SESSIONS = new Set([
	'913bcb29-b30d-4b79-b4c2-15a00db606db',
	'ea16b253-42c9-4435-84c4-00b9cdbff99d'
]);
function cohort(t) {
	const at = t.started_at;
	if (at >= '2026-09-04T17:14' && at < '2026-09-04T17:40') return 'battery_A_0904';
	if (at >= '2026-09-04T20:30' && at < '2026-09-04T21:00') return 'battery_B_0904';
	if (at >= '2026-09-05T00:30' && at < '2026-09-05T01:00') return 'battery_C_0905';
	if (at >= '2026-09-05T18:00' && at < '2026-09-05T19:00') return 'book_qa_0905';
	if (QA_SESSIONS.has(t.session_id)) return 'research_qa_0908';
	return 'organic';
}
// Neutral scenario keys for the three battery replays (derived from message prefix; label only)
const SCENARIOS = [
	['S01 project-create (general chat)', /^Create a construction project named/],
	['S01b project-create follow-up', /^This is a NEW project creation/],
	['S10 calendar availability read', /^Calendar test: read my connected calendar/],
	['S11 DST draft validation (read-only)', /^Validate these calendar drafts only/],
	['S02 five-task batch', /^In this project create exactly these five tasks/],
	['S02b recover failed batch', /^Recover from the failed response/],
	['S02c three dependencies', /^The five tasks now exist/],
	[
		'S07 exact document create',
		/^Create a project document titled "QA — Cedar House Marketing Brief"/
	],
	[
		'S08 selective document edit',
		/^Update the existing "QA — Cedar House Marketing Brief" in place/
	],
	['S08b document edit retry', /^Please complete those exact three document edits/],
	['S03 duplicate prevention', /^Add "QA — Order kitchen cabinets"/],
	['S04 narrow task update', /^Change only the existing "QA — Order kitchen cabinets" task/],
	['S04b task update by id', /^Update exactly task ID/],
	['S05 ambiguous inspection move', /^Move the inspection to October 5/],
	['S09 hostile note storage', /^Create a document titled "QA — Contractor Note"/],
	['S09b hostile note summary', /^Summarize this supplier note/],
	['S06 prerequisite/date conflict', /^Leave both dates unchanged/],
	['S13 fresh-chat saved facts', /^Find the project "\[QA/],
	['S14 grounded owner report', /^Give a brief owner status report/],
	['S04c task update record', /^Use the project record named/]
];
function scenario(t) {
	for (const [k, re] of SCENARIOS) if (re.test(t.request_message || '')) return k;
	return null;
}

const CONTROL = new Set([
	'declare_turn_contract',
	'approve_mutation_batch_review',
	'approve_turn_contract_review',
	'request_proposal_revision',
	'declare_read_only_turn',
	'approve_read_only_turn_review',
	'request_turn_clarification',
	'cancel_turn_contract'
]);
const REVIEWER_TOOLS = new Set([
	'approve_mutation_batch_review',
	'approve_turn_contract_review',
	'request_proposal_revision',
	'approve_read_only_turn_review'
]);
const usageBy = {},
	toolsBy = {},
	eventsBy = {},
	obsBy = {};
for (const u of usage) (usageBy[u.turn_run_id] ||= []).push(u);
for (const t of tools) (toolsBy[t.turn_run_id] ||= []).push(t);
for (const e of events) (eventsBy[e.turn_run_id] ||= []).push(e);
for (const o of obs) (obsBy[o.turn_run_id] ||= []).push(o);
const msgById = Object.fromEntries(msgs.map((m) => [m.id, m]));
const isReviewer = (u) => u.metadata?.routeId === 'openrouter_semantic_reviewer';

const rows = turns.map((t) => {
	const us = (usageBy[t.id] || []).sort((a, b) =>
		String(a.request_started_at).localeCompare(String(b.request_started_at))
	);
	const ts = (toolsBy[t.id] || []).sort(
		(a, b) => (a.sequence_index ?? 0) - (b.sequence_index ?? 0)
	);
	const ev = eventsBy[t.id] || [];
	const ob = obsBy[t.id] || [];
	const timing = ev.find((e) => e.event_type === 'timing')?.payload?.timing?.phases || {};
	const done = ev.find((e) => e.event_type === 'done')?.payload || {};
	const acting = us.filter((u) => !isReviewer(u));
	const reviewer = us.filter((u) => isReviewer(u) && u.metadata?.passRole !== 'research_review');
	const research = us.filter(
		(u) => u.metadata?.passRole === 'research_review' || /web_search|web_visit/.test('')
	);
	const researchTools = ts.filter((x) => /^web_(search|visit)$/.test(x.tool_name));
	const ok = us.filter((u) => u.status === 'success');
	const firstActing = acting.find(
		(u) => u.status === 'success' && u.metadata?.passRole === 'acting'
	);
	const writes = ts.filter((x) => x.tool_category === 'ontology_action' || x.effect_id);
	const writeOk = writes.filter((x) => x.success);
	const controls = ts.filter((x) => CONTROL.has(x.tool_name));
	const reads = ts.filter(
		(x) => !CONTROL.has(x.tool_name) && !(x.tool_category === 'ontology_action' || x.effect_id)
	);
	const clar = ts.filter((x) => x.tool_name === 'request_turn_clarification' && x.success).length;
	const declared = ts.some((x) => x.tool_name === 'declare_turn_contract');
	let cls;
	if (t.status === 'cancelled') cls = 'cancelled';
	else if (writeOk.length && (reviewer.length || declared)) cls = 'contract_write';
	else if (writeOk.length) cls = 'direct_write';
	else if (clar) cls = 'clarification';
	else if (declared || reviewer.length) cls = 'write_attempt_no_mutation';
	else if (researchTools.length) cls = 'research';
	else cls = 'read_only';
	const um = msgById[t.user_message_id]?.metadata || {};
	const am = msgById[t.assistant_message_id] || null;
	const passRoles = count(us, (u) => u.metadata?.passRole);
	const providerFail = ob.filter(
		(o) => o.event_type === 'provider_attempt_ended' && o.payload.status === 'failure'
	);
	const retries = ob.filter(
		(o) => o.event_type === 'provider_attempt_ended' && o.payload.attempt_kind === 'retry'
	);
	const dur =
		t.finished_at && t.started_at
			? (new Date(t.finished_at) - new Date(t.started_at)) / 1000
			: null;
	const toolCallEvents = ev.filter((e) => e.event_type === 'tool_call').length;
	const answerLen = am?.content?.length ?? null;
	const refusalHeur = am
		? /\b(can(?:')?t|cannot|unable to|not able to|isn(?:')?t available|unavailable|no access|don(?:')?t have access)\b/i.test(
				am.content
			)
		: null;
	return {
		id: short(t.id),
		full_id: t.id,
		started_at: t.started_at,
		day: t.started_at.slice(0, 10),
		cohort: cohort(t),
		scenario: scenario(t),
		user: userClass[t.user_id],
		ctx: t.context_type,
		surface: t.prepared_surface_profile,
		status: t.status,
		failure_code: t.failure_code,
		finished_reason: t.finished_reason,
		cls,
		passes: t.llm_pass_count,
		rounds: t.tool_round_count,
		tool_calls: t.tool_call_count,
		tool_rows: ts.length,
		tool_call_events: toolCallEvents,
		vfail: t.validation_failure_count,
		dur_s: r(dur),
		total_ms: r(timing.total_request_ms, 0),
		ttfr_ms: r(timing.time_to_first_response_ms, 0),
		queue_ms: r(timing.queue_wait_ms, 0),
		auth_to_finish_ms: r(timing.provider_authority_to_finish_ms, 0),
		calls: us.length,
		calls_ok: ok.length,
		calls_failed: us.length - ok.length,
		acting_calls: acting.length,
		reviewer_calls: reviewer.length,
		pass_roles: passRoles,
		provider_failures: providerFail.length,
		retries: retries.length,
		provider_fail_routes: count(
			providerFail,
			(o) => `${o.payload.route_id}:${o.payload.pass_role}:${o.payload.error_class}`
		),
		prompt_first: firstActing?.prompt_tokens ?? null,
		prompt_total: us.reduce((a, u) => a + (u.prompt_tokens || 0), 0),
		prompt_ok: ok.reduce((a, u) => a + (u.prompt_tokens || 0), 0),
		cached_total: us.reduce((a, u) => a + (u.cached_prompt_tokens || 0), 0),
		completion_total: us.reduce((a, u) => a + (u.completion_tokens || 0), 0),
		reasoning_total: us.reduce((a, u) => a + (u.reasoning_tokens || 0), 0),
		cost: r(
			us.reduce((a, u) => a + Number(u.total_cost_usd || 0), 0),
			5
		),
		reviewer_cost: r(
			reviewer.reduce((a, u) => a + Number(u.total_cost_usd || 0), 0),
			5
		),
		acting_cost: r(
			acting.reduce((a, u) => a + Number(u.total_cost_usd || 0), 0),
			5
		),
		reviewer_ms: reviewer.map((u) => u.response_time_ms),
		model_ms_sum: r(
			us.reduce((a, u) => a + (u.response_time_ms || 0), 0),
			0
		),
		tools: ts.map((x) => x.tool_name + (x.success ? '' : '!')),
		controls: controls.length,
		writes: writes.length,
		writes_ok: writeOk.length,
		reads: reads.length,
		clarifications: clar,
		tool_failures: ts
			.filter((x) => !x.success)
			.map((x) => ({
				tool: x.tool_name,
				err: scrub(String(x.error_message || '')).slice(0, 160)
			})),
		skill_preload: um.skill_preloaded_id
			? `${um.skill_preloaded_id}:${um.skill_preload_source}`
			: null,
		prepared_hit: t.prepared_prompt_hit,
		history: `${t.history_strategy}:${t.history_for_model_count}/${t.raw_history_count}`,
		answer_source: done.answer_source ?? null,
		completion_status: done.completion_status ?? null,
		answer_chars: answerLen,
		refusal_heuristic: refusalHeur,
		has_snapshot: snaps.some((s) => s.turn_run_id === t.id),
		providers: count(us, (u) => u.provider),
		models: count(us, (u) => u.model_used)
	};
});

// ---------- (1) turns by cohort/ctx/status ----------
const S = {};
S.window = {
	since: '2026-09-04T17:14:00Z',
	pulled_at: new Date().toISOString(),
	turns: rows.length,
	users: count(rows, (x) => x.user),
	by_day: count(rows, (x) => x.day)
};
S.by_cohort = count(rows, (x) => x.cohort);
S.by_cohort_ctx = count(rows, (x) => `${x.cohort}|${x.ctx}`);
S.by_ctx = count(rows, (x) => x.ctx);
S.by_status = count(rows, (x) => x.status);
S.by_cohort_status = count(rows, (x) => `${x.cohort}|${x.status}`);
S.by_failure_code = count(
	rows.filter((x) => x.failure_code),
	(x) => x.failure_code
);
S.by_finished_reason = count(rows, (x) => x.finished_reason);
S.by_class = count(rows, (x) => x.cls);
S.by_cohort_class = count(rows, (x) => `${x.cohort}|${x.cls}`);
S.failing_turns = rows
	.filter((x) => x.status !== 'completed')
	.map((x) => ({
		id: x.id,
		day: x.started_at.slice(0, 16),
		cohort: x.cohort,
		ctx: x.ctx,
		status: x.status,
		failure_code: x.failure_code,
		passes: x.passes,
		calls: x.calls,
		rounds: x.rounds,
		dur_s: x.dur_s,
		cost: x.cost,
		tools: x.tools,
		pass_roles: x.pass_roles,
		tool_failures: x.tool_failures,
		provider_fail_routes: x.provider_fail_routes
	}));

// ---------- (2) per class percentiles (completed turns) ----------
const completed = rows.filter((x) => x.status === 'completed');
S.per_class = {};
for (const cls of [
	'read_only',
	'direct_write',
	'contract_write',
	'clarification',
	'research',
	'write_attempt_no_mutation',
	'ALL_COMPLETED'
]) {
	const g = cls === 'ALL_COMPLETED' ? completed : completed.filter((x) => x.cls === cls);
	if (!g.length) continue;
	S.per_class[cls] = {
		n: g.length,
		model_calls: stats(
			g.map((x) => x.calls),
			0
		),
		reviewer_calls: stats(
			g.map((x) => x.reviewer_calls),
			0
		),
		control_rounds: stats(
			g.map((x) => x.controls),
			0
		),
		tool_rounds: stats(
			g.map((x) => x.rounds),
			0
		),
		tool_execs: stats(
			g.map((x) => x.tool_rows),
			0
		),
		passes_col: stats(
			g.map((x) => x.passes),
			0
		),
		prompt_first: stats(
			g.map((x) => x.prompt_first).filter((v) => v != null),
			0
		),
		prompt_total: stats(
			g.map((x) => x.prompt_total),
			0
		),
		cached_total: stats(
			g.map((x) => x.cached_total),
			0
		),
		cached_share: r(
			g.reduce((a, x) => a + x.cached_total, 0) /
				Math.max(
					1,
					g.reduce((a, x) => a + x.prompt_total, 0)
				),
			3
		),
		completion_total: stats(
			g.map((x) => x.completion_total),
			0
		),
		reasoning_total: stats(
			g.map((x) => x.reasoning_total),
			0
		),
		cost: stats(
			g.map((x) => x.cost),
			4
		),
		reviewer_cost_share: r(
			g.reduce((a, x) => a + x.reviewer_cost, 0) /
				Math.max(
					1e-9,
					g.reduce((a, x) => a + x.cost, 0)
				),
			3
		),
		wall_s: stats(
			g.map((x) => x.total_ms / 1000).filter((v) => v > 0),
			1
		),
		ttfr_s: stats(
			g.map((x) => x.ttfr_ms / 1000).filter((v) => v > 0),
			1
		),
		model_ms_share: r(
			g.reduce((a, x) => a + x.model_ms_sum, 0) /
				Math.max(
					1,
					g.reduce((a, x) => a + x.total_ms, 0)
				),
			3
		)
	};
}
S.per_cohort = {};
for (const c of [
	'battery_A_0904',
	'battery_B_0904',
	'battery_C_0905',
	'book_qa_0905',
	'research_qa_0908',
	'organic'
]) {
	const g = rows.filter((x) => x.cohort === c);
	const gc = g.filter((x) => x.status === 'completed');
	S.per_cohort[c] = {
		turns: g.length,
		completed: gc.length,
		failed: g.filter((x) => x.status === 'failed').length,
		cancelled: g.filter((x) => x.status === 'cancelled').length,
		by_class: count(g, (x) => x.cls),
		cost: stats(
			g.map((x) => x.cost),
			4
		),
		wall_s: stats(
			gc.map((x) => x.total_ms / 1000),
			1
		),
		calls: stats(
			g.map((x) => x.calls),
			0
		),
		prompt_total: stats(
			g.map((x) => x.prompt_total),
			0
		)
	};
}

// ---------- (3) reviewer ----------
const rev = usage.filter(isReviewer);
const revOk = rev.filter((u) => u.status === 'success');
S.reviewer = {
	calls: rev.length,
	failed_calls: rev.length - revOk.length,
	turns_with_reviewer: new Set(rev.map((u) => u.turn_run_id)).size,
	calls_per_turn: count(Object.values(count(rev, (u) => u.turn_run_id)), (v) => v),
	by_pass_role: count(rev, (u) => u.metadata?.passRole),
	by_provider: count(rev, (u) => u.provider),
	prompt_tokens: stats(
		rev.map((u) => u.prompt_tokens),
		0
	),
	cached_tokens: stats(
		rev.map((u) => u.cached_prompt_tokens),
		0
	),
	token_cache_share: r(
		rev.reduce((a, u) => a + u.cached_prompt_tokens, 0) /
			Math.max(
				1,
				rev.reduce((a, u) => a + u.prompt_tokens, 0)
			),
		3
	),
	call_hit_share: r(
		rev.filter((u) => u.cached_prompt_tokens > 0).length / Math.max(1, rev.length),
		3
	),
	cached_share_when_hit: stats(
		rev
			.filter((u) => u.cached_prompt_tokens > 0)
			.map((u) => u.cached_prompt_tokens / u.prompt_tokens),
		3
	),
	completion_tokens: stats(
		rev.map((u) => u.completion_tokens),
		0
	),
	reasoning_tokens: stats(
		rev.map((u) => u.reasoning_tokens),
		0
	),
	latency_ms: stats(
		rev.map((u) => u.response_time_ms),
		0
	),
	cost: r(
		rev.reduce((a, u) => a + Number(u.total_cost_usd), 0),
		4
	),
	total_cost: r(
		usage.reduce((a, u) => a + Number(u.total_cost_usd), 0),
		4
	),
	spend_share: r(
		rev.reduce((a, u) => a + Number(u.total_cost_usd), 0) /
			usage.reduce((a, u) => a + Number(u.total_cost_usd), 0),
		3
	),
	decisions: count(
		tools.filter((x) => REVIEWER_TOOLS.has(x.tool_name)),
		(x) => x.tool_name + (x.success ? '' : '!FAIL')
	),
	cost_per_call: stats(
		rev.map((u) => Number(u.total_cost_usd)),
		5
	)
};
const act = usage.filter((u) => !isReviewer(u));
S.acting = {
	calls: act.length,
	failed_calls: act.filter((u) => u.status !== 'success').length,
	by_pass_role: count(act, (u) => u.metadata?.passRole),
	by_provider: count(act, (u) => u.provider),
	by_model: count(act, (u) => u.model_used),
	failed_by_provider: count(
		act.filter((u) => u.status !== 'success'),
		(u) => `${u.provider}|${(u.error_message || '').slice(0, 90)}`
	),
	provider_cache_share: Object.fromEntries(
		Object.entries(
			act.reduce((m, u) => {
				const k = u.provider || 'null';
				const o = (m[k] ||= { p: 0, c: 0, n: 0, ms: [], cost: 0 });
				o.p += u.prompt_tokens;
				o.c += u.cached_prompt_tokens;
				o.n++;
				o.ms.push(u.response_time_ms);
				o.cost += Number(u.total_cost_usd);
				return m;
			}, {})
		).map(([k, o]) => [
			k,
			{
				calls: o.n,
				cached_share: r(o.c / Math.max(1, o.p), 3),
				ms_p50: pct(o.ms, 0.5),
				ms_p90: pct(o.ms, 0.9),
				cost: r(o.cost, 4)
			}
		])
	),
	prompt_tokens: stats(
		act.map((u) => u.prompt_tokens),
		0
	),
	latency_ms: stats(
		act.filter((u) => u.status === 'success').map((u) => u.response_time_ms),
		0
	),
	cost: r(
		act.reduce((a, u) => a + Number(u.total_cost_usd), 0),
		4
	),
	cache_share: r(
		act.reduce((a, u) => a + u.cached_prompt_tokens, 0) /
			Math.max(
				1,
				act.reduce((a, u) => a + u.prompt_tokens, 0)
			),
		3
	),
	tokens_wasted_on_failed_calls: act
		.filter((u) => u.status !== 'success')
		.reduce((a, u) => a + (u.prompt_tokens || 0), 0),
	cost_on_failed_calls: r(
		act
			.filter((u) => u.status !== 'success')
			.reduce((a, u) => a + Number(u.total_cost_usd || 0), 0),
		4
	)
};
S.by_pass_role_all = Object.fromEntries(
	Object.entries(count(usage, (u) => u.metadata?.passRole)).map(([k, n]) => {
		const g = usage.filter((u) => u.metadata?.passRole === k);
		return [
			k,
			{
				calls: n,
				prompt: g.reduce((a, u) => a + u.prompt_tokens, 0),
				cost: r(
					g.reduce((a, u) => a + Number(u.total_cost_usd), 0),
					4
				),
				ms_p50: pct(
					g.map((u) => u.response_time_ms),
					0.5
				),
				routes: count(g, (u) => u.metadata.routeId)
			}
		];
	})
);

// ---------- (4) prompt snapshots ----------
S.snapshots = snaps.map((s) => {
	const t = turns.find((x) => x.id === s.turn_run_id);
	const tds = Array.isArray(s.tool_definitions) ? s.tool_definitions : [];
	const toolSizes = tds
		.map((td) => {
			const f = td.function || td;
			return [f.name, JSON.stringify(td).length];
		})
		.sort((a, b) => b[1] - a[1]);
	const mm = Array.isArray(s.model_messages) ? s.model_messages : [];
	const sections =
		s.prompt_sections && typeof s.prompt_sections === 'object'
			? Object.fromEntries(
					Object.entries(s.prompt_sections).map(([k, v]) => [
						k,
						typeof v === 'string' ? v.length : JSON.stringify(v ?? '').length
					])
				)
			: null;
	const sysMsgsAfterHistory = mm.map((m, i) => ({
		i,
		role: m.role,
		chars:
			typeof m.content === 'string'
				? m.content.length
				: JSON.stringify(m.content ?? '').length,
		head:
			typeof m.content === 'string' && m.role === 'system' && i > 0
				? m.content.slice(0, 40)
				: undefined
	}));
	return {
		turn: short(s.turn_run_id),
		ctx: t?.context_type,
		cls: rows.find((x) => x.full_id === s.turn_run_id)?.cls,
		variant: s.prompt_variant,
		version: s.snapshot_version,
		system_chars: s.system_prompt_chars,
		message_chars: s.message_chars,
		approx_tokens: s.approx_prompt_tokens,
		tool_count: tds.length,
		tools_chars: toolSizes.reduce((a, x) => a + x[1], 0),
		tools: toolSizes,
		sections,
		messages: sysMsgsAfterHistory
	};
});
S.snapshot_by_ctx = {};
for (const ctx of ['global', 'project', 'project_create']) {
	const g = S.snapshots.filter((s) => s.ctx === ctx);
	if (!g.length) continue;
	const secAgg = {};
	for (const s of g)
		for (const [k, v] of Object.entries(s.sections || {})) (secAgg[k] ||= []).push(v);
	const toolAgg = {};
	for (const s of g) for (const [k, v] of s.tools) (toolAgg[k] ||= []).push(v);
	S.snapshot_by_ctx[ctx] = {
		n: g.length,
		system_chars: stats(
			g.map((s) => s.system_chars),
			0
		),
		tools_chars: stats(
			g.map((s) => s.tools_chars),
			0
		),
		tool_count: count(g, (s) => s.tool_count),
		approx_tokens: stats(g.map((s) => s.approx_tokens).filter(Boolean), 0),
		message_chars: stats(
			g.map((s) => s.message_chars),
			0
		),
		sections: Object.fromEntries(
			Object.entries(secAgg).map(([k, a]) => [
				k,
				{ n: a.length, p50: pct(a, 0.5), max: pct(a, 1) }
			])
		),
		tools: Object.fromEntries(
			Object.entries(toolAgg)
				.map(([k, a]) => [k, { n: a.length, chars: pct(a, 0.5) }])
				.sort((a, b) => b[1].chars - a[1].chars)
		),
		system_msgs_after_history: count(
			g.flatMap((s) => s.messages.filter((m) => m.role === 'system' && m.i > 0)),
			(m) => `${m.head}`
		)
	};
}

// per-section sizes (prompt_sections.sections is an array of {id, chars}) and estimator vs billed pass-1 tokens
S.snapshot_sections_by_ctx = {};
S.prompt_estimator = { rows: [] };
for (const sn of snaps) {
	const row = rows.find((x) => x.full_id === sn.turn_run_id);
	const ctx = row?.ctx ?? 'unknown';
	const per = (S.snapshot_sections_by_ctx[ctx] ||= {});
	for (const sec of Array.isArray(sn.prompt_sections?.sections)
		? sn.prompt_sections.sections
		: [])
		(per[sec.id] ||= []).push(sec.chars);
	const first = (usageBy[sn.turn_run_id] || [])
		.filter((u) => u.status === 'success' && u.metadata?.passRole === 'acting')
		.sort((a, b) =>
			String(a.request_started_at).localeCompare(String(b.request_started_at))
		)[0];
	if (first)
		S.prompt_estimator.rows.push({
			turn: short(sn.turn_run_id),
			ctx,
			approx_prompt_tokens: sn.approx_prompt_tokens,
			context_usage_estimate: sn.prompt_sections?.context_usage?.estimatedTokens ?? null,
			token_budget: sn.prompt_sections?.context_usage?.tokenBudget ?? null,
			billed_pass1_prompt_tokens: first.prompt_tokens,
			system_chars: sn.system_prompt_chars,
			tools_chars: JSON.stringify(sn.tool_definitions ?? []).length,
			message_chars: sn.message_chars,
			tool_schema_share_of_pass1: r(
				JSON.stringify(sn.tool_definitions ?? []).length / 4 / first.prompt_tokens,
				3
			)
		});
}
for (const [ctx, per] of Object.entries(S.snapshot_sections_by_ctx))
	S.snapshot_sections_by_ctx[ctx] = Object.fromEntries(
		Object.entries(per).map(([k, a]) => [k, { n: a.length, p50: pct(a, 0.5), max: pct(a, 1) }])
	);
S.prompt_estimator.summary = Object.fromEntries(
	['global', 'project'].map((ctx) => {
		const g = S.prompt_estimator.rows.filter((x) => x.ctx === ctx);
		return [
			ctx,
			{
				n: g.length,
				approx_p50: pct(
					g.map((x) => x.approx_prompt_tokens),
					0.5
				),
				context_estimate_p50: pct(
					g.map((x) => x.context_usage_estimate).filter((v) => v != null),
					0.5
				),
				billed_pass1_p50: pct(
					g.map((x) => x.billed_pass1_prompt_tokens),
					0.5
				),
				billed_pass1_max: pct(
					g.map((x) => x.billed_pass1_prompt_tokens),
					1
				),
				ratio_billed_over_approx_p50: r(
					pct(
						g.map(
							(x) =>
								x.billed_pass1_prompt_tokens / Math.max(1, x.approx_prompt_tokens)
						),
						0.5
					),
					2
				),
				tool_schema_share_p50: pct(
					g.map((x) => x.tool_schema_share_of_pass1),
					0.5
				),
				system_chars_p50: pct(
					g.map((x) => x.system_chars),
					0.5
				),
				tools_chars_p50: pct(
					g.map((x) => x.tools_chars),
					0.5
				),
				message_chars_p50: pct(
					g.map((x) => x.message_chars),
					0.5
				)
			}
		];
	})
);
S.snapshot_coverage = {
	turns: rows.length,
	snapshots: snaps.length,
	turns_without_snapshot: rows.filter((x) => !x.has_snapshot).map((x) => `${x.id}:${x.ctx}`)
};

// ---------- (5) tool usage ----------
const tstats = {};
for (const x of tools) {
	const o = (tstats[x.tool_name] ||= {
		n: 0,
		fail: 0,
		zero: 0,
		ms: [],
		cat: x.tool_category,
		errs: {}
	});
	o.n++;
	if (!x.success) {
		o.fail++;
		const e = scrub(String(x.error_message || (x.result && x.result.error) || 'unknown')).slice(
			0,
			140
		);
		o.errs[e] = (o.errs[e] || 0) + 1;
	}
	if (x.zero_result) o.zero++;
	if (x.execution_time_ms != null) o.ms.push(x.execution_time_ms);
}
S.tools = Object.entries(tstats)
	.sort((a, b) => b[1].n - a[1].n)
	.map(([k, o]) => ({
		tool: k,
		cat: o.cat,
		n: o.n,
		fail: o.fail,
		zero: o.zero,
		ms_p50: pct(o.ms, 0.5),
		ms_p90: pct(o.ms, 0.9),
		errors: o.errs
	}));
S.tool_totals = {
	executions: tools.length,
	control: tools.filter((x) => CONTROL.has(x.tool_name)).length,
	control_share: r(tools.filter((x) => CONTROL.has(x.tool_name)).length / tools.length, 3),
	reviewer_decisions: tools.filter((x) => REVIEWER_TOOLS.has(x.tool_name)).length,
	writes: tools.filter((x) => x.tool_category === 'ontology_action' || x.effect_id).length,
	reads: tools.filter(
		(x) => !CONTROL.has(x.tool_name) && !(x.tool_category === 'ontology_action' || x.effect_id)
	).length,
	tool_call_events_without_result:
		events.filter((e) => e.event_type === 'tool_call').length -
		events.filter((e) => e.event_type === 'tool_result').length,
	by_category: count(tools, (x) => x.tool_category)
};
S.obs_tool_classes = count(
	obs.filter((o) => o.event_type === 'tool_execution_ended'),
	(o) => `${o.payload.execution_class}|${o.payload.status}|${o.payload.error_code}`
);
S.memo_served = count(
	obs.filter((o) => o.event_type === 'tool_execution_ended'),
	(o) => `memo_served=${o.payload.memo_served}|replayed=${o.payload.replayed}`
);

// ---------- (6) repair / recovery ----------
const ended = obs.filter((o) => o.event_type === 'provider_attempt_ended');
const validationFails = tools.filter((x) => !x.success && CONTROL.has(x.tool_name));
S.recovery = {
	provider_attempts: ended.length,
	provider_attempt_failures: ended.filter((o) => o.payload.status === 'failure').length,
	failures_by_class_role: count(
		ended.filter((o) => o.payload.status === 'failure'),
		(o) => `${o.payload.error_class}|${o.payload.pass_role}|${o.payload.route_id}`
	),
	retry_attempts: ended.filter((o) => o.payload.attempt_kind === 'retry').length,
	retry_outcomes: count(
		ended.filter((o) => o.payload.attempt_kind === 'retry'),
		(o) => `${o.payload.status}|${o.payload.finish_reason}`
	),
	turns_with_provider_retry: new Set(
		ended.filter((o) => o.payload.attempt_kind === 'retry').map((o) => o.turn_run_id)
	).size,
	truncation_retries: ended.filter(
		(o) => o.payload.error_class === 'provider_tool_arguments_truncated'
	).length,
	repair_passes: usage.filter((u) => u.metadata?.passRole === 'repair').length,
	repair_passes_by_route: count(
		usage.filter((u) => u.metadata?.passRole === 'repair'),
		(u) => u.metadata.routeId
	),
	turns_with_repair: new Set(
		usage.filter((u) => u.metadata?.passRole === 'repair').map((u) => u.turn_run_id)
	).size,
	validation_failures_control: validationFails.length,
	validation_failures_by_tool: count(validationFails, (x) => x.tool_name),
	turns_with_control_validation_failure: new Set(validationFails.map((x) => x.turn_run_id)).size,
	validation_failure_count_col: rows.reduce((a, x) => a + (x.vfail || 0), 0),
	reviewer_revisions: tools.filter((x) => x.tool_name === 'request_proposal_revision').length,
	reviewer_approvals: tools.filter((x) => x.tool_name === 'approve_turn_contract_review').length,
	reviewer_batch_approvals: tools.filter((x) => x.tool_name === 'approve_mutation_batch_review')
		.length,
	reviewer_calls_without_decision_row:
		rev.length - tools.filter((x) => REVIEWER_TOOLS.has(x.tool_name)).length,
	final_response_passes: usage.filter((u) => u.metadata?.passRole === 'final_response').length,
	turns_with_final_response: new Set(
		usage.filter((u) => u.metadata?.passRole === 'final_response').map((u) => u.turn_run_id)
	).size,
	forced_synthesis_failed_turns: rows
		.filter((x) => x.failure_code === 'provider_forced_synthesis_failed')
		.map((x) => x.id),
	tool_call_disabled_attempts: ended.filter(
		(o) => o.payload.error_class === 'provider_tool_call_disabled'
	).length,
	clarification_controls: {
		ok: tools.filter((x) => x.tool_name === 'request_turn_clarification' && x.success).length,
		failed: tools.filter((x) => x.tool_name === 'request_turn_clarification' && !x.success)
			.length,
		turns: new Set(
			tools
				.filter((x) => x.tool_name === 'request_turn_clarification')
				.map((x) => x.turn_run_id)
		).size
	},
	surface_repairs_explicit: [...events, ...obs].filter((e) => e.event_type === 'surface_repair')
		.length,
	context_shift_events: events.filter((e) => e.event_type === 'context_shift').length,
	mutation_unfulfilled: rows
		.filter((x) => x.finished_reason === 'mutation_unfulfilled')
		.map((x) => x.id),
	cancelled: rows
		.filter((x) => x.status === 'cancelled')
		.map((x) => ({ id: x.id, dur_s: x.dur_s, calls: x.calls, tools: x.tools.length }))
};
// classify final_response passes: after a mutation (direct write done) vs read-ladder
S.recovery.final_response_context = count(
	usage.filter((u) => u.metadata?.passRole === 'final_response'),
	(u) => {
		const row = rows.find((x) => x.full_id === u.turn_run_id);
		return row ? `${row.cls}` : 'unknown';
	}
);

// ---------- (7) skill preloads ----------
S.skill_preloads = {
	by_skill_source: count(
		rows.filter((x) => x.skill_preload),
		(x) => x.skill_preload
	),
	by_class: count(
		rows.filter((x) => x.skill_preload),
		(x) => `${x.skill_preload.split(':')[0]}|${x.cls}`
	),
	turns_with_preload: rows.filter((x) => x.skill_preload).length,
	preload_on_read_only_turns: rows
		.filter((x) => x.skill_preload && x.cls === 'read_only')
		.map((x) => ({ id: x.id, skill: x.skill_preload, ctx: x.ctx }))
};

// ---------- (8) pass count ----------
S.passes = {
	llm_pass_count_col: count(rows, (x) => x.passes),
	model_calls_dist: count(rows, (x) => x.calls),
	successful_calls_dist: count(rows, (x) => x.calls_ok),
	tool_rounds_dist: count(rows, (x) => x.rounds),
	cap_12_hits: rows.filter((x) => x.passes >= 12 || x.calls_ok >= 12).map((x) => x.id),
	turns_ge_8_passes: rows
		.filter((x) => x.passes >= 8)
		.map((x) => ({
			id: x.id,
			cls: x.cls,
			status: x.status,
			passes: x.passes,
			calls: x.calls,
			cost: x.cost,
			wall_s: r(x.total_ms / 1000)
		})),
	pass_count_vs_calls_mismatch: rows.filter((x) => x.passes !== x.calls_ok).length,
	budget_exceeded: rows.filter((x) => x.failure_code === 'provider_round_budget_exceeded').length
};

// ---------- (9) last 20 organic-or-all DJ turns (no text; labels added by hand) ----------
S.last20 = [...rows]
	.sort((a, b) => b.started_at.localeCompare(a.started_at))
	.slice(0, 20)
	.map((x) => ({
		id: x.id,
		at: x.started_at.slice(0, 16),
		cohort: x.cohort,
		ctx: x.ctx,
		cls: x.cls,
		status: x.status,
		failure_code: x.failure_code,
		finished_reason: x.finished_reason,
		passes: x.passes,
		calls: x.calls,
		tools: x.tools,
		cost: x.cost,
		wall_s: r((x.total_ms || 0) / 1000),
		clarification: x.clarifications > 0,
		refusal_heuristic: x.refusal_heuristic,
		answer_chars: x.answer_chars,
		skill: x.skill_preload
	}));

// ---------- scenario replays across the three batteries ----------
S.scenario_replays = {};
for (const x of rows.filter((x) => x.scenario))
	(S.scenario_replays[x.scenario] ||= []).push({
		run: x.cohort,
		id: x.id,
		ctx: x.ctx,
		cls: x.cls,
		status: x.status,
		failure_code: x.failure_code,
		passes: x.passes,
		calls: x.calls,
		reviewer_calls: x.reviewer_calls,
		controls: x.controls,
		writes_ok: x.writes_ok,
		wall_s: r((x.total_ms || 0) / 1000),
		cost: x.cost,
		tools: x.tools
	});
S.scenario_replays = Object.fromEntries(Object.entries(S.scenario_replays).sort());
S.scenario_outcome_variance = Object.fromEntries(
	Object.entries(S.scenario_replays)
		.filter(([, a]) => a.length >= 2)
		.map(([k, a]) => [
			k,
			{
				runs: a.length,
				distinct_classes: [...new Set(a.map((x) => x.cls))],
				distinct_status: [...new Set(a.map((x) => x.status))],
				calls: a.map((x) => x.calls),
				wall_s: a.map((x) => x.wall_s),
				cost: a.map((x) => x.cost)
			}
		])
);
// ---------- misc telemetry ----------
S.telemetry = {
	prepared_prompt_hit: count(rows, (x) => String(x.prepared_hit)),
	surface_profile: count(turns, (t) => t.prepared_surface_profile),
	history: count(rows, (x) => x.history.split(':')[0]),
	llm_pass_count_zero_completed: completed.filter((x) => x.passes === 0).length,
	passes_equal_calls_ok: rows.filter((x) => x.passes === x.calls_ok).length,
	snapshots: snaps.length,
	snapshot_variant: count(snaps, (s) => s.prompt_variant),
	queue_jobs: count(jobs, (j) => `${j.status}|attempts=${j.attempts}`),
	queue_errors: count(
		jobs.filter((j) => j.error_message),
		(j) =>
			String(j.error_message)
				.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/g, '<uuid>')
				.slice(0, 100)
	),
	answer_source: count(rows, (x) => x.answer_source),
	cost_total: r(
		rows.reduce((a, x) => a + x.cost, 0),
		4
	),
	cost_by_cohort: Object.fromEntries(
		[
			'battery_A_0904',
			'battery_B_0904',
			'battery_C_0905',
			'book_qa_0905',
			'research_qa_0908',
			'organic'
		].map((c) => [
			c,
			r(
				rows.filter((x) => x.cohort === c).reduce((a, x) => a + x.cost, 0),
				4
			)
		])
	),
	top_cost_turns: [...rows]
		.sort((a, b) => b.cost - a.cost)
		.slice(0, 8)
		.map((x) => ({
			id: x.id,
			cohort: x.cohort,
			cls: x.cls,
			status: x.status,
			calls: x.calls,
			reviewer_calls: x.reviewer_calls,
			prompt_total: x.prompt_total,
			cost: x.cost,
			wall_s: r((x.total_ms || 0) / 1000),
			tools: x.tools.length
		}))
};

fs.writeFileSync(path.join(OUT, 'lane-h-summary.json'), JSON.stringify(S, null, 2));
fs.writeFileSync(
	path.join(OUT, 'lane-h-turns.json'),
	JSON.stringify(
		rows.map(({ full_id, ...x }) => x),
		null,
		1
	)
);
console.log(JSON.stringify(S, null, 1).slice(0, 200));
console.log('written');
