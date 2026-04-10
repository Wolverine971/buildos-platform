// apps/web/src/lib/services/agentic-chat/tools/registry/tool-schema.ts
import { normalizeGatewayOpName } from './gateway-op-aliases';
import { getToolHelp } from './tool-help';

export type ToolSchemaOptions = {
	include_examples?: boolean;
	include_schema?: boolean;
};

function formatDirectUsage(toolName: string): string {
	return `${toolName}({ ... })`;
}

function rewriteToolSchemaString(value: string, toolName: string): string {
	return value
		.replace(
			/execute_op\(\{\s*op:\s*"[^"]+",\s*input:\s*\{ \.\.\. \}\s*\}\)/g,
			formatDirectUsage(toolName)
		)
		.replace(/\bexecute_op\b/g, toolName)
		.replace(/\btool_exec\b/g, toolName)
		.replace(/\bbuildos_call\b/g, toolName)
		.replace(/\binput(?=\s*:\s*\{)/g, 'arguments');
}

function rewriteExamplePayload(value: unknown, toolName: string): unknown {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return value;
	}

	const record = value as Record<string, unknown>;
	const executePayload =
		(record.execute_op as Record<string, unknown> | undefined) ??
		(record.tool_exec as Record<string, unknown> | undefined) ??
		(record.buildos_call as Record<string, unknown> | undefined);

	const output: Record<string, unknown> = { ...record };
	delete output.execute_op;
	delete output.tool_exec;
	delete output.buildos_call;

	if (executePayload && typeof executePayload === 'object' && !Array.isArray(executePayload)) {
		output.tool_call = {
			name: toolName,
			arguments:
				(executePayload.input as Record<string, unknown> | undefined) ??
				(executePayload.args as Record<string, unknown> | undefined) ??
				{}
		};
	}

	if (Array.isArray(record.sequence)) {
		output.sequence = record.sequence.map((entry) => {
			if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;
			const sequenceRecord = entry as Record<string, unknown>;
			return {
				op: sequenceRecord.op,
				tool_call: {
					name:
						typeof sequenceRecord.tool_name === 'string'
							? sequenceRecord.tool_name
							: toolName,
					arguments:
						(sequenceRecord.input as Record<string, unknown> | undefined) ??
						(sequenceRecord.args as Record<string, unknown> | undefined) ??
						{}
				}
			};
		});
	}

	return output;
}

function rewriteToolSchemaPayload(
	value: Record<string, unknown>,
	toolName: string
): Record<string, unknown> {
	const output: Record<string, unknown> = {};

	for (const [key, entry] of Object.entries(value)) {
		if (key === 'usage' && typeof entry === 'string') {
			output[key] = formatDirectUsage(toolName);
			continue;
		}
		if (
			key === 'example_execute_op' ||
			key === 'example_tool_exec' ||
			key === 'example_buildos_call'
		) {
			output.example_tool_call = rewriteExamplePayload(
				{ execute_op: entry as Record<string, unknown> },
				toolName
			);
			continue;
		}
		if (key === 'examples' && Array.isArray(entry)) {
			output.examples = entry.map((example) => rewriteExamplePayload(example, toolName));
			continue;
		}
		if (typeof entry === 'string') {
			output[key] = rewriteToolSchemaString(entry, toolName);
			continue;
		}
		output[key] = entry;
	}

	output.tool_name = toolName;
	output.callable_tool = toolName;
	return output;
}

export function getToolSchema(
	opReference: string,
	options: ToolSchemaOptions = {}
): Record<string, unknown> {
	const normalizedOp = normalizeGatewayOpName(opReference.trim());
	const payload = getToolHelp(normalizedOp, {
		format: 'full',
		include_examples: options.include_examples !== false,
		include_schemas: options.include_schema !== false
	});

	if (payload.type !== 'op') {
		return {
			type: 'not_found',
			op: normalizedOp,
			message: 'No tool schema found for this op.'
		};
	}

	const toolName =
		typeof payload.tool_name === 'string' && payload.tool_name.trim().length > 0
			? payload.tool_name.trim()
			: '';

	return {
		...rewriteToolSchemaPayload(payload, toolName),
		type: 'tool_schema'
	};
}
