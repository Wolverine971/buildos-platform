// apps/web/src/lib/services/agentic-chat/tools/registry/tool-schema.ts
import { normalizeGatewayOpName } from './gateway-op-aliases';
import { getToolHelp } from './tool-help';

export type ToolSchemaOptions = {
	include_examples?: boolean;
	include_schema?: boolean;
};

function rewriteGatewayString(value: string): string {
	return value.replace(/\btool_exec\b/g, 'buildos_call');
}

function rewriteGatewayPayload(value: unknown): unknown {
	if (typeof value === 'string') {
		return rewriteGatewayString(value);
	}

	if (Array.isArray(value)) {
		return value.map((entry) => rewriteGatewayPayload(entry));
	}

	if (!value || typeof value !== 'object') {
		return value;
	}

	const record = value as Record<string, unknown>;
	const output: Record<string, unknown> = {};
	for (const [key, entry] of Object.entries(record)) {
		const nextKey =
			key === 'tool_exec'
				? 'buildos_call'
				: key === 'example_tool_exec'
					? 'example_buildos_call'
					: key;
		output[nextKey] = rewriteGatewayPayload(entry);
	}
	return output;
}

function rewriteGatewayRecordPayload(value: Record<string, unknown>): Record<string, unknown> {
	return rewriteGatewayPayload(value) as Record<string, unknown>;
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

	return {
		...rewriteGatewayRecordPayload(payload),
		type: 'tool_schema'
	};
}
