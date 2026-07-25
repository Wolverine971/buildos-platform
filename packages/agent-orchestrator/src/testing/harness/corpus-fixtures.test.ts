// packages/agent-orchestrator/src/testing/harness/corpus-fixtures.test.ts
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
	CandidateCorpusSchema,
	FrozenCorpusSchema,
	HoldoutCorpusSchema,
	ProjectSnapshotSchema
} from './corpus-schema';

function readJson(relativePath: string): unknown {
	return JSON.parse(readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8'));
}

describe('Phase A corpus candidate fixtures', () => {
	const corpus = CandidateCorpusSchema.parse(readJson('./candidates/candidates.json'));
	const frozen = FrozenCorpusSchema.parse(readJson('./corpus/phase-a.json'));
	const holdout = HoldoutCorpusSchema.parse(readJson('./corpus/phase-a-holdout.json'));
	const snapshot = ProjectSnapshotSchema.parse(
		readJson('./fixtures/project-alpha.snapshot.json')
	);

	it('contains 10–12 unique, production-derived candidates', () => {
		expect(corpus.candidates).toHaveLength(11);
		expect(new Set(corpus.candidates.map((item) => item.source.turn_ref_hash)).size).toBe(11);
	});

	it('covers the required class and route mix before selection', () => {
		const classes = new Set(corpus.candidates.map((item) => item.class));
		const routes = new Set(corpus.candidates.map((item) => item.proposed_route));

		for (const requiredClass of [
			'simple_read',
			'status_summary',
			'single_source_lookup',
			'multi_source_research',
			'context_research_recommendation',
			'ambiguous',
			'unsupported_capability'
		] as const) {
			expect(classes.has(requiredClass)).toBe(true);
		}
		expect(routes).toEqual(new Set(['direct', 'workflow', 'clarify', 'capability_gap']));
	});

	it('points every project scenario at the frozen snapshot', () => {
		const projectCandidates = corpus.candidates.filter(
			(item) => item.context_type === 'project'
		);

		expect(projectCandidates.length).toBeGreaterThan(0);
		expect(
			projectCandidates.every((item) => item.snapshot_ref === corpus.default_snapshot_ref)
		).toBe(true);
		expect(snapshot.snapshot_id).toBe('phase-a-project-alpha-v1');
	});

	it('contains only anonymized fixture IDs, not production entity IDs', () => {
		expect(snapshot.project.id).toBe('10000000-0000-4000-8000-000000000001');
		expect(JSON.stringify(snapshot)).not.toContain('a1a4bf29-a2d1-4421-a0f0-b3c58240a37b');
	});

	it('locks the eight DJ-approved scenarios and labels', () => {
		expect(frozen.scenarios.map((scenario) => scenario.scenario_id)).toEqual([
			'a0-c01-in-sync-explanation',
			'a0-c02-next-actions',
			'a0-c04-five-bullet-status',
			'a0-c06-single-source-article',
			'a0-c07-campaign-workflow-research',
			'a0-c08-context-app-recommendation',
			'a0-c09-missing-content-scope',
			'a0-c12-email-capability-gap'
		]);
		expect(frozen.scenarios.map((scenario) => scenario.expected_route)).toEqual([
			'direct',
			'direct',
			'direct',
			'workflow',
			'workflow',
			'workflow',
			'clarify',
			'capability_gap'
		]);
	});

	it('copies approved candidate content without label or request drift', () => {
		for (const scenario of frozen.scenarios) {
			const candidate = corpus.candidates.find(
				(item) => item.candidate_id === scenario.scenario_id
			);
			expect(candidate).toBeDefined();
			expect(scenario).toEqual({
				scenario_id: candidate!.candidate_id,
				selection_status: 'frozen',
				class: candidate!.class,
				source: candidate!.source,
				request_text: candidate!.request_text,
				context_type: candidate!.context_type,
				snapshot_ref: candidate!.snapshot_ref,
				expected_route: candidate!.proposed_route,
				expected_reason_code: candidate!.proposed_reason_code,
				acceptance_checks: candidate!.acceptance_checks,
				notes: candidate!.notes
			});
		}
	});

	it('freezes the held-out labels independently of model output', () => {
		expect(holdout.scored_against_prompt_version).toBe('phase-a-route-prompt-v5');
		expect(holdout.scenarios).toHaveLength(5);
		expect(holdout.scenarios.map((scenario) => scenario.scenario_id)).toEqual([
			'a0-c03-project-status',
			'a0-c05-single-document-read',
			'a0-c10-week-planning-stress',
			'h1-t01-today-focus',
			'h1-t02-email-connection'
		]);
		expect(
			holdout.scenarios.map((scenario) => [
				scenario.expected_route,
				scenario.expected_reason_code
			])
		).toEqual([
			['direct', 'status_summary'],
			['direct', 'simple_read'],
			['direct', 'status_summary'],
			['direct', 'status_summary'],
			['capability_gap', 'unsupported_capability']
		]);
	});

	it('copies the three pre-labeled alternatives without request or label drift', () => {
		for (const scenario of holdout.scenarios.slice(0, 3)) {
			const candidate = corpus.candidates.find(
				(item) => item.candidate_id === scenario.scenario_id
			);
			expect(candidate).toBeDefined();
			expect(scenario.request_text).toBe(candidate!.request_text);
			expect(scenario.expected_route).toBe(candidate!.proposed_route);
			expect(scenario.expected_reason_code).toBe(candidate!.proposed_reason_code);
			expect(scenario.source).toEqual(candidate!.source);
		}
	});

	it('pins the exact anonymized snapshot bytes', () => {
		const snapshotBytes = readFileSync(
			fileURLToPath(new URL('./fixtures/project-alpha.snapshot.json', import.meta.url))
		);
		expect(createHash('sha256').update(snapshotBytes).digest('hex')).toBe(
			frozen.snapshot_sha256
		);
	});
});
