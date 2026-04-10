// apps/web/src/lib/services/agentic-chat/tools/registry/tool-help.ts

import { getToolRegistry } from './tool-registry';
import { normalizeGatewayHelpPath } from './gateway-op-aliases';
import {
	buildCapabilityHelpPayload,
	getCapabilityByPath,
	listCapabilityDirectoryItems
} from './capability-catalog';
import { getSkillByPath, listAllSkills, listSkillsForDirectory } from '../skills/registry';
import { buildSkillLoadPayload } from '../skills/skill-load';
import type { SkillDefinition, SkillHelpPayload } from '../skills/types';

export type ToolHelpFormat = 'short' | 'full';

export type ToolHelpOptions = {
	format?: ToolHelpFormat;
	include_examples?: boolean;
	include_schemas?: boolean;
};

type JsonSchemaProperty = Record<string, any>;
type RegistryOp = {
	op: string;
	tool_name: string;
	description: string;
	parameters_schema: Record<string, any>;
};

const POLICY_MAP: Record<string, { do: string[]; dont: string[]; edge_cases: string[] }> = {
	'onto.task.create': {
		do: [
			'Create tasks when the user explicitly asks to track future work',
			'Create tasks for human actions that must happen outside this chat'
		],
		dont: [
			'Do not create tasks for research or analysis you can do now',
			'Do not create tasks just to look helpful'
		],
		edge_cases: ['If ambiguous, ask one clarifying question before creating']
	},
	'onto.project.create': {
		do: [
			'Infer project name and type_key from the user message',
			'Keep structure minimal unless the user explicitly mentions more'
		],
		dont: [
			'Do not add entities the user did not mention',
			'Do not leave props empty when details are provided'
		],
		edge_cases: ['If critical info is missing, add clarifications[] and still create']
	}
};
export function getToolHelp(path: string, options: ToolHelpOptions = {}): Record<string, any> {
	const registry = getToolRegistry();
	const format: ToolHelpFormat = options.format ?? 'short';
	const includeSchemas = options.include_schemas ?? false;
	const includeExamples = options.include_examples ?? true;

	const normalized = normalizeGatewayHelpPath(normalizePath(path));
	if (!normalized || normalized === 'root') {
		const rootHelp: Record<string, any> = {
			type: 'directory',
			path: 'root',
			format,
			version: registry.version,
			groups: ['capabilities', 'skills', 'workflow', 'onto', 'util', 'cal'],
			capabilities: listCapabilityDirectoryItems('available'),
			skills: listAllSkills().map((skill) => ({
				name: skill.id,
				type: 'skill' as const,
				summary: skill.summary
			})),
			command_contract: {
				tool_help: {
					required: ['path'],
					shape: { path: '<help path>', format: 'short|full', include_schemas: false }
				},
				execute_op: {
					required: ['op', 'input'],
					shape: {
						op: '<canonical op>',
						input: {
							/* required fields */
						}
					},
					critical_rules: [
						'Never call execute_op with input: {} for writes.',
						'Never omit input for write operations.',
						'For onto.<entity>.get|update|delete, pass exact <entity>_id UUIDs.',
						'For onto.project.create, include project, entities, and relationships.'
					]
				}
			},
			workflow: [
				'1) Choose a capability first when the domain is clear: capabilities.overview, capabilities.project_creation, capabilities.calendar, capabilities.documents, capabilities.planning, capabilities.project_graph, capabilities.people_context, capabilities.workflow_audit, capabilities.workflow_forecast, capabilities.web_research, capabilities.buildos_reference, or capabilities.schema_reference.',
				'2) For routine workspace/project status questions, start with capabilities.overview and use util.workspace.overview or util.project.overview before generic ontology search/list assembly.',
				'3) For project_create context or any new-project request, prefer capabilities.project_creation, then load onto.project.create.skill before onto.project.create.',
				'4) If the capability lists a skill entry point, fetch that skill before multi-step or easy-to-get-wrong work. If it has no dedicated skill, go straight to targeted exact-op help. You can also inspect the global skill catalog with tool_help({ path: "skills" }).',
				'5) If tool_help returns a directory, skill, or capability, narrow to the exact op; for first-time or complex writes, inspect exact schema with tool_help({ path: "<exact op>", format: "full", include_schemas: true }).',
				'6) Execute with execute_op({ op: "<exact op>", input: { ... } }).',
				'7) If execution returns error.help_path, call tool_help({ path: help_path }) then retry once.'
			]
		};
		if (includeExamples) {
			rootHelp.examples = [
				{
					description: 'Inspect the overview capability for status questions',
					tool_help: { path: 'capabilities.overview', format: 'short' }
				},
				{
					description: 'Get a named project status snapshot',
					execute_op: {
						op: 'util.project.overview',
						input: {
							query: '9takes'
						}
					}
				},
				{
					description: 'Inspect the calendar capability first',
					tool_help: { path: 'capabilities.calendar', format: 'short' }
				},
				{
					description: 'Inspect the project creation capability first',
					tool_help: { path: 'capabilities.project_creation', format: 'short' }
				},
				{
					description: 'Fetch the global skill catalog',
					tool_help: { path: 'skills', format: 'short' }
				},
				{
					description: 'Inspect task update schema',
					tool_help: { path: 'onto.task.update', format: 'full', include_schemas: true }
				},
				{
					description: 'Valid update call shape',
					execute_op: {
						op: 'onto.task.update',
						input: {
							task_id: '<task_id_uuid>',
							title: 'Updated task title'
						}
					}
				}
			];
		}
		return rootHelp;
	}
	if (normalized === 'capabilities') {
		return buildCapabilitiesDirectoryHelp(registry.version, format, includeExamples);
	}
	const capability = getCapabilityByPath(normalized);
	if (capability) {
		return buildCapabilityHelpPayload(capability, format);
	}
	if (normalized === 'skills') {
		return buildSkillsDirectoryHelp(registry.version, format, includeExamples);
	}
	const skill = getSkillByPath(normalized);
	if (skill) {
		return buildSkillHelp(skill, registry.version, format, includeExamples);
	}

	const op = registry.ops[normalized];
	if (op) {
		return buildOpHelp(op, format, includeSchemas, includeExamples);
	}

	const children = [
		...listSkillsForDirectory(normalized),
		...listChildren(normalized, registry.ops)
	].sort((a, b) => {
		if (sortItemPriority(a.type) !== sortItemPriority(b.type)) {
			return sortItemPriority(a.type) - sortItemPriority(b.type);
		}
		return a.name.localeCompare(b.name);
	});
	if (children.length === 0) {
		return {
			type: 'not_found',
			path: normalized,
			format,
			version: registry.version,
			message: 'No commands found for this path.'
		};
	}

	const directoryHelp: Record<string, any> = {
		type: 'directory',
		path: normalized,
		format,
		version: registry.version,
		items: children,
		next_step:
			'Call tool_help({ path: "<exact op>", format: "full", include_schemas: true }) before execute_op for writes.'
	};
	if (includeExamples) {
		const firstOp = children.find((child) => child.type === 'op');
		if (firstOp?.name) {
			directoryHelp.examples = [
				{
					description: `Inspect ${firstOp.name} schema`,
					tool_help: { path: firstOp.name, format: 'full', include_schemas: true }
				}
			];
		}
	}
	return directoryHelp;
}

function buildCapabilitiesDirectoryHelp(
	version: string,
	format: ToolHelpFormat,
	includeExamples: boolean
): Record<string, any> {
	const items = listCapabilityDirectoryItems('available');
	const help: Record<string, any> = {
		type: 'directory',
		path: 'capabilities',
		format,
		version,
		items,
		next_step:
			'Call tool_help({ path: "<capability path>" }) to inspect the capability, then fetch any listed skill path or exact op path.'
	};

	if (includeExamples) {
		help.examples = [
			{
				description: 'Inspect overview capability details',
				tool_help: { path: 'capabilities.overview', format: 'full' }
			},
			{
				description: 'Inspect project creation capability details',
				tool_help: { path: 'capabilities.project_creation', format: 'full' }
			}
		];
	}

	return help;
}

function buildSkillsDirectoryHelp(
	version: string,
	format: ToolHelpFormat,
	includeExamples: boolean
): Record<string, any> {
	const items = listAllSkills()
		.map((skill) => ({
			name: skill.id,
			type: 'skill' as const,
			summary: skill.summary
		}))
		.sort((a, b) => a.name.localeCompare(b.name));

	const help: Record<string, any> = {
		type: 'directory',
		path: 'skills',
		format,
		version,
		items,
		next_step:
			'Call tool_help({ path: "<skill path>", format: "full" }) to load the playbook, then inspect the exact op schema only when needed.'
	};

	if (includeExamples) {
		help.examples = [
			{
				description: 'Load the calendar skill playbook',
				tool_help: { path: 'cal.skill', format: 'full' }
			}
		];
	}

	return help;
}

function sortItemPriority(type: string): number {
	if (type === 'capability') return 0;
	if (type === 'skill') return 1;
	return 2;
}

function normalizePath(path: string): string {
	if (!path) return 'root';
	const trimmed = path.trim();
	if (!trimmed) return 'root';
	return trimmed.replace(/^\./, '').replace(/\.$/, '');
}

function buildOpHelp(
	op: RegistryOp,
	format: ToolHelpFormat,
	includeSchemas: boolean,
	includeExamples: boolean
): Record<string, any> {
	const schema = op.parameters_schema ?? { type: 'object', properties: {} };
	const properties = (schema.properties ?? {}) as Record<string, JsonSchemaProperty>;
	const required = Array.isArray(schema.required) ? (schema.required as string[]) : [];
	const args = Object.entries(properties).map(([name, def]) => ({
		name,
		type: Array.isArray(def?.type) ? def.type.join(' | ') : (def?.type ?? 'any'),
		required: required.includes(name),
		default: def?.default,
		description: def?.description
	}));
	const idArgs = Object.keys(properties).filter((name) => name.endsWith('_id'));

	const usage = `execute_op({ op: "${op.op}", input: { ... } })`;
	const summary = summarize(op.description);
	const notes = buildOpNotes(op.op, required, properties);
	const minimalArgs = buildMinimalArgsTemplate(op.op, required, properties);

	const help: Record<string, any> = {
		type: 'op',
		op: op.op,
		tool_name: op.tool_name,
		summary,
		usage,
		args,
		required_args: required,
		id_args: idArgs,
		notes
	};

	if (includeSchemas) {
		help.schema = schema;
	}

	if (includeExamples) {
		help.examples = buildOpExamples(op.op, minimalArgs, required, properties);
		help.example_execute_op = {
			op: op.op,
			input: minimalArgs
		};
	}

	const policy = POLICY_MAP[op.op];
	if (policy) {
		help.policy = policy;
	}

	if (format === 'short') {
		return help;
	}

	help.description = op.description;
	return help;
}

function summarize(description: string): string {
	if (!description) return '';
	const trimmed = description.trim();
	const end = trimmed.indexOf('.');
	if (end === -1) return trimmed;
	return trimmed.slice(0, end + 1);
}

function buildOpNotes(
	op: string,
	required: string[],
	properties: Record<string, JsonSchemaProperty>
): string[] {
	const notes: string[] = [];
	if (op === 'cal.event.list') {
		notes.push(
			'Prefer input.timeMin/timeMax (or input.time_min/time_max) to inspect an exact future/history window.'
		);
		notes.push(
			'Use input.limit (or input.max_results) plus input.offset to page through long timelines.'
		);
	}
	if (op === 'cal.event.get') {
		notes.push(
			'Prefer input.onto_event_id when available; otherwise pass input.event_id (+ scope/calendar hints when needed).'
		);
	}
	if (op === 'cal.event.create' || op === 'cal.event.update') {
		notes.push(
			'Use timezone-safe ISO 8601 for input.start_at/input.end_at (include offset/Z, or pass input.timezone).'
		);
	}
	if (op === 'cal.event.update' || op === 'cal.event.delete') {
		notes.push('Pass input.onto_event_id or input.event_id.');
	}
	if (op.startsWith('cal.event.')) {
		notes.push(
			'When input.calendar_scope="project", include input.project_id so the correct project calendar is resolved.'
		);
	}
	if (op === 'cal.project.get' || op === 'cal.project.set') {
		notes.push('Pass input.project_id as an exact UUID.');
	}
	if (op === 'onto.goal.create') {
		notes.push('Use input.name for the goal title; goals use name, not title.');
		notes.push(
			'Include input.project_id and input.name. Add input.description when the user already stated the outcome or success criteria.'
		);
	}
	if (op === 'onto.milestone.create') {
		notes.push('Use input.title for the milestone title; milestones use title, not name.');
		notes.push(
			'Include input.project_id and input.title. Add input.goal_id when the milestone belongs to a known goal.'
		);
	}
	if (op === 'onto.plan.create') {
		notes.push('Use input.name for the plan title; plans use name, not title.');
		notes.push(
			'Include input.project_id and input.name. Add input.goal_id or input.milestone_id when the plan belongs under one of them.'
		);
	}

	const updateMatch = op.match(/^onto\.([a-z_]+)\.update$/);
	if (updateMatch) {
		const idKey = `${updateMatch[1]}_id`;
		if (required.includes(idKey) || idKey in properties) {
			notes.push(`${op} requires input.${idKey} and at least one field to update.`);
		}
	}

	if (/^onto\.[a-z_]+\.(get|delete)$/.test(op)) {
		const entity = op.split('.')[1];
		notes.push(`${op} requires input.${entity}_id as an exact UUID.`);
	}

	if (op === 'onto.search' || /^onto\.[a-z_]+\.search$/.test(op)) {
		notes.push('Search ops require input.query (and include input.project_id when known).');
	}

	if (op === 'onto.document.tree.move') {
		notes.push(
			'Pass input.document_id and input.new_position. Use input.new_parent_id only when nesting under a parent.'
		);
	}

	if (op === 'util.profile.overview') {
		notes.push('Use this when personalization is relevant; profile context is not preloaded.');
		notes.push('Start with default args for a lightweight section overview.');
	}
	if (op === 'util.workspace.overview') {
		notes.push(
			'This is the preferred first read for workspace-wide status questions before generic ontology search/list assembly.'
		);
		notes.push(
			'Use input.project_limit only when the user wants a broader or narrower snapshot.'
		);
	}
	if (op === 'util.project.overview') {
		notes.push(
			'Pass input.project_id when the exact project is already known; otherwise pass input.query with the project name.'
		);
		notes.push(
			'If the result returns match.status="ambiguous", ask one concise clarifying question from the returned candidates instead of guessing.'
		);
	}
	if (op === 'onto.project.create') {
		notes.push(
			'onto.project.create requires input.project, input.entities, and input.relationships.'
		);
		notes.push(
			'input.project must include project.name and project.type_key. Use entities: [] and relationships: [] when starting minimal.'
		);
		notes.push(
			'Infer project.name and project.type_key from the user message when reasonably possible, and use clarifications[] only for critical missing information.'
		);
		notes.push(
			'If relationships are present, each item must be [ { temp_id, kind }, { temp_id, kind } ] or { from: { temp_id, kind }, to: { temp_id, kind } }. Never use raw string pairs like ["g1", "t1"].'
		);
	}
	if (op === 'util.contact.search' || op === 'util.contact.candidates.list') {
		notes.push('Contact methods are redacted by default.');
		notes.push(
			'Only request include_sensitive_values=true when the user explicitly asks for exact phone/email values, and set user_confirmed_sensitive=true with a short reason.'
		);
	}
	if (op === 'util.contact.candidate.resolve') {
		notes.push(
			'Use action=confirmed_merge only when the user explicitly confirms both contacts are the same person.'
		);
	}
	if (op === 'util.contact.link') {
		notes.push('Choose a link_type first, then pass matching target IDs for that link type.');
	}

	if (notes.length === 0) {
		notes.push('Match input exactly to required fields in this schema.');
	}

	return notes;
}

function buildOpExamples(
	op: string,
	minimalArgs: Record<string, unknown>,
	required: string[],
	properties: Record<string, JsonSchemaProperty>
): Array<Record<string, unknown>> {
	if (op === 'cal.event.list') {
		return [
			{
				description: 'List a specific future window',
				execute_op: {
					op,
					input: {
						time_min: '2026-03-01',
						time_max: '2026-04-01',
						limit: 100
					}
				}
			},
			{
				description: 'Page to the next chunk in the same window',
				execute_op: {
					op,
					input: {
						time_min: '2026-03-01',
						time_max: '2026-04-01',
						limit: 100,
						offset: 100
					}
				}
			}
		];
	}
	if (op === 'cal.event.create') {
		return [
			{
				description: 'Create a project-scoped event',
				execute_op: {
					op,
					input: {
						title: 'Design review',
						start_at: '2026-03-10T18:00:00.000Z',
						end_at: '2026-03-10T19:00:00.000Z',
						calendar_scope: 'project',
						project_id: '<project_id_uuid>'
					}
				}
			}
		];
	}
	if (op === 'cal.event.update') {
		return [
			{
				description: 'Update an event by ontology event id',
				execute_op: {
					op,
					input: {
						onto_event_id: '<onto_event_id_uuid>',
						title: 'Updated title'
					}
				}
			}
		];
	}
	if (op === 'cal.event.delete') {
		return [
			{
				description: 'Delete an event by ontology event id',
				execute_op: {
					op,
					input: {
						onto_event_id: '<onto_event_id_uuid>'
					}
				}
			}
		];
	}
	if (op === 'cal.project.set') {
		return [
			{
				description: 'Link or update a project calendar mapping',
				execute_op: {
					op,
					input: {
						project_id: '<project_id_uuid>',
						action: 'update',
						sync_enabled: true
					}
				}
			}
		];
	}
	if (op === 'util.workspace.overview') {
		return [
			{
				description: 'Get a concise workspace-wide status snapshot',
				execute_op: {
					op,
					input: {
						project_limit: 8
					}
				}
			}
		];
	}
	if (op === 'util.project.overview') {
		return [
			{
				description: 'Resolve a project by name and return its status snapshot',
				execute_op: {
					op,
					input: {
						query: '9takes'
					}
				}
			},
			{
				description:
					'Load a project snapshot directly when the project ID is already known',
				execute_op: {
					op,
					input: {
						project_id: '<project_id_uuid>'
					}
				}
			}
		];
	}
	if (op === 'onto.project.create') {
		return [
			{
				description: 'Create a minimal project skeleton',
				execute_op: {
					op,
					input: buildProjectCreateMinimalArgs()
				}
			},
			{
				description: 'Create a project with one explicit goal',
				execute_op: {
					op,
					input: {
						project: {
							name: 'Learn Spanish',
							type_key: 'project.education.skill'
						},
						entities: [{ temp_id: 'g1', kind: 'goal', name: 'Conversational fluency' }],
						relationships: []
					}
				}
			},
			{
				description: 'Create a project with one goal and explicit tasks',
				execute_op: {
					op,
					input: {
						project: {
							name: 'Product Launch',
							type_key: 'project.business.product_launch'
						},
						entities: [
							{ temp_id: 'g1', kind: 'goal', name: 'Launch MVP by Q2' },
							{ temp_id: 't1', kind: 'task', title: 'Schedule kickoff meeting' },
							{ temp_id: 't2', kind: 'task', title: 'Review vendor proposals' }
						],
						relationships: [
							{
								from: { temp_id: 'g1', kind: 'goal' },
								to: { temp_id: 't1', kind: 'task' }
							},
							{
								from: { temp_id: 'g1', kind: 'goal' },
								to: { temp_id: 't2', kind: 'task' }
							}
						]
					}
				}
			}
		];
	}
	if (op === 'onto.goal.create') {
		return [
			{
				description: 'Create a project goal with the required name field',
				execute_op: {
					op,
					input: {
						project_id: '<project_id_uuid>',
						name: 'Finish first draft by March 31st',
						description:
							'Complete the first draft with a consistent weekday writing routine and monthly checkpoints.'
					}
				}
			},
			{
				description: 'Create a smaller supporting goal',
				execute_op: {
					op,
					input: {
						project_id: '<project_id_uuid>',
						name: 'Submit chapter 1 to beta readers by January 15th'
					}
				}
			}
		];
	}
	if (op === 'onto.milestone.create') {
		return [
			{
				description: 'Create a milestone linked to a known goal',
				execute_op: {
					op,
					input: {
						project_id: '<project_id_uuid>',
						goal_id: '<goal_id_uuid>',
						title: 'Complete chapters 1-10',
						due_at: '2026-01-31T23:59:00.000Z',
						description: 'Reach 30,000 words and finish the January chapter target.'
					}
				}
			},
			{
				description: 'Create a standalone checkpoint',
				execute_op: {
					op,
					input: {
						project_id: '<project_id_uuid>',
						title: 'Research fantasy literary agents'
					}
				}
			}
		];
	}
	if (op === 'onto.plan.create') {
		return [
			{
				description: 'Create a plan nested under a milestone',
				execute_op: {
					op,
					input: {
						project_id: '<project_id_uuid>',
						milestone_id: '<milestone_id_uuid>',
						name: 'Weekday drafting routine',
						description: 'Daily drafting blocks plus weekend revision and planning.',
						state_key: 'active'
					}
				}
			},
			{
				description: 'Create a supporting plan under a goal',
				execute_op: {
					op,
					input: {
						project_id: '<project_id_uuid>',
						goal_id: '<goal_id_uuid>',
						name: 'Beta reader outreach'
					}
				}
			}
		];
	}

	const examples: Array<Record<string, unknown>> = [
		{
			description: 'Minimal valid call',
			execute_op: {
				op,
				input: minimalArgs
			}
		}
	];

	const detailMatch = op.match(/^onto\.([a-z_]+)\.(get|update|delete)$/);
	if (detailMatch) {
		const entity = detailMatch[1];
		const idKey = `${entity}_id`;
		if (required.includes(idKey) || idKey in properties) {
			examples.push({
				description: 'When ID is unknown, discover it first',
				sequence: [
					{
						op: `onto.${entity}.list`,
						input: {
							project_id: '<project_id_uuid>',
							limit: 20
						}
					},
					{
						op,
						input: {
							...minimalArgs,
							[idKey]: `<${idKey}_uuid>`
						}
					}
				]
			});
		}
	}

	return examples;
}

function buildMinimalArgsTemplate(
	op: string,
	required: string[],
	properties: Record<string, JsonSchemaProperty>
): Record<string, unknown> {
	if (op === 'onto.project.create') {
		return buildProjectCreateMinimalArgs();
	}

	const args: Record<string, unknown> = {};
	for (const key of required) {
		args[key] = buildPlaceholderValue(key, properties[key] ?? {});
	}

	if (/^onto\.[a-z_]+\.update$/.test(op)) {
		const mutableKey = Object.keys(properties).find((key) => {
			if (key === 'project_id') return false;
			if (key.endsWith('_id')) return false;
			if (key === 'update_strategy' || key === 'merge_instructions') return false;
			return true;
		});
		if (mutableKey && args[mutableKey] === undefined) {
			args[mutableKey] = buildPlaceholderValue(mutableKey, properties[mutableKey] ?? {});
		}
	}

	if ((op === 'onto.search' || /^onto\.[a-z_]+\.search$/.test(op)) && args.query === undefined) {
		args.query = '<search query>';
	}
	if (op === 'cal.event.update' || op === 'cal.event.delete') {
		if (args.onto_event_id === undefined && args.event_id === undefined) {
			args.onto_event_id = '<onto_event_id_uuid>';
		}
	}
	if (op === 'cal.event.update' && args.title === undefined) {
		args.title = '<title>';
	}

	return args;
}

function buildProjectCreateMinimalArgs(): Record<string, unknown> {
	return {
		project: {
			name: '<project name>',
			type_key: 'project.business.initiative'
		},
		entities: [],
		relationships: []
	};
}

function buildSkillHelp(
	skill: SkillDefinition,
	version: string,
	format: ToolHelpFormat,
	includeExamples: boolean
): SkillHelpPayload {
	return buildSkillLoadPayload(skill, version, format, includeExamples);
}

function buildPlaceholderValue(name: string, def: JsonSchemaProperty): unknown {
	const types = getSchemaTypes(def);

	if (name.endsWith('_id')) return `<${name}_uuid>`;
	if (name === 'query' || name === 'search') return '<search query>';
	if (name === 'title' || name.endsWith('_title')) return '<title>';
	if (name === 'name' || name.endsWith('_name')) return '<name>';
	if (name === 'description' || name.endsWith('_description')) return '<description>';
	if (name === 'content' || name === 'body_markdown') return '<markdown content>';
	if (name === 'type_key') return '<type_key>';
	if (name === 'state_key') return '<state_key>';

	if (types.has('string')) return `<${name}>`;
	if (types.has('integer') || types.has('number')) return 0;
	if (types.has('boolean')) return false;
	if (types.has('array')) return [];
	if (types.has('object')) return {};

	return `<${name}>`;
}

function getSchemaTypes(def: JsonSchemaProperty): Set<string> {
	const types = new Set<string>();
	if (!def || typeof def !== 'object') return types;

	if (typeof def.type === 'string') {
		types.add(def.type);
	} else if (Array.isArray(def.type)) {
		for (const item of def.type) {
			if (typeof item === 'string') {
				types.add(item);
			}
		}
	}

	const unions = ([] as unknown[]).concat(def.anyOf ?? [], def.oneOf ?? [], def.allOf ?? []);
	for (const unionEntry of unions) {
		if (!unionEntry || typeof unionEntry !== 'object') continue;
		const nestedTypes = getSchemaTypes(unionEntry as JsonSchemaProperty);
		for (const nestedType of nestedTypes) {
			types.add(nestedType);
		}
	}

	return types;
}

function listChildren(
	path: string,
	ops: Record<string, { op: string; description: string }>
): Array<Record<string, any>> {
	const prefix = path.endsWith('.') ? path : `${path}.`;
	const children = new Map<string, { name: string; type: string; summary?: string }>();

	for (const op of Object.values(ops)) {
		if (!op.op.startsWith(prefix)) continue;
		const remainder = op.op.slice(prefix.length);
		const [head, ...rest] = remainder.split('.');
		if (!head) continue;
		if (rest.length === 0) {
			children.set(op.op, {
				name: op.op,
				type: 'op',
				summary: summarize(op.description)
			});
		} else {
			const childPath = `${path}.${head}`;
			if (!children.has(childPath)) {
				children.set(childPath, { name: childPath, type: 'group' });
			}
		}
	}

	return Array.from(children.values()).sort((a, b) => a.name.localeCompare(b.name));
}
