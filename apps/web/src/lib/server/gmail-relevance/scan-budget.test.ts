// apps/web/src/lib/server/gmail-relevance/scan-budget.test.ts
import { describe, expect, it } from 'vitest';
import {
	EMAIL_RELEVANCE_SCAN_BUDGET_POLICY,
	EMAIL_RELEVANCE_SCAN_QUOTA_POLICY_VERSION,
	estimateEmailRelevanceGmailQuotaUnits,
	priceEmailRelevanceScanOperation,
	reserveEmailRelevanceScanBudget,
	settleEmailRelevanceScanBudget
} from './scan-budget';

describe('email relevance scan budget policy', () => {
	it('prices bounded list and metadata operations using the locked Gmail quota policy', () => {
		expect(estimateEmailRelevanceGmailQuotaUnits({ kind: 'list_page' })).toBe(5);
		expect(
			estimateEmailRelevanceGmailQuotaUnits({ kind: 'metadata_batch', message_count: 50 })
		).toBe(1_000);
		expect(
			estimateEmailRelevanceGmailQuotaUnits({ kind: 'metadata_batch', message_count: 51 })
		).toBeNull();
		expect(EMAIL_RELEVANCE_SCAN_BUDGET_POLICY.gmail_quota_units_per_connection).toBe(20_050);
	});

	it('prices real provider operations from the versioned allowlist', () => {
		expect(priceEmailRelevanceScanOperation({ operation_code: 'list_page' })).toEqual({
			operation_code: 'list_page',
			gmail_quota_units: 5,
			runtime_ms: 15_000,
			message_count: 0
		});
		expect(
			priceEmailRelevanceScanOperation({
				operation_code: 'metadata_batch',
				message_count: 50
			})
		).toEqual({
			operation_code: 'metadata_batch',
			gmail_quota_units: 1_000,
			runtime_ms: 60_000,
			message_count: 50
		});
		expect(
			priceEmailRelevanceScanOperation({
				operation_code: 'metadata_batch',
				message_count: 51
			})
		).toBeNull();
	});

	it('reserves before execution and stops before a ceiling would be exceeded', () => {
		const first = reserveEmailRelevanceScanBudget({
			resource_kind: 'gmail_quota',
			policy_version: EMAIL_RELEVANCE_SCAN_QUOTA_POLICY_VERSION,
			quantity: 1_000,
			accounting: { ceiling: 20_050, reserved: 0, used: 19_000 }
		});
		expect(first).toEqual({
			ok: true,
			accounting: { ceiling: 20_050, reserved: 1_000, used: 19_000 }
		});

		const denied = reserveEmailRelevanceScanBudget({
			resource_kind: 'gmail_quota',
			policy_version: EMAIL_RELEVANCE_SCAN_QUOTA_POLICY_VERSION,
			quantity: 51,
			accounting: first.ok ? first.accounting : { ceiling: 0, reserved: 0, used: 0 }
		});
		expect(denied).toEqual({ ok: false, code: 'budget_exceeded' });
	});

	it('settles actual use once while releasing the unused reservation', () => {
		const settled = settleEmailRelevanceScanBudget({
			resource_kind: 'gmail_quota',
			policy_version: EMAIL_RELEVANCE_SCAN_QUOTA_POLICY_VERSION,
			reserved_quantity: 1_000,
			actual_quantity: 940,
			accounting: { ceiling: 20_050, reserved: 1_000, used: 2_000 }
		});

		expect(settled).toEqual({
			ok: true,
			accounting: { ceiling: 20_050, reserved: 0, used: 2_940 }
		});
		expect(
			settleEmailRelevanceScanBudget({
				resource_kind: 'gmail_quota',
				policy_version: EMAIL_RELEVANCE_SCAN_QUOTA_POLICY_VERSION,
				reserved_quantity: 1_000,
				actual_quantity: 940,
				accounting: settled.ok ? settled.accounting : { ceiling: 0, reserved: 0, used: 0 }
			})
		).toEqual({ ok: false, code: 'settlement_exceeds_reservation' });
	});

	it('fails closed for unavailable policy/accounting and all content or model resources', () => {
		const accounting = { ceiling: 20_050, reserved: 0, used: 0 };
		expect(
			reserveEmailRelevanceScanBudget({
				resource_kind: 'gmail_quota',
				policy_version: 'unknown-policy',
				quantity: 5,
				accounting
			})
		).toEqual({ ok: false, code: 'policy_unavailable' });
		expect(
			reserveEmailRelevanceScanBudget({
				resource_kind: 'gmail_quota',
				policy_version: EMAIL_RELEVANCE_SCAN_QUOTA_POLICY_VERSION,
				quantity: 5,
				accounting: { ceiling: 20_050, reserved: -1, used: 0 }
			})
		).toEqual({ ok: false, code: 'accounting_unavailable' });

		for (const resourceKind of [
			'raw_content_bytes',
			'model_tokens',
			'model_cost_micros'
		] as const) {
			expect(
				reserveEmailRelevanceScanBudget({
					resource_kind: resourceKind,
					policy_version: EMAIL_RELEVANCE_SCAN_QUOTA_POLICY_VERSION,
					quantity: 1,
					accounting: { ceiling: 0, reserved: 0, used: 0 }
				})
			).toEqual({ ok: false, code: 'resource_disabled' });
			expect(
				settleEmailRelevanceScanBudget({
					resource_kind: resourceKind,
					policy_version: EMAIL_RELEVANCE_SCAN_QUOTA_POLICY_VERSION,
					reserved_quantity: 1,
					actual_quantity: 0,
					accounting: { ceiling: 1, reserved: 1, used: 0 }
				})
			).toEqual({ ok: false, code: 'resource_disabled' });
		}
	});
});
