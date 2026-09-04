// apps/web/src/lib/tests/agentic-e2e/scenarios/cedar-house/cases-10-to-12-calendar.pending.ts
//
// NOT BUILT YET — Cedar House cases 10, 11 and 12 join the battery at stage S4.
//
// These three are the calendar arm of the 2026-09-03 audit. They are deliberately
// absent from `catalog.ts`: a calendar case that cannot read a real connected
// calendar scores the transport, not the agent, and would silently drag the
// battery grade around for reasons unrelated to a deploy.
//
// When they land, model them on `../calendar-move.scenario.ts` — it already
// carries the connected-calendar `skip()` guard and the event-scoped teardown
// this arm needs — and register them in `../catalog.ts` alongside the other
// Cedar House cases, keeping `batteryCase` 10, 11 and 12.
//
// Denominator note: the scorecard's max score is derived from the number of
// REGISTERED cases, so adding these three moves it from 44 to 56 automatically.
// Runs either side of that change are not directly comparable on total score;
// compare per-case scores instead.

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
		batteryCase: 10,
		title: 'Find real calendar availability',
		prompt:
			'Calendar test: read my connected calendar for September 4, 2026, 9:00 AM–5:00 PM ' +
			'America/New_York. Propose three non-overlapping 30-minute slots for a synthetic Cedar ' +
			'House planning session, with at least 15 minutes between each proposal and any existing ' +
			'busy event. Consider all-day busy events. Do not create, update, cancel, or invite ' +
			'anyone. State which calendars you could actually check and distinguish verified ' +
			'availability from assumptions. You may keep existing event titles private; busy ' +
			'intervals are enough.',
		auditScore: '2/4 — both connected Google sources failed to read; it honestly withheld',
		passCondition:
			'real calendar reads succeed, per-source coverage is stated, no invented free time, no writes'
	},
	{
		batteryCase: 11,
		title: 'Validate repeated and nonexistent local times',
		prompt:
			'Validate these calendar drafts only; do not save anything: A) Cedar House test block on ' +
			'November 1, 2026 at 1:30 AM America/New_York for 30 minutes. B) Another test block on ' +
			'March 14, 2027 at 2:30 AM America/New_York for 30 minutes. Are these local times ' +
			'unambiguous and valid? State the clarification or correction needed before scheduling, ' +
			'and show UTC equivalents only where the instant is determined.',
		auditScore: '4/4 — both DST edges handled correctly, no calendar writes',
		passCondition:
			'flags the repeated hour as ambiguous and the nonexistent hour as invalid; asserts no single instant for either; writes nothing'
	},
	{
		batteryCase: 12,
		title: 'Create and verify a concrete calendar test block',
		prompt: '(not exercised in the audit; define with DJ before building)',
		auditScore: '— ungraded; excluded from the audit denominator',
		passCondition:
			'a single named test event is created, verified by an independent read, and removable'
	}
];
