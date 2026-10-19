// packages/shared-agent-ops/src/gateway/op-execution-gateway.create-idempotency.ts
import { createHash } from 'node:crypto';
import type { ToolExecutionContext } from './op-execution-gateway.types';

// Fixed UUIDv5 namespace. Identity is bound to the user, entity table and stable
// operation key; project changes on a replay must conflict, not mint a new row.
const CREATE_NAMESPACE = Buffer.from('fb00fc0aee925ed5a772c7db10af41a4', 'hex');
export type GatewayCreateTable =
	| 'onto_documents'
	| 'onto_goals'
	| 'onto_plans'
	| 'onto_milestones'
	| 'onto_risks';

export function gatewayCreateId(
	userId: string,
	table: GatewayCreateTable,
	downstreamIdempotencyKey: string
): string {
	const bytes = createHash('sha1')
		.update(CREATE_NAMESPACE)
		.update(JSON.stringify([userId, table, downstreamIdempotencyKey]))
		.digest();
	bytes[6] = (bytes[6]! & 0x0f) | 0x50;
	bytes[8] = (bytes[8]! & 0x3f) | 0x80;
	const hex = bytes.subarray(0, 16).toString('hex');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** The row's primary key is the durable receipt even when telemetry is lost. */
export async function insertGatewayEntity(
	context: ToolExecutionContext,
	table: GatewayCreateTable,
	payload: Record<string, unknown>,
	select: string
): Promise<{
	data: Record<string, any> | null;
	error: { message: string; code?: string } | null;
	replayed: boolean;
}> {
	const id = context.downstreamIdempotencyKey
		? gatewayCreateId(context.userId, table, context.downstreamIdempotencyKey)
		: undefined;
	const result = await context.admin
		.from(table)
		.insert({ ...payload, ...(id ? { id } : {}) } as never)
		.select(select)
		.single();
	if (!id || result.error?.code !== '23505') {
		return {
			data: result.data as Record<string, any> | null,
			error: result.error,
			replayed: false
		};
	}
	// Never upsert: a retry must preserve edits made after the original insert.
	const replay = await context.admin
		.from(table)
		.select(select)
		.eq('id', id)
		.eq('project_id', String(payload.project_id))
		.eq('created_by', String(payload.created_by))
		.maybeSingle();
	return {
		data: replay.data as Record<string, any> | null,
		error: replay.error ?? (replay.data ? null : result.error),
		replayed: Boolean(replay.data) && !replay.error
	};
}
