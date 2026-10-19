// scripts/agentic/write-review-reasons.ts
// GET-only production report; no model calls, writes, prompts or argument values in output.
// node --import tsx scripts/agentic/write-review-reasons.ts --from <ISO> --to <ISO>
// --input <snapshot.json> runs offline; --json <path> saves only content-free results.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'dotenv';

type Row = Record<string, any>;
export type ReviewEvidence = {
	usage: Row[];
	users: Row[];
	tools: Row[];
	observations: Row[];
	events: Row[];
};
type Outcome = 'approved' | 'revise' | 'refuse' | 'invalid' | 'unknown';
type Review = {
	id: string;
	turnId: string | null;
	cohort: 'real' | 'harness' | 'unknown';
	reason: string;
	outcome: Outcome;
	batchKey: string;
	tools: string[];
	count: number | null;
	evidence: 'recorded' | 'deleted_turn_link' | 'original_proposal_not_persisted';
	hasEvents: boolean;
	hasTools: boolean;
};
const REASONS = new Set([
	'mixed_tool_batch',
	'mutation_count_exceeded',
	'operation_requires_contract',
	'ordered_or_dependent_batch',
	'external_content_requires_review',
	'source_fidelity_requires_review',
	'target_resolution_requires_review',
	'reviewed_turn_continuation'
]);
const DECISIONS: Record<string, Outcome> = {
	approve_mutation_batch_review: 'approved',
	request_proposal_revision: 'revise',
	declare_read_only_turn: 'refuse',
	request_turn_clarification: 'refuse'
};
const OUTCOMES: Record<string, Outcome> = {
	approved: 'approved',
	revision_requested: 'revise',
	read_only: 'refuse',
	clarification: 'refuse',
	invalid: 'invalid'
};
const time = (value: unknown) => Date.parse(String(value));

export function analyzeReviews(input: ReviewEvidence): Review[] {
	const users = new Map(input.users.map((row) => [row.id, row.email]));
	const passes = input.usage
		.filter((row) => row.metadata?.passRole === 'mutation_review')
		.sort((a, b) => time(a.request_started_at) - time(b.request_started_at));
	return passes.map((pass) => {
		const metadata = pass.metadata ?? {};
		const turnId = pass.turn_run_id ?? null;
		const start = time(pass.request_started_at);
		const siblings = turnId
			? passes.filter((row) => row.turn_run_id === turnId && row.id !== pass.id)
			: [];
		const next = siblings.find((row) => time(row.request_started_at) > start);
		const end = next ? time(next.request_started_at) : Infinity;
		const inWindow = (stamp: unknown) => time(stamp) >= start && time(stamp) < end;
		const observations = turnId
			? input.observations.filter(
					(row) =>
						row.turn_run_id === turnId &&
						row.payload?.logical_provider_round === metadata.logicalProviderRound &&
						inWindow(row.observed_at)
				)
			: [];
		const decisions = turnId
			? input.tools.filter(
					(row) =>
						row.turn_run_id === turnId &&
						row.success === true &&
						Object.hasOwn(DECISIONS, row.tool_name) &&
						inWindow(row.created_at)
				)
			: [];
		// Retries/hedges can share a logical round. Never attach one verdict to two attempts.
		const overlapping = siblings.some(
			(row) =>
				time(row.request_started_at) === start ||
				(time(row.request_started_at) < start && time(row.request_completed_at) > start) ||
				(time(row.request_started_at) > start &&
					time(row.request_started_at) < time(pass.request_completed_at))
		);
		// Format repairs reuse the logical round. Their observations are written
		// asynchronously, so an earlier decision may arrive during the next pass.
		// Usage providerAttempt and observation review_attempt are different counters;
		// timestamps alone cannot bind a decision to either physical request.
		const repeatedRound = siblings.some(
			(row) => row.metadata?.logicalProviderRound === metadata.logicalProviderRound
		);
		let outcome: Outcome = 'unknown';
		if (!overlapping && !repeatedRound && pass.status === 'success') {
			if (observations.length === 1)
				outcome = OUTCOMES[observations[0].payload.review_outcome] ?? 'unknown';
			else if (observations.length === 0 && decisions.length === 1)
				outcome = DECISIONS[decisions[0].tool_name]!;
		}
		const reason = REASONS.has(metadata.writeRouteReason)
			? metadata.writeRouteReason
			: 'unknown';
		const email = users.get(pass.user_id);
		// This is a structured account-address prefix, not classification of user prose.
		const cohort =
			typeof email !== 'string'
				? 'unknown'
				: email.startsWith('agentic-e2e')
					? 'harness'
					: 'real';
		return {
			id: pass.id,
			turnId,
			cohort,
			reason,
			outcome,
			batchKey: `${turnId ?? pass.stream_run_id ?? pass.id}:${metadata.writeRouteBatchSha256 ?? metadata.logicalProviderRound ?? pass.id}`,
			tools: Array.isArray(metadata.writeRouteTools)
				? metadata.writeRouteTools.filter(
						(v: unknown) => typeof v === 'string' && /^[a-z][a-z0-9_]{0,127}$/.test(v)
					)
				: [],
			count:
				Number.isSafeInteger(metadata.writeRouteCount) && metadata.writeRouteCount >= 0
					? metadata.writeRouteCount
					: null,
			evidence:
				reason !== 'unknown'
					? 'recorded'
					: !turnId
						? 'deleted_turn_link'
						: 'original_proposal_not_persisted',
			hasEvents: Boolean(turnId && input.events.some((row) => row.turn_run_id === turnId)),
			hasTools: Boolean(turnId && input.tools.some((row) => row.turn_run_id === turnId))
		};
	});
}

export function renderReviewReport(rows: Review[]): string {
	const lines = [
		'| Cohort | Route reason | Passes | Distinct batch/round keys | Approved | Revise | Refuse | Invalid | Unknown verdict | Approval / known decisions |',
		'| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |'
	];
	const keys = [...new Set(rows.map((row) => `${row.cohort}:${row.reason}`))].sort();
	for (const key of keys) {
		const group = rows.filter((row) => `${row.cohort}:${row.reason}` === key);
		const count = (outcome: Outcome) => group.filter((row) => row.outcome === outcome).length;
		const known = group.length - count('unknown');
		lines.push(
			`| ${key.replace(':', ' | ')} | ${group.length} | ${new Set(group.map((row) => row.batchKey)).size} | ${count('approved')} | ${count('revise')} | ${count('refuse')} | ${count('invalid')} | ${count('unknown')} | ${known ? `${((100 * count('approved')) / known).toFixed(1)}%` : 'unknown'} |`
		);
	}
	lines.push(
		'',
		'Approval rates exclude unknown verdicts. Passes are not independent batch samples; this table alone never authorizes widening.',
		'',
		'Historical replay limitation: production stores executed tools, approval hashes and review rejection diagnostics, not the original withheld proposal. Rejected calls and mixed-batch reads may be absent. A matching executed-write digest cannot prove the original batch had no reads. Recomputing the router from those surviving writes would bias the result toward approvals, so routes without recorded telemetry remain unknown.',
		'',
		'| Cohort | Passes | Linked turns | Passes with tool history | Passes with turn events |',
		'| --- | ---: | ---: | ---: | ---: |'
	);
	for (const cohort of ['real', 'harness', 'unknown'] as const) {
		const group = rows.filter((row) => row.cohort === cohort);
		if (group.length)
			lines.push(
				`| ${cohort} | ${group.length} | ${new Set(group.map((row) => row.turnId).filter(Boolean)).size} | ${group.filter((row) => row.hasTools).length} | ${group.filter((row) => row.hasEvents).length} |`
			);
	}
	return lines.join('\n');
}

async function readEvidence(from: string, to: string): Promise<ReviewEvidence> {
	const root = fileURLToPath(new URL('../../', import.meta.url));
	const env = parse(readFileSync(resolve(root, 'apps/web/.env')));
	const url = env.PUBLIC_SUPABASE_URL;
	const key = env.PRIVATE_SUPABASE_SERVICE_KEY;
	if (!url || !key) throw new Error('Missing production read credentials in apps/web/.env');
	const get = async (query: string): Promise<Row[]> => {
		const rows: Row[] = [];
		for (let offset = 0; ; offset += 1000) {
			const response = await fetch(`${url}/rest/v1/${query}&limit=1000&offset=${offset}`, {
				method: 'GET',
				headers: { apikey: key, Authorization: `Bearer ${key}` },
				signal: AbortSignal.timeout(30_000)
			});
			// Never echo an error body: it may include argument values or credentials.
			if (!response.ok)
				throw new Error(`Read of ${query.split('?')[0]} failed (${response.status})`);
			const page = (await response.json()) as Row[];
			rows.push(...page);
			if (page.length < 1000) return rows;
		}
	};
	const usage = await get(
		`llm_usage_logs?select=id,user_id,turn_run_id,stream_run_id,status,request_started_at,request_completed_at,metadata&metadata->>passRole=eq.mutation_review&created_at=gte.${encodeURIComponent(from)}&created_at=lt.${encodeURIComponent(to)}&order=created_at.asc,id.asc`
	);
	const ids = [...new Set(usage.map((row) => row.turn_run_id).filter(Boolean))];
	const userIds = [...new Set(usage.map((row) => row.user_id))];
	const result: ReviewEvidence = { usage, users: [], tools: [], observations: [], events: [] };
	for (let i = 0; i < userIds.length; i += 50)
		result.users.push(
			...(await get(
				`users?select=id,email&id=in.(${userIds.slice(i, i + 50).join(',')})&order=id.asc`
			))
		);
	for (let i = 0; i < ids.length; i += 50) {
		const filter = `turn_run_id=in.(${ids.slice(i, i + 50).join(',')})`;
		// Only structure, timestamps and decision codes; no messages, bodies or arguments fetched.
		result.tools.push(
			...(await get(
				`chat_tool_executions?select=id,turn_run_id,tool_name,success,created_at&${filter}&order=created_at.asc,id.asc`
			))
		);
		result.observations.push(
			...(await get(
				`agentic_chat_execution_observations?select=id,turn_run_id,execution_generation,observed_at,payload&event_type=eq.provider_review_decided&${filter}&order=observed_at.asc,id.asc`
			))
		);
		result.events.push(
			...(await get(
				`chat_turn_events?select=id,turn_run_id&event_type=eq.agent_state&${filter}&order=id.asc`
			))
		);
	}
	return result;
}

async function main() {
	const args = process.argv.slice(2);
	const options = new Map<string, string>();
	for (let i = 0; i < args.length; i += 2) {
		if (!['--from', '--to', '--input', '--json'].includes(args[i]!) || !args[i + 1])
			throw new Error(
				'Use --from/--to ISO dates, --input snapshot.json, or --json output.json'
			);
		options.set(args[i]!, args[i + 1]!);
	}
	const to = new Date(options.get('--to') ?? Date.now()).toISOString();
	const from = new Date(options.get('--from') ?? time(to) - 30 * 86_400_000).toISOString();
	if (time(from) >= time(to)) throw new Error('--from must precede --to');
	const evidence: ReviewEvidence = options.has('--input')
		? JSON.parse(readFileSync(options.get('--input')!, 'utf8'))
		: await readEvidence(from, to);
	const rows = analyzeReviews(evidence);
	console.log(`Window: ${from} to ${to} (exclusive)\n\n${renderReviewReport(rows)}`);
	if (options.has('--json'))
		writeFileSync(options.get('--json')!, JSON.stringify({ from, to, rows }, null, 2) + '\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main().catch(() => {
		console.error(
			'Write-review report failed; check arguments and read access. No data was written to production.'
		);
		process.exitCode = 1;
	});
}
