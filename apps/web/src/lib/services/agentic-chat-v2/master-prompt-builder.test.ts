// apps/web/src/lib/services/agentic-chat-v2/master-prompt-builder.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildMasterPrompt } from './master-prompt-builder';
import { configureLibriRuntimeEnv } from '$lib/services/agentic-chat/tools/libri/config';

afterEach(() => {
	configureLibriRuntimeEnv(null);
	vi.unstubAllEnvs();
});

function extractTagBlock(prompt: string, tag: string): string {
	const match = prompt.match(new RegExp(`<${tag}>[\\s\\S]*?<\\/${tag}>`));
	return match?.[0] ?? '';
}

describe('buildMasterPrompt instruction rewrite', () => {
	it('renders markdown instructions with canonical gateway/direct tool sections', () => {
		vi.stubEnv('LIBRI_INTEGRATION_ENABLED', 'true');

		const prompt = buildMasterPrompt({
			contextType: 'global',
			projectId: null,
			entityId: null
		});
		const instructionsBlock = extractTagBlock(prompt, 'instructions');
		const contextBlock = extractTagBlock(prompt, 'context');

		expect(instructionsBlock).toContain('# BuildOS Agent System Prompt');
		expect(instructionsBlock).toContain('## Identity');
		expect(instructionsBlock).toContain('## Capabilities, Skills, and Tools');
		expect(instructionsBlock).toContain(
			'Think in three layers. They work together in sequence:'
		);
		expect(instructionsBlock).toContain(
			'Workspace and project overviews: Get BuildOS-native status snapshots for the whole workspace or one project without assembling generic ontology reads by hand.'
		);
		expect(instructionsBlock).toContain(
			'Calendar management: Check the calendar, create or reschedule events, cancel events, and manage project calendar mapping.'
		);
		expect(instructionsBlock).toContain('### Skill Catalog');
		expect(instructionsBlock).toContain('| Skill ID | Description |');
		expect(instructionsBlock).toContain('| `project_creation` |');
		expect(instructionsBlock).toContain('| `workflow_forecast` |');
		expect(instructionsBlock).toContain('### Tools');
		expect(instructionsBlock).toContain('Discovery tools:');
		expect(instructionsBlock).toContain('- skill_load');
		expect(instructionsBlock).toContain('- tool_search');
		expect(instructionsBlock).toContain('- tool_schema');
		expect(instructionsBlock).toContain('Preloaded direct tools:');
		expect(instructionsBlock).toContain('- get_workspace_overview');
		expect(instructionsBlock).toContain('- search_buildos');
		expect(instructionsBlock).not.toContain('```json');
		expect(instructionsBlock).not.toContain('"parameters"');
		expect(instructionsBlock).toContain('## Execution Protocol');
		expect(instructionsBlock).toContain(
			'If the workflow is multi-step or easy to get wrong, load the relevant skill first.'
		);
		expect(instructionsBlock).toContain(
			'If a preloaded direct tool already fits the job, call it directly.'
		);
		expect(instructionsBlock).toContain('### Direct tool protocol');
		expect(instructionsBlock).toContain('The callable surface is the direct tool name');
		expect(instructionsBlock).toContain(
			'Good examples: `{"capability":"overview"}`, `{"entity":"task","kind":"write","query":"update existing task state"}`'
		);
		expect(instructionsBlock).toContain(
			'`tool_search` is for discovering which op/tool to use. Query for operations like `"update existing task state"` or `"move document in tree"`'
		);
		expect(instructionsBlock).toContain(
			'Only call `onto.<entity>.get`, `onto.<entity>.update`, or `onto.<entity>.delete` when you have the exact `*_id`.'
		);
		expect(instructionsBlock).toContain('## Agent Behavior');
		expect(instructionsBlock).toContain('Do not claim actions you did not perform.');
		expect(instructionsBlock).toContain(
			'If data is missing or a tool fails, state what happened and request the minimum next input or retry.'
		);
		expect(instructionsBlock).toContain('## Data Rules');
		expect(instructionsBlock).toContain(
			'Do not use `onto.project.graph.reorganize` to reorganize documents.'
		);
		expect(instructionsBlock).toContain(
			'Treat permission role and access as hard constraints — do not route admin actions to viewers.'
		);
		expect(instructionsBlock).not.toContain('<buildos_capabilities>');
		expect(instructionsBlock).not.toContain('<capability_system>');
		expect(instructionsBlock).not.toContain('<skill_catalog>');
		expect(instructionsBlock).not.toContain('<entity_resolution>');
		expect(instructionsBlock).not.toContain('<tool_discovery>');
		expect(contextBlock).toContain('<context_description>');
		expect(contextBlock).toContain('Context type: global.');
		expect(prompt).not.toContain('<data>');
		expect(contextBlock).toContain('<overview_guidance>');
		expect(contextBlock).toContain('<libri_guidance>');
		expect(instructionsBlock).toContain('| `libri_knowledge` |');
		expect(contextBlock).toContain('skill_load({ skill: "libri_knowledge" })');
		expect(instructionsBlock).not.toContain('<overview_guidance>');
		expect(contextBlock).toContain('Workspace-wide status -> get_workspace_overview({})');
	});

	it('omits overview guidance outside global context', () => {
		vi.stubEnv('LIBRI_INTEGRATION_ENABLED', 'true');

		const prompt = buildMasterPrompt({
			contextType: 'project',
			projectId: 'project-1',
			entityId: 'project-1'
		});
		const contextBlock = extractTagBlock(prompt, 'context');
		const instructionsBlock = extractTagBlock(prompt, 'instructions');

		expect(contextBlock).not.toContain('<overview_guidance>');
		expect(contextBlock).toContain('<libri_guidance>');
		expect(instructionsBlock).not.toContain('<overview_guidance>');
	});

	it('omits Libri guidance when the Libri feature flag is disabled', () => {
		vi.stubEnv('LIBRI_INTEGRATION_ENABLED', 'false');

		const prompt = buildMasterPrompt({
			contextType: 'global',
			projectId: null,
			entityId: null
		});
		const contextBlock = extractTagBlock(prompt, 'context');
		const instructionsBlock = extractTagBlock(prompt, 'instructions');

		expect(contextBlock).not.toContain('<libri_guidance>');
		expect(instructionsBlock).not.toContain('libri_knowledge');
		expect(prompt).not.toContain('resolve_libri_resource');
	});

	it('includes Libri in fastchat prompts when server runtime env enables it', () => {
		configureLibriRuntimeEnv({
			LIBRI_INTEGRATION_ENABLED: 'true'
		});

		const prompt = buildMasterPrompt({
			contextType: 'global',
			projectId: null,
			entityId: null
		});
		const instructionsBlock = extractTagBlock(prompt, 'instructions');
		const contextBlock = extractTagBlock(prompt, 'context');

		expect(instructionsBlock).toContain('| `libri_knowledge` |');
		expect(instructionsBlock).toContain('- resolve_libri_resource');
		expect(contextBlock).toContain('<libri_guidance>');
		expect(contextBlock).toContain('skill_load({ skill: "libri_knowledge" })');
	});

	it('renders compact gateway tool names without duplicating full schemas', () => {
		const prompt = buildMasterPrompt({
			contextType: 'global',
			projectId: null,
			entityId: null
		});
		const instructionsBlock = extractTagBlock(prompt, 'instructions');

		expect(instructionsBlock).toContain('### Tools');
		expect(instructionsBlock).toContain('Discovery tools:');
		expect(instructionsBlock).toContain('- skill_load');
		expect(instructionsBlock).toContain('Preloaded direct tools:');
		expect(instructionsBlock).toContain('- get_workspace_overview');
		expect(instructionsBlock).not.toContain('```json');
		expect(instructionsBlock).not.toContain('"name": "skill_load"');
		expect(instructionsBlock).not.toContain('"parameters"');
	});

	it('falls back project_id to entity_id for project context', () => {
		const prompt = buildMasterPrompt({
			contextType: 'project',
			projectId: null,
			entityId: '05c40ed8-9dbe-4893-bd64-8aeec90eab40'
		});

		expect(prompt).toContain('<project_id>05c40ed8-9dbe-4893-bd64-8aeec90eab40</project_id>');
	});

	it('nests project scope and project data inside the context block', () => {
		const prompt = buildMasterPrompt({
			contextType: 'project',
			projectId: '4cfdbed1-840a-4fe4-9751-77c7884daa70',
			entityId: '4cfdbed1-840a-4fe4-9751-77c7884daa70',
			projectName: 'The Last Ember',
			data: {
				goals: [
					{
						id: '34268cc1-eeda-468c-87d2-3791af8b48ca',
						name: 'Finish first draft by March 31st'
					}
				],
				plans: [],
				tasks: [],
				project: {
					id: '4cfdbed1-840a-4fe4-9751-77c7884daa70',
					name: 'The Last Ember'
				}
			}
		});
		const contextBlock = extractTagBlock(prompt, 'context');

		expect(contextBlock).toContain('Context type: project.');
		expect(contextBlock).toContain('<project>');
		expect(contextBlock).toContain(
			'<project_id>4cfdbed1-840a-4fe4-9751-77c7884daa70</project_id>'
		);
		expect(contextBlock).toContain('<project_name>The Last Ember</project_name>');
		expect(contextBlock).toContain('"goals": [');
		expect(contextBlock).toContain('"plans": []');
		expect(contextBlock).toContain('"tasks": []');
		expect(contextBlock).toContain('"project": {');
		expect(prompt).not.toContain('<data>');
		expect(prompt).not.toContain('<json>');
	});

	it('adds dedicated project creation workflow guidance in project_create context', () => {
		const prompt = buildMasterPrompt({
			contextType: 'project_create',
			projectId: null,
			entityId: null
		});
		const instructionsBlock = extractTagBlock(prompt, 'instructions');
		const contextBlock = extractTagBlock(prompt, 'context');

		expect(contextBlock).toContain('<project_create_workflow>');
		expect(instructionsBlock).not.toContain('<project_create_workflow>');
		expect(contextBlock).toContain('You are already in project_create context.');
		expect(contextBlock).toContain(
			'Prefer the project creation capability, then load skill_load({ skill: "project_creation" }) before the first create call.'
		);
		expect(contextBlock).toContain(
			'Always include entities: [] and relationships: [] even when the project starts empty.'
		);
		expect(contextBlock).toContain('Never use raw temp_id strings like ["g1", "t1"].');
	});

	it('omits project creation workflow guidance outside project_create context', () => {
		const prompt = buildMasterPrompt({
			contextType: 'global',
			projectId: null,
			entityId: null
		});
		const contextBlock = extractTagBlock(prompt, 'context');
		const instructionsBlock = extractTagBlock(prompt, 'instructions');

		expect(contextBlock).not.toContain('<project_create_workflow>');
		expect(instructionsBlock).not.toContain('<project_create_workflow>');
	});

	it('omits absent scope tags instead of rendering empty or none placeholders', () => {
		const prompt = buildMasterPrompt({
			contextType: 'global',
			projectId: null,
			entityId: null,
			focusEntityId: null
		});
		const instructionsBlock = extractTagBlock(prompt, 'instructions');
		const contextBlock = extractTagBlock(prompt, 'context');

		expect(contextBlock).not.toContain('<project>');
		expect(contextBlock).not.toContain('<focus_entity>');
		expect(prompt).not.toContain('<project_id></project_id>');
		expect(prompt).not.toContain('<entity_id></entity_id>');
		expect(prompt).not.toContain('<focus_entity_id></focus_entity_id>');
		expect(prompt).not.toContain('<project_id>none</project_id>');
		expect(prompt).not.toContain('<entity_id>none</entity_id>');
		expect(prompt).not.toContain('<focus_entity_type>none</focus_entity_type>');
		expect(instructionsBlock).toContain(
			'Do not pass `"__TASK_ID_FROM_ABOVE__"`, `"<task_id_uuid>"`, `"REPLACE_ME"`, `"TBD"`, `"none"`, `"null"`, or `"undefined"` in any `*_id` field.'
		);
	});

	it('renders focused entity details only when they exist', () => {
		const prompt = buildMasterPrompt({
			contextType: 'project',
			projectId: 'project-1',
			entityId: 'project-1',
			projectName: 'The Last Ember',
			focusEntityType: 'task',
			focusEntityId: 'task-123',
			focusEntityName: 'Outline chapter 7'
		});
		const contextBlock = extractTagBlock(prompt, 'context');

		expect(contextBlock).toContain('Context type: project entity focus.');
		expect(contextBlock).toContain('<focus_entity>');
		expect(contextBlock).toContain('<focus_entity_type>task</focus_entity_type>');
		expect(contextBlock).toContain('<focus_entity_id>task-123</focus_entity_id>');
		expect(contextBlock).toContain('<focus_entity_name>Outline chapter 7</focus_entity_name>');
	});

	it('does not inject user profile data into the system prompt by default', () => {
		const prompt = buildMasterPrompt({
			contextType: 'global',
			projectId: null,
			entityId: null
		});

		expect(prompt).not.toContain('<user_profile>');
	});

	it('does not inject agent_state into the prompt', () => {
		const prompt = buildMasterPrompt({
			contextType: 'project',
			projectId: 'proj-1',
			entityId: 'proj-1',
			data: {
				doc_structure: {
					version: 1,
					root: [{ id: 'doc-linked', order: 0, title: 'Linked Doc' }]
				},
				documents: [
					{
						id: 'doc-linked',
						title: 'Linked Doc',
						in_doc_structure: true,
						is_unlinked: false
					},
					{
						id: 'doc-unlinked',
						title: 'Unlinked Doc',
						in_doc_structure: false,
						is_unlinked: true
					}
				]
			}
		});

		expect(prompt).not.toContain('<agent_state>');
		expect(prompt).toContain('"id": "doc-unlinked"');
		expect(prompt).not.toContain('"in_doc_structure": true');
	});

	it('includes recent referents in the context block when provided', () => {
		const prompt = buildMasterPrompt({
			contextType: 'global',
			projectId: null,
			entityId: null,
			entityResolutionHint: [
				'Recent exact referents from the prior turn:',
				'- task: Invite Phil to BuildOS (3cdf0778-5301-43da-a899-a67561b4fa73)',
				'If the user clearly refers to one of these entities, reuse its exact id instead of searching again.'
			].join('\n')
		});
		const instructionsBlock = extractTagBlock(prompt, 'instructions');
		const contextBlock = extractTagBlock(prompt, 'context');

		expect(contextBlock).toContain('<recent_referents>');
		expect(contextBlock).toContain(
			'Invite Phil to BuildOS (3cdf0778-5301-43da-a899-a67561b4fa73)'
		);
		expect(instructionsBlock).not.toContain('<recent_referents>');
	});
});
