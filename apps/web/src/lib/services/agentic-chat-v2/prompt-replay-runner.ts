// apps/web/src/lib/services/agentic-chat-v2/prompt-replay-runner.ts
import { v4 as uuidv4 } from 'uuid';
import type { ChatContextType, Database } from '@buildos/shared-types';
import type { ProjectFocus } from '$lib/types/agent-chat-enhancement';
import type { FastAgentStreamRequest } from './types';
import {
	evaluateAndPersistPromptEval,
	normalizePromptEvalRunnerType,
	type PersistedPromptEval
} from './prompt-eval-runner';
import {
	getPromptEvalScenario,
	isPromptEvalScenarioReplayable,
	type PromptEvalReplayRequest,
	type PromptEvalScenario
} from './prompt-eval-scenarios';

type ChatTurnRunRow = Database['public']['Tables']['chat_turn_runs']['Row'];

type ReplayEventSummary = {
	sessionId: string | null;
	assistantText: string;
	errorMessages: string[];
	finishedReason: string | null;
	eventTypes: string[];
};

export type PromptReplayResult = {
	scenario: PromptEvalScenario;
	replayRequest: PromptEvalReplayRequest;
	streamRunId: string;
	clientTurnId: string;
	sessionId: string | null;
	turnRun: ChatTurnRunRow;
	streamSummary: ReplayEventSummary;
	eval: PersistedPromptEval;
};

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function isTerminalTurnRunStatus(status: string | null | undefined): boolean {
	return ['completed', 'failed', 'cancelled'].includes(String(status ?? '').toLowerCase());
}

function waitMs(ms: number): Promise<void> {
	if (!Number.isFinite(ms) || ms <= 0) return Promise.resolve();
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeReplayRequest(params: {
	scenario: PromptEvalScenario;
	messageOverride?: string | null;
	contextTypeOverride?: ChatContextType | null;
	entityIdOverride?: string | null;
	projectFocusOverride?: ProjectFocus | null;
}): PromptEvalReplayRequest {
	const replayRequest = params.scenario.replayRequest;
	if (!isPromptEvalScenarioReplayable(params.scenario) && !params.messageOverride?.trim()) {
		throw new Error(`Scenario ${params.scenario.slug} is not replayable yet.`);
	}

	const message = params.messageOverride?.trim() || replayRequest?.message?.trim() || '';
	if (!message) {
		throw new Error(`Scenario ${params.scenario.slug} is missing a replay message.`);
	}

	return {
		message,
		contextType:
			params.contextTypeOverride ??
			replayRequest?.contextType ??
			('global' satisfies ChatContextType),
		entityId: params.entityIdOverride ?? replayRequest?.entityId ?? null,
		projectFocus: params.projectFocusOverride ?? replayRequest?.projectFocus ?? null
	};
}

async function parseReplayStream(response: Response): Promise<ReplayEventSummary> {
	if (!response.body) {
		throw new Error('Replay stream response did not include a body.');
	}

	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';
	const eventTypes: string[] = [];
	const errorMessages: string[] = [];
	let sessionId: string | null = null;
	let assistantText = '';
	let finishedReason: string | null = null;

	const processBlock = (block: string) => {
		const lines = block
			.split('\n')
			.map((line) => line.trimEnd())
			.filter(Boolean);
		if (lines.length === 0) return;
		const dataPayload = lines
			.filter((line) => line.startsWith('data:'))
			.map((line) => line.slice(5).trimStart())
			.join('\n');
		if (!dataPayload) return;
		let parsed: Record<string, unknown>;
		try {
			parsed = JSON.parse(dataPayload) as Record<string, unknown>;
		} catch {
			return;
		}
		const type = typeof parsed.type === 'string' ? parsed.type : null;
		if (type) {
			eventTypes.push(type);
		}
		if (type === 'session') {
			const session =
				parsed.session &&
				typeof parsed.session === 'object' &&
				!Array.isArray(parsed.session)
					? (parsed.session as Record<string, unknown>)
					: null;
			sessionId = typeof session?.id === 'string' ? session.id : sessionId;
			return;
		}
		if (type === 'text_delta') {
			assistantText += typeof parsed.content === 'string' ? parsed.content : '';
			return;
		}
		if (type === 'error' && typeof parsed.error === 'string') {
			errorMessages.push(parsed.error);
			return;
		}
		if (type === 'done') {
			finishedReason =
				typeof parsed.finished_reason === 'string'
					? parsed.finished_reason
					: finishedReason;
		}
	};

	while (true) {
		const { value, done } = await reader.read();
		buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
		let separatorIndex = buffer.indexOf('\n\n');
		while (separatorIndex >= 0) {
			const block = buffer.slice(0, separatorIndex);
			buffer = buffer.slice(separatorIndex + 2);
			processBlock(block);
			separatorIndex = buffer.indexOf('\n\n');
		}
		if (done) break;
	}

	const trailing = buffer.trim();
	if (trailing) {
		processBlock(trailing);
	}

	return {
		sessionId,
		assistantText: assistantText.trim(),
		errorMessages,
		finishedReason,
		eventTypes
	};
}

async function waitForTurnRunByStreamRunId(params: {
	supabase: any;
	streamRunId: string;
	maxAttempts?: number;
	retryDelayMs?: number;
}): Promise<ChatTurnRunRow | null> {
	const maxAttempts = Math.max(1, params.maxAttempts ?? 20);
	const retryDelayMs = Math.max(0, params.retryDelayMs ?? 250);
	let latestRow: ChatTurnRunRow | null = null;

	for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
		const { data, error } = await params.supabase
			.from('chat_turn_runs')
			.select('*')
			.eq('stream_run_id', params.streamRunId)
			.maybeSingle();

		if (error) {
			const message = String((error as { message?: string })?.message ?? '');
			if (!/not found/i.test(message)) {
				throw error;
			}
		}

		latestRow = (data as ChatTurnRunRow | null) ?? latestRow;
		if (
			latestRow &&
			isTerminalTurnRunStatus(latestRow.status) &&
			(latestRow.assistant_message_id || latestRow.finished_at)
		) {
			return latestRow;
		}

		if (attempt < maxAttempts - 1) {
			await waitMs(retryDelayMs);
		}
	}

	return latestRow;
}

async function updateTurnRunReplaySource(params: {
	supabase: any;
	turnRunId: string;
	userId: string;
	source: 'admin_replay' | 'eval_runner';
}): Promise<void> {
	const { error } = await params.supabase
		.from('chat_turn_runs')
		.update({ source: params.source })
		.eq('id', params.turnRunId)
		.eq('user_id', params.userId);
	if (error) {
		throw error;
	}
}

async function ensureSseOk(response: Response): Promise<void> {
	if (response.ok) return;
	const contentType = response.headers.get('content-type') ?? '';
	if (contentType.includes('application/json')) {
		const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
		const errorMessage =
			typeof payload?.error === 'string'
				? payload.error
				: typeof payload?.message === 'string'
					? payload.message
					: `Replay request failed with status ${response.status}`;
		throw new Error(errorMessage);
	}
	const bodyText = await response.text().catch(() => '');
	throw new Error(bodyText || `Replay request failed with status ${response.status}`);
}

export async function replayAndEvaluatePromptScenario(params: {
	fetch: FetchLike;
	supabase: any;
	userId: string;
	scenarioSlug: string;
	runnerType?: string | null;
	source?: 'admin_replay' | 'eval_runner';
	messageOverride?: string | null;
	contextTypeOverride?: ChatContextType | null;
	entityIdOverride?: string | null;
	projectFocusOverride?: ProjectFocus | null;
}): Promise<PromptReplayResult> {
	const scenario = getPromptEvalScenario(params.scenarioSlug);
	if (!scenario) {
		throw new Error(`Unknown prompt eval scenario: ${params.scenarioSlug}`);
	}

	const replayRequest = normalizeReplayRequest({
		scenario,
		messageOverride: params.messageOverride,
		contextTypeOverride: params.contextTypeOverride,
		entityIdOverride: params.entityIdOverride,
		projectFocusOverride: params.projectFocusOverride
	});
	const streamRunId = uuidv4();
	const clientTurnId = `${params.source ?? 'admin_replay'}:${scenario.slug}:${uuidv4()}`;
	const requestPayload: FastAgentStreamRequest = {
		message: replayRequest.message,
		context_type: replayRequest.contextType,
		entity_id: replayRequest.entityId ?? undefined,
		projectFocus: replayRequest.projectFocus ?? undefined,
		stream_run_id: streamRunId,
		client_turn_id: clientTurnId
	};

	const response = await params.fetch('/api/agent/v2/stream', {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			accept: 'text/event-stream'
		},
		body: JSON.stringify(requestPayload)
	});
	await ensureSseOk(response);
	const streamSummary = await parseReplayStream(response);
	const turnRun = await waitForTurnRunByStreamRunId({
		supabase: params.supabase,
		streamRunId
	});
	if (!turnRun) {
		throw new Error(
			streamSummary.errorMessages[0] ??
				`Replay turn run was not found for stream_run_id ${streamRunId}.`
		);
	}

	await updateTurnRunReplaySource({
		supabase: params.supabase,
		turnRunId: turnRun.id,
		userId: params.userId,
		source: params.source ?? 'admin_replay'
	});

	const evalResult = await evaluateAndPersistPromptEval({
		supabase: params.supabase,
		turnRunId: turnRun.id,
		scenarioSlug: scenario.slug,
		createdByUserId: params.userId,
		runnerType: normalizePromptEvalRunnerType(
			params.runnerType ?? params.source ?? 'admin_replay'
		)
	});

	return {
		scenario,
		replayRequest,
		streamRunId,
		clientTurnId,
		sessionId: turnRun.session_id ?? streamSummary.sessionId,
		turnRun: {
			...turnRun,
			source: params.source ?? 'admin_replay'
		},
		streamSummary,
		eval: evalResult
	};
}
