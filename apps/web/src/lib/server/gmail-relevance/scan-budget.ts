// apps/web/src/lib/server/gmail-relevance/scan-budget.ts

export const EMAIL_RELEVANCE_SCAN_QUOTA_POLICY_VERSION = 'email-relevance-gmail-quota-v1';

export const EMAIL_RELEVANCE_SCAN_BUDGET_POLICY = {
	version: EMAIL_RELEVANCE_SCAN_QUOTA_POLICY_VERSION,
	message_cap_per_connection: 1_000,
	metadata_batch_ceiling: 50,
	max_list_pages_per_connection: 10,
	gmail_units: {
		messages_list: 5,
		messages_get: 20
	},
	operation_runtime_ms: {
		list_page: 15_000,
		metadata_batch: 60_000
	},
	// Twenty bounded metadata steps at no more than sixty seconds each.
	runtime_ms_per_connection: 1_200_000,
	gmail_quota_units_per_connection: 20_050,
	raw_content_bytes_per_connection: 0,
	model_tokens_per_connection: 0,
	model_cost_micros_per_connection: 0
} as const;

export const EMAIL_RELEVANCE_SCAN_OPERATION_CODES = [
	'synthetic_step',
	'list_page',
	'metadata_batch'
] as const;

export type EmailRelevanceScanOperationCode = (typeof EMAIL_RELEVANCE_SCAN_OPERATION_CODES)[number];

export type EmailRelevanceScanOperationReservation = {
	operation_code: 'list_page' | 'metadata_batch';
	gmail_quota_units: number;
	runtime_ms: number;
	message_count: number;
};

export const EMAIL_RELEVANCE_SCAN_RESOURCE_KINDS = [
	'gmail_quota',
	'runtime_ms',
	'raw_content_bytes',
	'model_tokens',
	'model_cost_micros'
] as const;

export type EmailRelevanceScanResourceKind = (typeof EMAIL_RELEVANCE_SCAN_RESOURCE_KINDS)[number];

export type EmailRelevanceScanBudgetAccounting = {
	ceiling: number;
	reserved: number;
	used: number;
};

export type EmailRelevanceScanBudgetFailureCode =
	| 'policy_unavailable'
	| 'accounting_unavailable'
	| 'invalid_quantity'
	| 'resource_disabled'
	| 'budget_exceeded'
	| 'settlement_exceeds_reservation';

export type EmailRelevanceScanBudgetResult =
	| {
			ok: true;
			accounting: EmailRelevanceScanBudgetAccounting;
	  }
	| {
			ok: false;
			code: EmailRelevanceScanBudgetFailureCode;
	  };

const SLICE_2_ENABLED_RESOURCES = new Set<EmailRelevanceScanResourceKind>([
	'gmail_quota',
	'runtime_ms'
]);

function isNonNegativeSafeInteger(value: number): boolean {
	return Number.isSafeInteger(value) && value >= 0;
}

function hasValidAccounting(accounting: EmailRelevanceScanBudgetAccounting): boolean {
	return (
		isNonNegativeSafeInteger(accounting.ceiling) &&
		isNonNegativeSafeInteger(accounting.reserved) &&
		isNonNegativeSafeInteger(accounting.used) &&
		accounting.reserved + accounting.used <= accounting.ceiling
	);
}

function hasCurrentPolicy(policyVersion: string | null | undefined): boolean {
	return policyVersion === EMAIL_RELEVANCE_SCAN_QUOTA_POLICY_VERSION;
}

export function estimateEmailRelevanceGmailQuotaUnits(
	operation: { kind: 'list_page' } | { kind: 'metadata_batch'; message_count: number }
): number | null {
	if (operation.kind === 'list_page') {
		return EMAIL_RELEVANCE_SCAN_BUDGET_POLICY.gmail_units.messages_list;
	}

	if (
		!Number.isSafeInteger(operation.message_count) ||
		operation.message_count < 1 ||
		operation.message_count > EMAIL_RELEVANCE_SCAN_BUDGET_POLICY.metadata_batch_ceiling
	) {
		return null;
	}

	return operation.message_count * EMAIL_RELEVANCE_SCAN_BUDGET_POLICY.gmail_units.messages_get;
}

export function priceEmailRelevanceScanOperation(
	operation:
		| { operation_code: 'list_page' }
		| { operation_code: 'metadata_batch'; message_count: number }
): EmailRelevanceScanOperationReservation | null {
	if (operation.operation_code === 'list_page') {
		return {
			operation_code: 'list_page',
			gmail_quota_units: EMAIL_RELEVANCE_SCAN_BUDGET_POLICY.gmail_units.messages_list,
			runtime_ms: EMAIL_RELEVANCE_SCAN_BUDGET_POLICY.operation_runtime_ms.list_page,
			message_count: 0
		};
	}
	const gmailQuotaUnits = estimateEmailRelevanceGmailQuotaUnits({
		kind: 'metadata_batch',
		message_count: operation.message_count
	});
	if (gmailQuotaUnits === null) return null;
	return {
		operation_code: 'metadata_batch',
		gmail_quota_units: gmailQuotaUnits,
		runtime_ms: EMAIL_RELEVANCE_SCAN_BUDGET_POLICY.operation_runtime_ms.metadata_batch,
		message_count: operation.message_count
	};
}

export function reserveEmailRelevanceScanBudget(input: {
	resource_kind: EmailRelevanceScanResourceKind;
	policy_version: string | null | undefined;
	quantity: number;
	accounting: EmailRelevanceScanBudgetAccounting;
}): EmailRelevanceScanBudgetResult {
	if (!hasCurrentPolicy(input.policy_version)) {
		return { ok: false, code: 'policy_unavailable' };
	}
	if (!hasValidAccounting(input.accounting)) {
		return { ok: false, code: 'accounting_unavailable' };
	}
	if (!Number.isSafeInteger(input.quantity) || input.quantity <= 0) {
		return { ok: false, code: 'invalid_quantity' };
	}
	if (!SLICE_2_ENABLED_RESOURCES.has(input.resource_kind)) {
		return { ok: false, code: 'resource_disabled' };
	}

	const nextReserved = input.accounting.reserved + input.quantity;
	if (nextReserved + input.accounting.used > input.accounting.ceiling) {
		return { ok: false, code: 'budget_exceeded' };
	}

	return {
		ok: true,
		accounting: {
			...input.accounting,
			reserved: nextReserved
		}
	};
}

export function settleEmailRelevanceScanBudget(input: {
	resource_kind: EmailRelevanceScanResourceKind;
	policy_version: string | null | undefined;
	reserved_quantity: number;
	actual_quantity: number;
	accounting: EmailRelevanceScanBudgetAccounting;
}): EmailRelevanceScanBudgetResult {
	if (!hasCurrentPolicy(input.policy_version)) {
		return { ok: false, code: 'policy_unavailable' };
	}
	if (!hasValidAccounting(input.accounting)) {
		return { ok: false, code: 'accounting_unavailable' };
	}
	if (!SLICE_2_ENABLED_RESOURCES.has(input.resource_kind)) {
		return { ok: false, code: 'resource_disabled' };
	}
	if (
		!Number.isSafeInteger(input.reserved_quantity) ||
		input.reserved_quantity <= 0 ||
		!isNonNegativeSafeInteger(input.actual_quantity)
	) {
		return { ok: false, code: 'invalid_quantity' };
	}
	if (
		input.reserved_quantity > input.accounting.reserved ||
		input.actual_quantity > input.reserved_quantity
	) {
		return { ok: false, code: 'settlement_exceeds_reservation' };
	}

	const nextAccounting = {
		ceiling: input.accounting.ceiling,
		reserved: input.accounting.reserved - input.reserved_quantity,
		used: input.accounting.used + input.actual_quantity
	};

	if (!hasValidAccounting(nextAccounting)) {
		return { ok: false, code: 'accounting_unavailable' };
	}

	return { ok: true, accounting: nextAccounting };
}
