// apps/web/src/lib/services/agentic-chat-v2/transport-decision.server.ts
import {
	AGENTIC_CHAT_WORKER_CONTRACT_VERSION,
	type AgentChatTransportLeaseRequestV1,
	type AgentChatTransportLeaseV1
} from '@buildos/shared-types';

type DecisionRow = {
	id: string;
	user_id: string;
	session_id: string;
	stream_run_id: string;
	client_turn_id: string | null;
	context_type: string;
	entity_id: string | null;
	project_id: string | null;
	execution_mode: string;
	transport_contract_version: string | null;
	transport_decision_id: string | null;
};

type QueryResult = { data: unknown; error: { code?: string; message?: string } | null };

export type AgenticChatTransportDecisionQuery = {
	eq(column: string, value: string): AgenticChatTransportDecisionQuery;
	limit(count: number): PromiseLike<QueryResult>;
};

export type AgenticChatTransportDecisionClient = {
	from(table: 'chat_turn_runs'): {
		select(columns: string): AgenticChatTransportDecisionQuery;
	};
};

export type ExistingAgenticChatTransportDecision = Pick<
	AgentChatTransportLeaseV1,
	'mode' | 'contractVersion' | 'decisionId'
> & {
	turnRunId: string;
	sessionId: string;
};

export type AgenticChatTransportDecisionErrorCode =
	| 'database_error'
	| 'ambiguous_turn'
	| 'binding_mismatch'
	| 'stored_contract_invalid';

export class AgenticChatTransportDecisionError extends Error {
	constructor(
		readonly code: AgenticChatTransportDecisionErrorCode,
		message: string
	) {
		super(message);
		this.name = 'AgenticChatTransportDecisionError';
	}
}

const DECISION_COLUMNS = [
	'id',
	'user_id',
	'session_id',
	'stream_run_id',
	'client_turn_id',
	'context_type',
	'entity_id',
	'project_id',
	'execution_mode',
	'transport_contract_version',
	'transport_decision_id'
].join(',');

export async function resolveExistingAgenticChatTransportDecision(input: {
	client: AgenticChatTransportDecisionClient;
	userId: string;
	request: AgentChatTransportLeaseRequestV1;
}): Promise<ExistingAgenticChatTransportDecision | null> {
	if (input.request.priorDecisionId) {
		const byDecision = await queryRows(input.client, [
			['user_id', input.userId],
			['transport_decision_id', input.request.priorDecisionId]
		]);
		if (byDecision.length > 1) throw ambiguousTurn();
		if (byDecision.length === 1) {
			return validateExistingDecision(byDecision[0]!, input);
		}
	}

	const byClientTurn = await queryRows(input.client, [
		['user_id', input.userId],
		['client_turn_id', input.request.clientTurnId]
	]);
	if (byClientTurn.length > 1) throw ambiguousTurn();
	if (byClientTurn.length === 0) return null;
	const decision = validateExistingDecision(byClientTurn[0]!, input);
	if (
		input.request.priorDecisionId &&
		decision.decisionId !== input.request.priorDecisionId.toLowerCase()
	) {
		throw new AgenticChatTransportDecisionError(
			'binding_mismatch',
			'Prior transport decision does not match the existing turn'
		);
	}
	return decision;
}

async function queryRows(
	client: AgenticChatTransportDecisionClient,
	filters: Array<[string, string]>
): Promise<DecisionRow[]> {
	let query = client.from('chat_turn_runs').select(DECISION_COLUMNS);
	for (const [column, value] of filters) query = query.eq(column, value);
	const { data, error } = await query.limit(2);
	if (error) {
		throw new AgenticChatTransportDecisionError(
			'database_error',
			'Failed to resolve an existing transport decision'
		);
	}
	if (!Array.isArray(data)) {
		throw new AgenticChatTransportDecisionError(
			'database_error',
			'Transport decision query returned an invalid result'
		);
	}
	return data as DecisionRow[];
}

function validateExistingDecision(
	row: DecisionRow,
	input: {
		userId: string;
		request: AgentChatTransportLeaseRequestV1;
	}
): ExistingAgenticChatTransportDecision {
	const request = input.request;
	if (
		row.user_id !== input.userId ||
		row.client_turn_id !== request.clientTurnId ||
		row.stream_run_id !== request.streamRunId ||
		(request.sessionId !== null && row.session_id !== request.sessionId) ||
		row.context_type !== request.context.type ||
		row.entity_id !== request.context.entityId ||
		row.project_id !== request.context.projectId
	) {
		throw new AgenticChatTransportDecisionError(
			'binding_mismatch',
			'Existing turn does not match the requested transport binding'
		);
	}
	if (!isCanonicalUuid(row.id) || !isCanonicalUuid(row.session_id)) {
		throw storedContractInvalid();
	}
	if (!row.transport_decision_id || !isCanonicalUuid(row.transport_decision_id)) {
		throw storedContractInvalid();
	}

	let mode: AgentChatTransportLeaseV1['mode'];
	let contractVersion: AgentChatTransportLeaseV1['contractVersion'];
	if (
		row.execution_mode === 'worker_realtime' &&
		row.transport_contract_version === AGENTIC_CHAT_WORKER_CONTRACT_VERSION
	) {
		mode = 'worker_realtime';
		contractVersion = AGENTIC_CHAT_WORKER_CONTRACT_VERSION;
	} else if (
		row.execution_mode === 'legacy_sse' &&
		row.transport_contract_version === 'legacy_internal_v1'
	) {
		mode = 'legacy_sse';
		contractVersion = 'legacy_internal_v1';
	} else {
		throw storedContractInvalid();
	}

	return {
		turnRunId: row.id.toLowerCase(),
		sessionId: row.session_id.toLowerCase(),
		mode,
		contractVersion,
		decisionId: row.transport_decision_id.toLowerCase()
	};
}

function ambiguousTurn(): AgenticChatTransportDecisionError {
	return new AgenticChatTransportDecisionError(
		'ambiguous_turn',
		'Transport decision lookup returned multiple turns'
	);
}

function storedContractInvalid(): AgenticChatTransportDecisionError {
	return new AgenticChatTransportDecisionError(
		'stored_contract_invalid',
		'Existing turn has an invalid stored transport contract'
	);
}

function isCanonicalUuid(value: string): boolean {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
