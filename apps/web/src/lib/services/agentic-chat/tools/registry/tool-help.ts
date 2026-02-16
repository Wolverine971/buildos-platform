// apps/web/src/lib/services/agentic-chat/tools/registry/tool-help.ts

import { getToolRegistry } from './tool-registry';
import { normalizeGatewayHelpPath } from './gateway-op-aliases';

export type ToolHelpFormat = 'short' | 'full';

export type ToolHelpOptions = {
	format?: ToolHelpFormat;
	include_examples?: boolean;
	include_schemas?: boolean;
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
		return {
			type: 'directory',
			path: 'root',
			format,
			version: registry.version,
			groups: ['onto', 'util', 'cal']
		};
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

	return {
		type: 'directory',
		path: normalized,
		format,
		version: registry.version,
		items: children
	};
}

function normalizePath(path: string): string {
	if (!path) return 'root';
	const trimmed = path.trim();
	if (!trimmed) return 'root';
	return trimmed.replace(/^\./, '').replace(/\.$/, '');
}

function buildOpHelp(
	op: {
		op: string;
		tool_name: string;
		description: string;
		parameters_schema: Record<string, any>;
	},
	format: ToolHelpFormat,
	includeSchemas: boolean,
	includeExamples: boolean
): Record<string, any> {
	const schema = op.parameters_schema ?? { type: 'object', properties: {} };
	const properties = schema.properties ?? {};
	const required = Array.isArray(schema.required) ? schema.required : [];
	const args = Object.entries(properties).map(([name, def]) => ({
		name,
		type: Array.isArray((def as any)?.type)
			? (def as any).type.join(' | ')
			: ((def as any)?.type ?? 'any'),
		required: required.includes(name),
		default: (def as any)?.default,
		description: (def as any)?.description
	}));

	const usage = `tool_exec { op: "${op.op}", args: { ... } }`;
	const summary = summarize(op.description);

	const help: Record<string, any> = {
		type: 'op',
		op: op.op,
		tool_name: op.tool_name,
		summary,
		usage,
		args
	};

	if (includeSchemas) {
		help.schema = schema;
	}

	if (includeExamples) {
		help.examples = [];
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
