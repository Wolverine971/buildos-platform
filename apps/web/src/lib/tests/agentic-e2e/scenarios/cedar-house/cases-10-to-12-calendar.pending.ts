// apps/web/src/lib/tests/agentic-e2e/scenarios/cedar-house/cases-10-to-12-calendar.pending.ts
// Cases 10 and 11 now run in the gate. External writes (case 12) remain ungraded.

export interface PendingBatteryCase {
	batteryCase: number;
	title: string;
	/** Verbatim prompt from artifacts/agentic-chat-postdeploy-a1771c1f7-runs.json. */
	prompt: string;
	auditScore: string;
	passCondition: string;
}

export const CEDAR_HOUSE_PENDING_CALENDAR_CASES: readonly PendingBatteryCase[] = [
	{
		batteryCase: 12,
		title: 'Create and verify a concrete calendar test block',
		prompt: '(not exercised in the audit; define with DJ before building)',
		auditScore: '— ungraded; excluded from the audit denominator',
		passCondition:
			'a single named test event is created, verified by an independent read, and removable'
	}
];
