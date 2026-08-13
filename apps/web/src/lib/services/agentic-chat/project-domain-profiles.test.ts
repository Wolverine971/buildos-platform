// apps/web/src/lib/services/agentic-chat/project-domain-profiles.test.ts
import { describe, expect, it } from 'vitest';
import {
	AGENT_WORKSPACE_PROP,
	applyFictionStructureUpdateSourceDefault,
	applyProjectCreationProfileDefaults,
	hasExplicitProjectScheduleSignal,
	looksLikeFictionStoryCraftTurn,
	looksLikeLivingWorkspaceCaptureTurn,
	looksLikeLivingWorkspaceCommission,
	resolveAgentWorkspaceFromContextData,
	resolveProjectDomainRuntimeSkillId,
	resolveProjectDomainProfile,
	renderProjectCreationProfileGuidance,
	validateFictionCharacterSourceCoverage,
	validateFictionOperationalScaffoldingGrounding,
	validateFictionStructureSourceCoverage,
	validateProjectCreationMilestoneGrounding,
	validateProjectCreationProfileGrounding
} from './project-domain-profiles';

describe('project domain profiles', () => {
	it('retains the complete author source in an incremental fiction structure update', () => {
		const source =
			'Ilyan catches Mara hiding a forbidden map and chooses not to report her. Mara reads that as loyalty, but he is using her to reach the Salt Archive. Chapter 5 opens Part II on the morning after that choice.';
		const result = applyFictionStructureUpdateSourceDefault(
			{
				document_id: 'structure-doc',
				content: '## Chapter 5\n\nPart II begins the next morning.',
				update_strategy: 'append'
			},
			source
		);

		expect(result.content).toContain('## Author canon');
		expect(result.content).toContain(source);
		expect(result.content).toContain('Part II begins the next morning.');
	});

	it('places a raw commissioned source under Author canon before a structure merge', () => {
		const source =
			'Ilyan catches Mara hiding a forbidden map and chooses not to report her. Chapter 5 opens Part II the next morning.';
		const result = applyFictionStructureUpdateSourceDefault(
			{
				document_id: 'structure-doc',
				content: source,
				update_strategy: 'merge_llm'
			},
			source
		);

		expect(result.content).toMatch(/^## Author canon\n\n/);
		expect(result.content.match(/Ilyan catches Mara/g)).toHaveLength(1);
	});

	it('skips structure-source augmentation when the model content is not top-level', () => {
		const source = 'Chapter 5 opens Part II on the morning after that choice.';
		const args = {
			document_id: 'structure-doc',
			document: { body_markdown: 'MODEL CONTENT UNDER A NESTED ALIAS' }
		};
		// Augmenting would fabricate a canon-only top-level body that replaces
		// the model's nested content under the default replace strategy.
		expect(applyFictionStructureUpdateSourceDefault(args, source)).toBe(args);
	});

	it('never demands a character sheet for determiner-led places or objects', () => {
		const args = {
			project: { name: 'Bellwether', type_key: 'project.creative.book' },
			entities: [
				{
					kind: 'document',
					type_key: 'document.creative.character',
					title: 'Mara Venn — Character',
					content: 'Mara Venn is a smuggler who works the night docks.'
				}
			]
		};
		const errors = validateFictionCharacterSourceCoverage(
			args,
			'I want an ongoing workspace for my novel. Mara Venn is a smuggler who works the night docks. ' +
				'The Salt Archive is a forbidden vault beneath the customs house. ' +
				'The Iron Council is the governing body of the port.'
		);
		expect(errors).toEqual([]);
	});

	it('treats question-mark-free speculation as read-only, not capture', () => {
		expect(looksLikeLivingWorkspaceCaptureTurn('Do you think Mara would forgive him')).toBe(
			false
		);
		expect(looksLikeLivingWorkspaceCaptureTurn('I wonder if Ilyan should betray Mara')).toBe(
			false
		);
		expect(looksLikeLivingWorkspaceCaptureTurn('Maybe Ilyan should refuse the mission')).toBe(
			false
		);
		expect(
			looksLikeLivingWorkspaceCaptureTurn(
				'Ilyan keeps a contraband brass whistle in his evidence drawer.'
			)
		).toBe(true);
	});

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

	it('rejects invented milestone dates but allows explicitly scheduled milestones', () => {
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

	it('requires complete character sheets and keeps story structure out of project plans', () => {
		const guidance = renderProjectCreationProfileGuidance(
			'Create an ongoing workspace for my novel and keep its characters and parts organized.'
		)?.content;

		expect(guidance).toContain('Do not rely on START HERE');
		expect(guidance).toContain('complete source sentence verbatim');
		expect(guidance).toContain(
			'Do not create BuildOS goals, plans, tasks, milestones, or dates'
		);
	});

	it('strips invented project dates from an idea-only fiction workspace', () => {
		const result = applyProjectCreationProfileDefaults(
			{
				project: {
					name: 'The Glass Harbor',
					type_key: 'project.creative.novel',
					start_at: '2026-07-29T00:00:00Z',
					end_at: '2026-10-29T00:00:00Z'
				},
				entities: [],
				relationships: []
			},
			'Create an ongoing workspace for my novel; it has three narrative parts.'
		);

		expect(result.project).not.toHaveProperty('start_at');
		expect(result.project).not.toHaveProperty('end_at');
	});

	it('deterministically grounds a fiction workspace without replacing creative judgment', () => {
		const characterSentence =
			'Mara Venn is an apprentice cartographer who alone remembers the erased Drowned Ward, and she wants to restore it before Archivist Senn removes it forever.';
		const structureSentence =
			'The book has three parts: Part I, The Missing Street; Part II, The Salt Archive; and Part III, A Map That Refuses to Burn.';
		const result = applyProjectCreationProfileDefaults(
			{
				project: { name: 'The Glass Harbor', type_key: 'project.creative.novel' },
				entities: [
					{ kind: 'goal', temp_id: 'finish-book', name: 'Complete the first draft' },
					{ kind: 'plan', temp_id: 'part-one', name: 'Part I' },
					{
						kind: 'document',
						temp_id: 'mara',
						title: 'Mara Venn',
						type_key: 'document.creative.character',
						body_markdown: '## Role\n\nMara maps the harbor.'
					},
					{
						kind: 'document',
						temp_id: 'structure',
						title: 'Story Structure',
						type_key: 'document.creative.structure',
						content: '## Parts\n\nThree escalating movements.'
					}
				],
				relationships: [
					[
						{ temp_id: 'finish-book', kind: 'goal' },
						{ temp_id: 'mara', kind: 'document' }
					],
					[
						{ temp_id: 'mara', kind: 'document' },
						{ temp_id: 'structure', kind: 'document' }
					]
				]
			},
			`Create an ongoing novel workspace. ${characterSentence} ${structureSentence}`
		);

		expect(result.entities.map((entity) => entity.kind)).toEqual(['document', 'document']);
		expect(result.relationships).toHaveLength(1);
		expect(result.entities[0].body_markdown).toContain(characterSentence);
		expect(result.entities[0].body_markdown).toContain('## Author canon');
		expect(result.entities[1].content).toContain(structureSentence);
		expect(result.entities[1].content).toContain(characterSentence);
		expect(result.entities[1].content).toContain('Archivist Senn');
		expect(result.entities[1].content).toContain('## Author canon');
		expect(validateFictionCharacterSourceCoverage(result, characterSentence)).toEqual([]);
		expect(validateFictionStructureSourceCoverage(result, structureSentence)).toEqual([]);
	});

	it('keeps a controlling antagonist pressure with an explicitly named story structure', () => {
		const pressure =
			'Mara Venn is an apprentice cartographer, and she wants to restore the Drowned Ward before Archivist Senn removes it forever.';
		const structure =
			'The book has three parts: Part I, The Missing Street; Part II, The Salt Archive; and Part III, A Map That Refuses to Burn.';
		const result = applyProjectCreationProfileDefaults(
			{
				project: { name: 'The Glass Harbor', type_key: 'project.creative.novel' },
				entities: [
					{
						kind: 'document',
						type_key: 'document.creative.character',
						title: 'Mara Venn',
						content: 'Mara is the protagonist.'
					},
					{
						kind: 'document',
						type_key: 'document.creative.structure',
						title: 'Story Structure',
						content: 'Three-part structure.'
					}
				]
			},
			`Create an ongoing novel workspace. ${pressure} ${structure}`
		);

		expect(result.entities[1].content).toContain(pressure);
		expect(validateFictionStructureSourceCoverage(result, `${pressure} ${structure}`)).toEqual(
			[]
		);
	});

	it('supplies the minimum grounded fiction artifacts when a creation model omits them', () => {
		const userMessage =
			'Create an ongoing novel workspace. Here is the opening brain dump: Bellwether is a canal city where official maps decide what the city remembers. Mara Venn is an apprentice cartographer who wants to restore the Drowned Ward before Archivist Senn removes it forever. Ilyan Rook is a harbor customs clerk whose older brother disappeared. The book has three parts: Part I, The Missing Street; Part II, The Salt Archive; and Part III, A Map That Refuses to Burn.';
		const result = applyProjectCreationProfileDefaults(
			{
				project: { name: 'The Glass Harbor', type_key: 'project.creative.novel' },
				entities: [],
				relationships: []
			},
			userMessage
		);

		expect(result.entities).toHaveLength(3);
		expect(result.entities.map((entity) => entity.title)).toEqual([
			'Mara Venn',
			'Ilyan Rook',
			'Story Structure'
		]);
		expect(result.entities[2].content).toContain(
			'official maps decide what the city remembers'
		);
		expect(result.entities[2].content).toContain('Archivist Senn');
		expect(result.entities[2].content).toContain('Part III');
		expect(validateProjectCreationProfileGrounding(result, userMessage)).toEqual([]);
	});

	it('does not turn character pressure alone into a required structure artifact', () => {
		const userMessage =
			'Mara Venn is an apprentice cartographer who must reach the archive before Archivist Senn.';
		const args = {
			project: { name: 'The Glass Harbor', type_key: 'project.creative.novel' },
			entities: [
				{
					kind: 'document',
					type_key: 'document.creative.character',
					title: 'Mara Venn',
					content: userMessage
				}
			]
		};

		expect(validateFictionStructureSourceCoverage(args, userMessage)).toEqual([]);
	});

	it('rejects invented operational scaffolding for a canon-only fiction opening', () => {
		const args = {
			project: { name: 'The Glass Harbor', type_key: 'project.creative.novel' },
			entities: [
				{ kind: 'goal', temp_id: 'draft-goal', name: 'Complete the novel' },
				{ kind: 'plan', temp_id: 'part-one', name: 'Part I' }
			],
			relationships: []
		};

		expect(
			validateFictionOperationalScaffoldingGrounding(
				args,
				'Create an ongoing workspace for my novel; Part I is The Missing Street.'
			)
		).toEqual([expect.stringContaining('does not request project-management scaffolding')]);
		expect(
			validateFictionOperationalScaffoldingGrounding(
				args,
				'Create a novel workspace and add a writing plan with tasks for the first draft.'
			)
		).toEqual([]);
	});

	it('requires the author source sentence in each unambiguously introduced character sheet', () => {
		const userMessage =
			'Mara Venn is an apprentice cartographer who alone remembers the erased Drowned Ward. Ilyan Rook is a harbor customs clerk whose brother disappeared.';
		const baseArgs = {
			project: { name: 'The Glass Harbor', type_key: 'project.creative.novel' },
			entities: [
				{
					kind: 'document',
					temp_id: 'mara',
					title: 'Mara Venn',
					type_key: 'document.creative.character',
					content: '## Role\n\nMara wants to recover a lost part of the city.'
				},
				{
					kind: 'document',
					temp_id: 'ilyan',
					title: 'Ilyan Rook',
					type_key: 'document.creative.character',
					content:
						'## Author canon\n\nIlyan Rook is a harbor customs clerk whose brother disappeared.'
				}
			],
			relationships: []
		};

		expect(validateFictionCharacterSourceCoverage(baseArgs, userMessage)).toEqual([
			expect.stringContaining("Mara Venn's character sheet")
		]);
		expect(
			validateFictionCharacterSourceCoverage(
				{
					...baseArgs,
					entities: baseArgs.entities.map((entity) =>
						entity.temp_id === 'mara'
							? {
									...entity,
									content:
										'## Author canon\n\nMara Venn is an apprentice cartographer who alone remembers the erased Drowned Ward.'
								}
							: entity
					)
				},
				userMessage
			)
		).toEqual([]);
	});

	it('requires an explicitly named story sequence in the creative structure artifact', () => {
		const userMessage =
			'The book has three parts: Part I, The Missing Street; Part II, The Salt Archive; and Part III, A Map That Refuses to Burn.';
		const baseArgs = {
			project: { name: 'The Glass Harbor', type_key: 'project.creative.novel' },
			entities: [
				{
					kind: 'document',
					temp_id: 'structure',
					title: 'Story Structure',
					type_key: 'document.creative.structure',
					content: '## Parts\n\nThe story unfolds in three escalating movements.'
				}
			],
			relationships: []
		};

		expect(validateFictionStructureSourceCoverage(baseArgs, userMessage)).toEqual([
			expect.stringContaining('complete author source sentence')
		]);
		expect(
			validateFictionStructureSourceCoverage(
				{
					...baseArgs,
					entities: [
						{
							...baseArgs.entities[0],
							content: `## Author canon\n\n${userMessage}\n\n## Parts`
						}
					]
				},
				userMessage
			)
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
