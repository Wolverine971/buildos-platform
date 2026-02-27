// apps/web/src/lib/services/agentic-chat/tools/registry/tool-help.ts

import { getToolRegistry } from './tool-registry';
import { normalizeGatewayHelpPath } from './gateway-op-aliases';

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
			groups: ['onto', 'util', 'cal'],
			command_contract: {
				tool_help: {
					required: ['path'],
					shape: { path: '<help path>', format: 'short|full', include_schemas: false }
				},
				tool_exec: {
					required: ['op', 'args'],
					shape: {
						op: '<canonical op>',
						args: {
							/* required fields */
						}
					},
					critical_rules: [
						'Never call tool_exec with {}.',
						'Never omit args for write operations.',
						'For onto.<entity>.get|update|delete, pass exact <entity>_id UUIDs.'
					]
				}
			},
			workflow: [
				'1) Discover target group with tool_help("onto.<entity>") or tool_help("cal.event").',
				'2) For first-time/complex writes, inspect exact schema with tool_help("<exact op>", { format: "full", include_schemas: true }).',
				'3) Execute with tool_exec({ op: "<exact op>", args: { ... } }).',
				'4) If execution returns error.help_path, call tool_help(help_path) then retry once.'
			]
		};
		if (includeExamples) {
			rootHelp.examples = [
				{
					description: 'Inspect task update schema',
					tool_help: { path: 'onto.task.update', format: 'full', include_schemas: true }
				},
				{
					description: 'Valid update call shape',
					tool_exec: {
						op: 'onto.task.update',
						args: {
							task_id: '<task_id_uuid>',
							title: 'Updated task title'
						}
					}
				}
			];
		}
		return rootHelp;
	}

	const op = registry.ops[normalized];
	if (op) {
		return buildOpHelp(op, format, includeSchemas, includeExamples);
	}

	const children = listChildren(normalized, registry.ops);
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
			'Call tool_help("<exact op>", { format: "full", include_schemas: true }) before tool_exec for writes.'
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

	const usage = `tool_exec({ op: "${op.op}", args: { ... } })`;
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
		help.example_tool_exec = {
			op: op.op,
			args: minimalArgs
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
			'Prefer args.timeMin/timeMax (or args.time_min/time_max) to inspect an exact future/history window.'
		);
		notes.push(
			'Use args.limit (or args.max_results) plus args.offset to page through long timelines.'
		);
	}

	const updateMatch = op.match(/^onto\.([a-z_]+)\.update$/);
	if (updateMatch) {
		const idKey = `${updateMatch[1]}_id`;
		if (required.includes(idKey) || idKey in properties) {
			notes.push(`${op} requires args.${idKey} and at least one field to update.`);
		}
	}

	if (/^onto\.[a-z_]+\.(get|delete)$/.test(op)) {
		const entity = op.split('.')[1];
		notes.push(`${op} requires args.${entity}_id as an exact UUID.`);
	}

	if (op === 'onto.search' || /^onto\.[a-z_]+\.search$/.test(op)) {
		notes.push('Search ops require args.query (and include args.project_id when known).');
	}

	if (op === 'onto.document.tree.move') {
		notes.push(
			'Pass args.document_id and args.new_position. Use args.new_parent_id only when nesting under a parent.'
		);
	}

	if (notes.length === 0) {
		notes.push('Match args exactly to required fields in this schema.');
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
				tool_exec: {
					op,
					args: {
						time_min: '2026-03-01',
						time_max: '2026-04-01',
						limit: 100
					}
				}
			},
			{
				description: 'Page to the next chunk in the same window',
				tool_exec: {
					op,
					args: {
						time_min: '2026-03-01',
						time_max: '2026-04-01',
						limit: 100,
						offset: 100
					}
				}
			}
		];
	}

	const examples: Array<Record<string, unknown>> = [
		{
			description: 'Minimal valid call',
			tool_exec: {
				op,
				args: minimalArgs
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
						args: {
							project_id: '<project_id_uuid>',
							limit: 20
						}
					},
					{
						op,
						args: {
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

	return args;
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
