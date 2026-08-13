// apps/worker/src/workers/agentic-chat/consumptionBilling.ts
import { CONSUMPTION_BILLING_LIMITS } from '@buildos/shared-types';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export type AgenticChatConsumptionBillingEvaluationV1 = {
	userId: string;
	billingState: string;
	billingTier: string;
	isFrozen: boolean;
	projectCount: number;
	lifetimeCreditsUsed: number;
	triggerReason: string | null;
};

export type AgenticChatConsumptionBillingPortV1 = {
	evaluate(userId: string): Promise<AgenticChatConsumptionBillingEvaluationV1>;
};

export type AgenticChatConsumptionBillingRpcClient = {
	rpc(
		functionName: 'evaluate_user_consumption_gate',
		args: {
			p_user_id: string;
			p_project_limit: number;
			p_credit_limit: number;
		}
	): PromiseLike<{ data: unknown; error: unknown }>;
};

/**
 * Re-evaluate the same database-owned gate used by synchronous web admission.
 * The executor bounds this call and treats failures as observable but
 * non-terminal so billing telemetry cannot strand completed user work.
 */
export class SupabaseAgenticChatConsumptionBillingAdapter
	implements AgenticChatConsumptionBillingPortV1
{
	constructor(private readonly client: AgenticChatConsumptionBillingRpcClient) {}

	async evaluate(userId: string): Promise<AgenticChatConsumptionBillingEvaluationV1> {
		if (!UUID_PATTERN.test(userId)) {
			throw new Error('Agentic Chat consumption billing requires a canonical user UUID');
		}
		const { data, error } = await this.client.rpc('evaluate_user_consumption_gate', {
			p_user_id: userId,
			p_project_limit: CONSUMPTION_BILLING_LIMITS.FREE_PROJECT_LIMIT,
			p_credit_limit: CONSUMPTION_BILLING_LIMITS.FREE_CREDIT_LIMIT
		});
		if (error) {
			throw new Error(
				`Agentic Chat consumption billing evaluation failed: ${rpcError(error)}`
			);
		}
		if (!Array.isArray(data) || data.length !== 1) {
			throw new Error(
				'Agentic Chat consumption billing evaluation returned an invalid row set'
			);
		}

		const row = record(data[0]);
		if (row.user_id !== userId) {
			throw new Error('Agentic Chat consumption billing evaluation returned another user');
		}
		return {
			userId,
			billingState: canonicalText(row.billing_state, 'billing state'),
			billingTier: canonicalText(row.billing_tier, 'billing tier'),
			isFrozen: booleanValue(row.is_frozen, 'frozen state'),
			projectCount: nonnegativeInteger(row.project_count, 'project count'),
			lifetimeCreditsUsed: nonnegativeInteger(
				row.lifetime_credits_used,
				'lifetime credits used'
			),
			triggerReason:
				row.trigger_reason === null
					? null
					: canonicalText(row.trigger_reason, 'trigger reason')
		};
	}
}

function record(value: unknown): Record<string, unknown> {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error('Agentic Chat consumption billing evaluation returned an invalid row');
	}
	return value as Record<string, unknown>;
}

function canonicalText(value: unknown, label: string): string {
	if (
		typeof value !== 'string' ||
		!value ||
		value !== value.trim() ||
		value.length > 128 ||
		/[\r\n]/.test(value)
	) {
		throw new Error(`Agentic Chat consumption billing returned an invalid ${label}`);
	}
	return value;
}

function booleanValue(value: unknown, label: string): boolean {
	if (typeof value !== 'boolean') {
		throw new Error(`Agentic Chat consumption billing returned an invalid ${label}`);
	}
	return value;
}

function nonnegativeInteger(value: unknown, label: string): number {
	if (!Number.isSafeInteger(value) || Number(value) < 0) {
		throw new Error(`Agentic Chat consumption billing returned an invalid ${label}`);
	}
	return Number(value);
}

function rpcError(error: unknown): string {
	if (error && typeof error === 'object' && 'message' in error) {
		return String((error as { message?: unknown }).message ?? 'database error').slice(0, 1_000);
	}
	return String(error ?? 'database error').slice(0, 1_000);
}
