// packages/shared-types/src/context-selection.test.ts
import { describe, expect, it } from 'vitest';
import { parseContextSelectionEventV1 } from './context-selection';

const base = {
	type: 'context_selection',
	version: 1,
	mode: 'on',
	visible: true,
	injected: true,
	status: 'selected',
	failure: null,
	client_turn_id: 'client-1',
	turn_run_id: 'run-1',
	project_id: 'project-1',
	items: [],
	counts: { full: 1, summary: 1, checked: 9 },
	elapsed_ms: 400
};
const chip = (over: Record<string, unknown>) => ({
	kind: 'document',
	id: 'doc-1',
	label: 'Worklist',
	tier: 'full',
	p: 0.8,
	pinned: false,
	sections: ['Group 1'],
	...over
});

describe('parseContextSelectionEventV1', () => {
	it('keeps what the model was handed: per-chip given, snapshot, notes and the injection receipt', () => {
		const sha256 = 'a'.repeat(64);
		const parsed = parseContextSelectionEventV1({
			...base,
			items: [
				chip({ given: 'card' }),
				chip({ id: 'task-1', kind: 'task', given: 'text', partial: true, sections: [] }),
				chip({ id: 'doc-2', tier: 'summary', given: 'line', sections: [] }),
				chip({ id: 'doc-3', given: 'text', carried: true })
			],
			counts: { full: 2, summary: 1, checked: 9, carried: 1 },
			scope: 'broad',
			snapshot: { chars: 2100, cleanup: true },
			notes: { changed: 1, not_loaded: 2 },
			injection: { chars: 5200, sha256 }
		})!;
		expect(parsed.items.map((item) => item.given)).toEqual(['card', 'text', 'line', 'text']);
		expect(parsed.items[1]!.partial).toBe(true);
		expect(parsed.items[3]!.carried).toBe(true);
		expect(parsed.counts).toEqual({ full: 2, summary: 1, checked: 9, carried: 1 });
		expect(parsed.scope).toBe('broad');
		expect(parsed.snapshot).toEqual({ chars: 2100 });
		expect(parsed.notes).toEqual({ changed: 1, not_loaded: 2 });
		expect(parsed.injection).toEqual({ chars: 5200, sha256 });
	});

	it('still parses rows stored before the additions, with nulls and no given', () => {
		const parsed = parseContextSelectionEventV1({ ...base, items: [chip({})] })!;
		expect(parsed.items[0]).not.toHaveProperty('given');
		expect(parsed.items[0]).not.toHaveProperty('partial');
		expect(parsed.counts.carried).toBe(0);
		expect(parsed.scope).toBeNull();
		expect(parsed.snapshot).toBeNull();
		expect(parsed.notes).toBeNull();
		expect(parsed.injection).toBeNull();
	});

	it('drops malformed additions instead of failing the event', () => {
		const parsed = parseContextSelectionEventV1({
			...base,
			items: [chip({ given: 'everything', partial: true })],
			scope: 'huge',
			snapshot: { chars: 0 },
			notes: { changed: 0, not_loaded: 0 },
			injection: { chars: 10, sha256: 'not-a-hash' }
		})!;
		expect(parsed.items[0]).not.toHaveProperty('given');
		// `partial` only means something for text.
		expect(parsed.items[0]).not.toHaveProperty('partial');
		expect(parsed.scope).toBeNull();
		expect(parsed.snapshot).toBeNull();
		expect(parsed.notes).toBeNull();
		expect(parsed.injection).toBeNull();
	});
});
