// apps/web/src/lib/services/agentic-chat/execution/tool-execution/tool-argument-adapters.ts
import { normalizeProjectCreateArgs } from '../../tools/core/project-create-args';
import { isToolArgumentRecord, type ToolArguments } from './argument-values';

type AliasRule = {
	targetKey: string;
	aliasKeys: readonly string[];
	allowNonString?: boolean;
};

export interface SemanticAliasResult {
	args: ToolArguments;
	mutated: boolean;
	addedCount: number;
}

const CREATE_TASK_ALIASES: readonly AliasRule[] = [
	{
		targetKey: 'title',
		aliasKeys: ['task_title', 'task_name', 'name', 'task.title', 'task.name']
	},
	{
		targetKey: 'description',
		aliasKeys: ['task_description', 'details', 'summary', 'task.description', 'task.details']
	}
];

const CREATE_PLAN_ALIASES: readonly AliasRule[] = [
	{
		targetKey: 'name',
		aliasKeys: ['title', 'plan_name', 'plan_title', 'plan.title', 'plan.name']
	},
	{
		targetKey: 'description',
		aliasKeys: ['plan_description', 'details', 'summary', 'plan.description']
	},
	{
		targetKey: 'plan',
		aliasKeys: ['plan_body', 'plan_content', 'plan_details', 'body', 'content', 'plan.plan']
	}
];

const CREATE_GOAL_ALIASES: readonly AliasRule[] = [
	{
		targetKey: 'name',
		aliasKeys: ['title', 'goal_name', 'goal_title', 'goal.title', 'goal.name']
	},
	{
		targetKey: 'description',
		aliasKeys: ['goal_description', 'details', 'summary', 'goal.description']
	}
];

const UPDATE_PLAN_ALIASES: readonly AliasRule[] = [
	{
		targetKey: 'name',
		aliasKeys: ['plan_name', 'plan_title', 'title', 'plan.title', 'plan.name']
	},
	{
		targetKey: 'description',
		aliasKeys: ['plan_description', 'details', 'summary', 'plan.description']
	},
	{
		targetKey: 'plan',
		aliasKeys: ['plan_body', 'plan_content', 'plan_details', 'body', 'content', 'plan.plan']
	}
];

const UPDATE_GOAL_ALIASES: readonly AliasRule[] = [
	{
		targetKey: 'name',
		aliasKeys: ['goal_name', 'goal_title', 'title', 'goal.title', 'goal.name']
	},
	{
		targetKey: 'description',
		aliasKeys: ['goal_description', 'details', 'summary', 'content', 'goal.description']
	}
];

const CALENDAR_EVENT_ID_ALIASES: readonly AliasRule[] = [
	{
		targetKey: 'event_id',
		aliasKeys: ['external_event_id', 'externalEventId', 'event.id', 'external_event.id']
	}
];

const SEMANTIC_ALIAS_POLICIES: Readonly<Record<string, readonly AliasRule[]>> = {
	create_onto_task: CREATE_TASK_ALIASES,
	create_onto_plan: CREATE_PLAN_ALIASES,
	create_onto_goal: CREATE_GOAL_ALIASES,
	update_onto_task: CREATE_TASK_ALIASES,
	update_onto_plan: UPDATE_PLAN_ALIASES,
	update_onto_goal: UPDATE_GOAL_ALIASES,
	update_onto_document: [
		{
			targetKey: 'title',
			aliasKeys: ['document_title', 'doc_title', 'name', 'document.title', 'document.name']
		},
		{
			targetKey: 'description',
			aliasKeys: ['document_description', 'summary', 'details']
		},
		{
			targetKey: 'content',
			aliasKeys: [
				'body_markdown',
				'markdown',
				'body',
				'text',
				'document.content',
				'document.body_markdown',
				'document.markdown',
				'document.body',
				'document.text'
			]
		}
	],
	link_onto_entities: [
		{
			targetKey: 'src_kind',
			aliasKeys: ['source_kind', 'from_kind', 'from.kind', 'source.kind', 'src.kind']
		},
		{
			targetKey: 'src_id',
			aliasKeys: ['source_id', 'from_id', 'from.id', 'source.id', 'src.id']
		},
		{
			targetKey: 'dst_kind',
			aliasKeys: ['target_kind', 'to_kind', 'to.kind', 'target.kind', 'dst.kind']
		},
		{
			targetKey: 'dst_id',
			aliasKeys: ['target_id', 'to_id', 'to.id', 'target.id', 'dst.id']
		},
		{
			targetKey: 'rel',
			aliasKeys: ['relationship', 'relation', 'relationship_type', 'edge_type', 'type']
		},
		{ targetKey: 'props', aliasKeys: ['edge_props', 'metadata'], allowNonString: true }
	],
	list_calendar_events: [{ targetKey: 'query', aliasKeys: ['q'] }],
	get_calendar_event_details: CALENDAR_EVENT_ID_ALIASES,
	update_calendar_event: CALENDAR_EVENT_ID_ALIASES,
	delete_calendar_event: CALENDAR_EVENT_ID_ALIASES,
	domain_load: [{ targetKey: 'domain', aliasKeys: ['domain_id', 'id'] }],
	outcome_card_search: [
		{
			targetKey: 'buildosCapability',
			aliasKeys: ['buildos_capability', 'capability']
		}
	],
	work_capability_search: [
		{
			targetKey: 'buildosCapability',
			aliasKeys: ['buildos_capability', 'capability']
		}
	],
	outcome_card_load: [
		{
			targetKey: 'outcomeCard',
			aliasKeys: ['outcome_card', 'workCapability', 'work_capability', 'id']
		}
	],
	work_capability_load: [
		{
			targetKey: 'workCapability',
			aliasKeys: ['outcomeCard', 'outcome_card', 'work_capability', 'id']
		}
	],
	resource_load: [{ targetKey: 'resource', aliasKeys: ['resource_id', 'id'] }],
	skill_load: [{ targetKey: 'skill', aliasKeys: ['skill_id', 'id', 'path'] }],
	skill_reference_load: [
		{ targetKey: 'skill', aliasKeys: ['skill_id', 'id', 'path'] },
		{
			targetKey: 'reference',
			aliasKeys: ['reference_id', 'module', 'reference.path']
		}
	],
	tool_schema: [{ targetKey: 'op', aliasKeys: ['path'] }]
};

/** Tool-specific repair that intentionally runs immediately after decoding. */
export function applyDecodedToolAdapter(toolName: string, args: ToolArguments): ToolArguments {
	return toolName === 'create_onto_project' ? normalizeProjectCreateArgs(args) : args;
}

export function hasDocumentPayload(args: ToolArguments): boolean {
	const directKeys = [
		'title',
		'name',
		'document_title',
		'document_name',
		'content',
		'body_markdown',
		'text',
		'markdown',
		'body'
	];
	if (directKeys.some((key) => key in args)) return true;

	const nested = isToolArgumentRecord(args.document) ? args.document : undefined;
	return nested ? directKeys.some((key) => key in nested) : false;
}

export function applySemanticAliases(toolName: string, args: ToolArguments): SemanticAliasResult {
	const rules = SEMANTIC_ALIAS_POLICIES[toolName];
	if (!rules || rules.length === 0) {
		return { args, mutated: false, addedCount: 0 };
	}

	const resolved: ToolArguments = { ...args };
	let addedCount = 0;

	for (const rule of rules) {
		const existing = resolved[rule.targetKey];
		if (rule.allowNonString) {
			if (existing !== undefined && existing !== null) continue;
		} else if (hasNonEmptyString(existing)) {
			continue;
		}

		for (const aliasKey of rule.aliasKeys) {
			const candidate = readAliasValue(resolved, aliasKey);
			if (rule.allowNonString) {
				if (candidate !== undefined && candidate !== null) {
					resolved[rule.targetKey] = candidate;
					addedCount += 1;
					break;
				}
				continue;
			}
			if (hasNonEmptyString(candidate)) {
				resolved[rule.targetKey] = candidate.trim();
				addedCount += 1;
				break;
			}
		}
	}

	return {
		args: addedCount > 0 ? resolved : args,
		mutated: addedCount > 0,
		addedCount
	};
}

export function readAliasValue(source: ToolArguments, aliasKey: string): unknown {
	if (!aliasKey.includes('.')) {
		return source[aliasKey];
	}

	let cursor: unknown = source;
	for (const part of aliasKey.split('.')) {
		if (!isToolArgumentRecord(cursor)) {
			return undefined;
		}
		cursor = cursor[part];
	}
	return cursor;
}

export function hasNonEmptyString(value: unknown): value is string {
	return typeof value === 'string' && value.trim().length > 0;
}
