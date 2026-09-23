// apps/web/src/lib/services/admin/chat-workflow-audit-export.ts
//
// Offline exports for multi-agent workflow runs (Tasker 91). Both the Markdown report and
// the ZIP bundle are rendered from the same versioned `ChatWorkflowAuditPayload` the
// inspector displays. Scope is explicit (one workflow, or the whole session), stored record
// hashes stay separate from hashes of the exported (redacted) files, and archive paths are
// generated, never taken from record content.
import { zipSync, strToU8 } from 'fflate';
import { codeFence, metricLine, stringOrDash, tableCell, toJson } from './chat-session-audit-gist';
import type { ChatSessionAuditPayload } from './chat-session-audit-types';
import type {
	WorkflowAuditGraphEdge,
	WorkflowAuditRun,
	WorkflowAuditStep
} from './chat-workflow-audit-types';

export const CHAT_WORKFLOW_AUDIT_BUNDLE_SCHEMA = 'chat_workflow_audit_bundle_v1' as const;

export type WorkflowAuditExportScope =
	| { kind: 'workflow'; turnRunId: string }
	| { kind: 'session' };

// ---------------------------------------------------------------------------
// Safety helpers
// ---------------------------------------------------------------------------

/** Archive path segments are generated from ids/keys and constrained to a safe alphabet. */
export const safePathSegment = (value: unknown, fallback = 'item', maxLength = 64): string => {
	const text = String(value ?? '')
		.toLowerCase()
		.replace(/[^a-z0-9._-]+/g, '-')
		.replace(/^[.-]+|[.-]+$/g, '')
		.replace(/-{2,}/g, '-')
		.slice(0, maxLength);
	if (!text || text === '.' || text === '..') return fallback;
	return text;
};

/** Inline Markdown text: strip control characters and neutralize markup that could inject. */
export const escapeMarkdownInline = (value: unknown, maxLength = 200): string => {
	const text = String(value ?? '')
		.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
		.replace(/\r?\n+/g, ' ')
		.replace(/[<>]/g, (char) => (char === '<' ? '&lt;' : '&gt;'))
		.replace(/([\\`*_[\]#|])/g, '\\$1')
		.trim();
	return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
};

/**
 * Nest a Markdown section deeper by `by` levels without touching fenced code. Sections are
 * arrays of chunks; a chunk is either one line or a self-contained fenced block from
 * `codeFence`, and fences may also arrive as separate lines. Only a heading outside a fence
 * moves; headings cap at six levels.
 */
export const demoteMarkdownHeadings = (chunks: string[], by: number): string[] => {
	let openFence: string | null = null;
	return chunks.map((chunk) => {
		const out =
			openFence === null
				? chunk.replace(/^(#{1,6})(?= )/, (hashes) =>
						'#'.repeat(Math.min(6, hashes.length + by))
					)
				: chunk;
		for (const line of chunk.split('\n')) {
			const fence = line.match(/^(`{3,}|~{3,})/)?.[1];
			if (!fence) continue;
			if (openFence === null) openFence = fence;
			else if (fence[0] === openFence[0] && fence.length >= openFence.length)
				openFence = null;
		}
		return out;
	});
};

const mermaidLabel = (value: unknown, maxLength = 60): string => {
	const text = String(value ?? '')
		.replace(/[\u0000-\u001f\u007f]/g, ' ')
		.replace(/"/g, '#quot;')
		.replace(/[[\]{}()<>|]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
	return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text || '-';
};

const mermaidId = (value: string): string => `n_${value.replace(/[^A-Za-z0-9_]/g, '_')}`;

const usd = (micro: number | null | undefined): string =>
	micro === null || micro === undefined ? 'unknown' : `$${(micro / 1_000_000).toFixed(6)}`;

const usdPlain = (value: number | null | undefined): string =>
	value === null || value === undefined ? 'unknown' : `$${value.toFixed(6)}`;

const ms = (value: number | null | undefined): string =>
	value === null || value === undefined
		? '-'
		: value >= 1000
			? `${(value / 1000).toFixed(2)} s`
			: `${value} ms`;

const section = (lines: string[]): string => lines.join('\n').trimEnd() + '\n';

export const workflowFolderName = (run: WorkflowAuditRun): string =>
	`workflow-${run.turn_index ?? 'x'}-${safePathSegment(run.turn_run_id.slice(0, 8), 'run')}`;

// ---------------------------------------------------------------------------
// Mermaid
// ---------------------------------------------------------------------------

const edgeArrow = (edge: WorkflowAuditGraphEdge): string => {
	switch (edge.kind) {
		case 'evidence':
			return '==>';
		case 'observation':
			return '-.->';
		case 'tool':
			return '-->';
		default:
			return '-->';
	}
};

export const buildWorkflowMermaid = (run: WorkflowAuditRun): string => {
	const lines = ['flowchart LR'];
	lines.push(
		`  %% Saved graph for turn ${run.turn_run_id} (${run.policy_ref ?? 'policy ?'}, plan ${run.plan_version ?? '?'})`
	);
	lines.push(
		`  %% Edges come from the saved plan and evidence bindings, not the current registry.`
	);
	if (run.graph.nodes.length === 0) {
		lines.push(
			`  ${mermaidId('none')}["No saved plan or steps (${mermaidLabel(run.outcome_label)})"]`
		);
		return lines.join('\n') + '\n';
	}
	for (const node of run.graph.nodes) {
		const label = `${mermaidLabel(node.label)}${node.sublabel ? `<br/>${mermaidLabel(node.sublabel, 48)}` : ''}<br/>${mermaidLabel(node.state)}`;
		const shape =
			node.kind === 'tool'
				? `[[${JSON.stringify(label)}]]`
				: node.kind === 'shadow'
					? `{{${JSON.stringify(label)}}}`
					: node.kind === 'answer'
						? `([${JSON.stringify(label)}])`
						: `[${JSON.stringify(label)}]`;
		lines.push(`  ${mermaidId(node.id)}${shape}`);
	}
	for (const group of run.graph.parallel_groups) {
		lines.push(
			`  subgraph ${mermaidId(group.id)}["Parallel: ${group.step_keys.map((key) => mermaidLabel(key)).join(' + ')}"]`
		);
		for (const key of group.step_keys) lines.push(`    ${mermaidId(`step:${key}`)}`);
		lines.push('  end');
	}
	for (const edge of run.graph.edges) {
		const label = edge.label ? `|${JSON.stringify(mermaidLabel(edge.label, 48))}|` : '';
		lines.push(`  ${mermaidId(edge.from)} ${edgeArrow(edge)}${label} ${mermaidId(edge.to)}`);
	}
	lines.push('  classDef shadow stroke-dasharray: 4 4;');
	if (run.graph.nodes.some((node) => node.kind === 'shadow'))
		lines.push(`  class ${mermaidId('shadow')} shadow;`);
	return lines.join('\n') + '\n';
};

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

const runHeading = (run: WorkflowAuditRun): string =>
	`Workflow ${run.turn_index ?? '?'} · ${run.outcome_label} · ${run.policy_ref ?? 'policy ?'}`;

const stepStateLabel = (step: WorkflowAuditStep): string =>
	step.display_state === 'finalized' ? 'finalized (answer accepted)' : step.display_state;

export const buildWorkflowSummaryLines = (run: WorkflowAuditRun): string[] => [
	metricLine('Turn run', run.turn_run_id),
	metricLine('Turn index', run.turn_index),
	metricLine(
		'Outcome',
		`${run.outcome_label}${run.terminal_outcome ? ` (${run.terminal_outcome})` : ''}${run.is_terminal ? '' : ' — still running at capture'}`
	),
	metricLine('Phase', run.phase),
	metricLine('Policy', run.policy_ref),
	metricLine('Plan version', run.plan_version),
	metricLine(
		'Workflow version',
		`${run.workflow_version ?? '-'}${run.supported ? '' : ' (unsupported by this inspector)'}`
	),
	metricLine('Request hash', run.request_hash),
	metricLine('Context hash', run.context?.context_hash ?? 'no accepted context'),
	metricLine('Plan hash', run.plan?.hash ?? 'no plan installed'),
	metricLine('Answer sha256', run.answer.text_sha256 ?? 'no accepted answer'),
	metricLine(
		'Wall clock',
		run.timing.wall_clock_ms === null ? 'unknown' : ms(run.timing.wall_clock_ms)
	),
	metricLine(
		'Parallel overlap',
		run.timing.parallel_overlap_ms === null ? 'n/a' : ms(run.timing.parallel_overlap_ms)
	),
	metricLine('Settled workflow cost', usd(run.costs.settled_micro_usd)),
	metricLine(
		'Uncertain exposure',
		run.costs.uncertain_dispatch_count
			? `${run.costs.uncertain_dispatch_count} dispatch(es), reserved ${usd(run.costs.uncertain_reserved_micro_usd)}`
			: 'none'
	),
	metricLine(
		'Selector (Jev shadow) cost',
		run.costs.selector ? usdPlain(run.costs.selector.cost_usd) : 'no shadow observation'
	),
	metricLine('Recoveries', run.recovery_count),
	metricLine('Redacted control fields', run.redactions)
];

export const buildWorkflowReportSection = (run: WorkflowAuditRun): string[] => {
	const lines = [
		`# ${escapeMarkdownInline(runHeading(run))}`,
		'',
		...buildWorkflowSummaryLines(run),
		''
	];
	const recommendation = run.specialist_snapshot?.raw?.recommendation;
	const decision =
		recommendation && typeof recommendation === 'object' && !Array.isArray(recommendation)
			? (recommendation as Record<string, unknown>)
			: null;
	const result =
		decision?.result && typeof decision.result === 'object' && !Array.isArray(decision.result)
			? (decision.result as Record<string, unknown>)
			: null;
	const selected =
		result?.selected && typeof result.selected === 'object' && !Array.isArray(result.selected)
			? (result.selected as Record<string, unknown>)
			: null;
	if (decision && result) {
		lines.push(
			'## Specialist recommendation',
			'',
			metricLine('Decision', escapeMarkdownInline(decision.id)),
			metricLine('Policy', 'jev_specialist_choice_v1'),
			metricLine('Outcome', escapeMarkdownInline(result.status)),
			metricLine(
				'Selected',
				selected
					? `${escapeMarkdownInline(selected.name)} · v${escapeMarkdownInline(selected.version)}`
					: 'none'
			),
			metricLine('Input hash', escapeMarkdownInline(decision.inputHash)),
			metricLine('Result hash', escapeMarkdownInline(decision.resultHash)),
			metricLine(
				'Jev recommendation cost (outside workflow cap)',
				typeof result.costUsd === 'number' ? usdPlain(result.costUsd) : 'unknown'
			),
			''
		);
		const ranking = Array.isArray(result.ranking) ? result.ranking.slice(0, 20) : [];
		if (ranking.length) {
			lines.push('| Ranked specialist | Jev probability |', '| --- | ---: |');
			for (const item of ranking) {
				const row =
					item && typeof item === 'object' && !Array.isArray(item)
						? (item as Record<string, unknown>)
						: {};
				lines.push(
					`| ${tableCell(row.name)} · v${tableCell(row.version)} | ${typeof row.probability === 'number' && Number.isFinite(row.probability) ? `${Math.round(row.probability * 100)}%` : '-'} |`
				);
			}
			lines.push('');
		}
	}
	lines.push(
		'## Request',
		'',
		codeFence(run.request_message || '(request text not recorded)', 'text'),
		''
	);
	if (run.input_artifact) {
		lines.push(
			'## Admitted input artifact',
			'',
			metricLine('Artifact', run.input_artifact.id),
			metricLine('Version', run.input_artifact.artifact_version),
			metricLine('Content hash', run.input_artifact.content_hash),
			metricLine(
				'History',
				`${run.input_artifact.history_count ?? 0} message(s) from ${run.input_artifact.history_source ?? '-'}`
			),
			metricLine(
				'Matches run request hash',
				run.input_artifact.request_hash_matches_run === null
					? 'unknown'
					: run.input_artifact.request_hash_matches_run
						? 'yes'
						: 'NO'
			),
			''
		);
	}
	lines.push(
		'## Saved graph',
		'',
		`Source: ${run.graph.source.replace('_', ' ')}. Parallel groups: ${run.graph.parallel_groups.map((g) => g.step_keys.join(' + ')).join('; ') || 'none'}. Sequential handoffs: ${run.graph.sequential_handoffs.map((h) => `${h.from} → ${h.to} (${h.via.replace('_', ' ')})`).join('; ') || 'none'}.`,
		''
	);
	lines.push(codeFence(buildWorkflowMermaid(run).trimEnd(), 'mermaid'), '');
	if (run.plan) {
		lines.push(
			'## Plan',
			'',
			metricLine('Planner outcome', run.plan.planner_outcome),
			metricLine('Planner attempt', run.plan.planner_step_attempt_id),
			metricLine('Installed at', run.plan.installed_at),
			'',
			'| Step | Capability | Depends on |',
			'| --- | --- | --- |',
			...run.plan.steps.map(
				(step) =>
					`| ${tableCell(step.key)} | ${tableCell(step.capability)} | ${tableCell(step.depends_on.join(', ') || '-')} |`
			),
			''
		);
	}
	lines.push('## Agents', '');
	lines.push(
		'| Step | Label | State | Attempts | Specialist | Model | Tools | Sources | Settled cost | Duration |',
		'| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |'
	);
	for (const step of run.steps) {
		lines.push(
			`| ${tableCell(step.key)} | ${tableCell(step.label)} | ${tableCell(stepStateLabel(step))} | ${tableCell(`${step.attempts_used}${step.failure_code ? ` · ${step.failure_code}` : ''}`)} | ${tableCell(step.specialist ? `${step.specialist.id}@${step.specialist.version ?? '?'}` : step.specialist_coverage === 'code_owned_not_stored' ? 'code-owned (not stored)' : '-')} | ${tableCell(step.specialist?.primary_model ?? run.dispatches.find((d) => d.step_key === step.key)?.model_requested ?? '-')} | ${tableCell(step.specialist ? step.specialist.allowed_tool_ids.join(', ') || 'none' : '-')} | ${tableCell(step.source_coverage_summary, 60)} | ${tableCell(usd(step.cost.settled_micro_usd))} | ${tableCell(ms(step.timing.duration_ms))} |`
		);
	}
	lines.push('');
	for (const step of run.steps) {
		lines.push(`### ${escapeMarkdownInline(step.label)} (${step.key})`, '');
		lines.push(metricLine('State', stepStateLabel(step)));
		if (step.display_note) lines.push(metricLine('Note', step.display_note));
		lines.push(
			metricLine('Status row', `${step.status}${step.quality ? ` · ${step.quality}` : ''}`)
		);
		lines.push(
			metricLine(
				'Attempts',
				step.attempts
					.map(
						(a) =>
							`${a.index}:${a.state}${a.dispatch_ids.length ? ` (${a.dispatch_ids.length} dispatch)` : ''}`
					)
					.join(', ') || 'none'
			)
		);
		lines.push(metricLine('Accepted attempt', step.accepted_attempt_id));
		lines.push(metricLine('Result hash', step.result_hash));
		lines.push(metricLine('Evidence binding', step.input_evidence_coverage));
		lines.push(
			metricLine(
				'Prompt coverage',
				`system ${step.prompt_coverage.system_prompt}; assignment ${step.prompt_coverage.assignment}; request ${step.prompt_coverage.serialized_request}; rejected outputs ${step.prompt_coverage.rejected_outputs}; accepted result ${step.prompt_coverage.accepted_result}`
			)
		);
		lines.push('');
		if (step.assignment)
			lines.push(
				'**Assignment (stored)**',
				'',
				codeFence(toJson(step.assignment), 'json'),
				''
			);
		if (step.report) {
			lines.push(
				'**Accepted report**',
				'',
				`Summary: ${escapeMarkdownInline(step.report.summary, 400)}`,
				''
			);
			if (step.report.findings.length) {
				lines.push('Findings:', '');
				for (const finding of step.report.findings) {
					lines.push(
						`- ${escapeMarkdownInline(finding.claim, 400)} _(${finding.basis}; ${finding.evidence.map((e) => escapeMarkdownInline(e.label, 60)).join(', ') || 'no evidence refs'})_`
					);
				}
				lines.push('');
			}
			if (step.report.risks.length) {
				lines.push('Risks:', '');
				for (const risk of step.report.risks)
					lines.push(
						`- ${escapeMarkdownInline(risk.risk, 400)} _(${risk.evidence.map((e) => escapeMarkdownInline(e.label, 60)).join(', ') || 'no evidence refs'})_`
					);
				lines.push('');
			}
			if (step.report.unknowns.length)
				lines.push(
					`Unknowns: ${step.report.unknowns.map((u) => escapeMarkdownInline(u, 200)).join('; ')}`,
					''
				);
			if (step.report.recommendation)
				lines.push(
					`Recommendation: ${escapeMarkdownInline(step.report.recommendation, 600)}`,
					''
				);
		} else if (step.result) {
			lines.push(
				'**Accepted result (stored)**',
				'',
				codeFence(toJson(step.result), 'json'),
				''
			);
		} else if (step.key === 'editor' && run.answer.synthesis_status === 'accepted') {
			lines.push('_Editor output is the final answer text below._', '');
		} else {
			lines.push('_No accepted result stored for this step._', '');
		}
		if (step.input_evidence)
			lines.push(
				'**Saved evidence handoff binding**',
				'',
				codeFence(toJson(step.input_evidence), 'json'),
				''
			);
	}
	lines.push('## Final answer', '');
	lines.push(
		metricLine('Synthesis status', run.answer.synthesis_status),
		metricLine('Quality', run.answer.synthesis_quality),
		metricLine('Accepted at', run.answer.synthesis_accepted_at),
		metricLine('Text sha256', run.answer.text_sha256),
		''
	);
	lines.push(codeFence(run.answer.text || '(no answer text saved)', 'markdown'), '');
	if (run.coverage.length) {
		lines.push('## Coverage', '');
		for (const note of run.coverage)
			lines.push(
				`- **${escapeMarkdownInline(note.scope)}** (${note.status}): ${escapeMarkdownInline(note.detail, 400)}`
			);
		lines.push('');
	}
	return lines;
};

export const buildWorkflowTimelineSection = (run: WorkflowAuditRun): string[] => {
	const lines = [
		`## Timeline (${run.timeline.length} entries)`,
		'',
		`Wall clock ${run.timing.wall_clock_ms === null ? 'unknown' : ms(run.timing.wall_clock_ms)}; sum of agent lanes ${ms(run.timing.sum_of_lane_ms)}; parallel overlap ${run.timing.parallel_overlap_ms === null ? 'n/a' : ms(run.timing.parallel_overlap_ms)}. Sum of lanes is not wall-clock time.`,
		''
	];
	lines.push(
		'| At | Lane | Event | Detail | Ends | Parallel with | Attempt | Dispatch | Gen |',
		'| --- | --- | --- | --- | --- | --- | --- | --- | --- |'
	);
	for (const entry of run.timeline) {
		lines.push(
			`| ${tableCell(entry.at)} | ${tableCell(entry.lane)} | ${tableCell(entry.title)} | ${tableCell(entry.detail, 60)} | ${tableCell(entry.end_at)} | ${tableCell(entry.parallel_with.join(', ') || '-')} | ${tableCell(entry.attempt_id ? entry.attempt_id.slice(0, 8) : '-')} | ${tableCell(entry.dispatch_id ? entry.dispatch_id.slice(0, 8) : '-')} | ${tableCell(entry.generation)} |`
		);
	}
	lines.push('');
	return lines;
};

export const buildWorkflowCostsSection = (run: WorkflowAuditRun): string[] => {
	const lines = ['## Costs', '', run.costs.note, ''];
	lines.push(
		metricLine('Budget', usd(run.costs.budget_micro_usd)),
		metricLine('Synthesis headroom', usd(run.costs.synthesis_headroom_micro_usd)),
		metricLine('Settled (paid)', usd(run.costs.settled_micro_usd)),
		metricLine('Reserved outstanding', usd(run.costs.reserved_outstanding_micro_usd)),
		metricLine(
			'Uncertain exposure',
			`${usd(run.costs.uncertain_reserved_micro_usd)} across ${run.costs.uncertain_dispatch_count} dispatch(es)`
		),
		metricLine('Released reservations', run.costs.released_count),
		metricLine(
			'Physical dispatches',
			`${run.costs.physical_dispatches} of ${run.costs.max_physical_dispatches ?? '?'}`
		),
		metricLine(
			'Usage log correlation',
			`${run.costs.usage_logs.matched} matched (${usdPlain(run.costs.usage_logs.matched_cost_usd)}), ${run.costs.usage_logs.unmatched} uncorrelated (${usdPlain(run.costs.usage_logs.unmatched_cost_usd)})`
		),
		metricLine(
			'Selector (Jev shadow)',
			run.costs.selector
				? `${run.costs.selector.status} · ${usdPlain(run.costs.selector.cost_usd)} · ${ms(run.costs.selector.duration_ms)} · ${run.costs.selector.model ?? '-'} (outside the workflow budget)`
				: 'none recorded'
		),
		''
	);
	lines.push(
		'| Dispatch | Step | Attempt | Phys. | Kind | Model | State | Reserved | Actual | Provider request | Usage log | Dispatched | Settled |',
		'| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |'
	);
	for (const d of run.dispatches) {
		lines.push(
			`| ${tableCell(d.dispatch_id.slice(0, 8))} | ${tableCell(d.step_key)} | ${tableCell(d.step_attempt_id?.slice(0, 8))} | ${tableCell(d.physical_attempt)} | ${tableCell(d.dispatch_kind)} | ${tableCell(d.model_requested)} | ${tableCell(d.cost_state)} | ${tableCell(usd(d.reserved_micro_usd))} | ${tableCell(d.actual_micro_usd === null ? 'unknown' : usd(d.actual_micro_usd))} | ${tableCell(d.provider_request_id, 40)} | ${tableCell(d.usage_log_id ? `${d.usage_log_id.slice(0, 8)} (${usdPlain(d.usage_log_cost_usd)})` : 'uncorrelated')} | ${tableCell(d.dispatched_at)} | ${tableCell(d.settled_at ?? d.uncertain_at)} |`
		);
	}
	lines.push('');
	return lines;
};

const record = (value: unknown): Record<string, unknown> | null =>
	value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
const list = (value: unknown): Record<string, unknown>[] =>
	Array.isArray(value) ? value.map(record).filter((x) => x !== null) : [];

/** What Jev selected for this run, as frozen in the accepted context checkpoint. */
export const buildContextFinderLines = (payload: unknown): string[] => {
	const evidence = record(record(record(payload)?.data)?.selected_evidence);
	if (!evidence) return [];
	const ranker = record(evidence.ranker);
	const coverage = record(evidence.coverage);
	const score = (value: unknown) => (typeof value === 'number' ? value.toFixed(2) : '-');
	const lines = [
		'### Context finder (Jev-selected evidence)',
		'',
		metricLine('Status', evidence.status),
		metricLine(
			'Source',
			evidence.source === 'curated' ? 'curated (edited by the user)' : evidence.source
		),
		metricLine('Policy', evidence.policy),
		metricLine(
			'Ranker',
			ranker
				? `${stringOrDash(ranker.status)} · checked ${stringOrDash(ranker.checked)}, unchecked ${stringOrDash(ranker.unchecked)} · ${ms(typeof ranker.durationMs === 'number' ? ranker.durationMs : null)} · ${usdPlain(typeof ranker.costUsd === 'number' ? ranker.costUsd : null)}`
				: 'not run (plan materialized)'
		),
		metricLine(
			'Coverage',
			coverage
				? `${stringOrDash(coverage.fullChars)} full + ${stringOrDash(coverage.summaryChars)} summary characters of ${stringOrDash(coverage.budgetChars)}`
				: '-'
		),
		metricLine('Note', evidence.note),
		''
	];
	const full = list(evidence.full);
	if (full.length) {
		lines.push(
			'| Loaded in full | Kind | p | Pinned | Sections | Partial |',
			'| --- | --- | --- | --- | --- | --- |'
		);
		for (const item of full)
			lines.push(
				`| ${tableCell(item.title ?? item.id, 48)} | ${tableCell(item.kind)} | ${score(item.p)} | ${item.pinned ? 'yes' : 'no'} | ${tableCell(
					list(item.excerpts)
						.map((excerpt) => excerpt.heading ?? 'opening')
						.join(' · '),
					80
				)} | ${item.partial ? 'yes' : 'no'} |`
			);
		lines.push('');
	}
	const summaries = list(evidence.summaries);
	if (summaries.length)
		lines.push(
			`Nearby (one line each): ${summaries.map((item) => `${escapeMarkdownInline(item.title ?? item.id, 60)} (${score(item.p)})`).join(', ')}`,
			''
		);
	const missing = list(evidence.missing);
	if (missing.length)
		lines.push(
			`Planned but no longer in the project: ${missing.map((x) => `${escapeMarkdownInline(x.kind, 20)} ${escapeMarkdownInline(x.id, 40)}`).join('; ')}`,
			''
		);
	return lines;
};

export const buildWorkflowEvidenceSection = (run: WorkflowAuditRun): string[] => {
	const specialists = run.steps.filter((step) => step.role === 'specialist');
	const lines = [
		'## Evidence',
		'',
		'Which specialist actually received each source, and at what coverage. "inventory only" means title/summary from the accepted context; "not supplied" means another agent read it under a parallel plan and it was not shared.',
		''
	];
	if (!run.context) {
		lines.push('_Context was never accepted; no source inventory exists for this run._', '');
		return lines;
	}
	lines.push(
		`| Source | Kind | Version | ${specialists.map((s) => tableCell(s.label, 32)).join(' | ')} |`,
		`| --- | --- | --- | ${specialists.map(() => '---').join(' | ')} |`
	);
	for (const source of run.sources) {
		lines.push(
			`| ${tableCell(source.label ?? source.id, 48)} | ${tableCell(source.kind)} | ${tableCell(source.version, 32)} | ${specialists.map((s) => tableCell(source.receipts.find((r) => r.step_key === s.key)?.coverage ?? 'unknown')).join(' | ')} |`
		);
	}
	lines.push('');
	lines.push(...buildContextFinderLines(run.context.payload));
	for (const call of run.tool_calls) {
		lines.push(
			`### Document read by ${escapeMarkdownInline(call.step_key ?? 'unbound attempt')} (${call.step_attempt_id?.slice(0, 8) ?? '?'})`,
			''
		);
		lines.push(
			metricLine('Result hash', call.result_hash),
			metricLine(
				'Request hash matches run',
				call.request_hash_matches_run === null
					? 'unknown'
					: call.request_hash_matches_run
						? 'yes'
						: 'NO'
			),
			metricLine('Saved at', call.created_at),
			''
		);
		lines.push(
			'| Document | Status | Coverage | Version | Content hash | Characters | Truncated |',
			'| --- | --- | --- | --- | --- | --- | --- |'
		);
		for (const doc of call.documents)
			lines.push(
				`| ${tableCell(doc.title ?? doc.id, 48)} | ${tableCell(doc.status)} | ${tableCell(doc.coverage)} | ${tableCell(doc.version, 32)} | ${tableCell(doc.content_hash?.slice(0, 12))} | ${tableCell(doc.full_characters)} | ${tableCell(doc.truncated === null ? '-' : doc.truncated ? 'yes' : 'no')} |`
			);
		lines.push('');
	}
	if (run.selection_shadow) {
		const s = run.selection_shadow;
		lines.push(
			'### Jev shadow selection (observation only)',
			'',
			'This is selector telemetry. It did not choose the executing agents or grant tools.',
			''
		);
		lines.push(
			metricLine('Status', s.status),
			metricLine('Baseline bundle', s.baseline_bundle),
			metricLine('Selected bundle', s.selected_bundle),
			metricLine('Recommended bundle', s.recommended_bundle),
			metricLine(
				'Agrees with baseline',
				s.agrees_with_baseline === null ? 'unknown' : s.agrees_with_baseline ? 'yes' : 'no'
			),
			metricLine(
				'Probabilities',
				s.probabilities
					? Object.entries(s.probabilities)
							.map(([k, v]) => `${k} ${(v * 100).toFixed(1)}%`)
							.join(', ')
					: '-'
			),
			metricLine('Model', s.model_used ?? s.model_requested),
			metricLine('Cost', usdPlain(s.cost_usd)),
			metricLine('Latency', ms(s.duration_ms)),
			metricLine(
				'Context matches run',
				s.context_matches_run === null ? 'unknown' : s.context_matches_run ? 'yes' : 'NO'
			),
			''
		);
	}
	return lines;
};

const messageText = (message: Record<string, unknown> | undefined): string | null =>
	typeof message?.content === 'string' && message.content.trim() ? message.content : null;

export const buildWorkflowTranscriptSection = (
	payload: ChatSessionAuditPayload,
	run: WorkflowAuditRun
): string[] => {
	const turn = payload.turn_runs.find((t) => t.id === run.turn_run_id);
	const byId = new Map(payload.messages.map((m) => [String(m.id), m]));
	const userMessage = turn?.user_message_id ? byId.get(turn.user_message_id) : undefined;
	const assistantMessage = turn?.assistant_message_id
		? byId.get(turn.assistant_message_id)
		: undefined;
	const lines = [`## Transcript (workflow turn ${run.turn_index ?? '?'})`, ''];
	lines.push(
		`### USER · ${stringOrDash(userMessage?.created_at ?? turn?.started_at)}`,
		'',
		codeFence(messageText(userMessage) ?? run.request_message ?? '(not recorded)', 'text'),
		''
	);
	const answer = messageText(assistantMessage) ?? (run.answer.text || null);
	lines.push(
		`### ASSISTANT · ${stringOrDash(assistantMessage?.created_at ?? run.answer.synthesis_accepted_at)}${answer && !messageText(assistantMessage) ? ' (from durable answer text)' : ''}`,
		'',
		codeFence(answer ?? '(no assistant message or accepted answer saved)', 'markdown'),
		''
	);
	return lines;
};

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

export const buildWorkflowAgentFiles = (
	run: WorkflowAuditRun,
	prefix = ''
): Record<string, string> => {
	const files: Record<string, string> = {};
	for (const step of run.steps) {
		const dir = `${prefix}agents/${safePathSegment(step.key, 'step')}/`;
		const lines = [
			`# ${escapeMarkdownInline(step.label)} (${step.key})`,
			'',
			metricLine('Role', step.role),
			metricLine('State', stepStateLabel(step)),
			metricLine('Status row', step.status),
			metricLine('Quality', step.quality),
			metricLine('Attempts used', step.attempts_used),
			metricLine('Accepted attempt', step.accepted_attempt_id),
			metricLine('Failure code', step.failure_code),
			metricLine('Claimed at', step.claimed_at),
			metricLine('Finished at', step.finished_at),
			metricLine('Duration', ms(step.timing.duration_ms)),
			metricLine('Settled cost', usd(step.cost.settled_micro_usd)),
			metricLine('Dispatches', step.dispatch_ids.length),
			metricLine('Sources', step.source_coverage_summary),
			metricLine('Evidence binding', step.input_evidence_coverage),
			metricLine(
				'Specialist',
				step.specialist
					? `${step.specialist.id}@${step.specialist.version ?? '?'} (${step.specialist_coverage})`
					: step.specialist_coverage
			),
			''
		];
		lines.push(
			'## Prompt coverage',
			'',
			...Object.entries(step.prompt_coverage).map(([k, v]) => metricLine(k, v)),
			''
		);
		if (step.specialist?.system_prompt)
			lines.push(
				'## System instructions (pinned in run snapshot)',
				'',
				codeFence(step.specialist.system_prompt, 'text'),
				''
			);
		if (step.specialist?.slot_assignment)
			lines.push(
				'## Slot assignment (pinned in run snapshot)',
				'',
				codeFence(step.specialist.slot_assignment, 'text'),
				''
			);
		lines.push(
			'## Files',
			'',
			'- `assignment.json` — stored planner/default assignment for this step',
			'- `result.json` — accepted result (or null)',
			'- `dispatches.json` — physical provider requests for this step (accounting only)',
			'- `evidence.json` — saved evidence binding and received sources',
			''
		);
		files[`${dir}README.md`] = section(lines);
		files[`${dir}assignment.json`] = `${toJson(step.assignment)}\n`;
		files[`${dir}result.json`] = `${toJson(step.result)}\n`;
		files[`${dir}dispatches.json`] =
			`${toJson(run.dispatches.filter((d) => d.step_key === step.key))}\n`;
		files[`${dir}evidence.json`] =
			`${toJson({ input_evidence: step.input_evidence, input_evidence_coverage: step.input_evidence_coverage, received_sources: step.received_sources, tool_call_ids: step.tool_call_ids })}\n`;
	}
	return files;
};

export const buildWorkflowRawFiles = (
	run: WorkflowAuditRun,
	prefix = ''
): Record<string, string> => {
	const {
		steps,
		dispatches,
		tool_calls,
		specialist_snapshot,
		selection_shadow,
		input_artifact,
		progress_events,
		graph,
		timeline,
		costs,
		timing,
		sources,
		coverage,
		...workflow
	} = run;
	return {
		[`${prefix}raw/workflow.json`]: `${toJson(workflow)}\n`,
		[`${prefix}raw/steps.json`]: `${toJson(steps)}\n`,
		[`${prefix}raw/dispatches.json`]: `${toJson(dispatches)}\n`,
		[`${prefix}raw/document_reads.json`]: `${toJson(tool_calls)}\n`,
		[`${prefix}raw/specialist_snapshot.json`]: `${toJson(specialist_snapshot)}\n`,
		[`${prefix}raw/selection_shadow.json`]: `${toJson(selection_shadow)}\n`,
		[`${prefix}raw/input_artifact.json`]: `${toJson(input_artifact)}\n`,
		[`${prefix}raw/progress_events.json`]: `${toJson(progress_events)}\n`,
		[`${prefix}raw/graph.json`]: `${toJson(graph)}\n`,
		[`${prefix}raw/timeline.json`]: `${toJson(timeline)}\n`,
		[`${prefix}raw/costs.json`]: `${toJson(costs)}\n`,
		[`${prefix}raw/timing.json`]: `${toJson(timing)}\n`,
		[`${prefix}raw/sources.json`]: `${toJson(sources)}\n`,
		[`${prefix}raw/coverage.json`]: `${toJson(coverage)}\n`
	};
};

/** The files for one workflow run, relative to `prefix` (no manifest, no transcript). */
export const buildWorkflowRunFiles = (
	payload: ChatSessionAuditPayload,
	run: WorkflowAuditRun,
	prefix = ''
): Record<string, string> => ({
	[`${prefix}workflow.md`]: section(buildWorkflowReportSection(run)),
	[`${prefix}flow.mmd`]: buildWorkflowMermaid(run),
	[`${prefix}timeline.md`]: section(buildWorkflowTimelineSection(run)),
	[`${prefix}costs.md`]: section(buildWorkflowCostsSection(run)),
	[`${prefix}evidence.md`]: section(buildWorkflowEvidenceSection(run)),
	[`${prefix}transcript.md`]: section(buildWorkflowTranscriptSection(payload, run)),
	...buildWorkflowAgentFiles(run, prefix),
	...buildWorkflowRawFiles(run, prefix)
});

export const storedHashesForRun = (run: WorkflowAuditRun): Record<string, unknown> => ({
	request_hash: run.request_hash,
	context_hash: run.context?.context_hash ?? null,
	plan_hash: run.plan?.hash ?? null,
	answer_text_sha256: run.answer.text_sha256,
	specialist_snapshot_hash: run.specialist_snapshot?.snapshot_hash ?? null,
	step_result_hashes: Object.fromEntries(run.steps.map((s) => [s.key, s.result_hash])),
	document_read_result_hashes: run.tool_calls.map((c) => c.result_hash),
	selection_shadow_hashes: run.selection_shadow
		? { input: run.selection_shadow.input_hash, result: run.selection_shadow.result_hash }
		: null,
	input_artifact_content_hash: run.input_artifact?.content_hash ?? null
});

const selectRuns = (
	payload: ChatSessionAuditPayload,
	scope: WorkflowAuditExportScope
): WorkflowAuditRun[] => {
	const runs = payload.workflows?.runs ?? [];
	if (scope.kind === 'session') return runs;
	return runs.filter((run) => run.turn_run_id === scope.turnRunId);
};

export const buildWorkflowAuditBaseName = (
	payload: ChatSessionAuditPayload,
	scope: WorkflowAuditExportScope
): string => {
	const stamp = new Date()
		.toISOString()
		.replace(/[-:]/g, '')
		.replace(/\.\d{3}Z$/, 'Z');
	const sessionPart = safePathSegment(payload.session.id.slice(0, 8), 'session');
	if (scope.kind === 'workflow')
		return `cwa-workflow-${sessionPart}-${safePathSegment(scope.turnRunId.slice(0, 8), 'run')}-${stamp}`;
	return `cwa-session-${sessionPart}-${stamp}`;
};

const scopeLabel = (scope: WorkflowAuditExportScope): string =>
	scope.kind === 'workflow'
		? `one workflow (turn run ${scope.turnRunId})`
		: 'whole session (all workflow turns and ordinary conversation turns)';

const buildBundleReadme = (
	payload: ChatSessionAuditPayload,
	scope: WorkflowAuditExportScope,
	runs: WorkflowAuditRun[],
	filePaths: string[]
): string => {
	const workflows = payload.workflows;
	const lines = [
		`# Workflow audit: ${escapeMarkdownInline(payload.session.title, 120)}`,
		'',
		metricLine('Scope', scopeLabel(scope)),
		metricLine('Exported at', new Date().toISOString()),
		metricLine('Captured at', workflows?.captured_at ?? 'unknown'),
		metricLine('Atomic capture', 'no — assembled from several queries'),
		metricLine('Session', payload.session.id),
		metricLine('User', `${payload.session.user.name} <${payload.session.user.email}>`),
		metricLine(
			'Audit schema',
			`${CHAT_WORKFLOW_AUDIT_BUNDLE_SCHEMA} / ${workflows?.version ?? 'unknown'}`
		),
		''
	];
	if (runs.some((run) => !run.is_terminal))
		lines.push(
			'> **Incomplete:** at least one workflow was still running at capture time. Records after the capture are not included.',
			''
		);
	if (runs.length === 0) lines.push('_No workflow runs matched this scope._', '');
	for (const run of runs) {
		lines.push(
			`## ${escapeMarkdownInline(runHeading(run))}`,
			'',
			...buildWorkflowSummaryLines(run),
			''
		);
		lines.push('Issues:', '');
		const issues = [
			...run.coverage
				.filter((c) => c.status !== 'available' && c.status !== 'not_applicable')
				.map((c) => `${c.scope}: ${c.detail}`),
			...run.steps
				.filter((s) => s.failure_code)
				.map((s) => `${s.key} failed: ${s.failure_code}`),
			...(run.costs.uncertain_dispatch_count
				? [`${run.costs.uncertain_dispatch_count} dispatch(es) with uncertain cost`]
				: []),
			...(run.costs.usage_logs.unmatched
				? [`${run.costs.usage_logs.unmatched} uncorrelated usage row(s)`]
				: []),
			...(run.selection_shadow?.agrees_with_baseline === false
				? ['Jev shadow disagreed with the executed bundle (observation only)']
				: [])
		];
		lines.push(
			...(issues.length
				? issues.map((i) => `- ${escapeMarkdownInline(i, 400)}`)
				: ['- none recorded']),
			''
		);
	}
	if (scope.kind === 'session' && workflows) {
		lines.push(
			'## Session coverage',
			'',
			metricLine('Ordinary (non-workflow) turns', workflows.ordinary_turn_ids.length),
			metricLine('Workflow turns', workflows.runs.length),
			''
		);
		for (const [table, cov] of Object.entries(workflows.tables))
			lines.push(
				`- ${table}: ${cov.status}${cov.count !== undefined ? ` (${cov.count} rows)` : ''}${cov.detail ? ` — ${escapeMarkdownInline(cov.detail, 200)}` : ''}`
			);
		lines.push('');
		for (const note of workflows.notes) lines.push(`- ${escapeMarkdownInline(note, 300)}`);
		if (workflows.notes.length) lines.push('');
	}
	lines.push(
		'## Files',
		'',
		...filePaths.filter((p) => p !== 'README.md').map((p) => `- \`${p}\``),
		''
	);
	lines.push(
		'## Reading guide',
		'',
		'- `manifest.json` lists schema versions, scope, counts, stored record hashes and (separately) hashes of these exported files.',
		'- `workflow.md` is the saved graph, agent table, reports and final answer. `flow.mmd` is the same graph as Mermaid.',
		'- `evidence.md` shows which agent received which source and at what coverage.',
		'- `costs.md` separates settled spend, reservations, uncertain exposure and Jev selector telemetry.',
		'- `agents/<step>/` holds the stored assignment, accepted result, dispatches and evidence binding per agent. Per-attempt prompts and rejected outputs are not persisted by the engine and are not reconstructed.',
		'- Control secrets (tokens, keys, signed URLs) were removed before export; correlation ids were kept.',
		''
	);
	return section(lines);
};

/** All bundle files (relative paths), without `manifest.json`. */
export const buildWorkflowAuditBundleFiles = (
	payload: ChatSessionAuditPayload,
	scope: WorkflowAuditExportScope
): Record<string, string> => {
	const runs = selectRuns(payload, scope);
	const files: Record<string, string> = {};
	if (scope.kind === 'workflow') {
		const run = runs[0];
		if (run) Object.assign(files, buildWorkflowRunFiles(payload, run));
	} else {
		for (const run of runs) {
			const prefix = `workflows/${workflowFolderName(run)}/`;
			Object.assign(files, buildWorkflowRunFiles(payload, run, prefix));
		}
		files['raw/session.json'] = `${toJson(payload.session)}\n`;
		files['raw/messages.json'] = `${toJson(payload.messages)}\n`;
		files['raw/turn_runs.json'] =
			`${toJson(payload.turn_runs.map(({ events, prompt_snapshot, ...turn }) => ({ ...turn, event_count: events.length, prompt_snapshot_available: Boolean(prompt_snapshot) })))}\n`;
		files['raw/workflows.json'] = `${toJson(payload.workflows ?? null)}\n`;
		files['transcript.md'] = section([
			`## Transcript (whole session)`,
			'',
			...payload.messages
				.filter((m) => m.role === 'user' || m.role === 'assistant')
				.map(
					(m, i) =>
						`### ${i + 1}. ${String(m.role).toUpperCase()} · ${stringOrDash(m.created_at)}\n\n${codeFence(typeof m.content === 'string' && m.content ? m.content : '(empty message)', 'text')}\n`
				)
		]);
	}
	const paths = ['README.md', 'manifest.json', ...Object.keys(files)];
	files['README.md'] = buildBundleReadme(payload, scope, runs, paths);
	return files;
};

const sha256Hex = async (text: string): Promise<string | null> => {
	try {
		const subtle = globalThis.crypto?.subtle;
		if (!subtle) return null;
		const digest = await subtle.digest('SHA-256', strToU8(text));
		return Array.from(new Uint8Array(digest), (byte) =>
			byte.toString(16).padStart(2, '0')
		).join('');
	} catch {
		return null;
	}
};

export const buildWorkflowAuditManifest = async (
	payload: ChatSessionAuditPayload,
	scope: WorkflowAuditExportScope,
	files: Record<string, string>
): Promise<Record<string, unknown>> => {
	const runs = selectRuns(payload, scope);
	const fileHashes: Record<string, string> = {};
	let hashesAvailable = true;
	for (const [path, content] of Object.entries(files)) {
		const hash = await sha256Hex(content);
		if (hash) fileHashes[path] = hash;
		else hashesAvailable = false;
	}
	return {
		schema_version: CHAT_WORKFLOW_AUDIT_BUNDLE_SCHEMA,
		audit_version: payload.workflows?.version ?? null,
		exported_at: new Date().toISOString(),
		captured_at: payload.workflows?.captured_at ?? null,
		atomic: false,
		incomplete: runs.some((run) => !run.is_terminal),
		scope: {
			kind: scope.kind,
			session_id: payload.session.id,
			turn_run_id: scope.kind === 'workflow' ? scope.turnRunId : null
		},
		counts: {
			workflow_runs: runs.length,
			steps: runs.reduce((n, r) => n + r.steps.length, 0),
			dispatches: runs.reduce((n, r) => n + r.dispatches.length, 0),
			document_reads: runs.reduce((n, r) => n + r.tool_calls.length, 0),
			shadows: runs.filter((r) => r.selection_shadow).length,
			ordinary_turns:
				scope.kind === 'session'
					? (payload.workflows?.ordinary_turn_ids.length ?? null)
					: null,
			messages: scope.kind === 'session' ? payload.messages.length : null,
			redactions: runs.reduce((n, r) => n + r.redactions, 0)
		},
		/** Hashes the engine stored with the records (canonical JSON of the original rows). */
		stored_record_hashes: Object.fromEntries(
			runs.map((run) => [run.turn_run_id, storedHashesForRun(run)])
		),
		/** SHA-256 of each exported file as written here (after redaction); distinct from stored hashes. */
		exported_file_hashes: hashesAvailable ? fileHashes : null,
		exported_file_hashes_note: hashesAvailable
			? 'sha256 of exported file bytes'
			: 'WebCrypto unavailable; file hashes not computed',
		coverage: {
			tables: payload.workflows?.tables ?? null,
			notes: payload.workflows?.notes ?? [],
			runs: Object.fromEntries(runs.map((run) => [run.turn_run_id, run.coverage]))
		},
		files: Object.keys(files).sort()
	};
};

export const buildWorkflowAuditBundleZip = async (
	payload: ChatSessionAuditPayload,
	scope: WorkflowAuditExportScope
): Promise<{ bytes: Uint8Array; name: string; files: Record<string, string> }> => {
	const files = buildWorkflowAuditBundleFiles(payload, scope);
	const manifest = await buildWorkflowAuditManifest(payload, scope, files);
	files['manifest.json'] = `${toJson(manifest)}\n`;
	const folder = buildWorkflowAuditBaseName(payload, scope);
	const zippable: Record<string, Uint8Array> = {};
	for (const [path, content] of Object.entries(files))
		zippable[`${folder}/${path}`] = strToU8(content);
	return { bytes: zipSync(zippable, { level: 6 }), name: folder, files };
};

export const buildWorkflowAuditMarkdown = (
	payload: ChatSessionAuditPayload,
	scope: WorkflowAuditExportScope
): string => {
	const runs = selectRuns(payload, scope);
	const lines = [
		`# Workflow audit: ${escapeMarkdownInline(payload.session.title, 120)}`,
		'',
		metricLine('Scope', scopeLabel(scope)),
		metricLine('Exported at', new Date().toISOString()),
		metricLine('Captured at', payload.workflows?.captured_at ?? 'unknown'),
		metricLine('Session', payload.session.id),
		metricLine('User', `${payload.session.user.name} <${payload.session.user.email}>`),
		''
	];
	if (runs.length === 0) lines.push('_No workflow runs matched this scope._', '');
	for (const run of runs) {
		// Each run report starts at `#`; nest every run one level under the document title.
		lines.push(...demoteMarkdownHeadings(buildWorkflowReportSection(run), 1));
		lines.push(...demoteMarkdownHeadings(buildWorkflowTranscriptSection(payload, run), 1));
		lines.push(...demoteMarkdownHeadings(buildWorkflowEvidenceSection(run), 1));
		lines.push(...demoteMarkdownHeadings(buildWorkflowCostsSection(run), 1));
		lines.push(...demoteMarkdownHeadings(buildWorkflowTimelineSection(run), 1));
		lines.push(
			'<details>',
			`<summary>Raw records for turn ${run.turn_run_id}</summary>`,
			'',
			codeFence(
				toJson({
					steps: run.steps,
					dispatches: run.dispatches,
					document_reads: run.tool_calls,
					specialist_snapshot: run.specialist_snapshot,
					selection_shadow: run.selection_shadow,
					input_artifact: run.input_artifact,
					progress_events: run.progress_events
				}),
				'json'
			),
			'',
			'</details>',
			''
		);
	}
	if (payload.workflows) {
		lines.push('## Capture coverage', '');
		for (const [table, cov] of Object.entries(payload.workflows.tables))
			lines.push(
				`- ${table}: ${cov.status}${cov.count !== undefined ? ` (${cov.count} rows)` : ''}${cov.detail ? ` — ${escapeMarkdownInline(cov.detail, 200)}` : ''}`
			);
		for (const note of payload.workflows.notes)
			lines.push(`- ${escapeMarkdownInline(note, 300)}`);
		lines.push('');
	}
	return lines.join('\n').trimEnd() + '\n';
};

// ---------------------------------------------------------------------------
// Browser downloads
// ---------------------------------------------------------------------------

const triggerDownload = (blob: Blob, filename: string): void => {
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = filename;
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
	URL.revokeObjectURL(url);
};

export const downloadWorkflowAuditMarkdown = (
	payload: ChatSessionAuditPayload,
	scope: WorkflowAuditExportScope
): string => {
	const markdown = buildWorkflowAuditMarkdown(payload, scope);
	triggerDownload(
		new Blob([markdown], { type: 'text/markdown;charset=utf-8' }),
		`${buildWorkflowAuditBaseName(payload, scope)}.md`
	);
	return markdown;
};

export const downloadWorkflowAuditBundle = async (
	payload: ChatSessionAuditPayload,
	scope: WorkflowAuditExportScope
): Promise<void> => {
	const { bytes, name } = await buildWorkflowAuditBundleZip(payload, scope);
	triggerDownload(new Blob([new Uint8Array(bytes)], { type: 'application/zip' }), `${name}.zip`);
};
