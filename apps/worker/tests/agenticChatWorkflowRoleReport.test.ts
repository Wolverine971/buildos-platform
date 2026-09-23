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
			'more than twice the findings',
			{ ...valid, findings: Array(11).fill(valid.findings[0]) },
			'findings must list 1-5 items'
		],
		[
			'a claim more than twice its bound',
			{ ...valid, findings: [{ ...valid.findings[0], claim: 'x'.repeat(641) }] },
			'each finding claim must be 1-320 characters'
		],
		[
			'an unknown basis',
			{ ...valid, findings: [{ ...valid.findings[0], basis: 'guess' }] },
			'each finding basis must be "recorded" or "inferred"'
		],
		[
			'more than twice the references',
			{ ...valid, findings: [{ ...valid.findings[0], evidence: Array(9).fill('task-1') }] },
			'each finding may cite at most 4 record ids'
		],
		[
			'only unsupported evidence',
			{ ...valid, findings: [{ ...valid.findings[0], evidence: ['ghost'] }] },
			'no finding cited a supplied project record'
		],
		[
			'more than twice the risks',
			{ ...valid, risks: Array(9).fill(valid.risks[0]) },
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

	it('fits a report that runs modestly past its bounds instead of discarding it', () => {
		// Shapes V4.1 Flash wrote in the Tasker 98 pilot: a 573-character recommendation, a
		// finding citing more than four records, one list item too many.
		const recommendation = `${'Send the staged outreach first. '.repeat(18)}Then review.`;
		const result = parse({
			...valid,
			recommendation,
			findings: [
				{ ...valid.findings[0], claim: `${'word '.repeat(90)}end` },
				...Array(5).fill({
					...valid.findings[0],
					evidence: ['task-1', 'ghost', 'task-2', 'task-1', 'task-2', 'task-1', 'task-2']
				})
			],
			risks: Array(5).fill(valid.risks[0]),
			unknowns: Array(5).fill('Budget ceiling')
		});
		if (!result.ok) throw new Error(result.reason);
		const { report } = result;
		expect(recommendation.length).toBeGreaterThan(480);
		expect([...report.recommendation].length).toBeLessThanOrEqual(480);
		expect(report.recommendation.endsWith('…')).toBe(true);
		expect(report.recommendation.startsWith('Send the staged outreach first.')).toBe(true);
		expect([...report.findings[0]!.claim].length).toBeLessThanOrEqual(320);
		expect(report.findings).toHaveLength(5);
		expect(report.findings[1]!.evidence.map((ref) => ref.id)).toEqual(['task-1', 'task-2']);
		expect(report.risks).toHaveLength(4);
		expect(report.unknowns).toHaveLength(4);
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

describe('project review v2 outcomes', () => {
	const parseV2 = (value: unknown) =>
		parseWorkflowRoleReport(JSON.stringify(value), 'risk_reviewer', evidence, {
			id: 'risk_reviewer',
			version: 3
		});
	it.each(['no_material_findings', 'insufficient_evidence', 'needs_clarification'])(
		'accepts %s without manufacturing a finding',
		(outcome) => {
			const result = parseV2({ ...valid, outcome, findings: [], risks: [] });
			expect(result).toMatchObject({
				ok: true,
				report: {
					version: 'chat_workflow_role_report_v2',
					outcome,
					findings: [],
					specialist: { id: 'risk_reviewer', version: 3 }
				}
			});
			if (!result.ok) throw new Error(result.reason);
			expect(workflowReportForEditor(result.report)).toMatchObject({ outcome });
			expect(renderWorkflowRoleReport(result.report, 1)).toContain(
				`Outcome: ${outcome.replaceAll('_', ' ')}`
			);
		}
	);
	it('requires evidence for findings and risks and an explanation for missing evidence', () => {
		for (const report of [
			{ ...valid, outcome: 'findings', findings: [] },
			{
				...valid,
				outcome: 'findings',
				risks: [{ risk: 'A speculative risk', evidence: [] }]
			},
			{ ...valid, outcome: 'no_material_findings' },
			{ ...valid, outcome: 'insufficient_evidence', findings: [], risks: [], unknowns: [] },
			{ ...valid, outcome: 'anything' }
		])
			expect(parseV2(report).ok).toBe(false);
	});
	it('ignores a model-supplied specialist identity and requires an explicit outcome', () => {
		expect(parseV2(valid).ok).toBe(false);
		expect(
			parseV2({ ...valid, outcome: 'findings', specialist: { id: 'intruder', version: 999 } })
		).toMatchObject({ ok: true, report: { specialist: { id: 'risk_reviewer', version: 3 } } });
	});
});
