// apps/web/src/lib/components/inbox/InboxProjectManagerBrief.test.ts
// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import InboxProjectManagerBrief from './InboxProjectManagerBrief.svelte';

describe('InboxProjectManagerBrief', () => {
	afterEach(cleanup);

	it('leads with the bottom line, recommendation, one question, and real work links', async () => {
		render(InboxProjectManagerBrief, {
			props: {
				projectId: 'project-1',
				brief: {
					version: 2,
					attention_level: 'decision',
					bottom_line: 'Two launch documents now tell different stories.',
					recommendation:
						'Keep Launch plan as the main plan and fold the useful notes into it.',
					decision: {
						question: 'Should I organize the launch documents this way?',
						recommendation:
							'Keep Launch plan as the main plan and fold the useful notes into it.',
						why_user_needed:
							'This changes which document the team should treat as the source of truth.',
						options: [],
						recommended_option_id: null,
						recommended_suggestion_id: 'suggestion-1',
						candidate_ids: ['suggestion-1'],
						evidence_refs: [
							{
								entity_type: 'document',
								entity_id: 'doc-1',
								title: 'Launch plan',
								reason: 'Contains the current launch milestones.'
							}
						]
					},
					issues: [
						{
							category: 'document_quality',
							severity: 'important',
							headline: 'Launch plan and launch notes overlap',
							summary: 'Both documents cover launch sequencing.',
							recommendation: 'Keep one main plan.',
							candidate_ids: ['suggestion-1'],
							evidence_refs: []
						},
						{
							category: 'task_drift',
							severity: 'minor',
							headline: 'One follow-up task still points to the old notes',
							summary:
								'The task should point to Launch plan after the documents are organized.',
							recommendation: 'Update the task link afterward.',
							candidate_ids: ['suggestion-2'],
							evidence_refs: []
						}
					],
					current_goal: 'Launch',
					recent_changes: [],
					open_decisions: [],
					stale_assumptions: [],
					contradictions_or_drift: [],
					next_best_action: null,
					generated_at: '2026-08-14T12:00:00.000Z',
					source: 'llm'
				}
			}
		});

		expect(screen.getByText('Decision needed')).toBeVisible();
		expect(screen.getByText('Two launch documents now tell different stories.')).toBeVisible();
		expect(
			screen.getByText('Keep Launch plan as the main plan and fold the useful notes into it.')
		).toBeVisible();
		expect(screen.getByText('Should I organize the launch documents this way?')).toBeVisible();
		expect(screen.getByRole('link', { name: 'Launch plan' })).toHaveAttribute(
			'href',
			'/projects/project-1?entity=document&entity_id=doc-1'
		);

		const secondary = screen.getByText('Other things I noticed (1)').closest('summary');
		expect(secondary).not.toBeNull();
		expect(
			screen.getByText('One follow-up task still points to the old notes')
		).not.toBeVisible();
		await fireEvent.click(secondary!);
		expect(screen.getByText('One follow-up task still points to the old notes')).toBeVisible();
	});

	it('rewrites legacy academic audit language into a concrete manager recommendation', () => {
		render(InboxProjectManagerBrief, {
			props: {
				projectId: 'project-1',
				audit: {
					status: 'ready',
					summary:
						'The project has some documentation, but the document set is still thin.',
					recommendations: [
						{
							title: 'Choose the canonical project documents, then consolidate or expand them.',
							summary:
								'The project has some documentation, but the document set is still thin.',
							role: 'decision_point',
							priority: 'medium',
							dimension: 'documentation_quality',
							evidence_refs: [
								{
									entity_type: 'document',
									entity_id: 'doc-1',
									label: 'Launch plan'
								},
								{
									entity_type: 'document',
									entity_id: 'doc-2',
									label: 'Launch notes'
								}
							]
						}
					]
				}
			}
		});

		expect(screen.queryByText(/canonical project documents/i)).not.toBeInTheDocument();
		expect(screen.queryByText(/documentation_quality/i)).not.toBeInTheDocument();
		expect(
			screen.getByText('Launch plan and Launch notes need a clearer role in this project')
		).toBeVisible();
		expect(
			screen.getByText(
				'I recommend reviewing Launch plan, Launch notes together, keeping the most current document as the main one, and folding useful material from the others into it.'
			)
		).toBeVisible();
		expect(
			screen.getByText('Do you want to organize the project documents this way?')
		).toBeVisible();
	});

	it('renders separate issues when their manager-facing headlines match', () => {
		const repeatedHeadline = 'Recent work may be pulling the project in a new direction';

		render(InboxProjectManagerBrief, {
			props: {
				projectId: 'project-1',
				brief: {
					version: 2,
					attention_level: 'decision',
					bottom_line: 'The project needs a direction check.',
					issues: [
						{
							category: 'risk',
							severity: 'important',
							headline: 'The launch date is at risk',
							summary: 'A dependency is still unresolved.',
							recommendation: 'Resolve the dependency first.',
							candidate_ids: ['suggestion-1'],
							evidence_refs: []
						},
						{
							category: 'project_drift',
							severity: 'important',
							headline: repeatedHeadline,
							summary: 'Recent design work is outside the launch scope.',
							recommendation: 'Park the design work until after launch.',
							candidate_ids: ['suggestion-2'],
							evidence_refs: []
						},
						{
							category: 'project_drift',
							severity: 'minor',
							headline: repeatedHeadline,
							summary: 'A research task is exploring a different audience.',
							recommendation: 'Keep the research separate from launch decisions.',
							candidate_ids: ['suggestion-3'],
							evidence_refs: []
						}
					],
					current_goal: 'Launch',
					recent_changes: [],
					open_decisions: [],
					stale_assumptions: [],
					contradictions_or_drift: [],
					next_best_action: null
				}
			}
		});

		expect(screen.getAllByText(repeatedHeadline)).toHaveLength(2);
	});
});
