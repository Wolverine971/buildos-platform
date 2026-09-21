// apps/web/src/lib/services/admin/chat-workflow-audit-build.ts
//
// Pure builder for `ChatWorkflowAuditPayload` (Tasker 91). Takes the rows the server loaded
// for one authorized session plus the session's ordinary turn runs and usage logs, and
// derives per-run steps, dispatches, tool calls, sources, graph, timeline, costs, timing
// and coverage. It never touches the live registry or project data: every label, edge and
// receipt comes from what the engine saved for that run.

import {
	CHAT_WORKFLOW_AUDIT_VERSION,
	WORKFLOW_AUDIT_TABLES,
	type ChatWorkflowAuditPayload,
	type DocumentReadBatchRow,
	type InputArtifactRow,
	type JsonRecord,
	type SelectionShadowRow,
	type SpecialistSnapshotRow,
	type WorkflowAuditCoverage,
	type WorkflowAuditCoverageNote,
	type WorkflowAuditCosts,
	type WorkflowAuditDispatch,
	type WorkflowAuditDispatchCostState,
	type WorkflowAuditDisplayState,
	type WorkflowAuditGraph,
	type WorkflowAuditGraphEdge,
	type WorkflowAuditGraphNode,
	type WorkflowAuditProgressEvent,
	type WorkflowAuditRoleReport,
	type WorkflowAuditRowSet,
	type WorkflowAuditRun,
	type WorkflowAuditSelectionShadow,
	type WorkflowAuditSource,
	type WorkflowAuditSourceCoverage,
	type WorkflowAuditSourceReceipt,
	type WorkflowAuditSpecialistPin,
	type WorkflowAuditStep,
	type WorkflowAuditStepRole,
	type WorkflowAuditTable,
	type WorkflowAuditTimelineEntry,
	type WorkflowAuditTiming,
	type WorkflowAuditToolCall,
	type WorkflowAuditToolDocument,
	type WorkflowRunRow,
	type WorkflowStepRow
} from './chat-workflow-audit-types';

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/** A saved `chat_turn_events` row; only the workflow_progress payload is interpreted. */
export interface WorkflowAuditTurnEventInput {
	id?: string | null;
	event_id?: string | null;
	sequence_index?: number | string | null;
	event_type?: string | null;
	execution_generation?: number | string | null;
	created_at?: string | null;
	payload?: unknown;
}

export interface WorkflowAuditTurnRunInput {
	id: string;
	turn_index?: number | null;
	status?: string | null;
	finished_reason?: string | null;
	failure_code?: string | null;
	request_message?: string | null;
	started_at?: string | null;
	finished_at?: string | null;
	events?: WorkflowAuditTurnEventInput[] | null;
}

export interface WorkflowAuditUsageLogInput {
	id: string;
	turn_run_id?: string | null;
	openrouter_request_id?: string | null;
	total_cost_usd?: number | string | null;
	model_used?: string | null;
	status?: string | null;
}

export interface BuildChatWorkflowAuditPayloadInput {
	rows: WorkflowAuditRowSet;
	turnRuns: WorkflowAuditTurnRunInput[];
	llmCalls?: WorkflowAuditUsageLogInput[];
	capturedAt?: string;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const SUPPORTED_WORKFLOW_VERSION = 'agentic_chat_workflow_v1';
const PROGRESS_EVENT_TYPE = 'workflow_progress';
const ROLE_REPORT_VERSION = 'chat_workflow_role_report_v1';
const DOCUMENT_READ_TOOL = 'read_project_documents';

const asRecord = (value: unknown): JsonRecord | null =>
	value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : null;

const asString = (value: unknown): string | null => {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
};

const asNumber = (value: unknown): number | null => {
	if (typeof value === 'number') return Number.isFinite(value) ? value : null;
	if (typeof value === 'string' && value.trim()) {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : null;
	}
	return null;
};

const asBoolean = (value: unknown): boolean | null => (typeof value === 'boolean' ? value : null);

const asStringArray = (value: unknown): string[] =>
	Array.isArray(value)
		? value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
		: [];

const asRecordArray = (value: unknown): JsonRecord[] =>
	Array.isArray(value)
		? value.filter(
				(entry): entry is JsonRecord =>
					!!entry && typeof entry === 'object' && !Array.isArray(entry)
			)
		: [];

const parseMs = (value: string | null | undefined): number | null => {
	if (!value) return null;
	const ms = Date.parse(value);
	return Number.isFinite(ms) ? ms : null;
};

const diffMs = (
	start: string | null | undefined,
	end: string | null | undefined
): number | null => {
	const a = parseMs(start);
	const b = parseMs(end);
	if (a === null || b === null) return null;
	return Math.max(0, b - a);
};

const microToUsd = (micro: number): number => Math.round(micro) / 1_000_000;

const shortHash = (hash: string | null): string => (hash ? hash.slice(0, 12) : '');

// ---------------------------------------------------------------------------
// Redaction: control secrets never leave the server or reach an export.
// Token counts (`*_tokens`, `*Tokens`) are metrics and are kept.
// ---------------------------------------------------------------------------

const SECRET_KEY_PATTERN =
	/(token$|secret|password|passwd|^authorization$|api[_-]?key|signed[_-]?url|bearer|credential|private[_-]?key)/i;

export const isControlSecretKey = (key: string): boolean => SECRET_KEY_PATTERN.test(key);

export const redactControlSecrets = <T>(value: T): { value: T; count: number } => {
	let count = 0;
	const walk = (input: unknown, depth: number): unknown => {
		if (depth > 32 || input === null || typeof input !== 'object') return input;
		if (Array.isArray(input)) return input.map((entry) => walk(entry, depth + 1));
		const output: JsonRecord = {};
		for (const [key, entry] of Object.entries(input as JsonRecord)) {
			if (isControlSecretKey(key) && entry !== null && entry !== undefined) {
				count += 1;
				output[key] = '[redacted]';
				continue;
			}
			output[key] = walk(entry, depth + 1);
		}
		return output;
	};
	return { value: walk(value, 0) as T, count };
};

// ---------------------------------------------------------------------------
// Labels and states
// ---------------------------------------------------------------------------

const FALLBACK_STEP_LABELS: Record<string, string> = {
	planner: 'Planner',
	project_analyst: 'Project analyst slot',
	risk_reviewer: 'Risk reviewer slot',
	editor: 'Editor'
};

const roleForStep = (key: string): WorkflowAuditStepRole => {
	if (key === 'planner') return 'planner';
	if (key === 'editor') return 'editor';
	if (key === 'project_analyst' || key === 'risk_reviewer') return 'specialist';
	return 'unknown';
};

const outcomeLabel = (run: WorkflowRunRow): string => {
	switch (run.terminal_outcome) {
		case 'complete':
			return 'Complete';
		case 'partial':
			return 'Partial';
		case 'failed':
			return 'Failed';
		case 'cancelled':
			return 'Cancelled';
		default:
			break;
	}
	switch (run.phase) {
		case 'preparing':
			return 'Preparing';
		case 'assessing':
			return 'Planning';
		case 'executing':
			return 'Executing';
		case 'synthesizing':
			return 'Synthesizing';
		case 'finished':
			return 'Finished';
		default:
			return 'Unknown';
	}
};

const displayStateForStep = (
	step: WorkflowStepRow,
	run: WorkflowRunRow,
	isTerminal: boolean
): { state: WorkflowAuditDisplayState; note: string | null } => {
	const status = step.status ?? 'unknown';
	if (status === 'accepted') {
		return { state: step.quality === 'partial' ? 'partial' : 'accepted', note: null };
	}
	if (status === 'failed') return { state: 'failed', note: null };
	if (status === 'skipped') return { state: 'skipped', note: null };
	if (step.step_key === 'editor' && run.synthesis_status === 'accepted') {
		return {
			state: 'finalized',
			note: `Editor step row still reads "${status}"; the durable answer receipt is accepted, so the terminal outcome governs.`
		};
	}
	if (status === 'claimed') {
		if (!isTerminal) return { state: 'running', note: null };
		return run.terminal_outcome === 'cancelled'
			? { state: 'cancelled', note: 'Claimed when the run was cancelled.' }
			: { state: 'not_completed', note: 'Claimed but never finished before the run ended.' };
	}
	if (status === 'pending') {
		if (!isTerminal) return { state: 'pending', note: null };
		return run.terminal_outcome === 'cancelled'
			? { state: 'cancelled', note: null }
			: { state: 'not_completed', note: 'Never started before the run ended.' };
	}
	return { state: 'unknown', note: `Unrecognized step status "${status}".` };
};

const costStateForDispatch = (state: string | null): WorkflowAuditDispatchCostState => {
	switch (state) {
		case 'settled':
		case 'released':
		case 'uncertain':
		case 'reserved':
		case 'dispatching':
			return state;
		default:
			return 'unknown';
	}
};

const documentCoverage = (
	status: string | null,
	truncated: boolean | null
): WorkflowAuditSourceCoverage => {
	switch (status) {
		case 'read':
			return truncated ? 'excerpt' : 'full';
		case 'empty':
			return 'empty';
		case 'unavailable':
		case 'not_in_inventory':
		case 'changed_since_context':
		case 'version_unverifiable':
			return 'unavailable';
		default:
			return 'unknown';
	}
};

// ---------------------------------------------------------------------------
// Sub-builders
// ---------------------------------------------------------------------------

const parseRoleReport = (result: JsonRecord | null): WorkflowAuditRoleReport | null => {
	if (!result) return null;
	const version = asString(result.version);
	if (version !== ROLE_REPORT_VERSION && !('findings' in result)) return null;
	const evidenceRefs = (value: unknown) =>
		asRecordArray(value).map((ref) => ({
			id: asString(ref.id) ?? '',
			label: asString(ref.label) ?? asString(ref.id) ?? '',
			version: asString(ref.version),
			kind: asString(ref.kind)
		}));
	return {
		version,
		role: asString(result.role),
		summary: asString(result.summary) ?? '',
		findings: asRecordArray(result.findings).map((finding) => ({
			claim: asString(finding.claim) ?? '',
			basis: asString(finding.basis) ?? 'unknown',
			evidence: evidenceRefs(finding.evidence)
		})),
		risks: asRecordArray(result.risks).map((risk) => ({
			risk: asString(risk.risk) ?? '',
			evidence: evidenceRefs(risk.evidence)
		})),
		unknowns: asStringArray(result.unknowns),
		recommendation: asString(result.recommendation) ?? '',
		unsupported_references: asNumber(result.unsupportedReferences),
		unsupported_findings: asNumber(result.unsupportedFindings)
	};
};

const parseSpecialistPin = (
	slot: JsonRecord | null,
	slotKey: string
): WorkflowAuditSpecialistPin | null => {
	const definition = asRecord(slot?.definition);
	if (!definition) return null;
	const instructions = asRecord(definition.instructions);
	const capabilities = asRecord(definition.capabilities);
	const modelPolicy = asRecord(definition.modelPolicy);
	return {
		id: asString(definition.id) ?? slotKey,
		version: asNumber(definition.version),
		label: asString(definition.label) ?? asString(definition.id) ?? slotKey,
		description: asString(definition.description),
		expertise: asStringArray(definition.expertise),
		primary_model: asString(modelPolicy?.primaryModel),
		fallback_models: asStringArray(modelPolicy?.fallbackModels),
		allowed_tool_ids: asStringArray(capabilities?.allowedToolIds),
		system_prompt: asString(instructions?.system),
		default_assignment: asString(instructions?.defaultAssignment),
		slot_assignment: asString(slot?.assignment),
		source: 'run_snapshot'
	};
};

const buildSpecialistSnapshot = (
	row: SpecialistSnapshotRow | undefined,
	run: WorkflowRunRow
): WorkflowAuditRun['specialist_snapshot'] => {
	if (!row) return null;
	const snapshot = asRecord(row.snapshot);
	const slots: Record<string, WorkflowAuditSpecialistPin> = {};
	for (const [slotKey, slot] of Object.entries(asRecord(snapshot?.slots) ?? {})) {
		const pin = parseSpecialistPin(asRecord(slot), slotKey);
		if (pin) slots[slotKey] = pin;
	}
	return {
		snapshot_hash: asString(row.snapshot_hash),
		version: asString(snapshot?.version),
		profile_id: asString(snapshot?.profileId),
		profile_version: asNumber(snapshot?.profileVersion),
		engine_version: asString(snapshot?.engineVersion),
		request_hash_matches_run:
			row.request_hash && run.request_hash ? row.request_hash === run.request_hash : null,
		created_at: asString(row.created_at),
		slots,
		raw: snapshot
	};
};

const buildToolCalls = (
	batches: DocumentReadBatchRow[],
	run: WorkflowRunRow,
	steps: WorkflowStepRow[]
): WorkflowAuditToolCall[] =>
	batches.map((batch, index) => {
		const result = asRecord(batch.result);
		const attemptId = asString(batch.step_attempt_id);
		const owner = attemptId
			? steps.find((step) => asStringArray(step.attempt_ids).includes(attemptId))
			: undefined;
		const documents: WorkflowAuditToolDocument[] = asRecordArray(result?.documents).map(
			(document) => {
				const status = asString(document.status);
				const truncated = asBoolean(document.truncated);
				return {
					id: asString(document.id) ?? '',
					status: status ?? 'unknown',
					coverage: documentCoverage(status, truncated),
					title: asString(document.title),
					version: asString(document.version),
					content_hash: asString(document.contentHash),
					full_characters: asNumber(document.fullCharacters),
					truncated,
					content: typeof document.content === 'string' ? document.content : null
				};
			}
		);
		return {
			id: `${batch.turn_run_id}:read:${attemptId ?? index}`,
			tool: DOCUMENT_READ_TOOL,
			step_key: owner?.step_key ?? null,
			step_attempt_id: attemptId,
			execution_generation: asNumber(batch.execution_generation),
			request_hash: asString(batch.request_hash),
			request_hash_matches_run:
				batch.request_hash && run.request_hash
					? batch.request_hash === run.request_hash
					: null,
			document_ids: asStringArray(batch.document_ids),
			result_hash: asString(batch.result_hash),
			result_version: asString(result?.version),
			created_at: asString(batch.created_at),
			documents,
			result
		};
	});

const buildSelectionShadow = (
	row: SelectionShadowRow | undefined,
	run: WorkflowRunRow
): WorkflowAuditSelectionShadow | null => {
	if (!row) return null;
	const input = asRecord(row.input);
	const result = asRecord(row.result);
	const usage = asRecord(result?.usage);
	const request = asRecord(input?.request);
	const candidates = asRecordArray(
		request?.candidates ?? input?.candidates ?? request?.bundles
	).map((candidate) => ({
		id: asString(candidate.id) ?? '',
		description: asString(candidate.description),
		specialists: asRecordArray(candidate.specialists).map(
			(specialist) =>
				`${asString(specialist.label) ?? asString(specialist.id) ?? 'specialist'}${
					asNumber(specialist.version) !== null ? `@${asNumber(specialist.version)}` : ''
				}`
		),
		tools: asStringArray(candidate.tools)
	}));
	const status: WorkflowAuditSelectionShadow['status'] = result
		? asString(result.status) === 'observed'
			? 'observed'
			: asString(result.status) === 'unavailable'
				? 'unavailable'
				: 'unknown'
		: 'pending';
	const probabilities = asRecord(result?.probabilities);
	return {
		request_hash: asString(row.request_hash),
		request_hash_matches_run:
			row.request_hash && run.request_hash ? row.request_hash === run.request_hash : null,
		context_id: asString(row.context_id),
		context_hash: asString(row.context_hash),
		context_matches_run:
			row.context_id && run.context_id
				? row.context_id === run.context_id && row.context_hash === run.context_hash
				: null,
		execution_generation: asNumber(row.execution_generation),
		input_hash: asString(row.input_hash),
		result_hash: asString(row.result_hash),
		created_at: asString(row.created_at),
		completed_at: asString(row.completed_at),
		status,
		reason: asString(result?.reason),
		baseline_bundle: asString(input?.baseline),
		selected_bundle: asString(result?.selectedBundle),
		recommended_bundle: asString(result?.recommendedBundle),
		agrees_with_baseline: asBoolean(result?.agreesWithBaseline),
		probabilities: probabilities
			? Object.fromEntries(
					Object.entries(probabilities)
						.map(([key, value]) => [key, asNumber(value)] as const)
						.filter((entry): entry is readonly [string, number] => entry[1] !== null)
				)
			: null,
		confidence: asNumber(result?.confidence),
		margin: asNumber(result?.margin),
		model_requested:
			asString(usage?.modelRequested) ?? asString(asRecord(input?.policy)?.model),
		model_used: asString(usage?.modelUsed),
		cost_usd: asNumber(usage?.costUsd),
		duration_ms: asNumber(usage?.durationMs),
		attempts: asNumber(usage?.attempts),
		candidates,
		input,
		result
	};
};

const buildInputArtifact = (
	row: InputArtifactRow | undefined,
	run: WorkflowRunRow
): WorkflowAuditRun['input_artifact'] => {
	if (!row) return null;
	const prepared = asRecord(row.prepared);
	const request = asRecord(prepared?.request) ?? prepared;
	const history = Array.isArray(row.history)
		? row.history
		: Array.isArray(prepared?.history)
			? (prepared?.history as unknown[])
			: [];
	const artifactHash =
		asString(prepared?.requestHash) ?? asString(asRecord(request)?.requestHash);
	return {
		id: row.id,
		artifact_version: asString(row.artifact_version),
		content_hash: asString(row.content_hash),
		content_bytes: asNumber(row.content_bytes),
		history_source: asString(row.history_source),
		history_bytes: asNumber(row.history_bytes),
		history_count: history.length,
		retain_until: asString(row.retain_until),
		created_at: asString(row.created_at),
		request,
		history,
		request_hash_matches_run:
			artifactHash && run.request_hash ? artifactHash === run.request_hash : null
	};
};

const buildProgressEvents = (
	events: WorkflowAuditTurnEventInput[] | null | undefined
): WorkflowAuditProgressEvent[] =>
	(events ?? [])
		.filter((event) => {
			const payload = asRecord(event.payload);
			return (
				asString(event.event_type) === PROGRESS_EVENT_TYPE ||
				asString(payload?.type) === PROGRESS_EVENT_TYPE
			);
		})
		.map((event) => {
			const payload = asRecord(event.payload);
			const workflow = asRecord(payload?.workflow);
			const transport = asRecord(workflow?.transport);
			const statuses: Record<string, string> = {};
			for (const step of asRecordArray(workflow?.steps)) {
				const key = asString(step.key);
				if (key) statuses[key] = asString(step.status) ?? 'unknown';
			}
			return {
				id:
					asString(event.id) ??
					asString(event.event_id) ??
					`${asNumber(event.sequence_index) ?? 0}`,
				sequence_index: asNumber(event.sequence_index),
				created_at: asString(event.created_at),
				execution_generation: asNumber(event.execution_generation),
				phase: asString(workflow?.phase),
				terminal_outcome: asString(workflow?.terminalOutcome),
				execution_state: asString(transport?.executionState),
				step_statuses: statuses,
				coverage_gap: asString(workflow?.coverageGap)
			};
		});

const labelsFromProgressEvents = (
	events: WorkflowAuditTurnEventInput[] | null | undefined
): Record<string, string> => {
	const labels: Record<string, string> = {};
	for (const event of events ?? []) {
		const workflow = asRecord(asRecord(event.payload)?.workflow);
		for (const step of asRecordArray(workflow?.steps)) {
			const key = asString(step.key);
			const label = asString(step.label);
			if (key && label) labels[key] = label;
		}
	}
	return labels;
};

/** Depth-first search for a readable title of a record with this id in the saved context. */
const findLabelInPayload = (payload: unknown, id: string): string | null => {
	const seen = new Set<unknown>();
	const stack: Array<{ value: unknown; depth: number }> = [{ value: payload, depth: 0 }];
	while (stack.length > 0) {
		const { value, depth } = stack.pop()!;
		if (!value || typeof value !== 'object' || seen.has(value) || depth > 8) continue;
		seen.add(value);
		if (Array.isArray(value)) {
			for (const entry of value) stack.push({ value: entry, depth: depth + 1 });
			continue;
		}
		const record = value as JsonRecord;
		if (record.id === id) {
			const label =
				asString(record.title) ?? asString(record.name) ?? asString(record.label) ?? null;
			if (label) return label;
		}
		for (const entry of Object.values(record)) stack.push({ value: entry, depth: depth + 1 });
	}
	return null;
};

// ---------------------------------------------------------------------------
// Graph
// ---------------------------------------------------------------------------

type PlanStep = { key: string; capability: string | null; depends_on: string[] };

const planStepsFromRun = (
	plan: JsonRecord | null,
	stepRows: WorkflowStepRow[]
): { steps: PlanStep[]; source: WorkflowAuditGraph['source'] } => {
	const fromPlan = asRecordArray(plan?.steps)
		.map((step) => ({
			key: asString(step.key) ?? '',
			capability: asString(step.capability),
			depends_on: asStringArray(step.dependsOn ?? step.depends_on)
		}))
		.filter((step) => step.key);
	if (fromPlan.length > 0) return { steps: fromPlan, source: 'saved_plan' };
	const fromRows = stepRows.map((row) => ({
		key: row.step_key,
		capability: asString(row.capability),
		depends_on: asStringArray(row.depends_on)
	}));
	if (fromRows.length > 0) return { steps: fromRows, source: 'step_rows' };
	return { steps: [], source: 'none' };
};

const computeDepths = (steps: PlanStep[]): Map<string, number> => {
	const depths = new Map<string, number>();
	const byKey = new Map(steps.map((step) => [step.key, step]));
	const visit = (key: string, trail: Set<string>): number => {
		const cached = depths.get(key);
		if (cached !== undefined) return cached;
		if (trail.has(key)) return 0;
		trail.add(key);
		const step = byKey.get(key);
		const parents = (step?.depends_on ?? []).filter((dep) => byKey.has(dep));
		const depth =
			parents.length === 0 ? 0 : 1 + Math.max(...parents.map((dep) => visit(dep, trail)));
		depths.set(key, depth);
		return depth;
	};
	for (const step of steps) visit(step.key, new Set());
	return depths;
};

const buildGraph = (params: {
	run: WorkflowRunRow;
	planSteps: PlanStep[];
	planSource: WorkflowAuditGraph['source'];
	steps: WorkflowAuditStep[];
	toolCalls: WorkflowAuditToolCall[];
	shadow: WorkflowAuditSelectionShadow | null;
	requestMessage: string;
}): WorkflowAuditGraph => {
	const { run, planSteps, planSource, steps, toolCalls, shadow } = params;
	const nodes: WorkflowAuditGraphNode[] = [];
	const edges: WorkflowAuditGraphEdge[] = [];
	const stepByKey = new Map(steps.map((step) => [step.key, step]));
	const hasContext = Boolean(run.context_id);

	nodes.push({
		id: 'request',
		kind: 'request',
		label: 'User request',
		sublabel: params.requestMessage.slice(0, 80) || null,
		state: 'available',
		step_key: null,
		ref_id: run.request_artifact_id ?? null,
		column: 0,
		lane: 0
	});
	let column = 1;
	if (hasContext) {
		nodes.push({
			id: 'context',
			kind: 'context',
			label: 'Accepted context',
			sublabel: run.context_hash ? `hash ${shortHash(run.context_hash)}` : null,
			state: 'available',
			step_key: null,
			ref_id: run.context_id ?? null,
			column,
			lane: 0
		});
		edges.push({
			id: 'request->context',
			from: 'request',
			to: 'context',
			kind: 'input',
			label: null
		});
		column += 1;
	}
	const entryNode = hasContext ? 'context' : 'request';

	const depths = computeDepths(planSteps);
	const maxDepth = planSteps.length ? Math.max(...depths.values()) : -1;
	const firstStepColumn = column;
	const lanesAtDepth = new Map<number, number>();
	const stepNodeIds = new Map<string, string>();
	for (const planStep of planSteps) {
		const depth = depths.get(planStep.key) ?? 0;
		const lane = lanesAtDepth.get(depth) ?? 0;
		lanesAtDepth.set(depth, lane + 1);
		const step = stepByKey.get(planStep.key);
		const nodeId = `step:${planStep.key}`;
		stepNodeIds.set(planStep.key, nodeId);
		nodes.push({
			id: nodeId,
			kind: 'step',
			label: step?.label ?? FALLBACK_STEP_LABELS[planStep.key] ?? planStep.key,
			sublabel: step?.specialist
				? `${step.specialist.id}@${step.specialist.version ?? '?'}`
				: planStep.capability,
			state: step?.display_state ?? 'pending',
			step_key: planStep.key,
			ref_id: step?.accepted_attempt_id ?? step?.current_attempt_id ?? null,
			column: firstStepColumn + depth,
			lane
		});
		const parents = planStep.depends_on.filter((dep) => planSteps.some((s) => s.key === dep));
		if (parents.length === 0) {
			edges.push({
				id: `${entryNode}->${nodeId}`,
				from: entryNode,
				to: nodeId,
				kind: 'input',
				label: null
			});
		}
		for (const parent of parents) {
			const parentRole = roleForStep(parent);
			const childRole = roleForStep(planStep.key);
			const evidence = step?.input_evidence;
			const kind: WorkflowAuditGraphEdge['kind'] =
				childRole === 'editor'
					? 'synthesis'
					: parentRole === 'specialist' && childRole === 'specialist'
						? 'evidence'
						: 'dependency';
			edges.push({
				id: `step:${parent}->${nodeId}`,
				from: `step:${parent}`,
				to: nodeId,
				kind,
				label:
					kind === 'evidence'
						? evidence
							? `saved evidence handoff${
									asString(evidence.documentReadResultHash)
										? ` · reads ${shortHash(asString(evidence.documentReadResultHash))}`
										: ' · inventory only'
								}`
							: 'sequential dependency (binding not stored)'
						: kind === 'synthesis'
							? step?.report || stepByKey.get(parent)?.result
								? 'accepted report'
								: null
							: null
			});
		}
	}

	const toolLane = Math.max(1, ...Array.from(lanesAtDepth.values()));
	for (const call of toolCalls) {
		const ownerNode = call.step_key ? stepNodeIds.get(call.step_key) : undefined;
		const ownerStep = call.step_key ? stepByKey.get(call.step_key) : undefined;
		const ownerNodeRecord = nodes.find((node) => node.id === ownerNode);
		nodes.push({
			id: `tool:${call.id}`,
			kind: 'tool',
			label: 'Document read',
			sublabel: `${call.documents.length} document${call.documents.length === 1 ? '' : 's'} · ${
				call.documents.filter((d) => d.coverage === 'full' || d.coverage === 'excerpt')
					.length
			} with text`,
			state: 'available',
			step_key: call.step_key,
			ref_id: call.step_attempt_id,
			column: ownerNodeRecord?.column ?? firstStepColumn,
			lane: toolLane + (ownerStep ? 0 : 1)
		});
		if (ownerNode) {
			edges.push({
				id: `${ownerNode}->tool:${call.id}`,
				from: ownerNode,
				to: `tool:${call.id}`,
				kind: 'tool',
				label: call.result_hash ? `result ${shortHash(call.result_hash)}` : null
			});
		}
	}

	const answerColumn = firstStepColumn + Math.max(maxDepth + 1, 1);
	nodes.push({
		id: 'answer',
		kind: 'answer',
		label: 'Final answer',
		sublabel:
			run.synthesis_status === 'accepted'
				? `${run.synthesis_quality ?? 'accepted'} · ${shortHash(run.answer_text_sha256 ?? null)}`
				: run.synthesis_status === 'streaming'
					? 'streaming'
					: 'not started',
		state:
			run.synthesis_status === 'accepted'
				? 'accepted'
				: run.synthesis_status === 'streaming'
					? 'running'
					: run.terminal_outcome
						? 'not_completed'
						: 'pending',
		step_key: null,
		ref_id: run.answer_id ?? null,
		column: answerColumn,
		lane: 0
	});
	const editorNode = stepNodeIds.get('editor');
	if (editorNode) {
		edges.push({
			id: `${editorNode}->answer`,
			from: editorNode,
			to: 'answer',
			kind: 'synthesis',
			label: 'streamed text'
		});
	} else if (planSteps.length === 0) {
		edges.push({
			id: `${entryNode}->answer`,
			from: entryNode,
			to: 'answer',
			kind: 'input',
			label: 'no saved plan'
		});
	}

	if (shadow) {
		nodes.push({
			id: 'shadow',
			kind: 'shadow',
			label: 'Jev shadow selector',
			sublabel:
				shadow.status === 'observed'
					? `recommended ${shadow.recommended_bundle ?? '?'}${
							shadow.agrees_with_baseline === false ? ' (disagrees)' : ''
						}`
					: shadow.status,
			state:
				shadow.status === 'observed'
					? 'observed'
					: shadow.status === 'unavailable'
						? 'unavailable'
						: 'pending',
			step_key: null,
			ref_id: shadow.input_hash,
			column: hasContext ? 1 : 0,
			lane: toolLane + 1
		});
		edges.push({
			id: `${entryNode}->shadow`,
			from: entryNode,
			to: 'shadow',
			kind: 'observation',
			label: 'observation only · no execution authority'
		});
	}

	const parallelGroups: WorkflowAuditGraph['parallel_groups'] = [];
	const byDepth = new Map<number, string[]>();
	for (const planStep of planSteps) {
		if (roleForStep(planStep.key) !== 'specialist') continue;
		const depth = depths.get(planStep.key) ?? 0;
		byDepth.set(depth, [...(byDepth.get(depth) ?? []), planStep.key]);
	}
	for (const [depth, keys] of byDepth) {
		if (keys.length < 2) continue;
		const independent = keys.every((key) =>
			keys.every(
				(other) =>
					other === key ||
					!(planSteps.find((s) => s.key === key)?.depends_on ?? []).includes(other)
			)
		);
		if (independent) parallelGroups.push({ id: `parallel:${depth}`, step_keys: keys });
	}
	const sequentialHandoffs: WorkflowAuditGraph['sequential_handoffs'] = [];
	for (const planStep of planSteps) {
		if (roleForStep(planStep.key) !== 'specialist') continue;
		for (const parent of planStep.depends_on) {
			if (roleForStep(parent) !== 'specialist') continue;
			const bound = Boolean(stepByKey.get(planStep.key)?.input_evidence);
			sequentialHandoffs.push({
				from: parent,
				to: planStep.key,
				via: bound ? 'evidence_binding' : 'plan_dependency'
			});
		}
	}

	return {
		source: planSource,
		nodes,
		edges,
		parallel_groups: parallelGroups,
		sequential_handoffs: sequentialHandoffs,
		columns: Math.max(...nodes.map((node) => node.column)) + 1,
		lanes: Math.max(...nodes.map((node) => node.lane)) + 1
	};
};

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

const buildTimeline = (params: {
	run: WorkflowRunRow;
	turnRun: WorkflowAuditTurnRunInput | undefined;
	steps: WorkflowAuditStep[];
	dispatches: WorkflowAuditDispatch[];
	toolCalls: WorkflowAuditToolCall[];
	shadow: WorkflowAuditSelectionShadow | null;
	progressEvents: WorkflowAuditProgressEvent[];
	capturedAt: string;
	isTerminal: boolean;
}): WorkflowAuditTimelineEntry[] => {
	const { run, turnRun, steps, dispatches, toolCalls, shadow, progressEvents, capturedAt } =
		params;
	const entries: WorkflowAuditTimelineEntry[] = [];
	const push = (
		entry: Omit<WorkflowAuditTimelineEntry, 'parallel_with' | 'at'> & { at: string | null }
	) => {
		if (!entry.at) return;
		entries.push({ ...entry, at: entry.at, parallel_with: [] });
	};
	const base = {
		step_key: null,
		attempt_id: null,
		dispatch_id: null,
		generation: null,
		end_at: null,
		detail: null,
		severity: 'info' as const
	};

	push({
		...base,
		id: 'turn:start',
		at: turnRun?.started_at ?? null,
		kind: 'turn',
		lane: 'turn',
		title: 'Turn started'
	});
	push({
		...base,
		id: 'workflow:created',
		at: run.created_at ?? null,
		kind: 'workflow',
		lane: 'workflow',
		title: 'Workflow admitted',
		detail: run.policy_ref ?? null
	});
	push({
		...base,
		id: 'workflow:execution',
		at: run.first_execution_started_at ?? null,
		kind: 'workflow',
		lane: 'workflow',
		title: 'First execution started'
	});
	push({
		...base,
		id: 'context:accepted',
		at: run.context_accepted_at ?? null,
		kind: 'context',
		lane: 'workflow',
		title: 'Context accepted',
		detail: run.context_hash
			? `hash ${shortHash(run.context_hash)} · ${asNumber(run.context_bytes) ?? '?'} bytes`
			: null,
		generation: asNumber(run.context_accepted_generation)
	});
	push({
		...base,
		id: 'plan:installed',
		at: run.plan_installed_at ?? null,
		kind: 'plan',
		lane: 'workflow',
		title: 'Plan installed',
		detail: run.plan_hash ? `hash ${shortHash(run.plan_hash)}` : null,
		generation: asNumber(run.plan_installed_generation)
	});

	for (const step of steps) {
		push({
			...base,
			id: `step:${step.key}:claimed`,
			at: step.claimed_at,
			// Falls back to the answer receipt for a finalized editor, so the lane closes.
			end_at: step.timing.ended_at,
			kind: 'step',
			lane: step.key,
			title: `${step.label} claimed`,
			detail: `attempt ${step.attempts_used}${step.current_attempt_generation ? ` · generation ${step.current_attempt_generation}` : ''}`,
			step_key: step.key,
			attempt_id: step.current_attempt_id ?? step.accepted_attempt_id,
			generation: step.current_attempt_generation
		});
		if (step.finished_at) {
			const severity =
				step.status === 'accepted'
					? 'success'
					: step.status === 'failed'
						? 'error'
						: 'warning';
			push({
				...base,
				id: `step:${step.key}:finished`,
				at: step.finished_at,
				kind: 'step',
				lane: step.key,
				title: `${step.label} ${step.status}${step.quality ? ` (${step.quality})` : ''}`,
				detail:
					step.failure_code ??
					(step.result_hash ? `result ${shortHash(step.result_hash)}` : null),
				severity,
				step_key: step.key,
				attempt_id: step.accepted_attempt_id ?? step.current_attempt_id
			});
		}
		step.attempts.forEach((attempt) => {
			if (attempt.index <= 1) return;
			const firstDispatch = dispatches.find((d) => d.step_attempt_id === attempt.attempt_id);
			push({
				...base,
				id: `attempt:${attempt.attempt_id}`,
				at: firstDispatch?.reserved_at ?? null,
				kind: 'attempt',
				lane: step.key,
				title: `${step.label} retry ${attempt.index}`,
				detail: attempt.state === 'accepted' ? 'accepted attempt' : attempt.state,
				severity: 'warning',
				step_key: step.key,
				attempt_id: attempt.attempt_id
			});
		});
	}

	for (const dispatch of dispatches) {
		const severity =
			dispatch.cost_state === 'settled' || dispatch.cost_state === 'released'
				? 'info'
				: dispatch.cost_state === 'uncertain'
					? 'error'
					: 'warning';
		push({
			...base,
			id: `dispatch:${dispatch.dispatch_id}`,
			at: dispatch.reserved_at,
			end_at: dispatch.settled_at ?? dispatch.uncertain_at ?? null,
			kind: 'dispatch',
			lane: dispatch.step_key ?? 'dispatch',
			title: `${dispatch.dispatch_kind ?? 'dispatch'} request${
				(dispatch.physical_attempt ?? 1) > 1
					? ` (physical attempt ${dispatch.physical_attempt})`
					: ''
			}`,
			detail: `${dispatch.model_requested ?? 'model ?'} · ${dispatch.cost_state}${
				dispatch.actual_micro_usd !== null
					? ` · $${microToUsd(dispatch.actual_micro_usd).toFixed(6)}`
					: ''
			}`,
			severity,
			step_key: dispatch.step_key,
			attempt_id: dispatch.step_attempt_id,
			dispatch_id: dispatch.dispatch_id,
			generation: dispatch.reserved_generation
		});
	}

	for (const call of toolCalls) {
		push({
			...base,
			id: `tool:${call.id}`,
			at: call.created_at,
			kind: 'tool',
			lane: call.step_key ?? 'tool',
			title: 'Document read saved',
			detail: `${call.documents.length} document${call.documents.length === 1 ? '' : 's'} · result ${shortHash(call.result_hash)}`,
			severity: 'success',
			step_key: call.step_key,
			attempt_id: call.step_attempt_id,
			generation: call.execution_generation
		});
	}

	if (shadow) {
		push({
			...base,
			id: 'shadow',
			at: shadow.created_at,
			end_at: shadow.completed_at,
			kind: 'shadow',
			lane: 'jev_shadow',
			title: 'Jev shadow observation',
			detail:
				shadow.status === 'observed'
					? `recommended ${shadow.recommended_bundle ?? '?'} · baseline ${shadow.baseline_bundle ?? '?'} · ${
							shadow.agrees_with_baseline ? 'agrees' : 'disagrees'
						}`
					: shadow.status,
			severity: shadow.status === 'unavailable' ? 'warning' : 'info',
			generation: shadow.execution_generation
		});
	}

	push({
		...base,
		id: 'answer:accepted',
		at: run.synthesis_accepted_at ?? null,
		kind: 'answer',
		lane: 'editor',
		title: `Answer accepted (${run.synthesis_quality ?? 'accepted'})`,
		detail: run.answer_text_sha256 ? `text ${shortHash(run.answer_text_sha256)}` : null,
		severity: 'success'
	});

	let lastPhase: string | null = null;
	let lastGeneration: number | null = null;
	for (const event of progressEvents) {
		const phaseChanged = event.phase !== lastPhase;
		const generationChanged =
			lastGeneration !== null &&
			event.execution_generation !== null &&
			event.execution_generation !== lastGeneration;
		if (generationChanged || event.execution_state === 'recovering') {
			push({
				...base,
				id: `recovery:${event.id}`,
				at: event.created_at,
				kind: 'recovery',
				lane: 'workflow',
				title: generationChanged
					? `Recovery: execution generation ${event.execution_generation}`
					: 'Recovering',
				detail: event.coverage_gap,
				severity: 'warning',
				generation: event.execution_generation
			});
		} else if (phaseChanged) {
			push({
				...base,
				id: `phase:${event.id}`,
				at: event.created_at,
				kind: 'event',
				lane: 'workflow',
				title: `Phase: ${event.phase ?? 'unknown'}`,
				detail: event.terminal_outcome ? `terminal ${event.terminal_outcome}` : null,
				generation: event.execution_generation
			});
		}
		lastPhase = event.phase;
		if (event.execution_generation !== null) lastGeneration = event.execution_generation;
	}

	push({
		...base,
		id: 'workflow:finished',
		at: run.finished_at ?? null,
		kind: 'workflow',
		lane: 'workflow',
		title: `Workflow finished: ${run.terminal_outcome ?? 'unknown'}`,
		severity:
			run.terminal_outcome === 'complete'
				? 'success'
				: run.terminal_outcome === 'failed'
					? 'error'
					: 'warning'
	});
	if (!params.isTerminal) {
		push({
			...base,
			id: 'capture',
			at: capturedAt,
			kind: 'capture',
			lane: 'workflow',
			title: 'Captured while running',
			detail: 'Records after this point were not available at capture time.',
			severity: 'warning'
		});
	}

	const kindOrder: Record<WorkflowAuditTimelineEntry['kind'], number> = {
		turn: 0,
		workflow: 1,
		context: 2,
		plan: 3,
		recovery: 4,
		event: 5,
		shadow: 6,
		step: 7,
		attempt: 8,
		dispatch: 9,
		tool: 10,
		answer: 11,
		capture: 12
	};
	entries.sort((a, b) => {
		const diff = (parseMs(a.at) ?? 0) - (parseMs(b.at) ?? 0);
		if (diff !== 0) return diff;
		return kindOrder[a.kind] - kindOrder[b.kind];
	});

	const stepSpans = steps
		.filter((step) => step.timing.started_at)
		.map((step) => ({
			key: step.key,
			start: parseMs(step.timing.started_at) ?? 0,
			end: parseMs(step.timing.ended_at) ?? parseMs(capturedAt) ?? 0
		}));
	for (const entry of entries) {
		if (entry.kind !== 'step' || !entry.step_key || !entry.end_at) continue;
		const start = parseMs(entry.at) ?? 0;
		const end = parseMs(entry.end_at) ?? start;
		entry.parallel_with = stepSpans
			.filter((span) => span.key !== entry.step_key && span.start < end && span.end > start)
			.map((span) => span.key);
	}
	return entries;
};

// ---------------------------------------------------------------------------
// Costs and timing
// ---------------------------------------------------------------------------

const buildCosts = (params: {
	run: WorkflowRunRow;
	dispatches: WorkflowAuditDispatch[];
	shadow: WorkflowAuditSelectionShadow | null;
	usage: WorkflowAuditUsageLogInput[];
}): WorkflowAuditCosts => {
	const { run, dispatches, shadow, usage } = params;
	let settled = 0;
	let outstanding = 0;
	let uncertain = 0;
	let uncertainCount = 0;
	let released = 0;
	const counts: Record<string, number> = {};
	for (const dispatch of dispatches) {
		counts[dispatch.cost_state] = (counts[dispatch.cost_state] ?? 0) + 1;
		switch (dispatch.cost_state) {
			case 'settled':
				settled += dispatch.actual_micro_usd ?? 0;
				break;
			case 'released':
				released += 1;
				break;
			case 'uncertain':
				uncertain += dispatch.reserved_micro_usd ?? 0;
				uncertainCount += 1;
				break;
			case 'reserved':
			case 'dispatching':
				outstanding += dispatch.reserved_micro_usd ?? 0;
				break;
			default:
				break;
		}
	}
	const matchedIds = new Set(dispatches.map((d) => d.usage_log_id).filter(Boolean));
	let matchedCost = 0;
	let unmatchedCost = 0;
	let unmatched = 0;
	for (const row of usage) {
		const cost = asNumber(row.total_cost_usd) ?? 0;
		if (matchedIds.has(row.id)) matchedCost += cost;
		else {
			unmatched += 1;
			unmatchedCost += cost;
		}
	}
	return {
		budget_micro_usd: asNumber(run.max_spend_micro_usd),
		synthesis_headroom_micro_usd: asNumber(run.synthesis_headroom_micro_usd),
		settled_micro_usd: settled,
		settled_usd: microToUsd(settled),
		reserved_outstanding_micro_usd: outstanding,
		uncertain_reserved_micro_usd: uncertain,
		uncertain_dispatch_count: uncertainCount,
		released_count: released,
		physical_dispatches: dispatches.filter((d) => d.cost_state !== 'released').length,
		max_physical_dispatches: asNumber(run.max_physical_dispatches),
		dispatch_counts: counts,
		selector: shadow
			? {
					status: shadow.status,
					cost_usd: shadow.cost_usd,
					model: shadow.model_used ?? shadow.model_requested,
					duration_ms: shadow.duration_ms
				}
			: null,
		usage_logs: {
			matched: matchedIds.size,
			matched_cost_usd: matchedCost,
			unmatched,
			unmatched_cost_usd: unmatchedCost,
			note:
				unmatched > 0
					? 'Usage rows without a matching dispatch provider request id are shown separately and are not added to the workflow ledger total.'
					: 'Every usage row for this turn is correlated to a dispatch by provider request id, or none were recorded.'
		},
		note: 'Settled dispatch amounts are the workflow-spend authority. Reserved and uncertain amounts are exposure, not payment. Missing cost is unknown, not zero. Selector cost is separate Jev telemetry outside the workflow budget.'
	};
};

const buildTiming = (params: {
	run: WorkflowRunRow;
	turnRun: WorkflowAuditTurnRunInput | undefined;
	steps: WorkflowAuditStep[];
	capturedAt: string;
	isTerminal: boolean;
}): WorkflowAuditTiming => {
	const { run, turnRun, steps, capturedAt, isTerminal } = params;
	const start = turnRun?.started_at ?? run.created_at ?? null;
	const end = run.finished_at ?? turnRun?.finished_at ?? null;
	const lanes = steps.map((step) => ({
		step_key: step.key,
		label: step.label,
		started_at: step.timing.started_at,
		ended_at: step.timing.ended_at,
		duration_ms: step.timing.duration_ms
	}));
	const spans = lanes
		.filter((lane) => lane.started_at && roleForStep(lane.step_key) === 'specialist')
		.map((lane) => ({
			start: parseMs(lane.started_at) ?? 0,
			end: parseMs(lane.ended_at) ?? parseMs(capturedAt) ?? 0
		}));
	let overlap = 0;
	for (let i = 0; i < spans.length; i += 1) {
		for (let j = i + 1; j < spans.length; j += 1) {
			overlap += Math.max(
				0,
				Math.min(spans[i]!.end, spans[j]!.end) - Math.max(spans[i]!.start, spans[j]!.start)
			);
		}
	}
	const sumLanes = lanes.reduce<number | null>((sum, lane) => {
		if (lane.duration_ms === null) return sum;
		return (sum ?? 0) + lane.duration_ms;
	}, null);
	return {
		turn_started_at: turnRun?.started_at ?? null,
		workflow_created_at: run.created_at ?? null,
		first_execution_started_at: run.first_execution_started_at ?? null,
		context_accepted_at: run.context_accepted_at ?? null,
		plan_installed_at: run.plan_installed_at ?? null,
		synthesis_accepted_at: run.synthesis_accepted_at ?? null,
		finished_at: run.finished_at ?? null,
		captured_at: capturedAt,
		running: !isTerminal,
		wall_clock_ms: end ? diffMs(start, end) : isTerminal ? null : diffMs(start, capturedAt),
		queue_and_preparation_ms: diffMs(
			start,
			run.first_execution_started_at ?? run.context_accepted_at ?? null
		),
		lanes,
		parallel_overlap_ms: spans.length >= 2 ? overlap : null,
		sum_of_lane_ms: sumLanes
	};
};

// ---------------------------------------------------------------------------
// Per-run assembly
// ---------------------------------------------------------------------------

const buildRun = (params: {
	run: WorkflowRunRow;
	rows: WorkflowAuditRowSet;
	turnRun: WorkflowAuditTurnRunInput | undefined;
	usage: WorkflowAuditUsageLogInput[];
	capturedAt: string;
	stepsColumnHasInputEvidence: boolean;
}): WorkflowAuditRun => {
	const { run, rows, turnRun, usage, capturedAt, stepsColumnHasInputEvidence } = params;
	const turnRunId = run.turn_run_id;
	const coverage: WorkflowAuditCoverageNote[] = [];
	let redactions = 0;
	const redact = <T>(value: T): T => {
		const result = redactControlSecrets(value);
		redactions += result.count;
		return result.value;
	};

	const isTerminal = run.phase === 'finished' || Boolean(run.terminal_outcome);
	const supported =
		(run.workflow_version ?? SUPPORTED_WORKFLOW_VERSION) === SUPPORTED_WORKFLOW_VERSION;
	if (!supported) {
		coverage.push({
			scope: 'workflow_version',
			status: 'unavailable',
			detail: `Workflow version "${run.workflow_version}" is not understood by this inspector (supports ${SUPPORTED_WORKFLOW_VERSION}). Raw records are shown without a derived graph.`
		});
	}

	// Step rows are keyed by (turn_run_id, plan_version, step_key). A turn can carry rows saved
	// under another plan version; the engine ignores them and so does this inspector, or the
	// same step key would appear twice. They are reported, not merged.
	const turnStepRows = rows.steps.filter((row) => row.turn_run_id === turnRunId);
	const runPlanVersion = asString(run.plan_version);
	const stepRows = runPlanVersion
		? turnStepRows.filter((row) => (row.plan_version ?? runPlanVersion) === runPlanVersion)
		: turnStepRows;
	const otherPlanStepRows = turnStepRows.length - stepRows.length;
	if (otherPlanStepRows > 0) {
		coverage.push({
			scope: 'plan',
			status: 'not_applicable',
			detail: `${otherPlanStepRows} step row${otherPlanStepRows === 1 ? '' : 's'} saved under a different plan version than the run (${runPlanVersion}) were left out of the derived graph; they remain in the raw records.`
		});
	}
	const dispatchRows = rows.dispatches.filter((row) => row.turn_run_id === turnRunId);
	const snapshotRow = rows.snapshots.find((row) => row.turn_run_id === turnRunId);
	const batchRows = rows.readBatches.filter((row) => row.turn_run_id === turnRunId);
	const shadowRow = rows.shadows.find((row) => row.turn_run_id === turnRunId);
	const artifactRow = rows.inputArtifacts.find(
		(row) =>
			row.turn_run_id === turnRunId ||
			(run.request_artifact_id && row.id === run.request_artifact_id)
	);
	const events = turnRun?.events ?? null;
	const progressEvents = buildProgressEvents(events);
	const eventLabels = labelsFromProgressEvents(events);

	const plan = asRecord(run.plan);
	const { steps: planSteps, source: planSource } = planStepsFromRun(plan, stepRows);
	if (planSource === 'none') {
		coverage.push({
			scope: 'plan',
			status:
				run.phase === 'preparing' || run.phase === 'assessing' ? 'absent' : 'unavailable',
			detail:
				run.phase === 'preparing' || run.phase === 'assessing'
					? 'No plan was installed before the run ended or was captured.'
					: 'No saved plan or step rows were found for this run.'
		});
	}

	const specialistSnapshot = buildSpecialistSnapshot(snapshotRow, run);
	const isDocumentProfile = (run.policy_ref ?? '').startsWith('internal-document-organization:');
	if (isDocumentProfile && !specialistSnapshot) {
		coverage.push({
			scope: 'specialist_snapshot',
			status:
				rows.tables.chat_turn_specialist_snapshots.status === 'available'
					? 'unavailable'
					: rows.tables.chat_turn_specialist_snapshots.status,
			detail: 'This document profile pins specialists in a run snapshot, but none was found for this run.'
		});
	}
	if (specialistSnapshot && specialistSnapshot.request_hash_matches_run === false) {
		coverage.push({
			scope: 'specialist_snapshot',
			status: 'unavailable',
			detail: 'Snapshot request hash does not match the run request hash.'
		});
	}

	const toolCalls = buildToolCalls(batchRows, run, stepRows).map((call) => ({
		...call,
		result: redact(call.result)
	}));
	for (const call of toolCalls) {
		if (call.request_hash_matches_run === false) {
			coverage.push({
				scope: 'document_read',
				status: 'unavailable',
				detail: `Read batch request hash ${shortHash(call.request_hash)} does not match the run.`
			});
		}
		if (!call.step_key) {
			coverage.push({
				scope: 'document_read',
				status: 'unavailable',
				detail: `Read batch attempt ${call.step_attempt_id ?? '?'} is not bound to any saved step attempt.`
			});
		}
	}
	const documentProfileVersion = specialistSnapshot?.profile_version ?? null;
	if (
		isDocumentProfile &&
		documentProfileVersion !== null &&
		documentProfileVersion >= 2 &&
		batchRows.length === 0
	) {
		coverage.push({
			scope: 'document_read',
			status:
				rows.tables.chat_turn_document_read_batches.status === 'available'
					? 'absent'
					: rows.tables.chat_turn_document_read_batches.status,
			detail:
				rows.tables.chat_turn_document_read_batches.status === 'available'
					? 'No document read batch is saved: the organizer did not complete a read tool call (reads are saved atomically when they happen).'
					: 'Document read batches could not be loaded.'
		});
	}

	const shadow = buildSelectionShadow(shadowRow, run);
	if (shadow) {
		shadow.input = redact(shadow.input);
		shadow.result = redact(shadow.result);
		if (shadow.status === 'pending' && isTerminal) {
			coverage.push({
				scope: 'jev_shadow',
				status: 'unavailable',
				detail: 'A shadow attempt was recorded but never completed.'
			});
		}
	} else if (rows.tables.chat_turn_specialist_selection_shadows.status === 'available') {
		coverage.push({
			scope: 'jev_shadow',
			status: 'absent',
			detail: 'No Jev shadow observation was recorded for this run (shadow selection off or not attempted).'
		});
	}

	const inputArtifact = buildInputArtifact(artifactRow, run);
	if (inputArtifact) {
		inputArtifact.request = redact(inputArtifact.request);
		inputArtifact.history = redact(inputArtifact.history);
		if (inputArtifact.request_hash_matches_run === false) {
			coverage.push({
				scope: 'input_artifact',
				status: 'unavailable',
				detail: 'Input artifact request hash does not match the run request hash.'
			});
		}
	} else {
		coverage.push({
			scope: 'input_artifact',
			status:
				rows.tables.chat_turn_input_artifacts.status === 'available'
					? 'absent'
					: rows.tables.chat_turn_input_artifacts.status,
			detail: 'The exact admitted request/history artifact was not found (it may have passed its retention window).'
		});
	}

	// Usage correlation: provider request id only. Never by timestamp proximity.
	const usageByRequestId = new Map<string, WorkflowAuditUsageLogInput>();
	for (const row of usage) {
		const requestId = asString(row.openrouter_request_id);
		if (requestId && !usageByRequestId.has(requestId)) usageByRequestId.set(requestId, row);
	}

	const dispatches: WorkflowAuditDispatch[] = dispatchRows
		.map((row) => {
			const providerRequestId = asString(row.provider_request_id);
			const usageRow = providerRequestId
				? usageByRequestId.get(providerRequestId)
				: undefined;
			return {
				dispatch_id: row.dispatch_id,
				step_key: asString(row.step_key),
				step_attempt_id: asString(row.step_attempt_id),
				physical_attempt: asNumber(row.physical_attempt),
				dispatch_kind: asString(row.dispatch_kind),
				state: asString(row.state),
				cost_state: costStateForDispatch(asString(row.state)),
				model_requested: asString(row.model_requested),
				pricing: redact(asRecord(row.pricing)),
				serialized_request_bytes: asNumber(row.serialized_request_bytes),
				estimated_input_tokens: asNumber(row.estimated_input_tokens),
				max_output_tokens: asNumber(row.max_output_tokens),
				reserved_micro_usd: asNumber(row.reserved_micro_usd),
				actual_micro_usd: asNumber(row.actual_micro_usd),
				reserved_generation: asNumber(row.reserved_generation),
				provider_request_id: providerRequestId,
				provider_usage: redact(asRecord(row.provider_usage)),
				reconciliation_id: asString(row.reconciliation_id),
				reconciliation_receipt: redact(asRecord(row.reconciliation_receipt)),
				reserved_at: asString(row.reserved_at),
				dispatched_at: asString(row.dispatched_at),
				settled_at: asString(row.settled_at),
				uncertain_at: asString(row.uncertain_at),
				reconciled_at: asString(row.reconciled_at),
				duration_ms: diffMs(
					asString(row.dispatched_at) ?? asString(row.reserved_at),
					asString(row.settled_at) ?? asString(row.uncertain_at)
				),
				usage_log_id: usageRow?.id ?? null,
				usage_log_cost_usd: usageRow ? asNumber(usageRow.total_cost_usd) : null,
				usage_log_model_used: usageRow ? asString(usageRow.model_used) : null
			};
		})
		.sort((a, b) => (parseMs(a.reserved_at) ?? 0) - (parseMs(b.reserved_at) ?? 0));
	const uniqueDispatchIds = new Set(dispatches.map((d) => d.dispatch_id));
	if (uniqueDispatchIds.size !== dispatches.length) {
		coverage.push({
			scope: 'dispatches',
			status: 'unavailable',
			detail: 'Duplicate dispatch ids were returned; the ledger was deduplicated by dispatch id.'
		});
	}
	const dedupedDispatches = Array.from(
		new Map(dispatches.map((d) => [d.dispatch_id, d])).values()
	);

	// Steps in plan order, then any saved step rows the plan does not mention.
	const orderedKeys = Array.from(
		new Set([
			...planSteps.map((step) => step.key),
			...stepRows
				.map((row) => row.step_key)
				.filter((key) => !planSteps.some((step) => step.key === key))
		])
	);
	const contextEvidence = asRecordArray(run.evidence_versions).map((entry) => ({
		kind: asString(entry.kind) ?? 'unknown',
		id: asString(entry.id) ?? '',
		version: asString(entry.version),
		observed_at: asString(entry.observedAt ?? entry.observed_at)
	}));
	const contextPayload = asRecord(run.context_payload);
	const readByStep = new Map<string, WorkflowAuditToolCall[]>();
	for (const call of toolCalls) {
		if (!call.step_key) continue;
		readByStep.set(call.step_key, [...(readByStep.get(call.step_key) ?? []), call]);
	}

	const steps: WorkflowAuditStep[] = orderedKeys.map((key) => {
		const row = stepRows.find((entry) => entry.step_key === key);
		const planStep = planSteps.find((entry) => entry.key === key);
		const role = roleForStep(key);
		const attemptIds = asStringArray(row?.attempt_ids);
		const stepDispatches = dedupedDispatches.filter((d) => d.step_key === key);
		const { state, note } = row
			? displayStateForStep(row, run, isTerminal)
			: {
					state: (isTerminal ? 'not_completed' : 'pending') as WorkflowAuditDisplayState,
					note: 'No step row saved.'
				};
		const result = redact(asRecord(row?.result));
		const assignment = redact(
			asRecord(row?.assignment) ?? asRecord(asRecord(plan?.assignments)?.[key])
		);
		const hasInputEvidenceKey = row
			? Object.prototype.hasOwnProperty.call(row, 'input_evidence')
			: false;
		const inputEvidence = redact(asRecord(row?.input_evidence));
		const dependsOnSpecialist = (planStep?.depends_on ?? asStringArray(row?.depends_on)).some(
			(dep) => roleForStep(dep) === 'specialist'
		);
		const inputEvidenceCoverage: WorkflowAuditStep['input_evidence_coverage'] =
			role !== 'specialist' || !dependsOnSpecialist
				? 'not_applicable'
				: inputEvidence
					? 'stored'
					: hasInputEvidenceKey || stepsColumnHasInputEvidence
						? 'not_stored'
						: 'column_absent';
		const pin = specialistSnapshot?.slots[key] ?? null;
		const specialistCoverage: WorkflowAuditStep['specialist_coverage'] =
			role !== 'specialist'
				? 'not_applicable'
				: pin
					? 'run_snapshot'
					: 'code_owned_not_stored';
		const label = pin?.label ?? eventLabels[key] ?? FALLBACK_STEP_LABELS[key] ?? key;
		const attempts = attemptIds.map((attemptId, index) => ({
			attempt_id: attemptId,
			index: index + 1,
			state:
				attemptId === row?.accepted_attempt_id
					? ('accepted' as const)
					: attemptId === row?.current_attempt_id && row?.status === 'claimed'
						? ('current' as const)
						: ('superseded' as const),
			dispatch_ids: stepDispatches
				.filter((d) => d.step_attempt_id === attemptId)
				.map((d) => d.dispatch_id)
		}));
		const cost = stepDispatches.reduce(
			(acc, d) => {
				acc.dispatch_count += 1;
				if (d.cost_state === 'settled') acc.settled_micro_usd += d.actual_micro_usd ?? 0;
				else if (d.cost_state === 'uncertain')
					acc.uncertain_reserved_micro_usd += d.reserved_micro_usd ?? 0;
				else if (d.cost_state === 'reserved' || d.cost_state === 'dispatching')
					acc.reserved_outstanding_micro_usd += d.reserved_micro_usd ?? 0;
				else if (d.cost_state === 'released') acc.released_count += 1;
				return acc;
			},
			{
				settled_micro_usd: 0,
				reserved_outstanding_micro_usd: 0,
				uncertain_reserved_micro_usd: 0,
				dispatch_count: 0,
				released_count: 0
			}
		);
		const firstDispatchAt = stepDispatches[0]?.reserved_at ?? null;
		const startedAt = row?.claimed_at ?? firstDispatchAt;
		const endedAt =
			row?.finished_at ??
			(key === 'editor' && run.synthesis_status === 'accepted'
				? (run.synthesis_accepted_at ?? null)
				: null) ??
			(isTerminal ? (run.finished_at ?? null) : null);
		const reads = readByStep.get(key) ?? [];
		const handoffHash = asString(inputEvidence?.documentReadResultHash);
		const handoffCall = handoffHash
			? toolCalls.find((call) => call.result_hash === handoffHash)
			: undefined;
		const receivedSources: WorkflowAuditStep['received_sources'] = [];
		if (role === 'specialist' && run.context_id) {
			const readDocs = new Map<string, WorkflowAuditToolDocument>();
			for (const call of reads) for (const doc of call.documents) readDocs.set(doc.id, doc);
			const handoffDocs = new Map<string, WorkflowAuditToolDocument>();
			if (handoffCall) for (const doc of handoffCall.documents) handoffDocs.set(doc.id, doc);
			const otherReads = new Set<string>();
			for (const [otherKey, calls] of readByStep) {
				if (otherKey === key) continue;
				for (const call of calls) for (const doc of call.documents) otherReads.add(doc.id);
			}
			for (const source of contextEvidence) {
				const read = readDocs.get(source.id);
				const handed = handoffDocs.get(source.id);
				if (read)
					receivedSources.push({
						source_id: source.id,
						coverage: read.coverage,
						via: 'document_read'
					});
				else if (handed)
					receivedSources.push({
						source_id: source.id,
						coverage: handed.coverage,
						via: 'evidence_handoff'
					});
				else if (source.kind === 'document') {
					const inventoryOnly = !otherReads.has(source.id) || dependsOnSpecialist;
					receivedSources.push({
						source_id: source.id,
						coverage: inventoryOnly ? 'inventory_only' : 'not_supplied',
						via: inventoryOnly ? 'context_inventory' : 'none'
					});
				} else
					receivedSources.push({
						source_id: source.id,
						coverage: 'full',
						via: 'context_inventory'
					});
			}
			for (const [id, doc] of readDocs) {
				if (!contextEvidence.some((s) => s.id === id))
					receivedSources.push({
						source_id: id,
						coverage: doc.coverage,
						via: 'document_read'
					});
			}
		}
		const withText = receivedSources.filter(
			(r) => r.coverage === 'full' || r.coverage === 'excerpt'
		).length;
		const inventoryOnly = receivedSources.filter((r) => r.coverage === 'inventory_only').length;
		const notSupplied = receivedSources.filter((r) => r.coverage === 'not_supplied').length;
		const summary =
			role !== 'specialist'
				? role === 'editor'
					? 'Inputs: accepted specialist reports and saved evidence; document text receipt is not recorded per editor attempt.'
					: role === 'planner'
						? 'Inputs: accepted context inventory; produces assignments.'
						: 'Inputs not recorded.'
				: receivedSources.length === 0
					? run.context_id
						? 'No source inventory recorded.'
						: 'Context was never accepted.'
					: `${withText} with text${inventoryOnly ? `, ${inventoryOnly} inventory only` : ''}${notSupplied ? `, ${notSupplied} read by another agent but not shared` : ''}${
							handoffCall
								? ' · via saved evidence handoff'
								: reads.length
									? ' · via own document read'
									: ''
						}`;

		return {
			key,
			label,
			role,
			capability: planStep?.capability ?? asString(row?.capability),
			depends_on: planStep?.depends_on ?? asStringArray(row?.depends_on),
			plan_version: asString(row?.plan_version) ?? asString(run.plan_version),
			status: row?.status ?? 'missing',
			display_state: state,
			display_note: note,
			quality: asString(row?.quality),
			attempts_used: asNumber(row?.attempts_used) ?? attemptIds.length,
			attempt_ids: attemptIds,
			attempts,
			current_attempt_id: asString(row?.current_attempt_id),
			current_attempt_generation: asNumber(row?.current_attempt_generation),
			accepted_attempt_id: asString(row?.accepted_attempt_id),
			failure_code: asString(row?.failure_code),
			claimed_at: asString(row?.claimed_at),
			accepted_at: asString(row?.accepted_at),
			finished_at: asString(row?.finished_at),
			created_at: asString(row?.created_at),
			updated_at: asString(row?.updated_at),
			assignment,
			result,
			result_hash: asString(row?.result_hash),
			result_bytes: asNumber(row?.result_bytes),
			report: role === 'specialist' ? parseRoleReport(result) : null,
			input_evidence: inputEvidence,
			input_evidence_coverage: inputEvidenceCoverage,
			specialist: pin,
			specialist_coverage: specialistCoverage,
			prompt_coverage: {
				system_prompt:
					role === 'specialist'
						? pin?.system_prompt
							? 'run_snapshot'
							: 'not_persisted'
						: 'not_persisted',
				assignment: assignment ? 'stored' : 'missing',
				serialized_request: 'not_persisted',
				rejected_outputs: 'not_persisted',
				accepted_result: result
					? 'stored'
					: key === 'editor' && run.synthesis_status === 'accepted'
						? 'answer_text'
						: 'none'
			},
			dispatch_ids: stepDispatches.map((d) => d.dispatch_id),
			tool_call_ids: reads.map((call) => call.id),
			cost,
			timing: {
				started_at: startedAt,
				ended_at: endedAt,
				duration_ms: diffMs(startedAt, endedAt)
			},
			received_sources: receivedSources,
			source_coverage_summary: summary
		};
	});

	if (
		steps.some(
			(step) =>
				step.role === 'specialist' && step.specialist_coverage === 'code_owned_not_stored'
		)
	) {
		coverage.push({
			scope: 'specialist_definitions',
			status: 'not_persisted',
			detail: 'This profile pins specialists in code, not in a run snapshot. The exact system prompt and model policy used are not stored with the run and are not reconstructed here.'
		});
	}
	coverage.push({
		scope: 'per_attempt_prompts',
		status: 'not_persisted',
		detail: 'The dispatch ledger stores accounting and provider identity, not the serialized model request or rejected outputs. Assignments, accepted results and the answer text are stored.'
	});
	if (steps.some((step) => step.input_evidence_coverage === 'column_absent')) {
		coverage.push({
			scope: 'input_evidence',
			status: 'unavailable',
			detail: 'The steps table has no input_evidence column in this database (document evidence handoff migration not applied), so handoff bindings cannot be shown.'
		});
	}
	if (steps.some((step) => step.display_state === 'finalized')) {
		coverage.push({
			scope: 'editor_step',
			status: 'available',
			detail: 'The editor row stayed claimed after prefix finalization; the accepted answer receipt is authoritative.'
		});
	}
	const recoveryCount = asNumber(run.recovery_count) ?? 0;
	const generations = new Set(
		progressEvents.map((e) => e.execution_generation).filter((g): g is number => g !== null)
	);
	if (recoveryCount > 0 && generations.size <= 1) {
		coverage.push({
			scope: 'recovery',
			status: 'unavailable',
			detail: `The run records ${recoveryCount} recover${recoveryCount === 1 ? 'y' : 'ies'} but the saved progress events show a single execution generation; earlier generations' events are not available.`
		});
	}

	const sources: WorkflowAuditSource[] = contextEvidence.map((source) => {
		const labelFromReads =
			toolCalls.flatMap((c) => c.documents).find((d) => d.id === source.id)?.title ?? null;
		const labelFromReports =
			steps
				.flatMap((s) => [
					...(s.report?.findings ?? []).flatMap((f) => f.evidence),
					...(s.report?.risks ?? []).flatMap((r) => r.evidence)
				])
				.find((ref) => ref.id === source.id)?.label ?? null;
		const receipts: WorkflowAuditSourceReceipt[] = steps
			.filter((step) => step.role === 'specialist')
			.map((step) => {
				const received = step.received_sources.find((r) => r.source_id === source.id);
				return {
					step_key: step.key,
					coverage: received?.coverage ?? 'unknown',
					via: received?.via ?? 'none',
					detail:
						received?.coverage === 'not_supplied'
							? 'Read by another agent under a parallel plan; not shared with this agent.'
							: received?.via === 'evidence_handoff'
								? 'Received through the saved evidence handoff binding.'
								: received?.via === 'document_read'
									? 'Read directly with the document read tool.'
									: received?.coverage === 'inventory_only'
										? 'Title/summary inventory only from the accepted context.'
										: null
				};
			});
		return {
			kind: source.kind,
			id: source.id,
			version: source.version,
			label:
				labelFromReads ?? labelFromReports ?? findLabelInPayload(contextPayload, source.id),
			receipts
		};
	});

	const requestMessage =
		turnRun?.request_message ?? asString(asRecord(inputArtifact?.request)?.message) ?? '';
	const graph = supported
		? buildGraph({ run, planSteps, planSource, steps, toolCalls, shadow, requestMessage })
		: {
				source: 'none' as const,
				nodes: [],
				edges: [],
				parallel_groups: [],
				sequential_handoffs: [],
				columns: 0,
				lanes: 0
			};
	const timeline = buildTimeline({
		run,
		turnRun,
		steps,
		dispatches: dedupedDispatches,
		toolCalls,
		shadow,
		progressEvents,
		capturedAt,
		isTerminal
	});
	const costs = buildCosts({ run, dispatches: dedupedDispatches, shadow, usage });
	const timing = buildTiming({ run, turnRun, steps, capturedAt, isTerminal });

	const planRecord = plan ? redact(plan) : null;
	const planner = asRecord(plan?.planner);
	return {
		turn_run_id: turnRunId,
		session_id: asString(run.session_id),
		user_id: asString(run.user_id),
		project_id: asString(run.project_id),
		request_artifact_id: asString(run.request_artifact_id),
		turn_index: turnRun?.turn_index ?? null,
		turn_status: turnRun?.status ?? null,
		turn_finished_reason: turnRun?.finished_reason ?? null,
		turn_failure_code: turnRun?.failure_code ?? null,
		request_message: requestMessage,
		workflow_version: asString(run.workflow_version),
		policy_ref: asString(run.policy_ref),
		policy: redact(asRecord(run.policy)),
		plan_version: asString(run.plan_version),
		request_hash: asString(run.request_hash),
		phase: asString(run.phase),
		terminal_outcome: asString(run.terminal_outcome),
		is_terminal: isTerminal,
		outcome_label: outcomeLabel(run),
		supported,
		unsupported_reason: supported
			? null
			: `Unsupported workflow version ${run.workflow_version}`,
		limits: {
			max_spend_micro_usd: asNumber(run.max_spend_micro_usd),
			synthesis_headroom_micro_usd: asNumber(run.synthesis_headroom_micro_usd),
			max_physical_dispatches: asNumber(run.max_physical_dispatches),
			max_step_attempts: asNumber(run.max_step_attempts),
			whole_run_lifetime_ms: asNumber(run.whole_run_lifetime_ms)
		},
		deadline_at: asString(run.deadline_at),
		recovery_count: recoveryCount,
		created_at: asString(run.created_at),
		updated_at: asString(run.updated_at),
		finished_at: asString(run.finished_at),
		context: run.context_id
			? {
					context_id: run.context_id,
					preparation_version: asString(run.preparation_version),
					context_identity: redact(asRecord(run.context_identity)),
					evidence_versions: contextEvidence,
					context_hash: asString(run.context_hash),
					context_bytes: asNumber(run.context_bytes),
					accepted_at: asString(run.context_accepted_at),
					accepted_generation: asNumber(run.context_accepted_generation),
					payload: redact(contextPayload)
				}
			: null,
		plan:
			planRecord || stepRows.length
				? {
						version: asString(run.plan_version) ?? asString(plan?.version),
						hash: asString(run.plan_hash),
						installed_at: asString(run.plan_installed_at),
						installed_generation: asNumber(run.plan_installed_generation),
						planner_outcome: asString(planner?.outcome),
						planner_step_attempt_id: asString(planner?.stepAttemptId),
						planner_result_hash: asString(planner?.resultHash),
						steps: planSteps,
						assignments: Object.fromEntries(
							Object.entries(asRecord(plan?.assignments) ?? {})
								.map(([key, value]) => [key, redact(asRecord(value))] as const)
								.filter(
									(entry): entry is readonly [string, JsonRecord] =>
										entry[1] !== null
								)
						),
						raw: planRecord
					}
				: null,
		answer: {
			answer_id: asString(run.answer_id),
			editor_step_attempt_id: asString(run.answer_editor_step_attempt_id),
			text: typeof run.answer_text === 'string' ? run.answer_text : '',
			text_sha256: asString(run.answer_text_sha256),
			last_batch_id: asString(run.answer_last_batch_id),
			synthesis_status: asString(run.synthesis_status),
			synthesis_quality: asString(run.synthesis_quality),
			synthesis_accepted_at: asString(run.synthesis_accepted_at)
		},
		steps,
		unmatched_step_rows: turnStepRows
			.filter((row) => !stepRows.includes(row))
			.map((row) => redact({ ...row }) as JsonRecord),
		dispatches: dedupedDispatches,
		tool_calls: toolCalls,
		specialist_snapshot: specialistSnapshot
			? { ...specialistSnapshot, raw: redact(specialistSnapshot.raw) }
			: null,
		selection_shadow: shadow,
		input_artifact: inputArtifact,
		progress_events: progressEvents,
		sources,
		graph,
		timeline,
		costs,
		timing,
		coverage,
		redactions
	};
};

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export const emptyWorkflowTableCoverage = (
	status: WorkflowAuditCoverage['status'] = 'available',
	detail: string | null = null
): Record<WorkflowAuditTable, WorkflowAuditCoverage> =>
	Object.fromEntries(WORKFLOW_AUDIT_TABLES.map((table) => [table, { status, detail }])) as Record<
		WorkflowAuditTable,
		WorkflowAuditCoverage
	>;

export const buildChatWorkflowAuditPayload = (
	input: BuildChatWorkflowAuditPayloadInput
): ChatWorkflowAuditPayload => {
	const capturedAt = input.capturedAt ?? new Date().toISOString();
	const turnRunById = new Map(input.turnRuns.map((turnRun) => [turnRun.id, turnRun]));
	const usageByTurn = new Map<string, WorkflowAuditUsageLogInput[]>();
	for (const row of input.llmCalls ?? []) {
		if (!row.turn_run_id) continue;
		usageByTurn.set(row.turn_run_id, [...(usageByTurn.get(row.turn_run_id) ?? []), row]);
	}
	const stepsColumnHasInputEvidence = input.rows.steps.some((row) =>
		Object.prototype.hasOwnProperty.call(row, 'input_evidence')
	);
	const seen = new Set<string>();
	const runs = input.rows.runs
		.filter((row) => {
			if (seen.has(row.turn_run_id)) return false;
			seen.add(row.turn_run_id);
			return true;
		})
		.map((row) =>
			buildRun({
				run: row,
				rows: input.rows,
				turnRun: turnRunById.get(row.turn_run_id),
				usage: usageByTurn.get(row.turn_run_id) ?? [],
				capturedAt,
				stepsColumnHasInputEvidence
			})
		)
		.sort((a, b) => {
			const left = a.turn_index ?? Number.MAX_SAFE_INTEGER;
			const right = b.turn_index ?? Number.MAX_SAFE_INTEGER;
			if (left !== right) return left - right;
			return (parseMs(a.created_at) ?? 0) - (parseMs(b.created_at) ?? 0);
		});
	const workflowTurnIds = new Set(runs.map((run) => run.turn_run_id));
	const notes: string[] = [];
	for (const [table, coverage] of Object.entries(input.rows.tables) as Array<
		[WorkflowAuditTable, WorkflowAuditCoverage]
	>) {
		if (coverage.status === 'truncated') {
			notes.push(
				`${table}: ${coverage.count ?? '?'} rows returned at the ${coverage.limit ?? '?'} row limit; later rows are not included.`
			);
		} else if (coverage.status === 'unavailable' || coverage.status === 'absent') {
			notes.push(`${table}: ${coverage.detail ?? coverage.status}.`);
		}
	}
	if (runs.some((run) => !run.is_terminal)) {
		notes.push(
			`Captured at ${capturedAt} while at least one workflow was still running; this view is not atomic across queries.`
		);
	}
	return {
		version: CHAT_WORKFLOW_AUDIT_VERSION,
		captured_at: capturedAt,
		atomic: false,
		runs,
		ordinary_turn_ids: input.turnRuns
			.map((turnRun) => turnRun.id)
			.filter((id) => !workflowTurnIds.has(id)),
		tables: input.rows.tables,
		counts: {
			runs: runs.length,
			steps: runs.reduce((sum, run) => sum + run.steps.length, 0),
			dispatches: runs.reduce((sum, run) => sum + run.dispatches.length, 0),
			snapshots: runs.filter((run) => run.specialist_snapshot).length,
			read_batches: runs.reduce((sum, run) => sum + run.tool_calls.length, 0),
			shadows: runs.filter((run) => run.selection_shadow).length,
			input_artifacts: runs.filter((run) => run.input_artifact).length,
			redactions: runs.reduce((sum, run) => sum + run.redactions, 0)
		},
		notes
	};
};
