// apps/web/src/lib/services/admin/chat-session-metrics.ts
export type BillableTokenInputs = {
	usageTokenTotal?: number | null;
	sessionTokenTotal?: number | null;
	messageTokenTotal?: number | null;
};

const finiteNonNegative = (value: number | null | undefined): number => {
	if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 0;
	return value;
};

export const resolveBillableTokenTotal = ({
	usageTokenTotal,
	sessionTokenTotal,
	messageTokenTotal
}: BillableTokenInputs): number => {
	const usageTokens = finiteNonNegative(usageTokenTotal);
	if (usageTokens > 0) return usageTokens;

	const sessionTokens = finiteNonNegative(sessionTokenTotal);
	if (sessionTokens > 0) return sessionTokens;

	return finiteNonNegative(messageTokenTotal);
};
