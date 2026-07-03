// apps/web/src/lib/services/admin/chat-session-audit-compact.ts
//
// Agent-readable export helpers. These keep the primary JSON files compact by
// removing null/default fields, breaking duplicated nested records into their
// own files, and replacing huge prompt blobs with metrics + file references.
import type {
	AuditRecord,
	AuditTimelineEvent,
	AuditTurnRun,
	ChatSessionAuditPayload
} from './chat-session-audit-types';

type CatalogEntry = {
	id: string;
	name?: string;
	description?: string;
	source?: string;
};

type LoadedEntry = {
	id: string;
	source: string;
	turn_index?: number | null;
	event_id?: string;
};

export type AuditCapabilityManifest = {
	tools: {
		available: CatalogEntry[];
		loaded: CatalogEntry[];
		used: LoadedEntry[];
	};
	skills: {
		available: CatalogEntry[];
		loaded: LoadedEntry[];
		recommended: LoadedEntry[];
	};
	domains: {
		included: CatalogEntry[];
		loaded: LoadedEntry[];
	};
	outcome_cards: {
		included: CatalogEntry[];
		loaded: LoadedEntry[];
	};
};

const MAX_INLINE_STRING = 900;
const MAX_PREVIEW_STRING = 360;

const asRecord = (value: unknown): AuditRecord | null =>
	value && typeof value === 'object' && !Array.isArray(value) ? (value as AuditRecord) : null;

const asString = (value: unknown): string | null => {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
};

const isPresent = <T>(value: T | null | undefined): value is T =>
	value !== null && value !== undefined;

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const normalizeWhitespace = (value: string): string => value.replace(/\s+/g, ' ').trim();

const compactString = (value: string, maxChars = MAX_INLINE_STRING): unknown => {
	const normalized = normalizeWhitespace(value);
	if (normalized.length <= maxChars) return normalized;
	return {
		omitted: true,
		chars: value.length,
		preview: `${normalized.slice(0, Math.max(0, MAX_PREVIEW_STRING - 1))}...`
	};
};

export const omitEmpty = (value: unknown): unknown => {
	if (value === null || value === undefined || value === '') return undefined;
	if (Array.isArray(value)) {
		const items = value.map(omitEmpty).filter((item) => item !== undefined);
		return items.length > 0 ? items : undefined;
	}
	if (typeof value === 'object') {
		const entries = Object.entries(value as AuditRecord)
			.map(([key, entryValue]) => [key, omitEmpty(entryValue)] as const)
			.filter(([, entryValue]) => entryValue !== undefined);
		if (entries.length === 0) return undefined;
		return Object.fromEntries(entries);
	}
	return value;
};

const compactGenericValue = (value: unknown, maxChars = MAX_INLINE_STRING): unknown => {
	if (typeof value === 'string') return compactString(value, maxChars);
	if (Array.isArray(value)) return value.map((entry) => compactGenericValue(entry, maxChars));
	if (value && typeof value === 'object') {
		const compacted: AuditRecord = {};
		for (const [key, entryValue] of Object.entries(value as AuditRecord)) {
			compacted[key] = compactGenericValue(entryValue, maxChars);
		}
		return omitEmpty(compacted);
	}
	return value;
};

const promptSnapshotId = (snapshot: AuditRecord | null | undefined): string | null =>
	asString(snapshot?.id);

const summarizePromptSections = (snapshot: AuditRecord): unknown => {
	const promptSections = asRecord(snapshot.prompt_sections);
	const liteSections = asArray(promptSections?.lite_sections).map(asRecord).filter(isPresent);
	if (liteSections.length === 0) return undefined;
	return liteSections.map((section) =>
		omitEmpty({
			id: section.id,
			title: section.title,
			chars:
				typeof section.content === 'string'
					? section.content.length
					: (section.chars ?? undefined),
			estimated_tokens: section.estimatedTokens ?? section.estimated_tokens
		})
	);
};

export const compactPromptSnapshot = (snapshot: unknown): AuditRecord | null => {
	const record = asRecord(snapshot);
	if (!record) return null;
	return omitEmpty({
		id: record.id,
		turn_run_id: record.turn_run_id,
		snapshot_version: record.snapshot_version,
		prompt_variant: record.prompt_variant,
		approx_prompt_tokens: record.approx_prompt_tokens,
		system_prompt_chars: record.system_prompt_chars,
		message_chars: record.message_chars,
		system_prompt_sha256: record.system_prompt_sha256,
		messages_sha256: record.messages_sha256,
		tools_sha256: record.tools_sha256,
		tool_count: asArray(record.tool_definitions).length || undefined,
		section_count: asArray(asRecord(record.prompt_sections)?.lite_sections).length || undefined,
		sections: summarizePromptSections(record),
		created_at: record.created_at,
		full_prompt_fields:
			record.rendered_dump_text ||
			record.system_prompt ||
			record.model_messages ||
			record.prompt_sections
				? 'see raw/prompt_snapshots.json'
				: undefined
	}) as AuditRecord;
};

const compactToolPayload = (payload: AuditRecord): AuditRecord =>
	omitEmpty({
		id: payload.id,
		message_id: payload.message_id,
		turn_run_id: payload.turn_run_id,
		stream_run_id: payload.stream_run_id,
		client_turn_id: payload.client_turn_id,
		tool_name: payload.tool_name,
		tool_category: payload.tool_category,
		gateway_op: payload.gateway_op,
		help_path: payload.help_path,
		sequence_index: payload.sequence_index,
		success: payload.success,
		execution_time_ms: payload.execution_time_ms,
		tokens_consumed: payload.tokens_consumed,
		error_message: payload.error_message,
		requires_user_action: payload.requires_user_action,
		arguments: compactGenericValue(payload.arguments, 1400),
		result: compactGenericValue(payload.result, 1400),
		source: payload.source,
		trace_entry: compactGenericValue(payload.trace_entry, 1400)
	}) as AuditRecord;

const compactMessagePayload = (payload: AuditRecord): AuditRecord =>
	omitEmpty({
		id: payload.id,
		role: payload.role,
		message_type: payload.message_type,
		total_tokens: payload.total_tokens,
		prompt_tokens: payload.prompt_tokens,
		completion_tokens: payload.completion_tokens,
		tool_call_id: payload.tool_call_id,
		tool_name: payload.tool_name,
		content:
			typeof payload.content === 'string' ? compactString(payload.content, 1200) : undefined,
		tool_calls: compactGenericValue(payload.tool_calls, 1200),
		tool_result: compactGenericValue(payload.tool_result, 1200),
		error_message: payload.error_message,
		error_code: payload.error_code,
		operation_ids: payload.operation_ids
	}) as AuditRecord;

const compactTurnEventPayload = (payload: AuditRecord): AuditRecord =>
	omitEmpty({
		id: payload.id,
		turn_run_id: payload.turn_run_id,
		stream_run_id: payload.stream_run_id,
		sequence_index: payload.sequence_index,
		phase: payload.phase,
		event_type: payload.event_type,
		tool_call_id: payload.tool_call_id,
		tool_name: payload.tool_name,
		canonical_op: payload.canonical_op,
		success: payload.success,
		error: payload.error,
		duration_ms: payload.duration_ms,
		arguments: compactGenericValue(payload.arguments, 1400),
		result: compactGenericValue(payload.result, 1400),
		tool_result_source: payload.tool_result_source,
		tool_execution_id: asRecord(payload.linked_tool_execution)?.id,
		tool_message_id: asRecord(payload.linked_tool_message)?.id,
		supervisor_action: payload.supervisor_action,
		supervisor_reason: payload.supervisor_reason,
		supervisor_source: payload.supervisor_source,
		supervisor_trigger: payload.supervisor_trigger,
		supervisor_question: payload.supervisor_question
	}) as AuditRecord;

const compactPromptSnapshotPayload = (payload: AuditRecord): AuditRecord =>
	(compactPromptSnapshot(payload) ?? omitEmpty(payload) ?? {}) as AuditRecord;

const compactLlmPayload = (payload: AuditRecord): AuditRecord =>
	omitEmpty({
		id: payload.id,
		operation_type: payload.operation_type,
		model_requested: payload.model_requested,
		model_used: payload.model_used,
		provider: payload.provider,
		turn_run_id: payload.turn_run_id,
		stream_run_id: payload.stream_run_id,
		client_turn_id: payload.client_turn_id,
		status: payload.status,
		error_message: payload.error_message,
		prompt_tokens: payload.prompt_tokens,
		completion_tokens: payload.completion_tokens,
		total_tokens: payload.total_tokens,
		total_cost_usd: payload.total_cost_usd,
		response_time_ms: payload.response_time_ms,
		request_started_at: payload.request_started_at,
		request_completed_at: payload.request_completed_at,
		openrouter_request_id: payload.openrouter_request_id,
		openrouter_cache_status: payload.openrouter_cache_status,
		streaming: payload.streaming
	}) as AuditRecord;

const compactOperationPayload = (payload: AuditRecord): AuditRecord =>
	omitEmpty({
		id: payload.id,
		operation_type: payload.operation_type,
		table_name: payload.table_name,
		status: payload.status,
		reasoning: payload.reasoning,
		duration_ms: payload.duration_ms,
		sequence_number: payload.sequence_number,
		error_message: payload.error_message,
		data: compactGenericValue(payload.data, 1400),
		result: compactGenericValue(payload.result, 1400)
	}) as AuditRecord;

const compactTimelinePayload = (event: AuditTimelineEvent): AuditRecord => {
	const payload = asRecord(event.payload) ?? {};
	if (event.type === 'message') return compactMessagePayload(payload);
	if (event.type === 'tool_execution') return compactToolPayload(payload);
	if (event.type === 'turn_event') return compactTurnEventPayload(payload);
	if (event.type === 'prompt_snapshot') return compactPromptSnapshotPayload(payload);
	if (event.type === 'llm_call') return compactLlmPayload(payload);
	if (event.type === 'operation') return compactOperationPayload(payload);
	return (omitEmpty(compactGenericValue(payload, 1400)) ?? {}) as AuditRecord;
};

export const buildCompactTimeline = (timeline: AuditTimelineEvent[]): AuditTimelineEvent[] =>
	timeline.map((event) => ({
		...event,
		payload: compactTimelinePayload(event)
	}));

const countTurnEventTypes = (events: AuditRecord[]): AuditRecord => {
	const counts: Record<string, number> = {};
	for (const event of events) {
		const type = asString(event.event_type) ?? 'unknown';
		counts[type] = (counts[type] ?? 0) + 1;
	}
	return counts;
};

export const buildCompactTurnRuns = (turnRuns: AuditTurnRun[]): AuditRecord[] =>
	turnRuns.map((run) => {
		const events = run.events as AuditRecord[];
		return omitEmpty({
			id: run.id,
			turn_index: run.turn_index,
			stream_run_id: run.stream_run_id,
			client_turn_id: run.client_turn_id,
			status: run.status,
			finished_reason: run.finished_reason,
			context_type: run.context_type,
			entity_id: run.entity_id,
			project_id: run.project_id,
			gateway_enabled: run.gateway_enabled,
			request_message: compactString(run.request_message, 1000),
			user_message_id: run.user_message_id,
			assistant_message_id: run.assistant_message_id,
			tool_round_count: run.tool_round_count,
			tool_call_count: run.tool_call_count,
			validation_failure_count: run.validation_failure_count,
			llm_pass_count: run.llm_pass_count,
			first_lane: run.first_lane,
			first_help_path: run.first_help_path,
			first_skill_path: run.first_skill_path,
			first_canonical_op: run.first_canonical_op,
			history_strategy: run.history_strategy,
			history_compressed: run.history_compressed,
			raw_history_count: run.raw_history_count,
			history_for_model_count: run.history_for_model_count,
			cache_source: run.cache_source,
			cache_age_seconds: run.cache_age_seconds,
			request_prewarmed_context: run.request_prewarmed_context,
			started_at: run.started_at,
			finished_at: run.finished_at,
			prompt_snapshot_id: promptSnapshotId(run.prompt_snapshot),
			prompt_snapshot: compactPromptSnapshot(run.prompt_snapshot),
			event_count: events.length,
			event_type_counts: countTurnEventTypes(events),
			eval_runs: run.eval_runs.map((evalRun) =>
				omitEmpty({
					id: evalRun.id,
					scenario_slug: evalRun.scenario_slug,
					scenario_version: evalRun.scenario_version,
					runner_type: evalRun.runner_type,
					status: evalRun.status,
					started_at: evalRun.started_at,
					completed_at: evalRun.completed_at,
					assertion_counts: asRecord(evalRun.summary)?.assertion_counts
				})
			)
		}) as AuditRecord;
	});

export const buildPromptSnapshotRecords = (payload: ChatSessionAuditPayload): AuditRecord[] => {
	const byId = new Map<string, AuditRecord>();
	for (const run of payload.turn_runs) {
		const snapshot = asRecord(run.prompt_snapshot);
		const id = asString(snapshot?.id);
		if (snapshot && id) byId.set(id, snapshot);
	}
	return Array.from(byId.values()).map((snapshot) => omitEmpty(snapshot) as AuditRecord);
};

export const buildCompactTurnEvents = (payload: ChatSessionAuditPayload): AuditRecord[] =>
	payload.turn_runs.flatMap((run) =>
		(run.events as AuditRecord[]).map(
			(event) =>
				omitEmpty({
					turn_index: run.turn_index,
					id: event.id,
					turn_run_id: event.turn_run_id,
					stream_run_id: event.stream_run_id,
					sequence_index: event.sequence_index,
					phase: event.phase,
					event_type: event.event_type,
					created_at: event.created_at,
					payload: compactTurnEventPayload(asRecord(event.payload) ?? {})
				}) as AuditRecord
		)
	);

const latestSnapshot = (payload: ChatSessionAuditPayload): AuditRecord | null => {
	for (let index = payload.turn_runs.length - 1; index >= 0; index -= 1) {
		const snapshot = asRecord(payload.turn_runs[index]?.prompt_snapshot);
		if (snapshot) return snapshot;
	}
	return null;
};

const firstSnapshot = (payload: ChatSessionAuditPayload): AuditRecord | null => {
	for (const run of payload.turn_runs) {
		const snapshot = asRecord(run.prompt_snapshot);
		if (snapshot) return snapshot;
	}
	return null;
};

const toolDescription = (toolDefinition: AuditRecord): string | undefined => {
	const fn = asRecord(toolDefinition.function);
	return asString(fn?.description) ?? asString(toolDefinition.description) ?? undefined;
};

const toolName = (toolDefinition: AuditRecord): string | null => {
	const fn = asRecord(toolDefinition.function);
	return asString(fn?.name) ?? asString(toolDefinition.name);
};

const collectAvailableTools = (snapshot: AuditRecord | null): CatalogEntry[] => {
	const definitions = asArray(snapshot?.tool_definitions).map(asRecord).filter(isPresent);
	const entries: CatalogEntry[] = [];
	for (const definition of definitions) {
		const name = toolName(definition);
		if (!name) continue;
		const entry: CatalogEntry = {
			id: name,
			name,
			source: 'prompt_snapshot.tool_definitions'
		};
		const description = toolDescription(definition);
		if (description) entry.description = description;
		entries.push(entry);
	}
	return entries;
};

const collectUsedTools = (payload: ChatSessionAuditPayload): LoadedEntry[] => {
	const entries = new Map<string, LoadedEntry>();
	for (const execution of payload.tool_executions) {
		const name = asString(execution.tool_name);
		if (!name) continue;
		entries.set(name, { id: name, source: 'chat_tool_executions' });
	}
	for (const event of payload.timeline) {
		const payloadRecord = asRecord(event.payload);
		const name = asString(payloadRecord?.tool_name);
		if (name && !entries.has(name)) {
			entries.set(name, {
				id: name,
				source: `timeline.${event.type}`,
				turn_index: event.turn_index,
				event_id: event.id
			});
		}
	}
	return Array.from(entries.values()).sort((a, b) => a.id.localeCompare(b.id));
};

const promptSectionContents = (payload: ChatSessionAuditPayload): string[] => {
	const sections: string[] = [];
	for (const run of payload.turn_runs) {
		const snapshot = asRecord(run.prompt_snapshot);
		const liteSections = asArray(asRecord(snapshot?.prompt_sections)?.lite_sections)
			.map(asRecord)
			.filter(isPresent);
		for (const section of liteSections) {
			const content = asString(section.content);
			if (content) sections.push(content);
		}
	}
	return sections;
};

const parseMarkdownTable = (content: string): CatalogEntry[] => {
	const entries: CatalogEntry[] = [];
	const rows = content.matchAll(/^\|\s*`?([^`|\s]+)`?\s*\|\s*([^|]+?)\s*\|$/gm);
	for (const match of rows) {
		const id = match[1]?.trim();
		const description = normalizeWhitespace(match[2] ?? '');
		if (!id || id === '---' || id.toLowerCase().includes('skill id')) continue;
		entries.push({ id, description, source: 'prompt_section.root_skill_catalog' });
	}
	return entries;
};

const collectAvailableSkills = (payload: ChatSessionAuditPayload): CatalogEntry[] => {
	const byId = new Map<string, CatalogEntry>();
	for (const content of promptSectionContents(payload)) {
		if (!content.includes('Root skill catalog')) continue;
		for (const entry of parseMarkdownTable(content)) {
			byId.set(entry.id, entry);
		}
	}
	return Array.from(byId.values()).sort((a, b) => a.id.localeCompare(b.id));
};

const loadedSkillFromArgs = (args: AuditRecord): string | null =>
	asString(args.skill_path) ??
	asString(args.skill_id) ??
	asString(args.path) ??
	asString(args.id) ??
	asString(args.name);

const collectToolLoadedIds = (
	payload: ChatSessionAuditPayload,
	toolNames: Set<string>,
	extract: (args: AuditRecord) => string | null
): LoadedEntry[] => {
	const entries = new Map<string, LoadedEntry>();
	for (const event of payload.timeline) {
		const payloadRecord = asRecord(event.payload);
		const name = asString(payloadRecord?.tool_name);
		if (!payloadRecord || !name || !toolNames.has(name)) continue;
		const args = asRecord(payloadRecord.arguments) ?? asRecord(payloadRecord.payload) ?? {};
		const id = extract(args);
		if (id) {
			entries.set(id, {
				id,
				source: name,
				turn_index: event.turn_index,
				event_id: event.id
			});
		}
	}
	for (const execution of payload.tool_executions) {
		const name = asString(execution.tool_name);
		if (!name || !toolNames.has(name)) continue;
		const id = extract(asRecord(execution.arguments) ?? {});
		if (id) entries.set(id, { id, source: name });
	}
	return Array.from(entries.values()).sort((a, b) => a.id.localeCompare(b.id));
};

const collectLoadedSkills = (payload: ChatSessionAuditPayload): LoadedEntry[] => {
	const entries = new Map<string, LoadedEntry>();
	for (const run of payload.turn_runs) {
		if (run.first_skill_path) {
			entries.set(run.first_skill_path, {
				id: run.first_skill_path,
				source: 'turn_run.first_skill_path',
				turn_index: run.turn_index
			});
		}
	}
	for (const entry of collectToolLoadedIds(
		payload,
		new Set(['skill_load']),
		loadedSkillFromArgs
	)) {
		entries.set(entry.id, entry);
	}
	return Array.from(entries.values()).sort((a, b) => a.id.localeCompare(b.id));
};

const collectRecommendedSkills = (payload: ChatSessionAuditPayload): LoadedEntry[] => {
	const entries = new Map<string, LoadedEntry>();
	for (const content of promptSectionContents(payload)) {
		const block = content.match(/Recommended skill ids:\n((?:- .+\n?)+)/);
		if (!block) continue;
		for (const line of (block[1] ?? '').split('\n')) {
			const ids = line
				.replace(/^- /, '')
				.split(',')
				.map((value) => value.trim())
				.filter(Boolean);
			for (const id of ids) {
				entries.set(id, { id, source: 'active_domain_signals' });
			}
		}
	}
	return Array.from(entries.values()).sort((a, b) => a.id.localeCompare(b.id));
};

const parseCandidateEntries = (
	payload: ChatSessionAuditPayload,
	heading: 'Candidate domains:' | 'Candidate outcome cards:'
): CatalogEntry[] => {
	const entries = new Map<string, CatalogEntry>();
	for (const content of promptSectionContents(payload)) {
		const start = content.indexOf(heading);
		if (start < 0) continue;
		const after = content.slice(start + heading.length);
		const nextHeading = after.search(/\n[A-Z][A-Za-z ]+:\n/);
		const block = nextHeading >= 0 ? after.slice(0, nextHeading) : after;
		const matches = block.matchAll(/^- ([^\s(]+)(?: \(([^)]+)\))?:\s*(.+)$/gm);
		for (const match of matches) {
			const id = match[1]?.trim();
			if (!id) continue;
			entries.set(id, {
				id,
				name: asString(match[2]) ?? undefined,
				description: normalizeWhitespace(match[3] ?? ''),
				source: 'active_domain_signals'
			});
		}
	}
	return Array.from(entries.values()).sort((a, b) => a.id.localeCompare(b.id));
};

const domainFromArgs = (args: AuditRecord): string | null =>
	asString(args.domain_id) ?? asString(args.domain) ?? asString(args.id);

const outcomeCardFromArgs = (args: AuditRecord): string | null =>
	asString(args.outcome_card_id) ?? asString(args.card_id) ?? asString(args.id);

export const buildCapabilityManifest = (
	payload: ChatSessionAuditPayload
): AuditCapabilityManifest => {
	const currentSnapshot = latestSnapshot(payload) ?? firstSnapshot(payload);
	const availableTools = collectAvailableTools(currentSnapshot);
	return {
		tools: {
			available: availableTools,
			loaded: availableTools,
			used: collectUsedTools(payload)
		},
		skills: {
			available: collectAvailableSkills(payload),
			loaded: collectLoadedSkills(payload),
			recommended: collectRecommendedSkills(payload)
		},
		domains: {
			included: parseCandidateEntries(payload, 'Candidate domains:'),
			loaded: collectToolLoadedIds(
				payload,
				new Set(['domain_load', 'domain_search']),
				domainFromArgs
			)
		},
		outcome_cards: {
			included: parseCandidateEntries(payload, 'Candidate outcome cards:'),
			loaded: collectToolLoadedIds(
				payload,
				new Set(['outcome_card_load']),
				outcomeCardFromArgs
			)
		}
	};
};
