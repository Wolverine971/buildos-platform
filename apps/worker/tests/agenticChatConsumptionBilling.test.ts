// apps/worker/tests/agenticChatConsumptionBilling.test.ts
import { CONSUMPTION_BILLING_LIMITS } from '@buildos/shared-types';
import { describe, expect, it, vi } from 'vitest';
import {
	SupabaseAgenticChatConsumptionBillingAdapter,
	type AgenticChatConsumptionBillingRpcClient
} from '../src/workers/agentic-chat/consumptionBilling';

const USER_ID = '10000000-0000-4000-8000-000000000001';

function row(overrides: Record<string, unknown> = {}) {
	return {
		user_id: USER_ID,
		billing_state: 'upgrade_required_frozen',
		billing_tier: 'explorer',
		is_frozen: true,
		project_count: 6,
		lifetime_credits_used: 401,
		trigger_reason: 'projects_or_credits',
		...overrides
	};
}

describe('SupabaseAgenticChatConsumptionBillingAdapter', () => {
	it('calls the shared gate with shared product limits and validates its result', async () => {
		const rpc = vi.fn(async () => ({ data: [row()], error: null }));
		const adapter = new SupabaseAgenticChatConsumptionBillingAdapter({
			rpc
		} as AgenticChatConsumptionBillingRpcClient);

		await expect(adapter.evaluate(USER_ID)).resolves.toEqual({
			userId: USER_ID,
			billingState: 'upgrade_required_frozen',
			billingTier: 'explorer',
			isFrozen: true,
			projectCount: 6,
			lifetimeCreditsUsed: 401,
			triggerReason: 'projects_or_credits'
		});
		expect(rpc).toHaveBeenCalledWith('evaluate_user_consumption_gate', {
			p_user_id: USER_ID,
			p_project_limit: CONSUMPTION_BILLING_LIMITS.FREE_PROJECT_LIMIT,
			p_credit_limit: CONSUMPTION_BILLING_LIMITS.FREE_CREDIT_LIMIT
		});
	});

	it('accepts an unfrozen result with no trigger reason', async () => {
		const adapter = new SupabaseAgenticChatConsumptionBillingAdapter({
			rpc: vi.fn(async () => ({
				data: [
					row({
						billing_state: 'pro_active',
						billing_tier: 'pro',
						is_frozen: false,
						trigger_reason: null
					})
				],
				error: null
			}))
		});

		await expect(adapter.evaluate(USER_ID)).resolves.toMatchObject({
			isFrozen: false,
			triggerReason: null
		});
	});

	it('rejects database errors, ambiguous rows, and cross-user responses', async () => {
		const databaseFailure = new SupabaseAgenticChatConsumptionBillingAdapter({
			rpc: vi.fn(async () => ({ data: null, error: { message: 'gate unavailable' } }))
		});
		await expect(databaseFailure.evaluate(USER_ID)).rejects.toThrow('gate unavailable');

		const ambiguous = new SupabaseAgenticChatConsumptionBillingAdapter({
			rpc: vi.fn(async () => ({ data: [row(), row()], error: null }))
		});
		await expect(ambiguous.evaluate(USER_ID)).rejects.toThrow('invalid row set');

		const crossUser = new SupabaseAgenticChatConsumptionBillingAdapter({
			rpc: vi.fn(async () => ({
				data: [row({ user_id: '10000000-0000-4000-8000-000000000002' })],
				error: null
			}))
		});
		await expect(crossUser.evaluate(USER_ID)).rejects.toThrow('another user');
	});

	it('rejects malformed identity and result fields', async () => {
		const rpc = vi.fn(async () => ({
			data: [row({ lifetime_credits_used: -1 })],
			error: null
		}));
		const adapter = new SupabaseAgenticChatConsumptionBillingAdapter({ rpc });

		await expect(adapter.evaluate('not-a-user')).rejects.toThrow('canonical user UUID');
		expect(rpc).not.toHaveBeenCalled();
		await expect(adapter.evaluate(USER_ID)).rejects.toThrow('lifetime credits used');
	});
});
