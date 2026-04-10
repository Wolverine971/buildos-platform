// apps/web/src/lib/services/agentic-chat/tools/core/gateway-exec-utils.ts
export const PRIMARY_GATEWAY_EXEC_TOOL_NAME = 'execute_op' as const;
export const LEGACY_GATEWAY_EXEC_TOOL_NAMES = ['buildos_call', 'tool_exec'] as const;
export const ALL_GATEWAY_EXEC_TOOL_NAMES = [
	PRIMARY_GATEWAY_EXEC_TOOL_NAME,
	...LEGACY_GATEWAY_EXEC_TOOL_NAMES
] as const;

export function isGatewayExecToolName(toolName: string | undefined | null): boolean {
	return (
		typeof toolName === 'string' &&
		(ALL_GATEWAY_EXEC_TOOL_NAMES as readonly string[]).includes(toolName)
	);
}

function isObjectRecord(value: unknown): value is Record<string, any> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function readGatewayExecInput(payload: Record<string, any>): Record<string, any> {
	if (isObjectRecord(payload.input)) {
		return payload.input;
	}
	if (isObjectRecord(payload.args)) {
		return payload.args;
	}
	return {};
}

export function buildGatewayExecPayload(
	toolName: string,
	params: {
		op: string;
		input?: Record<string, any>;
		dry_run?: boolean;
		idempotency_key?: string;
	}
): Record<string, any> {
	const payload: Record<string, any> = {
		op: params.op
	};
	const input = isObjectRecord(params.input) ? params.input : {};

	if (toolName === PRIMARY_GATEWAY_EXEC_TOOL_NAME) {
		payload.input = input;
	} else {
		payload.args = input;
	}

	if (typeof params.dry_run === 'boolean') {
		payload.dry_run = params.dry_run;
	}

	if (typeof params.idempotency_key === 'string' && params.idempotency_key.trim().length > 0) {
		payload.idempotency_key = params.idempotency_key;
	}

	return payload;
}
