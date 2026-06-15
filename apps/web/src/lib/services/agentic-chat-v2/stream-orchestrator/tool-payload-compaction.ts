// apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/tool-payload-compaction.ts
import type { ChatToolCall, ChatToolResult } from '@buildos/shared-types';

type ToolArgumentParser = (rawArgs: unknown) => { args: Record<string, any>; error?: string };

const MAX_MODEL_TOOL_PAYLOAD_CHARS = 6000;
const MAX_MODEL_SKILL_PAYLOAD_CHARS = 20000;
const MAX_TOOL_LIST_ITEMS = 20;
const INTERNAL_PAYLOAD_KEYS = new Set(['search_vector']);

export function buildToolPayloadForModel(
	toolCall: ChatToolCall,
	result: ChatToolResult,
	_parseToolArguments: ToolArgumentParser
): unknown {
	const basePayload = stripInternalPayloadFields(
		result.result ?? (result.error ? { error: result.error } : null)
	);
	if (basePayload === null || basePayload === undefined) {
		return null;
	}

	const toolName = toolCall.function?.name?.trim();
	if (
		toolName === 'domain_search' ||
		toolName === 'domain_load' ||
		toolName === 'outcome_card_search' ||
		toolName === 'outcome_card_load' ||
		toolName === 'work_capability_search' ||
		toolName === 'work_capability_load' ||
		toolName === 'tool_schema' ||
		toolName === 'tool_search' ||
		toolName === 'skill_search' ||
		toolName === 'resource_search' ||
		toolName === 'resource_load' ||
		toolName === 'skill_load' ||
		toolName === 'skill_reference_load'
	) {
		return compactGatewayMetaPayload(basePayload);
	}

	return compactDirectToolPayload(toolName ?? '', basePayload);
}

function compactExampleToolCall(payload: unknown): Record<string, any> | undefined {
	if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
		return undefined;
	}

	const record = payload as Record<string, any>;
	const args =
		record.arguments && typeof record.arguments === 'object' && !Array.isArray(record.arguments)
			? (record.arguments as Record<string, any>)
			: {};

	return {
		name: record.name,
		arguments: args
	};
}

function normalizeMaterializedToolName(name: string): string {
	if (name === 'work_capability_search') return 'outcome_card_search';
	if (name === 'work_capability_load') return 'outcome_card_load';
	return name;
}

function compactMaterializedTools(value: unknown, limit = 4): string[] {
	if (!Array.isArray(value)) return [];
	return value
		.filter((name): name is string => typeof name === 'string' && name.trim().length > 0)
		.map((name) => normalizeMaterializedToolName(name.trim()))
		.slice(0, limit);
}

function compactOutcomeCardIds(record: Record<string, any>): string[] {
	if (Array.isArray(record.outcome_card_ids)) return record.outcome_card_ids.slice(0, 8);
	if (Array.isArray(record.work_capability_ids)) return record.work_capability_ids.slice(0, 8);
	return [];
}

function compactGatewayMetaPayload(payload: unknown): unknown {
	if (!payload || typeof payload !== 'object') {
		return payload;
	}

	const record = payload as Record<string, any>;
	const type = typeof record.type === 'string' ? record.type : '';
	if (!type) {
		return applyToolPayloadSizeGuard(payload);
	}

	if (type === 'op' || type === 'tool_schema') {
		const args = Array.isArray(record.args)
			? record.args.slice(0, 24).map((arg: Record<string, any>) => ({
					name: arg?.name,
					type: arg?.type,
					required: arg?.required,
					description:
						typeof arg?.description === 'string'
							? toTextPreview(arg.description, 160)
							: undefined
				}))
			: [];
		return applyToolPayloadSizeGuard({
			type,
			op: record.op,
			tool_name: record.tool_name,
			summary: record.summary,
			usage: record.usage,
			required_args: Array.isArray(record.required_args) ? record.required_args : [],
			id_args: Array.isArray(record.id_args) ? record.id_args : [],
			args,
			notes: Array.isArray(record.notes) ? record.notes.slice(0, 12) : [],
			policy:
				record.policy && typeof record.policy === 'object'
					? {
							do: Array.isArray(record.policy.do) ? record.policy.do.slice(0, 6) : [],
							dont: Array.isArray(record.policy.dont)
								? record.policy.dont.slice(0, 6)
								: [],
							edge_cases: Array.isArray(record.policy.edge_cases)
								? record.policy.edge_cases.slice(0, 4)
								: []
						}
					: undefined,
			example_tool_call: compactExampleToolCall(record.example_tool_call),
			examples: Array.isArray(record.examples) ? record.examples.slice(0, 4) : []
		});
	}

	if (type === 'skill') {
		return applyToolPayloadSizeGuard(
			{
				type,
				id: record.id ?? record.path,
				name: record.name,
				description: record.description ?? record.summary,
				summary: record.summary,
				parent_id: record.parent_id,
				depth: record.depth,
				when_to_use: Array.isArray(record.when_to_use)
					? record.when_to_use.slice(0, 8)
					: [],
				workflow: Array.isArray(record.workflow) ? record.workflow.slice(0, 10) : [],
				related_ops: Array.isArray(record.related_ops)
					? record.related_ops.slice(0, 12)
					: [],
				child_skills: compactSkillLinkedResources(record.child_skills),
				reference_modules: compactSkillLinkedResources(record.reference_modules),
				guardrails: Array.isArray(record.guardrails) ? record.guardrails.slice(0, 8) : [],
				markdown:
					typeof record.markdown === 'string'
						? toTextPreview(record.markdown, 16000)
						: undefined,
				examples: Array.isArray(record.examples) ? record.examples.slice(0, 4) : [],
				notes: Array.isArray(record.notes) ? record.notes.slice(0, 6) : []
			},
			MAX_MODEL_SKILL_PAYLOAD_CHARS
		);
	}

	if (type === 'skill_reference') {
		return applyToolPayloadSizeGuard(
			{
				type,
				skill_id: record.skill_id,
				reference_id: record.reference_id,
				name: record.name,
				summary: record.summary,
				when_to_load: Array.isArray(record.when_to_load)
					? record.when_to_load.slice(0, 6)
					: [],
				path: record.path,
				visibility: record.visibility,
				content:
					typeof record.content === 'string'
						? toTextPreview(record.content, 16000)
						: undefined
			},
			MAX_MODEL_SKILL_PAYLOAD_CHARS
		);
	}

	if (type === 'domain_search_results') {
		return applyToolPayloadSizeGuard({
			type,
			query: record.query,
			total_matches: record.total_matches,
			materialized_tools: compactMaterializedTools(record.materialized_tools),
			matches: Array.isArray(record.matches)
				? record.matches.slice(0, 8).map((match: Record<string, any>) => ({
						domain_id: match?.domain_id,
						name: match?.name,
						confidence: match?.confidence,
						coverage_status: match?.coverage_status,
						parent_ids: Array.isArray(match?.parent_ids)
							? match.parent_ids.slice(0, 4)
							: [],
						aliases_hit: Array.isArray(match?.aliases_hit)
							? match.aliases_hit.slice(0, 5)
							: [],
						skill_ids: Array.isArray(match?.skill_ids)
							? match.skill_ids.slice(0, 10)
							: [],
						outcome_card_ids: compactOutcomeCardIds(match),
						related_domain_ids: Array.isArray(match?.related_domain_ids)
							? match.related_domain_ids.slice(0, 6)
							: [],
						next_step: match?.next_step
					}))
				: [],
			next_step: record.next_step
		});
	}

	if (type === 'domain') {
		return applyToolPayloadSizeGuard({
			type,
			domain_id: record.domain_id,
			name: record.name,
			summary: record.summary,
			coverage_status: record.coverage_status,
			parent_ids: Array.isArray(record.parent_ids) ? record.parent_ids.slice(0, 4) : [],
			child_domains: Array.isArray(record.child_domains)
				? record.child_domains.slice(0, 8)
				: [],
			related_domain_ids: Array.isArray(record.related_domain_ids)
				? record.related_domain_ids.slice(0, 8)
				: [],
			boundaries: Array.isArray(record.boundaries) ? record.boundaries.slice(0, 8) : [],
			capability_ids: Array.isArray(record.capability_ids)
				? record.capability_ids.slice(0, 8)
				: [],
			outcome_card_ids: compactOutcomeCardIds(record),
			skills: Array.isArray(record.skills) ? record.skills.slice(0, 12) : [],
			recommended_skill_stacks: Array.isArray(record.recommended_skill_stacks)
				? record.recommended_skill_stacks.slice(0, 6).map((stack: Record<string, any>) => ({
						id: stack?.id,
						name: stack?.name,
						use_when: stack?.use_when,
						skill_ids: Array.isArray(stack?.skill_ids)
							? stack.skill_ids.slice(0, 8)
							: []
					}))
				: [],
			resources: Array.isArray(record.resources) ? record.resources.slice(0, 8) : [],
			gaps: Array.isArray(record.gaps) ? record.gaps.slice(0, 8) : [],
			notes: Array.isArray(record.notes) ? record.notes.slice(0, 6) : [],
			materialized_tools: compactMaterializedTools(record.materialized_tools),
			next_step: record.next_step
		});
	}

	if (type === 'outcome_card_search_results' || type === 'work_capability_search_results') {
		return applyToolPayloadSizeGuard({
			type: 'outcome_card_search_results',
			query: record.query,
			filters: record.filters,
			total_matches: record.total_matches,
			materialized_tools: compactMaterializedTools(record.materialized_tools),
			matches: Array.isArray(record.matches)
				? record.matches.slice(0, 8).map((match: Record<string, any>) => ({
						outcome_card_id: match?.outcome_card_id ?? match?.work_capability_id,
						name: match?.name,
						confidence: match?.confidence,
						summary:
							typeof match?.summary === 'string'
								? toTextPreview(match.summary, 300)
								: match?.summary,
						domain_ids: Array.isArray(match?.domain_ids)
							? match.domain_ids.slice(0, 6)
							: [],
						buildos_capability_ids: Array.isArray(match?.buildos_capability_ids)
							? match.buildos_capability_ids.slice(0, 8)
							: [],
						default_skill_id: match?.default_skill_id,
						skill_ids: Array.isArray(match?.skill_ids)
							? match.skill_ids.slice(0, 10)
							: [],
						coverage_status: match?.coverage_status,
						load_hint: match?.load_hint
					}))
				: [],
			next_step: record.next_step
		});
	}

	if (type === 'outcome_card' || type === 'work_capability') {
		return applyToolPayloadSizeGuard({
			type: 'outcome_card',
			id: record.id,
			name: record.name,
			summary: record.summary,
			domain_ids: Array.isArray(record.domain_ids) ? record.domain_ids.slice(0, 8) : [],
			buildos_capability_ids: Array.isArray(record.buildos_capability_ids)
				? record.buildos_capability_ids.slice(0, 8)
				: [],
			when_to_use: Array.isArray(record.when_to_use) ? record.when_to_use.slice(0, 6) : [],
			example_requests: Array.isArray(record.example_requests)
				? record.example_requests.slice(0, 4)
				: [],
			default_skill_id: record.default_skill_id,
			skill_ids: Array.isArray(record.skill_ids) ? record.skill_ids.slice(0, 12) : [],
			resource_ids: Array.isArray(record.resource_ids) ? record.resource_ids.slice(0, 8) : [],
			tool_hints: Array.isArray(record.tool_hints) ? record.tool_hints.slice(0, 8) : [],
			outputs: Array.isArray(record.outputs) ? record.outputs.slice(0, 8) : [],
			evaluation_criteria: Array.isArray(record.evaluation_criteria)
				? record.evaluation_criteria.slice(0, 8)
				: [],
			coverage_status: record.coverage_status,
			gaps: Array.isArray(record.gaps) ? record.gaps.slice(0, 8) : [],
			notes: Array.isArray(record.notes) ? record.notes.slice(0, 6) : [],
			materialized_tools: compactMaterializedTools(record.materialized_tools),
			next_step: record.next_step
		});
	}

	if (type === 'skill_search_results') {
		return applyToolPayloadSizeGuard({
			type,
			query: record.query,
			filters: record.filters,
			total_matches: record.total_matches,
			matches: Array.isArray(record.matches)
				? record.matches.slice(0, 8).map((match: Record<string, any>) => ({
						skill_id: match?.skill_id,
						name: match?.name,
						parent_id: match?.parent_id,
						depth: match?.depth,
						confidence: match?.confidence,
						summary:
							typeof match?.summary === 'string'
								? toTextPreview(match.summary, 260)
								: match?.summary,
						when_to_use: Array.isArray(match?.when_to_use)
							? match.when_to_use.slice(0, 4)
							: [],
						related_ops: Array.isArray(match?.related_ops)
							? match.related_ops.slice(0, 8)
							: [],
						load_hint: match?.load_hint
					}))
				: [],
			next_step: record.next_step
		});
	}

	if (type === 'resource_search_results') {
		return applyToolPayloadSizeGuard({
			type,
			query: record.query,
			filters: record.filters,
			total_matches: record.total_matches,
			materialized_tools: Array.isArray(record.materialized_tools)
				? record.materialized_tools.slice(0, 4)
				: [],
			matches: Array.isArray(record.matches)
				? record.matches.slice(0, 8).map((match: Record<string, any>) => ({
						resource_id: match?.resource_id,
						kind: match?.kind,
						title: match?.title,
						confidence: match?.confidence,
						summary:
							typeof match?.summary === 'string'
								? toTextPreview(match.summary, 260)
								: match?.summary,
						when_to_load: Array.isArray(match?.when_to_load)
							? match.when_to_load.slice(0, 4)
							: [],
						domain_ids: Array.isArray(match?.domain_ids)
							? match.domain_ids.slice(0, 6)
							: [],
						skill_ids: Array.isArray(match?.skill_ids)
							? match.skill_ids.slice(0, 6)
							: [],
						skill_id: match?.skill_id,
						path: match?.path,
						visibility: match?.visibility
					}))
				: [],
			next_step: record.next_step
		});
	}

	if (type === 'resource') {
		return applyToolPayloadSizeGuard({
			type,
			resource_id: record.resource_id,
			kind: record.kind,
			title: record.title,
			summary: record.summary,
			when_to_load: Array.isArray(record.when_to_load) ? record.when_to_load.slice(0, 6) : [],
			domain_ids: Array.isArray(record.domain_ids) ? record.domain_ids.slice(0, 6) : [],
			skill_ids: Array.isArray(record.skill_ids) ? record.skill_ids.slice(0, 6) : [],
			message: record.message
		});
	}

	if (type === 'capability') {
		return applyToolPayloadSizeGuard({
			type,
			path: record.path,
			name: record.name,
			status: record.status,
			summary: record.summary,
			what_you_can_do: Array.isArray(record.what_you_can_do)
				? record.what_you_can_do.slice(0, 8)
				: [],
			skill_entrypoints: Array.isArray(record.skill_entrypoints)
				? record.skill_entrypoints.slice(0, 8)
				: [],
			direct_paths: Array.isArray(record.direct_paths)
				? record.direct_paths.slice(0, 12)
				: [],
			notes: Array.isArray(record.notes) ? record.notes.slice(0, 6) : []
		});
	}

	if (type === 'directory') {
		return applyToolPayloadSizeGuard({
			type,
			path: record.path,
			groups: Array.isArray(record.groups) ? record.groups : undefined,
			items: Array.isArray(record.items) ? record.items.slice(0, MAX_TOOL_LIST_ITEMS) : [],
			capabilities: Array.isArray(record.capabilities)
				? record.capabilities.slice(0, MAX_TOOL_LIST_ITEMS)
				: [],
			skills: Array.isArray(record.skills) ? record.skills.slice(0, MAX_TOOL_LIST_ITEMS) : [],
			workflow: Array.isArray(record.workflow) ? record.workflow.slice(0, 8) : [],
			next_step: record.next_step,
			command_contract:
				record.command_contract && typeof record.command_contract === 'object'
					? record.command_contract
					: undefined,
			examples: Array.isArray(record.examples) ? record.examples.slice(0, 4) : []
		});
	}

	return applyToolPayloadSizeGuard(payload);
}

function compactSkillLinkedResources(value: unknown): Array<Record<string, unknown>> {
	if (!Array.isArray(value)) return [];
	return value.slice(0, 12).map((resource: Record<string, any>) => ({
		id: resource?.id,
		name: resource?.name,
		summary: resource?.summary,
		when_to_load: Array.isArray(resource?.when_to_load)
			? resource.when_to_load.slice(0, 4)
			: [],
		path: resource?.path,
		visibility: resource?.visibility
	}));
}

function compactDirectToolPayload(toolName: string, payload: unknown): unknown {
	const normalizedToolName = toolName.trim().toLowerCase();
	if (
		normalizedToolName === 'search_project' ||
		normalizedToolName === 'search_all_projects' ||
		normalizedToolName === 'search_ontology'
	) {
		return compactOntologySearchPayload(payload);
	}
	if (normalizedToolName === 'get_onto_document_details') {
		return compactOntologyDocumentDetailPayload(payload);
	}
	if (normalizedToolName === 'get_onto_project_details') {
		return compactOntologyProjectDetailPayload(payload);
	}
	if (normalizedToolName === 'get_document_tree') {
		return compactDocumentTreeGatewayPayload(payload);
	}
	if (normalizedToolName === 'web_visit' || normalizedToolName === 'util.web.visit') {
		return compactWebVisitPayload(payload);
	}
	if (
		normalizedToolName === 'list_onto_documents' ||
		normalizedToolName === 'search_onto_documents'
	) {
		return compactDocumentCollectionGatewayPayload(payload);
	}
	return applyToolPayloadSizeGuard(payload);
}

function stripInternalPayloadFields(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map(stripInternalPayloadFields);
	}

	if (!value || typeof value !== 'object') {
		return value;
	}

	const output: Record<string, unknown> = {};
	for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
		if (INTERNAL_PAYLOAD_KEYS.has(key)) continue;
		output[key] = stripInternalPayloadFields(raw);
	}
	return output;
}

function compactOntologySearchPayload(payload: unknown): unknown {
	if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
		return payload;
	}

	const record = payload as Record<string, any>;
	const results = Array.isArray(record.results) ? record.results : [];
	const compactResults = results.slice(0, 12).map(compactSearchResult);
	const compactPayload: Record<string, unknown> = {
		query: record.query,
		search_scope: record.search_scope,
		project_id: record.project_id,
		total_returned:
			typeof record.total_returned === 'number' ? record.total_returned : results.length,
		total: typeof record.total === 'number' ? record.total : results.length,
		maybe_more: Boolean(record.maybe_more),
		message: record.message,
		results: compactResults
	};

	if (results.length > compactResults.length) {
		compactPayload.results_truncated = results.length - compactResults.length;
	}

	return applyToolPayloadSizeGuard(compactPayload);
}

function compactSearchResult(result: any): Record<string, unknown> {
	return {
		type: result?.type,
		id: result?.id,
		project_id: result?.project_id,
		project_name: result?.project_name,
		title: result?.title,
		state_key: result?.state_key,
		type_key: result?.type_key,
		score: typeof result?.score === 'number' ? result.score : undefined,
		path: result?.path,
		snippet: toTextPreview(result?.snippet, 700),
		matched_fields: Array.isArray(result?.matched_fields)
			? result.matched_fields.slice(0, 8)
			: undefined,
		why_matched: toTextPreview(result?.why_matched, 220)
	};
}

function compactOntologyDocumentDetailPayload(payload: unknown): unknown {
	if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
		return payload;
	}

	const record = payload as Record<string, any>;
	const document =
		record.document && typeof record.document === 'object' ? record.document : null;
	if (!document) {
		return applyToolPayloadSizeGuard(payload);
	}

	const content =
		typeof document.content === 'string'
			? document.content
			: typeof document.props?.body_markdown === 'string'
				? document.props.body_markdown
				: '';
	const contentPreview = toTextPreview(content, 3500);

	return applyToolPayloadSizeGuard({
		message: record.message,
		document: {
			id: document.id,
			project_id: document.project_id,
			project_name: document.project_name,
			title: document.title,
			description: toTextPreview(document.description, 700),
			type_key: document.type_key,
			state_key: document.state_key,
			created_at: document.created_at,
			updated_at: document.updated_at,
			archived_at: document.archived_at,
			content_length: content.length,
			content_preview: contentPreview,
			content_truncated: content.length > (contentPreview?.length ?? 0),
			children_count: Array.isArray(document.children?.children)
				? document.children.children.length
				: undefined
		}
	});
}

function compactOntologyProjectDetailPayload(payload: unknown): unknown {
	if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
		return payload;
	}

	const record = payload as Record<string, any>;
	const project = record.project && typeof record.project === 'object' ? record.project : null;
	if (!project) {
		return applyToolPayloadSizeGuard(payload);
	}
	const sourceCounts =
		record.counts && typeof record.counts === 'object' && !Array.isArray(record.counts)
			? (record.counts as Record<string, unknown>)
			: {};
	const totalFor = (key: string, fallback: number): number =>
		typeof sourceCounts[key] === 'number' ? (sourceCounts[key] as number) : fallback;

	const compactPayload: Record<string, unknown> = {
		message: record.message,
		project: {
			id: project.id,
			name: project.name,
			description: toTextPreview(project.description, 900),
			type_key: project.type_key,
			state_key: project.state_key,
			updated_at: project.updated_at,
			task_count: project.task_count,
			goal_count: project.goal_count,
			plan_count: project.plan_count,
			document_count: project.document_count,
			next_step_short: project.next_step_short,
			next_step_long: toTextPreview(project.next_step_long, 700)
		},
		counts: {
			goals: totalFor('goals', arrayLength(record.goals)),
			requirements: totalFor('requirements', arrayLength(record.requirements)),
			plans: totalFor('plans', arrayLength(record.plans)),
			tasks: totalFor('tasks', arrayLength(record.tasks)),
			documents: totalFor('documents', arrayLength(record.documents)),
			images: totalFor('images', arrayLength(record.images)),
			sources: totalFor('sources', arrayLength(record.sources)),
			milestones: totalFor('milestones', arrayLength(record.milestones)),
			risks: totalFor('risks', arrayLength(record.risks)),
			metrics: totalFor('metrics', arrayLength(record.metrics))
		},
		goals: compactEntityList(record.goals, compactNamedEntity, 8, sourceCounts.goals),
		requirements: compactEntityList(
			record.requirements,
			compactRequirementEntity,
			8,
			sourceCounts.requirements
		),
		plans: compactEntityList(record.plans, compactNamedEntity, 8, sourceCounts.plans),
		tasks: compactEntityList(record.tasks, compactTitledEntity, 12, sourceCounts.tasks),
		documents: compactEntityList(
			record.documents,
			compactDocumentSummary,
			12,
			sourceCounts.documents
		),
		milestones: compactEntityList(
			record.milestones,
			compactTitledEntity,
			8,
			sourceCounts.milestones
		),
		risks: compactEntityList(record.risks, compactTitledEntity, 8, sourceCounts.risks),
		context_document: compactDocumentSummary(record.context_document)
	};

	return applyToolPayloadSizeGuard(compactPayload);
}

function arrayLength(value: unknown): number {
	return Array.isArray(value) ? value.length : 0;
}

function compactEntityList<T>(
	value: unknown,
	compact: (item: T) => Record<string, unknown> | null,
	limit: number,
	totalOverride?: unknown
): Record<string, unknown> {
	const items = Array.isArray(value) ? value : [];
	const compactItems = items
		.slice(0, limit)
		.map((item) => compact(item as T))
		.filter((item): item is Record<string, unknown> => Boolean(item));
	const total =
		typeof totalOverride === 'number' && Number.isFinite(totalOverride)
			? totalOverride
			: items.length;

	return {
		total,
		items: compactItems,
		truncated: total > compactItems.length || items.length > compactItems.length
	};
}

function compactNamedEntity(entity: any): Record<string, unknown> | null {
	if (!entity || typeof entity !== 'object') return null;
	return {
		id: entity.id,
		name: entity.name,
		description: toTextPreview(entity.description, 360),
		type_key: entity.type_key,
		state_key: entity.state_key,
		target_date: entity.target_date,
		updated_at: entity.updated_at
	};
}

function compactTitledEntity(entity: any): Record<string, unknown> | null {
	if (!entity || typeof entity !== 'object') return null;
	return {
		id: entity.id,
		title: entity.title,
		description: toTextPreview(entity.description, 360),
		type_key: entity.type_key,
		state_key: entity.state_key,
		priority: entity.priority,
		due_at: entity.due_at,
		updated_at: entity.updated_at
	};
}

function compactRequirementEntity(entity: any): Record<string, unknown> | null {
	if (!entity || typeof entity !== 'object') return null;
	return {
		id: entity.id,
		text: toTextPreview(entity.text, 420),
		type_key: entity.type_key,
		state_key: entity.state_key,
		created_at: entity.created_at,
		updated_at: entity.updated_at
	};
}

function compactDocumentSummary(document: any): Record<string, unknown> | null {
	if (!document || typeof document !== 'object') return null;
	const content =
		typeof document.content === 'string'
			? document.content
			: typeof document.props?.body_markdown === 'string'
				? document.props.body_markdown
				: '';
	return {
		id: document.id,
		project_id: document.project_id,
		title: document.title,
		description: toTextPreview(document.description, 360),
		type_key: document.type_key,
		state_key: document.state_key,
		updated_at: document.updated_at,
		content_length: content.length
	};
}

function compactWebVisitPayload(payload: unknown): unknown {
	if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
		return payload;
	}

	const record = payload as Record<string, any>;
	const info = record.info && typeof record.info === 'object' ? record.info : {};
	const structuredData = Array.isArray(record.structured_data)
		? record.structured_data.slice(0, 20).map(compactStructuredDataItem)
		: undefined;
	const links = Array.isArray(record.links)
		? record.links.slice(0, 10).map((link: any) => ({
				url: typeof link?.url === 'string' ? link.url : null,
				text: toTextPreview(link?.text, 120)
			}))
		: undefined;

	return applyToolPayloadSizeGuard({
		url: record.url,
		final_url: record.final_url,
		status_code: record.status_code,
		content_type: record.content_type,
		title: record.title,
		canonical_url: record.canonical_url,
		content_format: record.content_format,
		excerpt: toTextPreview(record.excerpt, 500),
		content: toTextPreview(record.content, 3500),
		truncated: record.truncated,
		structured_data: structuredData,
		structured_data_count: Array.isArray(record.structured_data)
			? record.structured_data.length
			: 0,
		links,
		meta:
			record.meta && typeof record.meta === 'object' && !Array.isArray(record.meta)
				? compactRecord(record.meta, 12, 220)
				: undefined,
		message: record.message,
		info: {
			fetched_at: info.fetched_at,
			mode: info.mode,
			parser: info.parser,
			extraction_strategy: info.extraction_strategy,
			fetch_ms: info.fetch_ms,
			bytes: info.bytes,
			html_chars: info.html_chars,
			markdown_chars: info.markdown_chars,
			cache_hit: info.cache_hit
		}
	});
}

function compactRecord(
	value: Record<string, any>,
	maxKeys: number,
	maxStringLength: number
): Record<string, unknown> {
	const output: Record<string, unknown> = {};
	for (const [key, raw] of Object.entries(value).slice(0, maxKeys)) {
		if (typeof raw === 'string') {
			output[key] = toTextPreview(raw, maxStringLength);
		} else if (raw === null || typeof raw === 'number' || typeof raw === 'boolean') {
			output[key] = raw;
		}
	}
	return output;
}

function compactStructuredDataItem(item: unknown): unknown {
	if (!item || typeof item !== 'object' || Array.isArray(item)) {
		return item;
	}

	const record = item as Record<string, any>;
	return {
		type: record.type,
		name: toTextPreview(record.name, 220),
		startDate: record.startDate,
		endDate: record.endDate,
		eventStatus: record.eventStatus,
		eventAttendanceMode: record.eventAttendanceMode,
		location: compactStructuredDataPlace(record.location),
		offers: compactStructuredDataOffers(record.offers),
		organizer: compactStructuredDataThing(record.organizer),
		url: record.url,
		description: toTextPreview(record.description, 500)
	};
}

function compactStructuredDataThing(value: unknown): unknown {
	if (typeof value === 'string') return toTextPreview(value, 180);
	if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
	const record = value as Record<string, any>;
	return {
		type: record.type,
		name: toTextPreview(record.name, 180),
		url: record.url
	};
}

function compactStructuredDataPlace(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.slice(0, 4).map(compactStructuredDataPlace);
	}
	if (typeof value === 'string') return toTextPreview(value, 220);
	if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
	const record = value as Record<string, any>;
	return {
		type: record.type,
		name: toTextPreview(record.name, 220),
		address: compactStructuredDataAddress(record.address),
		url: record.url
	};
}

function compactStructuredDataAddress(value: unknown): unknown {
	if (typeof value === 'string') return toTextPreview(value, 220);
	if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
	const record = value as Record<string, any>;
	return {
		streetAddress: record.streetAddress,
		addressLocality: record.addressLocality,
		addressRegion: record.addressRegion,
		postalCode: record.postalCode,
		addressCountry: record.addressCountry
	};
}

function compactStructuredDataOffers(value: unknown): unknown {
	const offers = Array.isArray(value) ? value : value ? [value] : [];
	if (offers.length === 0) return undefined;
	return offers.slice(0, 6).map((offer) => {
		if (!offer || typeof offer !== 'object' || Array.isArray(offer)) return offer;
		const record = offer as Record<string, any>;
		return {
			type: record.type,
			name: toTextPreview(record.name, 140),
			price: record.price,
			priceCurrency: record.priceCurrency,
			availability: record.availability,
			validFrom: record.validFrom,
			url: record.url
		};
	});
}

function compactDocumentTreeGatewayPayload(payload: unknown): unknown {
	if (!payload || typeof payload !== 'object') {
		return payload;
	}
	const record = payload as Record<string, any>;
	const treeResult = record.result && typeof record.result === 'object' ? record.result : null;
	if (!treeResult) {
		return applyToolPayloadSizeGuard(payload);
	}

	const structure =
		treeResult.structure && typeof treeResult.structure === 'object'
			? treeResult.structure
			: {};
	const root = Array.isArray((structure as Record<string, any>).root)
		? ((structure as Record<string, any>).root as Array<Record<string, any>>)
		: [];
	const documents =
		treeResult.documents && typeof treeResult.documents === 'object'
			? (treeResult.documents as Record<string, any>)
			: {};
	const unlinkedRaw = Array.isArray(treeResult.unlinked) ? treeResult.unlinked : [];

	const rootSummary = root.slice(0, MAX_TOOL_LIST_ITEMS).map((node) => ({
		id: typeof node?.id === 'string' ? node.id : null,
		title: typeof node?.title === 'string' ? node.title : null,
		children_count: Array.isArray(node?.children) ? node.children.length : 0
	}));

	const unlinkedSummary = unlinkedRaw.slice(0, MAX_TOOL_LIST_ITEMS).map((item: any) => {
		if (typeof item === 'string') {
			const doc = documents[item];
			return {
				id: item,
				title: typeof doc?.title === 'string' ? doc.title : null
			};
		}
		if (item && typeof item === 'object') {
			return {
				id: typeof item.id === 'string' ? item.id : null,
				title: typeof item.title === 'string' ? item.title : null
			};
		}
		return { id: null, title: null };
	});

	const compactPayload: Record<string, unknown> = {
		op: record.op,
		ok: record.ok,
		result: {
			message: typeof treeResult.message === 'string' ? treeResult.message : null,
			counts: {
				root_count: root.length,
				document_count: Object.keys(documents).length,
				unlinked_count: unlinkedRaw.length
			},
			root: rootSummary,
			unlinked: unlinkedSummary
		},
		meta: record.meta
	};
	if (root.length > rootSummary.length) {
		(compactPayload.result as Record<string, unknown>).root_truncated =
			root.length - rootSummary.length;
	}
	if (unlinkedRaw.length > unlinkedSummary.length) {
		(compactPayload.result as Record<string, unknown>).unlinked_truncated =
			unlinkedRaw.length - unlinkedSummary.length;
	}

	return applyToolPayloadSizeGuard(compactPayload);
}

function compactDocumentCollectionGatewayPayload(payload: unknown): unknown {
	if (!payload || typeof payload !== 'object') {
		return payload;
	}
	const record = payload as Record<string, any>;
	const listResult = record.result && typeof record.result === 'object' ? record.result : null;
	if (!listResult) {
		return applyToolPayloadSizeGuard(payload);
	}

	const documentsRaw = Array.isArray(listResult.documents) ? listResult.documents : [];
	const summary = documentsRaw.slice(0, MAX_TOOL_LIST_ITEMS).map((doc: any) => ({
		id: typeof doc?.id === 'string' ? doc.id : null,
		title: typeof doc?.title === 'string' ? doc.title : null,
		type_key: typeof doc?.type_key === 'string' ? doc.type_key : null,
		state_key: typeof doc?.state_key === 'string' ? doc.state_key : null,
		updated_at: typeof doc?.updated_at === 'string' ? doc.updated_at : null,
		content_length:
			typeof doc?.content_length === 'number'
				? doc.content_length
				: typeof doc?.content === 'string'
					? doc.content.length
					: 0,
		description_preview: toTextPreview(doc?.description, 180),
		markdown_outline: compactMarkdownOutline(doc?.markdown_outline)
	}));
	const total =
		typeof listResult.total === 'number' ? listResult.total : Math.max(documentsRaw.length, 0);

	const compactPayload: Record<string, unknown> = {
		op: record.op,
		ok: record.ok,
		result: {
			message: typeof listResult.message === 'string' ? listResult.message : null,
			total,
			documents: summary
		},
		meta: record.meta
	};
	if (documentsRaw.length > summary.length) {
		(compactPayload.result as Record<string, unknown>).documents_truncated =
			documentsRaw.length - summary.length;
	}

	return applyToolPayloadSizeGuard(compactPayload);
}

function toTextPreview(value: unknown, maxLength: number): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	if (!trimmed) return null;
	if (trimmed.length <= maxLength) return trimmed;
	return `${trimmed.slice(0, Math.max(0, maxLength - 3))}...`;
}

function compactMarkdownOutline(outline: unknown): unknown {
	if (!outline || typeof outline !== 'object') return null;
	const record = outline as Record<string, any>;
	const counts =
		record.counts && typeof record.counts === 'object'
			? {
					total:
						typeof (record.counts as Record<string, any>).total === 'number'
							? (record.counts as Record<string, any>).total
							: 0,
					h1:
						typeof (record.counts as Record<string, any>).h1 === 'number'
							? (record.counts as Record<string, any>).h1
							: 0,
					h2:
						typeof (record.counts as Record<string, any>).h2 === 'number'
							? (record.counts as Record<string, any>).h2
							: 0,
					h3:
						typeof (record.counts as Record<string, any>).h3 === 'number'
							? (record.counts as Record<string, any>).h3
							: 0
				}
			: { total: 0, h1: 0, h2: 0, h3: 0 };
	const headings = Array.isArray(record.headings) ? record.headings : [];
	return {
		counts,
		headings: headings.slice(0, 24),
		truncated: Boolean(record.truncated) || headings.length > 24
	};
}

function applyToolPayloadSizeGuard(
	payload: unknown,
	maxChars = MAX_MODEL_TOOL_PAYLOAD_CHARS
): unknown {
	try {
		const serialized = JSON.stringify(payload);
		if (serialized.length <= maxChars) {
			return payload;
		}
		return {
			truncated: true,
			original_length: serialized.length,
			preview: `${serialized.slice(0, maxChars)}...`
		};
	} catch {
		return payload;
	}
}
