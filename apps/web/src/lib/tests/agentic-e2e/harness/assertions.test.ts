// apps/web/src/lib/tests/agentic-e2e/harness/assertions.test.ts
import { describe, expect, it } from 'vitest';
import {
	assertIsoDate,
	assertMarkdownSectionBullets,
	assertExactVisiblyLabeledOptions,
	assertMinimumDistinctOptions,
	assertNarratedBeforeActing,
	assertNoMutations,
	assertNonEmptyAssistantText,
	assertNumericPriorityAtMost,
	assertRowsUnchanged,
	extractMarkdownSection,
	mutatingToolCalls,
	nextWeekdayDate,
	normalizeComparableText,
	rowFingerprint
} from './assertions';
import type { TurnResult } from './types';

describe('scenario assertion helpers', () => {
	it('counts em-dash option labels exactly', () => {
		const text = '**Option 1 — Hold price**\nDetails\n\n**Option 2 — Raise price**\nDetails';

		const turn = { assistantText: text } as TurnResult;
		expect(() => assertExactVisiblyLabeledOptions(turn, 2)).not.toThrow();
		expect(() => assertExactVisiblyLabeledOptions(turn, 3)).toThrow('expected exactly 3');
	});

	it('computes this Friday without rolling an existing Friday forward', () => {
		expect(nextWeekdayDate(new Date(2026, 6, 12, 9), 5)).toBe('2026-07-17');
		expect(nextWeekdayDate(new Date(2026, 6, 17, 9), 5)).toBe('2026-07-17');
		expect(nextWeekdayDate(new Date('2026-07-18T02:00:00.000Z'), 5)).toBe('2026-07-17');
	});

	it('requires the exact persisted ISO date', () => {
		expect(() => assertIsoDate('2026-07-17T17:00:00.000Z', '2026-07-17', 'task')).not.toThrow();
		expect(() => assertIsoDate('2026-07-18T02:00:00.000Z', '2026-07-17', 'task')).not.toThrow();
		expect(() => assertIsoDate('2026-07-18T12:00:00.000Z', '2026-07-17', 'task')).toThrow(
			'expected 2026-07-17'
		);
	});

	it('treats lower numeric values as higher task priority', () => {
		expect(() => assertNumericPriorityAtMost(1, 2, 'task')).not.toThrow();
		expect(() => assertNumericPriorityAtMost(3, 2, 'task')).toThrow('expected 2');
	});

	it('extracts markdown and bold sections and enforces bullet counts', () => {
		const content = `## Pre-flight\n- One\n- Two\n\n**Launch Day**\n- Three\n- Four`;
		expect(assertMarkdownSectionBullets(content, 'Pre-flight', 2, 3)).toContain('- One');
		expect(extractMarkdownSection(content, 'Launch Day')).toContain('- Three');
		expect(() => assertMarkdownSectionBullets(content, 'Rollback', 2, 3)).toThrow('missing');
	});

	it('normalizes text for preservation comparisons', () => {
		expect(normalizeComparableText(' A\n  B ')).toBe('a b');
	});
});

// A restraint assertion that never fires would pass every scenario silently, so
// the instrument itself is tested. These are free — no server, no model.
describe('restraint assertion helpers', () => {
	function turn(overrides: Partial<TurnResult> = {}): TurnResult {
		return {
			sessionId: 's',
			streamRunId: 'r',
			clientTurnId: 'c',
			lastTurnContext: null,
			assistantText: '',
			toolCalls: [],
			toolResults: [],
			skillActivity: [],
			errors: [],
			finishedReason: 'stop',
			usage: null,
			completed: true,
			rawEvents: [],
			timing: {
				requestStartedAt: '',
				responseHeadersMs: null,
				firstSseEventMs: null,
				ttftMs: null,
				terminalEventMs: null,
				totalDurationMs: null
			},
			...overrides
		};
	}

	function call(name: string) {
		return { id: name, type: 'function', function: { name, arguments: '{}' } } as never;
	}

	it('classifies ontology writes as mutations and reads as not', () => {
		const t = turn({
			toolCalls: [
				call('search_onto_tasks'),
				call('update_onto_task'),
				call('get_onto_project')
			]
		});
		expect(mutatingToolCalls(t)).toEqual(['update_onto_task']);
		expect(() => assertNoMutations(t, 'test')).toThrow('update_onto_task');
		expect(() =>
			assertNoMutations(turn({ toolCalls: [call('search_onto_tasks')] }), 'test')
		).not.toThrow();
	});

	it('flags an empty final response after tool work', () => {
		expect(() => assertNonEmptyAssistantText(turn({ toolCalls: [call('x')] }))).toThrow(
			'budget-exhaustion'
		);
		expect(() =>
			assertNonEmptyAssistantText(turn({ assistantText: 'x'.repeat(40) }))
		).not.toThrow();
	});

	it('requires text before the first tool call', () => {
		const narrated = turn({
			rawEvents: [
				{ type: 'text', content: 'Let me look that up.' },
				{ type: 'tool_call' },
				{ type: 'done' }
			]
		});
		const silent = turn({
			rawEvents: [{ type: 'tool_call' }, { type: 'text', content: 'Here you go.' }]
		});
		expect(() => assertNarratedBeforeActing(narrated)).not.toThrow();
		expect(() => assertNarratedBeforeActing(silent)).toThrow('acted before saying anything');
		// Whitespace-only text does not count as narration.
		expect(() =>
			assertNarratedBeforeActing(
				turn({ rawEvents: [{ type: 'text', content: '  ' }, { type: 'tool_call' }] })
			)
		).toThrow('acted before saying anything');
	});

	it('recognizes numbered, option-heading, and bulleted alternatives', () => {
		expect(() =>
			assertMinimumDistinctOptions(
				turn({ assistantText: '1. Confess\n2. Deflect\n3. Investigate' })
			)
		).not.toThrow();
		expect(() =>
			assertMinimumDistinctOptions(
				turn({
					assistantText:
						'### Option One: Confess\n### Option Two: Deflect\n### Option Three: Investigate'
				})
			)
		).not.toThrow();
		expect(() =>
			assertMinimumDistinctOptions(turn({ assistantText: '- Confess\n- Deflect' }))
		).toThrow('expected at least 3');
	});

	it('detects row changes regardless of ordering', () => {
		const a = [
			{ id: '2', updated_at: 't2', state_key: 'todo' },
			{ id: '1', updated_at: 't1', state_key: 'todo' }
		];
		const reordered = [...a].reverse();
		expect(rowFingerprint(a)).toBe(rowFingerprint(reordered));
		const mutated = [{ ...a[0]!, state_key: 'done' }, a[1]!];
		expect(() =>
			assertRowsUnchanged(rowFingerprint(a), rowFingerprint(mutated), 'tasks')
		).toThrow('changed during a turn');
	});
});
