// apps/worker/tests/agenticChatWorkflowRoleReport.test.ts
import { describe, expect, it } from 'vitest';
import type { MasterPromptContext } from '@buildos/agentic-chat-runtime/context';
import { AGENTIC_CHAT_ACTING_MAX_TOKENS } from '../src/workers/agentic-chat/provider/openrouter-client';
import {
	CHAT_WORKFLOW_DISPATCH_POLICY,
	buildSpecialistReportInstructions,
	buildWorkflowEvidenceIndex,
	parseWorkflowRoleReport,
	renderWorkflowRoleReport,
	workflowReportForEditor
} from '../src/workers/agentic-chat/workflow/role-report';

const context: MasterPromptContext = {
	contextType: 'project',
	contextLoadSource: 'rpc',
	data: {
		project: { id: 'project-1', name: 'Workshop launch' },
		tasks: [
			{
				id: 'task-1',
				title: 'Book venue',
				subtasks: [{ id: 'task-2', title: 'Confirm capacity' }]
			}
		],
		documents: [{ id: 'doc-1', title: 'x'.repeat(200) }],
		context_meta: { id: 'meta-1' }
	}
};
const evidence = buildWorkflowEvidenceIndex(context);

const valid = {
	summary: 'The venue decision gates the launch.',
	findings: [
		{ claim: 'The venue is not booked.', basis: 'recorded', evidence: ['task-1'] },
		{ claim: 'Capacity may constrain attendance.', basis: 'inferred', evidence: ['task-2'] }
	],
	risks: [{ risk: 'A late booking may lose the date.', evidence: ['task-1'] }],
	unknowns: ['The budget ceiling'],
	recommendation: 'Confirm capacity, then book the venue this week.'
};
const parse = (value: unknown) =>
	parseWorkflowRoleReport(
		typeof value === 'string' ? value : JSON.stringify(value),
		'risk_reviewer',
		evidence
	);

describe('workflow role report contract', () => {
	it('indexes only supplied evidence records with bounded readable labels', () => {
		expect(evidence.get('project-1')).toBe('project: Workshop launch');
		expect(evidence.get('task-1')).toBe('task: Book venue');
		expect(evidence.get('task-2')).toBe('record: Confirm capacity');
		expect(evidence.get('doc-1')).toMatch(/^document: x{79}…$/);
		expect(evidence.has('meta-1')).toBe(false);
	});

	it('accepts a complete bounded report, including a fenced response', () => {
		const result = parse(`\`\`\`json\n${JSON.stringify(valid)}\n\`\`\``);
		expect(result).toMatchObject({
			ok: true,
			report: {
				version: 'chat_workflow_role_report_v1',
				role: 'risk_reviewer',
				findings: [
					{ basis: 'recorded', evidence: [{ id: 'task-1', label: 'task: Book venue' }] },
					{
						basis: 'inferred',
						evidence: [{ id: 'task-2', label: 'record: Confirm capacity' }]
					}
				],
				unsupportedReferences: 0,
				unsupportedFindings: 0
			}
		});
	});

	it('removes unsupported references and findings but keeps supported findings', () => {
		const result = parse({
			...valid,
			findings: [
				{ claim: 'Supported.', basis: 'recorded', evidence: ['task-1', 'ghost', 'task-1'] },
				{ claim: 'Invented.', basis: 'inferred', evidence: ['ghost-2'] }
			]
		});
		if (!result.ok) throw new Error(result.reason);
		expect(result.report.findings).toEqual([
			{
				claim: 'Supported.',
				basis: 'recorded',
				evidence: [{ id: 'task-1', label: 'task: Book venue' }]
			}
		]);
		expect(result.report).toMatchObject({ unsupportedReferences: 2, unsupportedFindings: 1 });
		expect(renderWorkflowRoleReport(result.report, 1)).toContain(
			'Note: 1 finding without supplied evidence removed; 2 unsupported references removed.'
		);
	});

	it.each([
		['plain prose', 'Here is my review.', 'the report was not valid JSON'],
		['an array', [valid], 'the report was not a JSON object'],
		['no findings', { ...valid, findings: [] }, 'findings must list 1-5 items'],
		[
			'too many findings',
			{ ...valid, findings: Array(6).fill(valid.findings[0]) },
			'findings must list 1-5 items'
		],
		[
			'an overlong claim',
			{ ...valid, findings: [{ ...valid.findings[0], claim: 'x'.repeat(321) }] },
			'each finding claim must be 1-320 characters'
		],
		[
			'an unknown basis',
			{ ...valid, findings: [{ ...valid.findings[0], basis: 'guess' }] },
			'each finding basis must be "recorded" or "inferred"'
		],
		[
			'too many references',
			{ ...valid, findings: [{ ...valid.findings[0], evidence: Array(5).fill('task-1') }] },
			'each finding may cite at most 4 record ids'
		],
		[
			'only unsupported evidence',
			{ ...valid, findings: [{ ...valid.findings[0], evidence: ['ghost'] }] },
			'no finding cited a supplied project record'
		],
		[
			'too many risks',
			{ ...valid, risks: Array(5).fill(valid.risks[0]) },
			'risks must list at most 4 items'
		],
		[
			'a non-text unknown',
			{ ...valid, unknowns: [42] },
			'each unknown must be 1-240 characters'
		],
		[
			'a missing recommendation',
			{ ...valid, recommendation: '' },
			'recommendation must be 1-480 characters'
		]
	])('rejects %s with a truthful reason', (_label, value, reason) => {
		expect(parse(value)).toEqual({ ok: false, reason });
	});

	it('keeps every role inside the acting client cap and the dispatch contract', () => {
		const policy = CHAT_WORKFLOW_DISPATCH_POLICY;
		for (const role of [policy.planner, policy.specialist, policy.editor])
			expect(role.maxOutputTokens).toBeLessThanOrEqual(AGENTIC_CHAT_ACTING_MAX_TOKENS);
		expect(policy.maxProviderCalls).toBe(
			policy.planner.attempts + 2 * policy.specialist.attempts + policy.editor.attempts
		);
	});

	it('asks for a smaller report on the compact retry with the validator reason', () => {
		const first = buildSpecialistReportInstructions('Find risks.');
		const retry = buildSpecialistReportInstructions('Find risks.', {
			reason: 'no finding cited a supplied project record'
		});
		expect(first).toContain('findings: 1-5 items');
		expect(first).not.toContain('previous report');
		expect(retry).toContain('findings: 1-3 items');
		expect(retry).toContain('risks: at most 2; unknowns: at most 2');
		expect(retry).toContain(
			'Your previous report was not accepted: no finding cited a supplied project record.'
		);
	});

	it('projects accepted reports for the editor with record names beside ids', () => {
		const result = parse(valid);
		if (!result.ok) throw new Error(result.reason);
		expect(workflowReportForEditor(result.report)).toMatchObject({
			role: 'risk_reviewer',
			findings: [
				{ evidence: ['task: Book venue (task-1)'] },
				{ evidence: ['record: Confirm capacity (task-2)'] }
			],
			risks: [{ evidence: ['task: Book venue (task-1)'] }]
		});
		expect(renderWorkflowRoleReport(result.report, 2)).toContain(
			'Note: accepted after one compact retry.'
		);
	});
});
