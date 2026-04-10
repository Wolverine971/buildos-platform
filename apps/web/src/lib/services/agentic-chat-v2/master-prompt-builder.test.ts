// apps/web/src/lib/services/agentic-chat-v2/master-prompt-builder.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';

const mockEnv = vi.hoisted(() => ({}) as Record<string, string | undefined>);

vi.mock('$env/dynamic/private', () => ({
	env: mockEnv
}));

import { buildMasterPrompt } from './master-prompt-builder';

afterEach(() => {
	delete mockEnv.AGENTIC_CHAT_TOOL_GATEWAY;
});

function extractTagBlock(prompt: string, tag: string): string {
	const match = prompt.match(new RegExp(`<${tag}>[\\s\\S]*?<\\/${tag}>`));
	return match?.[0] ?? '';
}

describe('buildMasterPrompt instruction rewrite', () => {
	it('renders markdown instructions with gateway sections when enabled', () => {
		mockEnv.AGENTIC_CHAT_TOOL_GATEWAY = 'true';

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
		expect(instructionsBlock).toContain('```json');
		expect(instructionsBlock).toContain('"name": "skill_load"');
		expect(instructionsBlock).toContain('"name": "buildos_call"');
		expect(instructionsBlock).not.toContain('"idempotency_key"');
		expect(instructionsBlock).toContain('## Execution Protocol');
		expect(instructionsBlock).toContain(
			'If the workflow is multi-step or easy to get wrong, load the relevant skill first.'
		);
		expect(instructionsBlock).toContain(
			'If the skill or current context already identifies the exact op, skip `tool_search`'
		);
		expect(instructionsBlock).toContain(
			'Good examples: `{"capability":"overview"}`, `{"entity":"task","kind":"write","query":"update existing task state"}`'
		);
		expect(instructionsBlock).toContain(
			'`tool_search` is for discovering which op to use. Query for operations like `"update existing task state"` or `"move document in tree"`'
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
		expect(contextBlock).toContain('<overview_guidance>');
		expect(instructionsBlock).not.toContain('<overview_guidance>');
		expect(contextBlock).toContain(
			'Workspace-wide status -> buildos_call({ op: "util.workspace.overview", args: {} })'
		);
	});

	it('omits overview guidance outside global context', () => {
		mockEnv.AGENTIC_CHAT_TOOL_GATEWAY = 'true';

		const prompt = buildMasterPrompt({
			contextType: 'project',
			projectId: 'project-1',
			entityId: 'project-1'
		});
		const contextBlock = extractTagBlock(prompt, 'context');
		const instructionsBlock = extractTagBlock(prompt, 'instructions');

		expect(contextBlock).not.toContain('<overview_guidance>');
		expect(instructionsBlock).not.toContain('<overview_guidance>');
	});

	it('omits gateway-specific tool sections when gateway mode is disabled', () => {
		mockEnv.AGENTIC_CHAT_TOOL_GATEWAY = 'false';

		const prompt = buildMasterPrompt({
			contextType: 'global',
			projectId: null,
			entityId: null
		});
		const instructionsBlock = extractTagBlock(prompt, 'instructions');

		expect(instructionsBlock).toContain('# BuildOS Agent System Prompt');
		expect(instructionsBlock).toContain('## Capabilities, Skills, and Tools');
		expect(instructionsBlock).toContain(
			'Web research: Search the web, inspect URLs, and pull in current external information when needed.'
		);
		expect(instructionsBlock).not.toContain('### Skill Catalog');
		expect(instructionsBlock).not.toContain('### Tools');
		expect(instructionsBlock).not.toContain('## Execution Protocol');
		expect(instructionsBlock).not.toContain(
			'Use `tool_search` only when the exact op is unknown'
		);
		expect(prompt).not.toContain('<overview_guidance>');
	});

	it('falls back project_id to entity_id for project context', () => {
		mockEnv.AGENTIC_CHAT_TOOL_GATEWAY = 'true';

		const prompt = buildMasterPrompt({
			contextType: 'project',
			projectId: null,
			entityId: '05c40ed8-9dbe-4893-bd64-8aeec90eab40'
		});

		expect(prompt).toContain('<project_id>05c40ed8-9dbe-4893-bd64-8aeec90eab40</project_id>');
	});

	it('adds dedicated project creation workflow guidance in project_create context', () => {
		mockEnv.AGENTIC_CHAT_TOOL_GATEWAY = 'true';

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
		mockEnv.AGENTIC_CHAT_TOOL_GATEWAY = 'true';

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

	it('renders absent ID tags as empty values instead of the string none', () => {
		mockEnv.AGENTIC_CHAT_TOOL_GATEWAY = 'true';

		const prompt = buildMasterPrompt({
			contextType: 'global',
			projectId: null,
			entityId: null,
			focusEntityId: null
		});
		const instructionsBlock = extractTagBlock(prompt, 'instructions');

		expect(prompt).toContain('<project_id></project_id>');
		expect(prompt).toContain('<entity_id></entity_id>');
		expect(prompt).toContain('<focus_entity_id></focus_entity_id>');
		expect(prompt).not.toContain('<project_id>none</project_id>');
		expect(prompt).not.toContain('<entity_id>none</entity_id>');
		expect(instructionsBlock).toContain(
			'Do not pass `"__TASK_ID_FROM_ABOVE__"`, `"<task_id_uuid>"`, `"REPLACE_ME"`, `"TBD"`, `"none"`, `"null"`, or `"undefined"` in any `*_id` field.'
		);
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
		mockEnv.AGENTIC_CHAT_TOOL_GATEWAY = 'true';

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
