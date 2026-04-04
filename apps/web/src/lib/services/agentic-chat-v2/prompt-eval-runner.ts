// apps/web/src/lib/services/agentic-chat-v2/prompt-eval-runner.ts
import { v4 as uuidv4 } from 'uuid';
import type {
	ChatPromptEvalAssertionInsert,
	ChatPromptEvalRunInsert,
	Database,
	Json
} from '@buildos/shared-types';
import {
	evaluatePromptScenario,
	type PromptEvalResult,
	type PromptEvalTarget
} from './prompt-evaluator';
import {
	getPromptEvalScenario,
	listPromptEvalScenarios,
	type PromptEvalScenario
} from './prompt-eval-scenarios';

type TurnRunRow = Database['public']['Tables']['chat_turn_runs']['Row'];
type PromptSnapshotRow = Database['public']['Tables']['chat_prompt_snapshots']['Row'];
type TurnEventRow = Database['public']['Tables']['chat_turn_events']['Row'];
type ToolExecutionRow = Database['public']['Tables']['chat_tool_executions']['Row'];
type ChatMessageRow = Database['public']['Tables']['chat_messages']['Row'];
type ChatPromptEvalRunRow = Database['public']['Tables']['chat_prompt_eval_runs']['Row'];
type ChatPromptEvalAssertionRow =
	Database['public']['Tables']['chat_prompt_eval_assertions']['Row'];

export type PromptEvalLoadedTarget = {
	turnRun: TurnRunRow;
	promptSnapshot: PromptSnapshotRow | null;
	events: TurnEventRow[];
	toolExecutions: ToolExecutionRow[];
	userMessage: ChatMessageRow | null;
	assistantMessage: ChatMessageRow | null;
};

export type PersistedPromptEval = {
	scenario: PromptEvalScenario;
	target: PromptEvalLoadedTarget;
	result: PromptEvalResult;
	evalRun: ChatPromptEvalRunInsert;
	assertions: ChatPromptEvalAssertionInsert[];
};

function toJson(value: unknown): Json | null {
	if (value === undefined) return null;
	if (
		value === null ||
		typeof value === 'string' ||
		typeof value === 'number' ||
		typeof value === 'boolean'
	) {
		return value as Json;
	}
	if (Array.isArray(value) || typeof value === 'object') {
		return JSON.parse(JSON.stringify(value)) as Json;
	}
	return String(value) as Json;
}

export function listAvailablePromptEvalScenarios(): PromptEvalScenario[] {
	return listPromptEvalScenarios();
}

export function normalizePromptEvalRunnerType(value: string | null | undefined): string {
	if (typeof value !== 'string') return 'admin_manual';
	const normalized = value.trim();
	return normalized.length > 0 ? normalized : 'admin_manual';
}

export async function loadPromptEvalTarget(
	supabase: any,
	turnRunId: string
): Promise<PromptEvalLoadedTarget | null> {
	const { data: turnRun, error: turnRunError } = await supabase
		.from('chat_turn_runs')
		.select('*')
		.eq('id', turnRunId)
		.single();

	if (turnRunError || !turnRun) {
		return null;
	}

	const [
		{ data: promptSnapshot },
		{ data: events },
		{ data: toolExecutions },
		{ data: userMessage },
		{ data: assistantMessage }
	] = await Promise.all([
		supabase
			.from('chat_prompt_snapshots')
			.select('*')
			.eq('turn_run_id', turnRunId)
			.maybeSingle(),
		supabase
			.from('chat_turn_events')
			.select('*')
			.eq('turn_run_id', turnRunId)
			.order('sequence_index', { ascending: true }),
		supabase
			.from('chat_tool_executions')
			.select('*')
			.eq('turn_run_id', turnRunId)
			.order('sequence_index', { ascending: true }),
		turnRun.user_message_id
			? supabase
					.from('chat_messages')
					.select('*')
					.eq('id', turnRun.user_message_id)
					.maybeSingle()
			: Promise.resolve({ data: null, error: null }),
		turnRun.assistant_message_id
			? supabase
					.from('chat_messages')
					.select('*')
					.eq('id', turnRun.assistant_message_id)
					.maybeSingle()
			: Promise.resolve({ data: null, error: null })
	]);

	return {
		turnRun,
		promptSnapshot: (promptSnapshot as PromptSnapshotRow | null) ?? null,
		events: (events as TurnEventRow[]) ?? [],
		toolExecutions: (toolExecutions as ToolExecutionRow[]) ?? [],
		userMessage: (userMessage as ChatMessageRow | null) ?? null,
		assistantMessage: (assistantMessage as ChatMessageRow | null) ?? null
	};
}

export function buildPromptEvalTarget(target: PromptEvalLoadedTarget): PromptEvalTarget {
	return {
		turnRun: {
			id: target.turnRun.id,
			status: target.turnRun.status,
			finished_reason: target.turnRun.finished_reason,
			first_lane: target.turnRun.first_lane,
			first_skill_path: target.turnRun.first_skill_path,
			first_canonical_op: target.turnRun.first_canonical_op,
			validation_failure_count: target.turnRun.validation_failure_count,
			prompt_snapshot: target.promptSnapshot
				? {
						id: target.promptSnapshot.id,
						approx_prompt_tokens: target.promptSnapshot.approx_prompt_tokens,
						rendered_dump_text: target.promptSnapshot.rendered_dump_text
					}
				: null
		},
		assistantMessage: target.assistantMessage
			? {
					id: target.assistantMessage.id,
					content: target.assistantMessage.content
				}
			: null,
		userMessage: target.userMessage
			? {
					id: target.userMessage.id,
					content: target.userMessage.content
				}
			: null,
		events: target.events.map((event) => ({
			event_type: event.event_type,
			payload:
				event.payload && typeof event.payload === 'object' && !Array.isArray(event.payload)
					? (event.payload as Record<string, unknown>)
					: null
		})),
		toolExecutions: target.toolExecutions.map((tool) => ({
			gateway_op: tool.gateway_op,
			help_path: tool.help_path,
			success: tool.success,
			error_message: tool.error_message
		}))
	};
}

export async function evaluateAndPersistPromptEval(params: {
	supabase: any;
	turnRunId: string;
	scenarioSlug: string;
	createdByUserId: string;
	runnerType?: string;
}): Promise<PersistedPromptEval> {
	const scenario = getPromptEvalScenario(params.scenarioSlug);
	if (!scenario) {
		throw new Error(`Unknown prompt eval scenario: ${params.scenarioSlug}`);
	}

	const target = await loadPromptEvalTarget(params.supabase, params.turnRunId);
	if (!target) {
		throw new Error(`Turn run not found: ${params.turnRunId}`);
	}

	const result = evaluatePromptScenario(scenario, buildPromptEvalTarget(target));
	const nowIso = new Date().toISOString();
	const evalRunId = uuidv4();
	const evalRun: ChatPromptEvalRunInsert = {
		id: evalRunId,
		turn_run_id: target.turnRun.id,
		scenario_slug: scenario.slug,
		scenario_version: scenario.version,
		runner_type: normalizePromptEvalRunnerType(params.runnerType),
		status: result.status,
		summary: result.summary,
		started_at: nowIso,
		completed_at: nowIso,
		created_by: params.createdByUserId,
		created_at: nowIso
	};
	const assertions: ChatPromptEvalAssertionInsert[] = result.assertions.map((assertion) => ({
		id: uuidv4(),
		eval_run_id: evalRunId,
		assertion_key: assertion.assertionKey,
		status: assertion.status,
		expected: toJson(assertion.expected),
		actual: toJson(assertion.actual),
		details: assertion.details,
		created_at: nowIso
	}));

	const { error: evalRunError } = await params.supabase
		.from('chat_prompt_eval_runs')
		.insert(evalRun);
	if (evalRunError) {
		throw evalRunError;
	}

	if (assertions.length > 0) {
		const { error: assertionsError } = await params.supabase
			.from('chat_prompt_eval_assertions')
			.insert(assertions);
		if (assertionsError) {
			throw assertionsError;
		}
	}

	return {
		scenario,
		target,
		result,
		evalRun,
		assertions
	};
}

export async function loadPromptEvalResultsForTurnRuns(
	supabase: any,
	turnRunIds: string[]
): Promise<{
	evalRuns: ChatPromptEvalRunRow[];
	assertions: ChatPromptEvalAssertionRow[];
}> {
	if (!Array.isArray(turnRunIds) || turnRunIds.length === 0) {
		return { evalRuns: [], assertions: [] };
	}

	const { data: evalRuns, error: evalRunsError } = await supabase
		.from('chat_prompt_eval_runs')
		.select('*')
		.in('turn_run_id', turnRunIds)
		.order('created_at', { ascending: false });
	if (evalRunsError) {
		const message = String((evalRunsError as { message?: string })?.message ?? '');
		if (
			(evalRunsError as { code?: string })?.code === '42P01' ||
			/does not exist/i.test(message)
		) {
			return { evalRuns: [], assertions: [] };
		}
		throw evalRunsError;
	}
	const evalRunIds = (evalRuns ?? []).map((row: { id: string }) => row.id);
	if (evalRunIds.length === 0) {
		return { evalRuns: (evalRuns as ChatPromptEvalRunRow[]) ?? [], assertions: [] };
	}
	const { data: assertions, error: assertionsError } = await supabase
		.from('chat_prompt_eval_assertions')
		.select('*')
		.in('eval_run_id', evalRunIds)
		.order('created_at', { ascending: true });
	if (assertionsError) {
		const message = String((assertionsError as { message?: string })?.message ?? '');
		if (
			(assertionsError as { code?: string })?.code === '42P01' ||
			/does not exist/i.test(message)
		) {
			return { evalRuns: (evalRuns as ChatPromptEvalRunRow[]) ?? [], assertions: [] };
		}
		throw assertionsError;
	}

	return {
		evalRuns: (evalRuns as ChatPromptEvalRunRow[]) ?? [],
		assertions: (assertions as ChatPromptEvalAssertionRow[]) ?? []
	};
}
