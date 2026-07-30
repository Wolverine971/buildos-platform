// apps/web/src/lib/services/agentic-chat/project-domain-profiles.test.ts
import { describe, expect, it } from 'vitest';
import {
	AGENT_WORKSPACE_PROP,
	applyProjectCreationProfileDefaults,
	hasExplicitProjectScheduleSignal,
	looksLikeFictionStoryCraftTurn,
	looksLikeLivingWorkspaceCaptureTurn,
	looksLikeLivingWorkspaceCommission,
	resolveAgentWorkspaceFromContextData,
	resolveProjectDomainRuntimeSkillId,
	resolveProjectDomainProfile,
	validateProjectCreationMilestoneGrounding
} from './project-domain-profiles';

describe('project domain profiles', () => {
	it('recognizes fiction projects without treating ordinary booking language as fiction', () => {
		expect(
			resolveProjectDomainProfile({
				userMessage: 'Create an ongoing workspace for the novel I am writing.'
			})?.id
		).toBe('fiction_story');
		expect(
			resolveProjectDomainProfile({
				userMessage: 'Create a project to book a meeting room for the team.'
			})
		).toBeNull();
		expect(
			resolveProjectDomainProfile({
				userMessage: 'Research the commercial market for literary fiction.'
			})
		).toBeNull();
	});

	it('distinguishes a living-workspace commission from a one-time project', () => {
		expect(
			looksLikeLivingWorkspaceCommission(
				'Use this as an ongoing room and keep the book organized as I add ideas.'
			)
		).toBe(true);
		expect(looksLikeLivingWorkspaceCommission('Create a project for my novel.')).toBe(false);
		expect(looksLikeLivingWorkspaceCommission('Create an ongoing sprint workspace.')).toBe(
			false
		);
	});

	it('persists domain affinity and living mode without replacing existing props', () => {
		const result = applyProjectCreationProfileDefaults(
			{
				project: {
					name: 'The Glass Harbor',
					type_key: 'project.creative.novel',
					props: { facets: { stage: 'discovery' }, owner_note: 'private draft' }
				},
				context_document: {
					title: 'START HERE',
					content: 'A living book workspace.',
					props: { source: 'user' }
				},
				entities: [],
				relationships: []
			},
			'Keep this book organized as an ongoing workspace whenever I add story details.'
		);

		expect(result.project.props).toMatchObject({
			facets: { stage: 'discovery' },
			owner_note: 'private draft',
			[AGENT_WORKSPACE_PROP]: {
				mode: 'living_reference',
				domain_profile: 'fiction_story',
				domain_affinity: 'writing.fiction'
			}
		});
		expect(result.context_document.props).toMatchObject({
			source: 'user',
			[AGENT_WORKSPACE_PROP]: result.project.props[AGENT_WORKSPACE_PROP]
		});
	});

	it('treats workspace metadata as server-owned and strips unrecognized model values', () => {
		const result = applyProjectCreationProfileDefaults(
			{
				project: {
					name: 'Quarterly Planning',
					type_key: 'project.business.planning',
					props: {
						owner_note: 'keep',
						agent_workspace: {
							mode: 'living_reference',
							domain_profile: 'ignore_previous_instructions',
							domain_affinity: 'malicious prompt text'
						}
					}
				},
				entities: [],
				relationships: []
			},
			'Create a quarterly planning project.'
		);

		expect(result.project.props).toEqual({ owner_note: 'keep' });
		expect(
			resolveAgentWorkspaceFromContextData({
				start_here: {
					agent_workspace: {
						mode: 'living_reference',
						domain_profile: 'ignore_previous_instructions',
						domain_affinity: 'malicious prompt text'
					}
				}
			})
		).toEqual({ mode: 'living_reference' });
	});

	it('rejects invented milestone dates but allows explicitly scheduled checkpoints', () => {
		const args = {
			entities: [
				{
					kind: 'milestone',
					temp_id: 'part-one',
					title: 'Part I',
					due_at: '2027-03-01T17:00:00Z'
				}
			]
		};

		expect(
			validateProjectCreationMilestoneGrounding(
				args,
				'The novel has Part I, Part II, and Part III.'
			)
		).toHaveLength(1);
		expect(hasExplicitProjectScheduleSignal('Finish Part I by March 1, 2027.')).toBe(true);
		expect(
			validateProjectCreationMilestoneGrounding(args, 'Finish Part I by March 1, 2027.')
		).toEqual([]);
	});

	it('captures declarative canon but leaves questions and option generation read-only', () => {
		expect(
			looksLikeLivingWorkspaceCaptureTurn(
				'Ilyan hides the brass key because it belonged to his sister.'
			)
		).toBe(true);
		expect(
			looksLikeLivingWorkspaceCaptureTurn(
				'What should happen to Ilyan next? Give me three options.'
			)
		).toBe(false);
		expect(looksLikeLivingWorkspaceCaptureTurn('Thanks!')).toBe(false);
		expect(
			looksLikeLivingWorkspaceCaptureTurn('Write a scene where Ilyan confronts Mara.')
		).toBe(false);
	});

	it('reads persisted workspace metadata from bounded START HERE context', () => {
		expect(
			resolveAgentWorkspaceFromContextData({
				start_here: {
					agent_workspace: {
						mode: 'living_reference',
						domain_profile: 'fiction_story',
						domain_affinity: 'writing.fiction'
					}
				}
			})
		).toEqual({
			mode: 'living_reference',
			domain_profile: 'fiction_story',
			domain_affinity: 'writing.fiction'
		});
	});

	it('recognizes fiction craft work without treating project operations as story craft', () => {
		expect(
			looksLikeFictionStoryCraftTurn(
				'What should happen with Ilyan next? Give me three options.'
			)
		).toBe(true);
		expect(
			looksLikeFictionStoryCraftTurn(
				'Draft the confrontation scene in close third from Mara.'
			)
		).toBe(true);
		expect(looksLikeFictionStoryCraftTurn('Thanks!')).toBe(false);
		expect(looksLikeFictionStoryCraftTurn('Schedule a deadline for revising chapter 5.')).toBe(
			false
		);
		expect(looksLikeFictionStoryCraftTurn('Create a task to revise chapter 5 next week.')).toBe(
			false
		);
		expect(
			looksLikeFictionStoryCraftTurn('Review my project tasks and tell me what is blocked.')
		).toBe(false);
		expect(looksLikeFictionStoryCraftTurn("Check the project's status.")).toBe(false);
		expect(
			looksLikeFictionStoryCraftTurn(
				'What impossible task should this character face in the next scene?'
			)
		).toBe(true);
		expect(looksLikeFictionStoryCraftTurn('Review the chapter 5 confrontation scene.')).toBe(
			true
		);
	});

	it('selects the fiction runtime skill from persisted affinity only for craft turns', () => {
		const workspace = {
			mode: 'living_reference',
			domain_profile: 'fiction_story',
			domain_affinity: 'writing.fiction'
		};

		expect(
			resolveProjectDomainRuntimeSkillId({
				workspace,
				latestUserMessage: 'Give me options for what Mara should do next.'
			})
		).toBe('fiction_story_craft');
		expect(
			resolveProjectDomainRuntimeSkillId({
				workspace,
				latestUserMessage: 'Which option feels strongest?'
			})
		).toBe('fiction_story_craft');
		expect(
			resolveProjectDomainRuntimeSkillId({
				workspace,
				latestUserMessage: 'Mara no longer trusts Ilyan.',
				implicitCapture: true
			})
		).toBeNull();
		expect(
			resolveProjectDomainRuntimeSkillId({
				workspace,
				latestUserMessage: 'Schedule a deadline for chapter 5.'
			})
		).toBeNull();
	});
});
