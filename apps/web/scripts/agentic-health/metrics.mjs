const REVIEWER_ROUTE_ID = 'openrouter_semantic_reviewer';

export const CONTROL_TOOL_NAMES = new Set([
	'declare_turn_contract',
	'approve_mutation_batch_review',
	'approve_turn_contract_review',
	'request_proposal_revision',
	'declare_read_only_turn',
	'approve_read_only_turn_review',
	'request_turn_clarification',
	'cancel_turn_contract'
]);

const WRITE_TOOL_CATEGORIES = new Set(['action', 'ontology_action']);
const F7_READ_CANARY_PATTERNS = [
	/unique marker\s+cutover[^\s]*no[^\s]*match/i,
	/search my email for the invoice from stripe/i,
	/where are we at with this book/i
];

export function buildHealthReport({
	window,
	turns = [],
	usage = [],
	tools = [],
	events = [],
	observations = [],
	messages = [],
	queueJobs = [],
	sanitize
}) {
	const generatedAt = new Date().toISOString();
	const durationDays =
		(new Date(window.until).getTime() - new Date(window.since).getTime()) / 86_400_000;
	const turnById = new Map(turns.map((turn) => [turn.id, turn]));
	const messageById = new Map(messages.map((message) => [message.id, message]));
	const workerTurns = turns.filter(isWorkerTurn);
	const completedWorkerTurns = workerTurns.filter((turn) => turn.status === 'completed');
	const reviewerUsage = usage.filter(isReviewerUsage);
	const workerUsage = usage.filter((row) => row.operation_type === 'agentic_chat_worker_stream');
	const reviewerTurnIds = new Set(reviewerUsage.map((row) => row.turn_run_id).filter(Boolean));

	const invalidKills = turns.filter(
		(turn) => turn.failure_code === 'provider_tool_finish_reason_invalid'
	).length;

	const truncationObservations = observations.filter(
		(row) => observationErrorClass(row) === 'provider_tool_arguments_truncated'
	);
	const truncationTurnIds = uniqueTurnIds(truncationObservations);
	const completedTruncationTurns = [...truncationTurnIds].filter(
		(id) => turnById.get(id)?.status === 'completed'
	).length;
	const truncationCompletionRate = ratio(completedTruncationTurns, truncationTurnIds.size);

	const notAllowlistedKills = turns.filter(
		(turn) => turn.failure_code === 'provider_tool_not_allowlisted'
	).length;
	const notAllowlistedObservations = observations.filter(
		(row) => observationErrorClass(row) === 'provider_tool_not_allowlisted'
	);
	const explicitSurfaceRepairs = [...observations, ...events].filter(
		(row) => row.event_type === 'surface_repair'
	).length;
	const inferredSurfaceRepairTurnIds = uniqueTurnIds(notAllowlistedObservations);
	const inferredSurfaceRepairs = [...inferredSurfaceRepairTurnIds].filter(
		(id) => turnById.get(id)?.status === 'completed'
	).length;

	const reviewerPromptTokens = sum(reviewerUsage, (row) => row.prompt_tokens);
	const reviewerCachedTokens = sum(reviewerUsage, (row) => row.cached_prompt_tokens);
	const reviewerCacheTokenRate = ratio(reviewerCachedTokens, reviewerPromptTokens);
	const reviewerCacheCallRate = ratio(
		reviewerUsage.filter((row) => numeric(row.cached_prompt_tokens) > 0).length,
		reviewerUsage.length
	);
	const reviewerLatencies = reviewerUsage
		.map((row) => numericOrNull(row.response_time_ms))
		.filter((value) => value !== null);
	const reviewerP50Ms = percentile(reviewerLatencies, 0.5);
	const reviewerP90Ms = percentile(reviewerLatencies, 0.9);
	const reviewerCost = sum(reviewerUsage, (row) => row.total_cost_usd);
	const workerModelCost = sum(workerUsage, (row) => row.total_cost_usd);
	const reviewerSpendShare = ratio(reviewerCost, workerModelCost);

	const writeTurnIds = new Set(
		tools
			.filter((row) => WRITE_TOOL_CATEGORIES.has(row.tool_category) || Boolean(row.effect_id))
			.map((row) => row.turn_run_id)
			.filter(Boolean)
	);
	const contractWriteTurns = [...writeTurnIds].filter((id) => reviewerTurnIds.has(id)).length;
	const directWriteTurns = writeTurnIds.size - contractWriteTurns;
	const restraintCanaryTurns = turns.filter(isRestraintCanary);
	const reviewedRestraintCanaries = restraintCanaryTurns.filter((turn) =>
		reviewerTurnIds.has(turn.id)
	).length;

	const controlCalls = tools.filter((row) => CONTROL_TOOL_NAMES.has(row.tool_name)).length;
	const controlCallShare = ratio(controlCalls, tools.length);

	const partialTurns = turns.filter((turn) => turn.finished_reason === 'mutation_unfulfilled');
	const disclosedPartialTurns = partialTurns.filter((turn) => {
		const content = messageById.get(turn.assistant_message_id)?.content ?? '';
		return /\bDone:\s*\d+\s+of\s+\d+\b/i.test(content);
	}).length;

	const assistantReplies = turns
		.map((turn) => messageById.get(turn.assistant_message_id))
		.filter((message) => message?.role === 'assistant' && message.content?.trim())
		.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
		.slice(0, 76);
	const sanitizerAltered = assistantReplies.filter((message) => {
		const cleaned = sanitize(message.content);
		return cleaned !== message.content;
	}).length;

	const workerWriteTurns = workerTurns.filter((turn) => writeTurnIds.has(turn.id));
	const preloadedWorkerWriteTurns = workerWriteTurns.filter((turn) =>
		hasSkillPreload(messageById.get(turn.user_message_id))
	);
	const f7ReadTurns = workerTurns.filter(isF7ReadCanary);
	const preloadedF7ReadTurns = f7ReadTurns.filter((turn) =>
		hasSkillPreload(messageById.get(turn.user_message_id))
	);
	const preloadBreakdown = countBy(preloadedWorkerWriteTurns, (turn) => {
		const metadata = messageById.get(turn.user_message_id)?.metadata;
		return `${metadata?.skill_preloaded_id ?? 'unknown'}:${metadata?.skill_preload_source ?? 'unknown'}`;
	});

	const delegateCalls = tools.filter((row) => row.tool_name === 'delegate_task');
	const successfulDelegateCalls = delegateCalls.filter((row) => row.success === true).length;
	const delegateSuccessRate = ratio(successfulDelegateCalls, delegateCalls.length);

	const throttleTurnIds = uniqueTurnIds(
		observations.filter((row) => observationErrorClass(row) === 'provider_throttle')
	);
	const throttleJobs = queueJobs.filter((job) => {
		const relatedTurn = turns.find((turn) => turn.queue_job_id === job.id);
		return (
			(relatedTurn && throttleTurnIds.has(relatedTurn.id)) ||
			/provider_throttle/i.test(
				`${job.error_message ?? ''} ${JSON.stringify(job.metadata ?? {})}`
			)
		);
	});
	const throttleDelaysSeconds = throttleJobs
		.map(requeueDelaySeconds)
		.filter((value) => value !== null && value >= 0);
	const throttleDelayInRange = throttleDelaysSeconds.filter(
		(seconds) => seconds >= 5 && seconds <= 65
	).length;

	const timingByTurn = new Map();
	for (const event of events) {
		if (!['timing', 'done', 'turn_timing', 'terminal'].includes(event.event_type)) continue;
		const totalMs = totalRequestMs(event.payload);
		if (totalMs !== null) timingByTurn.set(event.turn_run_id, totalMs);
	}
	const workerDurationsMs = completedWorkerTurns
		.map((turn) => timingByTurn.get(turn.id) ?? null)
		.filter((value) => value !== null);
	const workerP50Ms = percentile(workerDurationsMs, 0.5);
	const workerP90Ms = percentile(workerDurationsMs, 0.9);

	const zeroLlmPassTurns = completedWorkerTurns.filter(
		(turn) => numeric(turn.llm_pass_count) === 0
	).length;
	const internalCohortRejected = turns.filter(
		(turn) => turn.failure_code === 'internal_cohort_rejected'
	).length;
	const legacyTurns = turns.filter((turn) => !isWorkerTurn(turn));

	const metrics = [
		metric({
			id: 'provider_finish_reason_invalid_kills',
			label: 'Invalid finish-reason kills',
			baseline: "3 of DJ's 31 turns",
			target: '0',
			status: invalidKills === 0 ? 'pass' : 'fail',
			value: String(invalidKills),
			details: { kills: invalidKills }
		}),
		metric({
			id: 'truncation_retry_completion',
			label: 'Truncation retries completed',
			baseline: 'n/a (new)',
			target: '>=90%',
			status:
				truncationTurnIds.size === 0
					? 'no_data'
					: truncationCompletionRate >= 0.9
						? 'pass'
						: 'fail',
			value: formatRate(
				truncationCompletionRate,
				completedTruncationTurns,
				truncationTurnIds.size
			),
			details: {
				retry_turns: truncationTurnIds.size,
				completed_turns: completedTruncationTurns,
				completion_rate: truncationCompletionRate
			}
		}),
		metric({
			id: 'provider_tool_not_allowlisted',
			label: 'Non-allowlisted tool kills / repairs',
			baseline: 'Theo Von turn + others',
			target: '0 kills; repairs counted',
			status: notAllowlistedKills === 0 ? 'pass' : 'fail',
			value: `${notAllowlistedKills} kills; ${explicitSurfaceRepairs} explicit / ${inferredSurfaceRepairs} inferred repairs`,
			details: {
				kills: notAllowlistedKills,
				explicit_surface_repairs: explicitSurfaceRepairs,
				inferred_completed_repair_turns: inferredSurfaceRepairs,
				telemetry_note:
					explicitSurfaceRepairs === 0 && inferredSurfaceRepairs > 0
						? 'No explicit surface_repair receipt exists; completed turns after matching provider failures are inferred repairs.'
						: null
			}
		}),
		metric({
			id: 'reviewer_cache_latency',
			label: 'Reviewer cache / latency',
			baseline: '0% cache; Azure tail 63-73s',
			target: '>50% token cache; p90 <30s',
			status:
				reviewerUsage.length === 0
					? 'no_data'
					: reviewerCacheTokenRate > 0.5 && reviewerP90Ms < 30_000
						? 'pass'
						: 'fail',
			value: `${formatPercent(reviewerCacheTokenRate)} cache; p50 ${formatSeconds(reviewerP50Ms)} / p90 ${formatSeconds(reviewerP90Ms)}`,
			details: {
				calls: reviewerUsage.length,
				call_hit_rate: reviewerCacheCallRate,
				token_cache_rate: reviewerCacheTokenRate,
				p50_ms: reviewerP50Ms,
				p90_ms: reviewerP90Ms
			}
		}),
		metric({
			id: 'reviewer_spend_share',
			label: 'Reviewer share of worker spend',
			baseline: '24%',
			target: '<24% (falling)',
			status: workerModelCost <= 0 ? 'no_data' : reviewerSpendShare < 0.24 ? 'pass' : 'fail',
			value: formatPercent(reviewerSpendShare),
			details: {
				reviewer_cost_usd: round(reviewerCost, 6),
				worker_model_cost_usd: round(workerModelCost, 6),
				share: reviewerSpendShare
			}
		}),
		metric({
			id: 'write_lane_share',
			label: 'Write turns: direct / contract',
			baseline: 'Contract for every existing-entity edit',
			target: 'Focused edits direct; restraint canary reviewed',
			status:
				writeTurnIds.size === 0
					? 'no_data'
					: restraintCanaryTurns.length === 0
						? 'watch'
						: reviewedRestraintCanaries === restraintCanaryTurns.length
							? 'pass'
							: 'fail',
			value: `${formatPercent(ratio(directWriteTurns, writeTurnIds.size))} direct (${directWriteTurns}/${writeTurnIds.size})`,
			details: {
				write_turns: writeTurnIds.size,
				direct_turns: directWriteTurns,
				contract_turns: contractWriteTurns,
				restraint_canary_turns: restraintCanaryTurns.length,
				restraint_canary_reviewed: reviewedRestraintCanaries
			}
		}),
		metric({
			id: 'control_call_share',
			label: 'Control-call share',
			baseline: '22.3%',
			target: 'Reported, not targeted',
			status: tools.length === 0 ? 'no_data' : 'informational',
			value: formatRate(controlCallShare, controlCalls, tools.length),
			details: {
				control_calls: controlCalls,
				tool_executions: tools.length,
				share: controlCallShare
			}
		}),
		metric({
			id: 'mutation_unfulfilled_disclosure',
			label: 'Partial-write disclosure',
			baseline: '0 disclosed',
			target: 'Every partial fulfilment says Done: N of M',
			status:
				partialTurns.length === 0 || disclosedPartialTurns === partialTurns.length
					? 'pass'
					: 'fail',
			value: `${disclosedPartialTurns}/${partialTurns.length} disclosed`,
			details: {
				partial_turns: partialTurns.length,
				disclosed_turns: disclosedPartialTurns,
				missing_disclosure: partialTurns.length - disclosedPartialTurns
			}
		}),
		metric({
			id: 'sanitizer_edits',
			label: 'Sanitizer-altered replies',
			baseline: '38/76',
			target: '<=6/76',
			status:
				assistantReplies.length === 0
					? 'no_data'
					: sanitizerAltered > 6
						? 'fail'
						: assistantReplies.length < 76
							? 'watch'
							: 'pass',
			value: `${sanitizerAltered}/${assistantReplies.length} altered`,
			details: { sample_size: assistantReplies.length, altered: sanitizerAltered }
		}),
		metric({
			id: 'worker_skill_preloads',
			label: 'Worker skill preloads',
			baseline: 'Never fired on prepared hits',
			target: 'Fires on writes; 0 on F7 reads',
			status:
				workerWriteTurns.length === 0
					? 'no_data'
					: preloadedF7ReadTurns.length > 0
						? 'fail'
						: preloadedWorkerWriteTurns.length > 0
							? 'pass'
							: 'watch',
			value: `${preloadedWorkerWriteTurns.length}/${workerWriteTurns.length} writes; ${preloadedF7ReadTurns.length}/${f7ReadTurns.length} F7 reads`,
			details: {
				worker_write_turns: workerWriteTurns.length,
				preloaded_worker_write_turns: preloadedWorkerWriteTurns.length,
				f7_read_turns: f7ReadTurns.length,
				preloaded_f7_read_turns: preloadedF7ReadTurns.length,
				preload_breakdown: preloadBreakdown
			}
		}),
		metric({
			id: 'delegate_task_success',
			label: 'delegate_task success',
			baseline: '4/4 since 08-30',
			target: '100%',
			status:
				delegateCalls.length === 0
					? 'no_data'
					: successfulDelegateCalls === delegateCalls.length
						? 'pass'
						: 'fail',
			value: formatRate(delegateSuccessRate, successfulDelegateCalls, delegateCalls.length),
			details: {
				calls: delegateCalls.length,
				successes: successfulDelegateCalls,
				success_rate: delegateSuccessRate
			}
		}),
		metric({
			id: 'throttle_requeue_delay',
			label: 'Throttle requeue delay',
			baseline: '60-120s',
			target: '5-65s',
			status:
				throttleDelaysSeconds.length === 0
					? 'no_data'
					: throttleDelayInRange === throttleDelaysSeconds.length
						? 'pass'
						: 'fail',
			value:
				throttleDelaysSeconds.length === 0
					? 'no samples'
					: `${formatNumber(percentile(throttleDelaysSeconds, 0.5), 1)}s p50; ${formatNumber(percentile(throttleDelaysSeconds, 0.9), 1)}s p90`,
			details: {
				throttle_jobs: throttleJobs.length,
				measurable_delays: throttleDelaysSeconds.length,
				in_target_range: throttleDelayInRange,
				p50_seconds: percentile(throttleDelaysSeconds, 0.5),
				p90_seconds: percentile(throttleDelaysSeconds, 0.9)
			}
		}),
		metric({
			id: 'completed_worker_latency',
			label: 'Completed worker turn latency',
			baseline: 'p50 21s / p90 70s',
			target: 'p50 <=21s; p90 <60s',
			status:
				workerDurationsMs.length === 0
					? 'no_data'
					: workerP50Ms <= 21_000 && workerP90Ms < 60_000
						? 'pass'
						: 'fail',
			value: `p50 ${formatSeconds(workerP50Ms)} / p90 ${formatSeconds(workerP90Ms)}`,
			details: {
				samples: workerDurationsMs.length,
				completed_worker_turns: completedWorkerTurns.length,
				p50_ms: workerP50Ms,
				p90_ms: workerP90Ms
			}
		}),
		metric({
			id: 'telemetry_zero_llm_passes',
			label: 'Completed workers with 0 LLM passes',
			baseline: '~20%',
			target: 'Reported for WP-6',
			status:
				completedWorkerTurns.length === 0
					? 'no_data'
					: zeroLlmPassTurns > 0
						? 'watch'
						: 'pass',
			value: formatRate(
				ratio(zeroLlmPassTurns, completedWorkerTurns.length),
				zeroLlmPassTurns,
				completedWorkerTurns.length
			),
			details: {
				turns: zeroLlmPassTurns,
				completed_worker_turns: completedWorkerTurns.length,
				share: ratio(zeroLlmPassTurns, completedWorkerTurns.length)
			}
		}),
		metric({
			id: 'telemetry_internal_cohort_rejected',
			label: 'internal_cohort_rejected rows',
			baseline: 'Audit telemetry hole',
			target: 'Reported for WP-6',
			status: internalCohortRejected > 0 ? 'watch' : 'pass',
			value: String(internalCohortRejected),
			details: { rows: internalCohortRejected }
		}),
		metric({
			id: 'legacy_lane_share',
			label: 'Legacy-lane turn share',
			baseline: 'Second harness exists',
			target: '0 before WP-2 lane deletion',
			status: turns.length === 0 ? 'no_data' : legacyTurns.length === 0 ? 'pass' : 'watch',
			value: formatRate(
				ratio(legacyTurns.length, turns.length),
				legacyTurns.length,
				turns.length
			),
			details: {
				legacy_turns: legacyTurns.length,
				all_turns: turns.length,
				by_execution_mode: countBy(turns, (turn) => turn.execution_mode ?? 'unknown'),
				note: 'This is the durable execution-mode proxy for transport renegotiation.'
			}
		})
	];

	return {
		schema_version: 1,
		generated_at: generatedAt,
		window: {
			since: window.since,
			until: window.until,
			duration_days: round(durationDays, 3),
			mature_seven_day_window: durationDays >= 7,
			user_scope: window.userId ? 'single_user' : 'all_users'
		},
		counts: {
			turns: turns.length,
			worker_turns: workerTurns.length,
			completed_worker_turns: completedWorkerTurns.length,
			tool_executions: tools.length,
			usage_rows: usage.length,
			observation_rows: observations.length
		},
		metrics,
		notes: [
			'Output is aggregate-only: no message text, email address, credential, or turn identifier is written.',
			'Acceptance remains provisional until the window contains seven full post-deploy days.',
			'Control-call share preserves the audit definition: control tool executions divided by all tool executions.'
		]
	};
}

export function consoleRows(report) {
	return report.metrics.map((row) => ({
		Metric: row.label,
		Value: row.value,
		Status: row.status,
		Target: row.target
	}));
}

function metric(row) {
	return row;
}

function isWorkerTurn(turn) {
	return String(turn.execution_mode ?? '').includes('worker');
}

function isReviewerUsage(row) {
	return (
		row.operation_type === 'agentic_chat_worker_stream' &&
		row.metadata?.routeId === REVIEWER_ROUTE_ID
	);
}

function observationErrorClass(row) {
	return row.payload?.error_class ?? row.payload?.failure_code ?? null;
}

function uniqueTurnIds(rows) {
	return new Set(rows.map((row) => row.turn_run_id).filter(Boolean));
}

function isRestraintCanary(turn) {
	return /cool\.\s*oh and the email one(?:'|’)?s done/i.test(turn.request_message ?? '');
}

function isF7ReadCanary(turn) {
	return F7_READ_CANARY_PATTERNS.some((pattern) => pattern.test(turn.request_message ?? ''));
}

function hasSkillPreload(message) {
	return Boolean(message?.metadata?.skill_preloaded_id);
}

function requeueDelaySeconds(job) {
	if (!job.updated_at || !job.scheduled_for) return null;
	const delay =
		(new Date(job.scheduled_for).getTime() - new Date(job.updated_at).getTime()) / 1000;
	return Number.isFinite(delay) ? delay : null;
}

function totalRequestMs(payload) {
	const candidates = [
		payload?.timing?.phases?.total_request_ms,
		payload?.async_timing?.phases?.total_request_ms,
		payload?.timing_summary?.phases?.total_request_ms,
		payload?.phases?.total_request_ms
	];
	for (const candidate of candidates) {
		const value = numericOrNull(candidate);
		if (value !== null && value >= 0) return value;
	}
	return null;
}

function percentile(values, p) {
	if (!values.length) return null;
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

function sum(rows, pick) {
	return rows.reduce((total, row) => total + numeric(pick(row)), 0);
}

function numeric(value) {
	const result = Number(value ?? 0);
	return Number.isFinite(result) ? result : 0;
}

function numericOrNull(value) {
	if (value === null || value === undefined || value === '') return null;
	const result = Number(value);
	return Number.isFinite(result) ? result : null;
}

function ratio(numerator, denominator) {
	return denominator > 0 ? numerator / denominator : null;
}

function formatRate(rate, numerator, denominator) {
	return `${formatPercent(rate)} (${numerator}/${denominator})`;
}

function formatPercent(value) {
	return value === null ? 'n/a' : `${formatNumber(value * 100, 1)}%`;
}

function formatSeconds(valueMs) {
	return valueMs === null ? 'n/a' : `${formatNumber(valueMs / 1000, 1)}s`;
}

function formatNumber(value, digits) {
	return value === null ? 'n/a' : Number(value.toFixed(digits)).toString();
}

function round(value, digits) {
	return Number(value.toFixed(digits));
}

function countBy(rows, pick) {
	return Object.fromEntries(
		Object.entries(
			rows.reduce((counts, row) => {
				const key = String(pick(row));
				counts[key] = (counts[key] ?? 0) + 1;
				return counts;
			}, {})
		).sort(([left], [right]) => left.localeCompare(right))
	);
}
