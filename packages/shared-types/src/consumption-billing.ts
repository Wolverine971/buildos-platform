// packages/shared-types/src/consumption-billing.ts
/** Product limits shared by web admission and asynchronous worker finalization. */
export const CONSUMPTION_BILLING_LIMITS = Object.freeze({
	FREE_PROJECT_LIMIT: 5,
	FREE_CREDIT_LIMIT: 400,
	PRO_INCLUDED_CREDITS: 2000,
	POWER_INCLUDED_CREDITS: 7500
} as const);
