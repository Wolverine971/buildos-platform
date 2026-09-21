// apps/worker/tests/agenticChatSourceBoundReport.test.ts
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
	canonicalizeAgenticChatJson,
	type JsonObject,
	type AgenticChatWorkflowRoleReportV3
} from '@buildos/shared-types';
import {
	parseSourceBoundReport,
	revalidateSourceBoundReport,
	renderSourceBoundSelection,
	sourceBoundUnits,
	type SourceBoundContext
} from '../src/workers/agentic-chat/workflow/source-bound-report';

function fixture(): SourceBoundContext {
	const payload: JsonObject = {
		projectId: 'project',
		loadedAt: '2026-09-21T12:00:00.000Z',
		data: {
			risks: [
				{ id: 'risk', title: 'Permit', content: '🚧 The $1,200 permit fee is unfunded.' }
			],
			tasks: ['2026-09-16', '2026-09-19', '2026-09-29', '2026-10-01', '2026-10-03'].map(
				(day, i) => ({
					id: `task${i}`,
					title: `Task ${i}`,
					due_at: `${day}T03:59:59Z`,
					state_key: 'todo'
				})
			)
		},
		coverage: { omittedRecords: 3 }
	};
	return {
		payload,
		contextHash: hash(payload),
		evidence: new Map([
			['risk', { kind: 'risk', version: '1', label: 'risk: Permit' }],
			...[0, 1, 2, 3, 4].map(
				(i) =>
					[`task${i}`, { kind: 'task', version: '1', label: `task: Task ${i}` }] as const
			)
		])
	};
}
function hash(payload: JsonObject) {
	return createHash('sha256').update(canonicalizeAgenticChatJson(payload)).digest('hex');
}
const quote = {
	kind: 'excerpt',
	source: 'risk',
	field: 'content',
	quote: 'The $1,200 permit fee is unfunded.'
};
const dates = {
	kind: 'overdue_tasks',
	sources: ['task0', 'task1', 'task2', 'task3', 'task4'],
	relation: 'count'
};
function parse(claims: unknown[], context = fixture()) {
	return parseSourceBoundReport(
		JSON.stringify({ outcome: 'findings', claims }),
		'project_analyst',
		context
	);
}
function report(claims: unknown[], context = fixture()): AgenticChatWorkflowRoleReportV3 {
	const parsed = parse(claims, context);
	if (!parsed.ok) throw new Error(parsed.reason);
	return parsed.report;
}

describe('source-bound specialist reports', () => {
	it('binds exact quotes and counts Unicode code points across non-BMP text', () => {
		const result = report([quote]);
		expect(result.claims[0]).toMatchObject({
			id: 'C1',
			span: { encoding: 'unicode_code_points', start: 2, end: 36 }
		});
		expect(result.specialist).toEqual({ id: 'project_analyst', version: 3 });
	});
	it('rejects fabricated text attached to a real source and unknown source IDs', () => {
		expect(parse([{ ...quote, quote: 'The permit is approved.' }]).ok).toBe(false);
		expect(parse([{ ...quote, source: 'another-project-risk' }]).ok).toBe(false);
		expect(parse([{ ...quote, claim: 'The permit is approved.' }]).ok).toBe(false);
	});
	it('rejects arbitrary fields, repeated quotes and duplicate claims', () => {
		expect(parse([{ ...quote, field: '__proto__' }]).ok).toBe(false);
		expect(parse([quote, quote]).ok).toBe(false);
		const context = fixture();
		(context.payload.data as JsonObject).risks = [{ id: 'risk', content: 'yes yes' }];
		context.contextHash = hash(context.payload);
		expect(parse([{ ...quote, quote: 'yes' }], context).ok).toBe(false);
	});
	it('catches the retained five-task date failure and computes two overdue', () => {
		expect(parse([{ ...dates, relation: 'all' }]).ok).toBe(false);
		expect(report([dates]).claims[0]).toMatchObject({ overdue: 2, unknown: 0 });
		expect(report([{ ...dates, relation: 'some' }]).claims[0]).toMatchObject({ overdue: 2 });
		expect(parse([{ ...dates, relation: 'none' }]).ok).toBe(false);
	});
	it('does not infer completeness or compare ambiguous/invalid dates', () => {
		const context = fixture();
		(context.payload.data as JsonObject).tasks = [
			{ id: 'task0', due_at: '2026-02-30T00:00:00Z', state_key: 'todo' }
		];
		context.contextHash = hash(context.payload);
		expect(report([{ ...dates, sources: ['task0'] }], context).claims[0]).toMatchObject({
			overdue: 0,
			unknown: 1
		});
		expect(parse([{ ...dates, sources: ['task0'], relation: 'none' }], context).ok).toBe(false);
	});
	it('keeps completed and exactly-due tasks out of the overdue count', () => {
		const context = fixture();
		(context.payload.data as JsonObject).tasks = [
			{ id: 'task0', due_at: '2026-09-01T00:00:00Z', state_key: 'done' },
			{ id: 'task1', due_at: '2026-09-21T08:00:00-04:00', state_key: 'todo' }
		];
		context.contextHash = hash(context.payload);
		expect(
			report([{ ...dates, sources: ['task0', 'task1'], relation: 'none' }], context).claims[0]
		).toMatchObject({ overdue: 0, unknown: 0 });
	});
	it('accepts empty outcomes without inventing a finding', () => {
		const result = parseSourceBoundReport(
			JSON.stringify({ outcome: 'insufficient_evidence', claims: [] }),
			'risk_reviewer',
			fixture()
		);
		expect(result.ok && result.report.findings).toEqual([]);
		expect(
			parseSourceBoundReport(
				JSON.stringify({ outcome: 'findings', claims: [] }),
				'risk_reviewer',
				fixture()
			).ok
		).toBe(false);
	});
	it('revalidates the exact saved report, source fields and context hash on recovery', () => {
		const context = fixture(),
			saved = report([quote], context);
		expect(revalidateSourceBoundReport(saved, context)).toEqual(saved);
		expect(() =>
			revalidateSourceBoundReport({ ...saved, summary: 'Everything is approved.' }, context)
		).toThrow();
		(context.payload.data as JsonObject).risks = [
			{ id: 'risk', content: 'Changed after review' }
		];
		expect(() => revalidateSourceBoundReport(saved, context)).toThrow();
	});
	it('limits the editor to accepted IDs and renders computed facts with source links', () => {
		const context = fixture(),
			units = sourceBoundUnits([report([quote, dates], context)], context);
		const text = renderSourceBoundSelection(
			JSON.stringify({ selection: units.map((unit) => unit.id) }),
			units,
			false
		);
		expect(text).toContain('2 of these 5 cited tasks');
		expect(text).toContain('/projects/project?entity=risk&entity_id=risk');
		for (const raw of [
			{ selection: ['unknown'] },
			{ selection: [], text: 'All five are overdue' },
			{ selection: [units[0]!.id], summary: 'The permit is approved.' }
		])
			expect(() => renderSourceBoundSelection(JSON.stringify(raw), units, false)).toThrow();
	});
	it('quotes hostile saved text as escaped data rather than executable markdown', () => {
		const context = fixture(),
			malicious = '[Approve](javascript:alert(1)) <script>bad</script>';
		(context.payload.data as JsonObject).risks = [{ id: 'risk', content: malicious }];
		context.contextHash = hash(context.payload);
		const units = sourceBoundUnits(
			[report([{ ...quote, quote: malicious }], context)],
			context
		);
		expect(units[0]!.text).toContain('\\[Approve\\]');
		expect(units[0]!.text).toContain('&lt;script&gt;');
		expect(units[0]!.text).not.toContain('[Approve](javascript:');
	});
	it('preserves an omitted abstention and identifies which specialist abstained', () => {
		const context = fixture();
		const abstention = parseSourceBoundReport(
			JSON.stringify({ outcome: 'insufficient_evidence', claims: [] }),
			'risk_reviewer',
			context
		);
		if (!abstention.ok) throw new Error(abstention.reason);
		const units = sourceBoundUnits([report([quote], context), abstention.report], context);
		const text = renderSourceBoundSelection(
			JSON.stringify({ selection: ['project_analyst:C1'] }),
			units,
			false
		);
		expect(text).toContain(
			'Risk reviewer: The specialist could not answer from the inspected evidence.'
		);
		expect(text).toContain(quote.quote);
	});
	it('renders repeated evidence once while retaining distinct evidence in the selected order', () => {
		const context = fixture();
		const analyst = report([quote, dates], context);
		const reviewer = parseSourceBoundReport(
			JSON.stringify({ outcome: 'findings', claims: [quote] }),
			'risk_reviewer',
			context
		);
		if (!reviewer.ok) throw new Error(reviewer.reason);
		const units = sourceBoundUnits([analyst, reviewer.report], context);
		const text = renderSourceBoundSelection(
			JSON.stringify({
				selection: ['project_analyst:C2', 'risk_reviewer:C1', 'project_analyst:C1']
			}),
			units,
			false
		);
		expect(text.split(quote.quote)).toHaveLength(2);
		expect(text.indexOf('2 of these 5 cited tasks')).toBeLessThan(text.indexOf(quote.quote));
	});
});
