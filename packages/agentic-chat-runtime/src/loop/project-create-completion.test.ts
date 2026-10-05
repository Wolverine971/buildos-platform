// packages/agentic-chat-runtime/src/loop/project-create-completion.test.ts
//
// A new user's first chat turn is a Project Setup (`project_create`) turn. The
// reviewer's frozen request checklist names the project's own fields (name,
// type_key, state_key, props, facets), but create_onto_project nests them under
// `project`, so the write ledger used to record only `project`, `entities` and
// `relationships`. The checklist could never be proved: every such turn spent
// an extra completion-repair pass (5-15 s in production, 2026-09-24 and
// 2026-09-26) and then replied "Some requested work is still unfinished" with
// the new project's raw id, although the project had been created.
import { describe, expect, it } from 'vitest';
import { buildCleanupManifest, describePendingCleanupItems } from './cleanup-manifest';
import { parseRequestExpectation, resolveRequestExpectationOutcome } from './request-expectation';
import type { FastToolExecution } from './shared';
import { buildWriteLedger } from './write-ledger';

const PROJECT_ID = '11111111-2222-4333-8444-555555555555';
const DOC_ID = '66666666-7777-4888-8999-aaaaaaaaaaaa';

// Shape of the reviewer checklist on the 2026-09-24 first turn (values
// replaced): changes on the project's own fields and facets.
function reviewerChecklist(overrides: { name?: string; stage?: string } = {}) {
	return parseRequestExpectation({
		summary: 'Create the smallest valid project for the idea.',
		outcomes: [
			{
				id: 'create_project',
				action: 'create',
				entity_kind: 'project',
				target_ids: [],
				changes: [
					{ field: 'name', value: overrides.name ?? 'Garden Planner' },
					{ field: 'type_key', value: 'project.technical.software' },
					{ field: 'state_key', value: 'planning' },
					{ field: 'context', value: 'personal' },
					{ field: 'scale', value: 'small' },
					{ field: 'stage', value: overrides.stage ?? 'discovery' }
				],
				description: 'Create the project for the garden planning app.',
				required_fields: ['name', 'description', 'type_key', 'state_key', 'props'],
				minimum_successful_effects: 1
			}
		]
	})!;
}

function projectCreate(
	project: Record<string, unknown> = {
		name: 'Garden Planner',
		description: 'A small app that plans what to plant and when.',
		type_key: 'project.technical.software',
		state_key: 'planning',
		props: { facets: { context: 'personal', scale: 'small', stage: 'discovery' } }
	}
): FastToolExecution {
	return {
		toolCall: {
			id: 'call-project',
			type: 'function',
			function: {
				name: 'create_onto_project',
				arguments: JSON.stringify({ project, entities: [], relationships: [] })
			}
		},
		result: {
			tool_call_id: 'call-project',
			success: true,
			// The adapter's receipt carries ids and counts, not the project row.
			result: {
				counts: { documents: 1, goals: 0, tasks: 0 },
				message: `Created project "${String(project.name)}" (ID: ${PROJECT_ID}) with 1 documents`,
				project_id: PROJECT_ID,
				context_shift: {
					entity_id: PROJECT_ID,
					entity_name: project.name,
					entity_type: 'project',
					new_context: 'project'
				},
				created_entities: [
					{ id: PROJECT_ID, kind: 'project', project_id: PROJECT_ID },
					{ id: DOC_ID, kind: 'document', project_id: PROJECT_ID }
				]
			}
		}
	};
}

describe('project-create request completion', () => {
	it('proves the reviewer checklist from the executed create_onto_project arguments', () => {
		const contract = reviewerChecklist();
		const executions = [projectCreate()];

		expect(
			resolveRequestExpectationOutcome({ contract, toolExecutions: executions })
		).toMatchObject({ fulfilled: true });
		expect(
			describePendingCleanupItems(
				buildCleanupManifest({ contract, toolExecutions: executions })
			)
		).toEqual([]);
	});

	it('still reports a project created with a different name or facet as unfinished', () => {
		expect(
			resolveRequestExpectationOutcome({
				contract: reviewerChecklist({ name: 'Seed Library' }),
				toolExecutions: [projectCreate()]
			}).fulfilled
		).toBe(false);
		expect(
			resolveRequestExpectationOutcome({
				contract: reviewerChecklist({ stage: 'execution' }),
				toolExecutions: [projectCreate()]
			}).fulfilled
		).toBe(false);
	});

	it('does not prove facets or fields the create call never wrote', () => {
		const executions = [
			projectCreate({
				name: 'Garden Planner',
				description: 'A small app that plans what to plant and when.',
				type_key: 'project.technical.software',
				state_key: 'planning'
			})
		];
		expect(
			resolveRequestExpectationOutcome({
				contract: reviewerChecklist(),
				toolExecutions: executions
			}).fulfilled
		).toBe(false);
	});

	it('names the project in the write ledger instead of its raw id', () => {
		const [entry] = buildWriteLedger([projectCreate()]);
		expect(entry).toMatchObject({
			toolName: 'create_onto_project',
			status: 'success',
			action: 'create',
			entityKind: 'project',
			entityId: PROJECT_ID,
			title: 'Garden Planner',
			typeKey: 'project.technical.software',
			stateKey: 'planning'
		});
		expect(entry?.changedFields).toEqual(
			expect.arrayContaining([
				'name',
				'description',
				'type_key',
				'state_key',
				'props',
				'props.facets.context',
				'props.facets.scale',
				'props.facets.stage'
			])
		);
		expect(entry?.changedValues).toMatchObject({
			name: 'Garden Planner',
			type_key: 'project.technical.software',
			state_key: 'planning',
			'props.facets.context': 'personal',
			'props.facets.scale': 'small',
			'props.facets.stage': 'discovery'
		});
	});

	it('proves a facet change on update_onto_project', () => {
		const contract = parseRequestExpectation({
			summary: 'Move the project to launch.',
			outcomes: [
				{
					id: 'stage',
					action: 'update',
					entity_kind: 'project',
					target_ids: [PROJECT_ID],
					changes: [{ field: 'stage', value: 'launch' }],
					minimum_successful_effects: 1
				}
			]
		})!;
		const update = (stage: string): FastToolExecution => ({
			toolCall: {
				id: `call-${stage}`,
				type: 'function',
				function: {
					name: 'update_onto_project',
					arguments: JSON.stringify({
						project_id: PROJECT_ID,
						props: { facets: { stage } }
					})
				}
			},
			result: { tool_call_id: `call-${stage}`, success: true, result: null }
		});
		expect(
			resolveRequestExpectationOutcome({ contract, toolExecutions: [update('launch')] })
				.fulfilled
		).toBe(true);
		expect(
			resolveRequestExpectationOutcome({ contract, toolExecutions: [update('execution')] })
				.fulfilled
		).toBe(false);
	});
});
