// apps/web/src/lib/services/agentic-chat/tools/core/tool-schema-compat.test.ts
import { describe, expect, it } from 'vitest';
import {
	AGENTIC_CHAT_STANDARD_CONTROL_TOOL_DEFINITIONS_V1,
	CANCEL_TURN_CONTRACT_TOOL_DEFINITION,
	CHAT_TOOL_DEFINITIONS,
	DECLARE_READ_ONLY_TURN_TOOL_DEFINITION,
	GATEWAY_TOOL_DEFINITIONS,
	REQUEST_TURN_CLARIFICATION_TOOL_DEFINITION,
	TURN_CONTRACT_TOOL_DEFINITION
} from '@buildos/agentic-chat-runtime/catalog';
import { getToolSchema } from '../registry/tool-schema';

const FORBIDDEN_TOP_LEVEL_KEYS = ['oneOf', 'anyOf', 'allOf', 'not', 'enum'] as const;
const CONTROL_TOOL_DEFINITIONS = [
	TURN_CONTRACT_TOOL_DEFINITION,
	DECLARE_READ_ONLY_TURN_TOOL_DEFINITION,
	REQUEST_TURN_CLARIFICATION_TOOL_DEFINITION,
	CANCEL_TURN_CONTRACT_TOOL_DEFINITION
];
const ALL_TOOL_DEFINITIONS = [
	...CHAT_TOOL_DEFINITIONS,
	...GATEWAY_TOOL_DEFINITIONS,
	...CONTROL_TOOL_DEFINITIONS
];

describe('Chat tool schema compatibility', () => {
	it('keeps internal execution architecture out of model-visible definitions', () => {
		const serializedDefinitions = JSON.stringify(ALL_TOOL_DEFINITIONS);

		expect(serializedDefinitions).not.toMatch(
			/ProjectSpec|web-owned|reviewed worker|project shell|shell-first|model lane|provider synthesis|execution lane/i
		);
	});

	it('uses OpenRouter/OpenAI-compatible top-level function parameter schemas', () => {
		for (const tool of ALL_TOOL_DEFINITIONS) {
			const toolName = tool.function?.name ?? 'unknown_tool';
			const parameters = tool.function?.parameters as Record<string, unknown> | undefined;

			expect(parameters, `${toolName} should define function.parameters`).toBeDefined();
			expect(parameters?.type, `${toolName} must have top-level type=object`).toBe('object');

			for (const key of FORBIDDEN_TOP_LEVEL_KEYS) {
				expect(
					Object.prototype.hasOwnProperty.call(parameters ?? {}, key),
					`${toolName} cannot use top-level "${key}" in function.parameters`
				).toBe(false);
			}
		}
	});

	it('keeps complete web control definitions aligned with the shared runtime', () => {
		for (const localDefinition of CONTROL_TOOL_DEFINITIONS) {
			const sharedDefinition = AGENTIC_CHAT_STANDARD_CONTROL_TOOL_DEFINITIONS_V1.find(
				(candidate) => candidate.function.name === localDefinition.function.name
			);
			expect(
				sharedDefinition,
				`${localDefinition.function.name} shared definition`
			).toBeDefined();
			expect(sharedDefinition).toEqual(localDefinition);
		}
	});

	it('does not require content for create_onto_document', () => {
		const tool = CHAT_TOOL_DEFINITIONS.find(
			(candidate) => candidate.function?.name === 'create_onto_document'
		);
		const parameters = tool?.function?.parameters as { required?: string[] } | undefined;
		const required = Array.isArray(parameters?.required) ? parameters.required : [];

		expect(required).toContain('project_id');
		expect(required).toContain('title');
		expect(required).toContain('description');
		expect(required).not.toContain('content');
	});

	it('documents the create_onto_task default type key consistently', () => {
		const tool = CHAT_TOOL_DEFINITIONS.find(
			(candidate) => candidate.function?.name === 'create_onto_task'
		);
		const parameters = tool?.function?.parameters as
			| { properties?: Record<string, { default?: unknown }> }
			| undefined;

		expect(parameters?.properties?.type_key?.default).toBe('task.default');
	});

	it('publishes the BuildOS web-search defaults and bounded evidence contract', () => {
		const tool = CHAT_TOOL_DEFINITIONS.find(
			(candidate) => candidate.function?.name === 'web_search'
		);
		const parameters = tool?.function?.parameters as
			| {
					properties?: Record<
						string,
						{ default?: unknown; minimum?: number; maximum?: number; maxItems?: number }
					>;
			  }
			| undefined;

		expect(tool?.function?.description).toContain('Find current or external sources');
		expect(tool?.function?.description).toContain('best two valid pages');
		expect(tool?.function?.description).not.toContain('using the Tavily API');
		expect(tool?.function?.description).not.toMatch(/provider synthesis|model lane/i);
		expect(parameters?.properties?.search_depth?.default).toBe('advanced');
		expect(parameters?.properties?.max_results).toMatchObject({
			default: 4,
			minimum: 1,
			maximum: 10
		});
		expect(parameters?.properties?.include_answer?.default).toBe(false);
		expect(parameters?.properties?.include_domains?.maxItems).toBe(20);
		expect(parameters?.properties?.exclude_domains?.maxItems).toBe(20);
	});

	it('returns exact create_onto_project schema details through tool_schema', () => {
		const definition = CHAT_TOOL_DEFINITIONS.find(
			(candidate) => candidate.function?.name === 'create_onto_project'
		);
		const schema = getToolSchema('onto.project.create', {
			include_examples: true,
			include_schema: true
		}) as Record<string, any>;

		expect(definition?.function?.description).toContain(
			'Create a project and its optional initial structure'
		);
		expect(definition?.function?.description).not.toMatch(
			/web-owned|reviewed|shell-first|execution lane/i
		);
		expect(schema.type).toBe('tool_schema');
		expect(schema.tool_name).toBe('create_onto_project');
		expect(schema.usage).toBe('create_onto_project({ ... })');
		expect(schema.required_args).toEqual(['project', 'entities', 'relationships']);
		expect(schema.schema.required).toEqual(['project', 'entities', 'relationships']);
		expect(schema.schema.properties.project.required).toEqual(['name', 'type_key']);
		expect(schema.schema.properties.project.properties.type_key.pattern).toBe(
			'^project\\.[a-z_]+\\.[a-z_]+(?:\\.[a-z_]+)?$'
		);
		expect(schema.schema.properties.entities.items.required).toEqual(['temp_id', 'kind']);
		expect(schema.schema.properties.entities.items.properties.kind.enum).toContain(
			'requirement'
		);
		expect(schema.schema.properties.entities.items.properties.priority.type).toEqual([
			'string',
			'number'
		]);
		expect(schema.schema.properties.entities.description).toContain('goal/plan/metric name');
		expect(schema.example_tool_call.name).toBe('create_onto_project');
		expect(schema.example_tool_call.arguments).toEqual({
			project: {
				name: '<name>',
				type_key: 'project.business.initiative'
			},
			entities: [],
			relationships: []
		});
	});

	it('uses bounded integer schemas for count and pagination inputs', () => {
		const countKeys = new Set([
			'limit',
			'offset',
			'project_limit',
			'max_results',
			'max_tool_calls',
			'position',
			'new_position'
		]);

		for (const tool of ALL_TOOL_DEFINITIONS) {
			const properties = (tool.function.parameters as any).properties ?? {};
			for (const [key, schema] of Object.entries(properties) as Array<
				[string, Record<string, unknown>]
			>) {
				if (!countKeys.has(key)) continue;
				expect(schema.type, `${tool.function.name}.${key} should be an integer`).toBe(
					'integer'
				);
				expect(
					typeof schema.minimum === 'number',
					`${tool.function.name}.${key} should define minimum`
				).toBe(true);
			}
		}
	});

	it('publishes the same search defaults enforced by gateway implementations', () => {
		const defaults: Record<string, number> = {
			domain_search: 6,
			outcome_card_search: 8,
			skill_search: 8,
			resource_search: 8,
			tool_search: 8
		};

		for (const [toolName, expectedDefault] of Object.entries(defaults)) {
			const tool = GATEWAY_TOOL_DEFINITIONS.find(
				(definition) => definition.function.name === toolName
			);
			expect(
				(tool?.function.parameters as any)?.properties?.limit?.default,
				`${toolName}.limit default`
			).toBe(expectedDefault);
		}
	});

	it('publishes executor defaults instead of hiding them in prose', () => {
		const defaultsByTool: Record<string, Record<string, unknown>> = {
			search_user_contacts: {
				include_methods: true,
				include_archived: false,
				include_sensitive_values: false
			},
			upsert_user_contact: { include_sensitive_values: false },
			list_user_contact_candidates: {
				status: 'pending',
				include_sensitive_values: false
			},
			resolve_user_contact_candidate: { include_sensitive_values: false },
			web_visit: {
				mode: 'auto',
				output_format: 'markdown',
				persist: true,
				force_refresh: false,
				include_links: false,
				allow_redirects: true
			},
			delegate_task: {
				scope_mode: 'read_only',
				effort: 'standard',
				run_template: 'agent',
				review: false
			},
			commit_change_set: { default_decision: 'approved' }
		};

		for (const [toolName, expectedDefaults] of Object.entries(defaultsByTool)) {
			const properties = CHAT_TOOL_DEFINITIONS.find((tool) => tool.function.name === toolName)
				?.function.parameters.properties as
				| Record<string, { default?: unknown }>
				| undefined;
			expect(properties, `${toolName} definition`).toBeDefined();
			for (const [propertyName, expectedDefault] of Object.entries(expectedDefaults)) {
				expect(properties?.[propertyName]?.default, `${toolName}.${propertyName}`).toBe(
					expectedDefault
				);
			}
		}
	});

	it('publishes canonical calendar arguments without legacy aliases', () => {
		const list = CHAT_TOOL_DEFINITIONS.find(
			(tool) => tool.function.name === 'list_calendar_events'
		)?.function.parameters as any;
		const update = CHAT_TOOL_DEFINITIONS.find(
			(tool) => tool.function.name === 'update_calendar_event'
		)?.function.parameters as any;

		expect(list.properties).toHaveProperty('time_min');
		expect(list.properties).toHaveProperty('time_max');
		expect(list.properties).not.toHaveProperty('timeMin');
		expect(list.properties).not.toHaveProperty('timeMax');
		expect(list.properties).not.toHaveProperty('q');
		expect(list.properties).not.toHaveProperty('max_results');
		expect(list.properties.offset.default).toBe(0);
		expect(update.properties).not.toHaveProperty('external_event_id');
		expect(update.properties.description.type).toEqual(['string', 'null']);
		expect(update.properties.location.type).toEqual(['string', 'null']);
	});

	it('does not advertise ontology read arguments ignored by the executor', () => {
		const omittedByTool: Record<string, string[]> = {
			list_onto_tasks: ['type_key', 'offset'],
			list_onto_goals: ['state_key', 'type_key', 'offset'],
			list_onto_plans: ['state_key', 'type_key', 'offset'],
			list_onto_projects: ['archived', 'offset'],
			list_onto_documents: ['offset'],
			list_onto_milestones: ['type_key', 'offset'],
			list_onto_risks: ['type_key', 'offset'],
			search_onto_tasks: ['type_key', 'offset'],
			search_onto_projects: ['archived', 'offset'],
			search_onto_documents: ['offset'],
			search_onto_goals: ['state_key', 'type_key', 'offset'],
			search_onto_plans: ['state_key', 'type_key', 'offset'],
			search_onto_milestones: ['type_key', 'offset'],
			search_onto_risks: ['type_key', 'offset'],
			search_ontology: ['offset']
		};

		for (const [toolName, omittedKeys] of Object.entries(omittedByTool)) {
			const properties = CHAT_TOOL_DEFINITIONS.find((tool) => tool.function.name === toolName)
				?.function.parameters.properties;
			expect(properties, `${toolName} definition`).toBeDefined();
			for (const key of omittedKeys) {
				expect(properties, `${toolName} should omit ${key}`).not.toHaveProperty(key);
			}
		}
	});

	it('serves one name per capability: the canonical name resolves, a legacy one does not', () => {
		// One tool name space (one-engine stage S9, 2026-09-04). `tool_schema` used
		// to fold legacy names onto canonical ops through `GATEWAY_OP_ALIASES`; that
		// table is deleted, so a legacy name is simply not a name. `search_buildos`
		// survives only as an executor-side entry in the shared read dispatch — it
		// has no tool definition, so it is never mounted and never callable.
		const canonical = getToolSchema('search_all_projects', {
			include_examples: true,
			include_schema: true
		}) as Record<string, any>;

		expect(canonical.type).toBe('tool_schema');
		expect(canonical.op).toBe('x.search.all_projects');
		expect(canonical.tool_name).toBe('search_all_projects');
		expect(canonical.example_tool_call.name).toBe('search_all_projects');

		expect(
			(getToolSchema('search_buildos', { include_schema: true }) as Record<string, any>).type
		).toBe('not_found');
	});
});
