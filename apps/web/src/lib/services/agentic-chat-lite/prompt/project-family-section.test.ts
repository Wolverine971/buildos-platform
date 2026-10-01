// apps/web/src/lib/services/agentic-chat-lite/prompt/project-family-section.test.ts
//
// Project hierarchy, phase 1. A child project's chat knows its parent and can
// open the parent's shared docs by document id; a hub's chat sees its
// sub-projects. Nothing renders for a project outside a hierarchy, and the
// section renders for stewards too.
import { describe, expect, it } from 'vitest';
import type { ProjectFamilyV1 } from '@buildos/shared-types';
import type { ProjectStewardPacket } from '@buildos/agentic-chat-runtime/context';
import { getGatewaySurfaceForContextType } from '@buildos/agentic-chat-runtime/catalog';
import {
	buildWorkerPromptScaffold,
	resolveWorkerPromptTools
} from '$lib/services/agentic-chat-v2/worker-prompt-surface';
import { buildLitePromptEnvelope } from './index';
import {
	PROJECT_FAMILY_SECTION_MAX_CHARS,
	buildProjectFamilySection
} from './project-family-section';

const WORKER_TOOLS = resolveWorkerPromptTools(getGatewaySurfaceForContextType('project')).tools;
const WORKER_SCAFFOLD = buildWorkerPromptScaffold({});
const NOW = '2026-09-30T16:00:00Z';
const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const PARENT_ID = '22222222-2222-4222-8222-222222222222';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function childFamily(shelfCount = 3): ProjectFamilyV1 {
	return {
		project_id: PROJECT_ID,
		parent: {
			id: PARENT_ID,
			name: 'Wayne Strategies',
			state_key: 'active',
			can_write: true,
			shared_folder_document_id: uuid(999),
			child_count: 5,
			can_detach: false
		},
		shelf: Array.from({ length: shelfCount }, (_, index) => ({
			id: uuid(index + 1),
			title: index === 1 ? 'Rate card' : `Shared doc ${index + 1}`,
			description: null,
			type_key: 'document.default',
			state_key: 'draft',
			updated_at: '2026-09-29T00:00:00Z',
			tree_parent_id: index === 1 ? uuid(1) : null,
			depth: index === 1 ? 1 : 0
		})),
		children: [],
		own_shared_folder_document_id: null,
		child_count: 0
	};
}

function hubFamily(childCount = 3): ProjectFamilyV1 {
	return {
		project_id: PARENT_ID,
		parent: null,
		shelf: [],
		children: Array.from({ length: childCount }, (_, index) => ({
			id: uuid(100 + index),
			name: index === 0 ? 'Redline' : `Client ${index + 1}`,
			state_key: index === 2 ? null : 'active',
			next_step_short: index === 0 ? 'Send the Q4 proposal' : null,
			updated_at: '2026-09-28T00:00:00Z',
			can_detach: false
		})),
		own_shared_folder_document_id: uuid(999),
		child_count: childCount + 1
	};
}

function stewardPacket(): ProjectStewardPacket {
	return {
		version: 1,
		computed_at: NOW,
		charter: {
			text: 'Purpose: keep Redline moving and keep its record true.',
			approved_at: '2026-09-26T12:00:00Z',
			document_id: 'doc-charter',
			pending_edits_at: null
		},
		facts: {
			goals: [],
			goals_omitted: 0,
			other_milestones: [],
			other_plans: [],
			other_plans_completed: 0,
			tasks: {
				open: 1,
				todo: 1,
				in_progress: 0,
				blocked: 0,
				done: 0,
				overdue: 0,
				oldest_overdue_due_at: null,
				done_last_7_days: 0,
				unlinked_open: 1
			},
			in_progress: [],
			blocked: [],
			upcoming: [],
			changes_last_7_days: { total: 0, by_source: [], latest: [] },
			document_updated_at: {}
		}
	} as ProjectStewardPacket;
}

function envelopeFor(family: ProjectFamilyV1 | null, steward: ProjectStewardPacket | null = null) {
	return buildLitePromptEnvelope({
		contextType: 'project',
		entityId: PROJECT_ID,
		projectId: PROJECT_ID,
		projectName: 'Redline',
		now: NOW,
		timezone: 'America/New_York',
		tools: WORKER_TOOLS,
		scaffold: WORKER_SCAFFOLD,
		data: {
			project: {
				id: PROJECT_ID,
				name: 'Redline',
				state_key: 'active',
				description: 'Client engagement.',
				next_step_short: null,
				updated_at: '2026-09-29T12:00:00Z'
			},
			doc_structure: {
				version: 1,
				root: [
					{ id: 'doc-local', type: 'doc', order: 0, title: 'Kickoff notes', children: [] }
				]
			},
			goals: [],
			milestones: [],
			plans: [],
			tasks: [],
			documents: [],
			events: [],
			members: [],
			...(steward ? { steward } : {}),
			...(family ? { project_family: family } : {})
		}
	});
}

describe('project family prompt section', () => {
	it('tells a child where it sits and lists the shared docs to open by document id', () => {
		const section = buildProjectFamilySection('project', { project_family: childFamily() })!;
		expect(section.id).toBe('project_family');
		expect(section.content).toContain(`Part of Wayne Strategies [${PARENT_ID}].`);
		expect(section.content).toContain(
			'Shared docs, owned by Wayne Strategies and shown in 5 sub-projects (edits go through a confirm card):'
		);
		expect(section.content).toContain(`- Shared doc 1 [${uuid(1)}]`);
		// Nested shelf docs indent under their folder.
		expect(section.content).toContain(`\n  - Rate card [${uuid(2)}]`);
		// Consent is the click on the confirm card, never typed text.
		expect(section.content).toContain('chooses Update shared doc, Copy here, or Cancel');
		expect(section.content).toContain('Never ask them to type yes, claim it is done, or repeat the edit');
		expect(section.content).not.toContain('confirmation_token');
		// The gateway admits single shelf docs, not the parent's lists or search.
		expect(section.content).not.toContain('project_id');
		expect(section.content).not.toContain('more');
	});
	it('keeps the parent copy read-only when the viewer cannot edit the parent', () => {
		const family = childFamily();
		family.parent!.can_write = false;
		const section = buildProjectFamilySection('project', { project_family: family })!;
		expect(section.content).toContain('(read-only)');
		expect(section.content).toContain('You cannot edit the parent’s copy');
		expect(section.content).not.toContain('confirmation_token');
	});

	it('says so when the parent shares nothing yet', () => {
		const section = buildProjectFamilySection('project', {
			project_family: childFamily(0)
		})!;
		expect(section.content).toBe(
			`Part of Wayne Strategies [${PARENT_ID}].\nWayne Strategies shares no docs with its sub-projects yet.`
		);
	});

	it('shows a hub its sub-projects with state and next step', () => {
		const section = buildProjectFamilySection('project', { project_family: hubFamily() })!;
		expect(section.content).toBe(
			[
				'Inside this project:',
				`- Redline (active) — next: Send the Q4 proposal [${uuid(100)}]`,
				`- Client 2 (active) [${uuid(101)}]`,
				`- Client 3 [${uuid(102)}]`,
				"When a question needs one, read it by passing its project_id. Don't write into a sub-project from here."
			].join('\n')
		);
	});

	it('caps long shelves and hubs at the line limits and the char budget', () => {
		const shelf = buildProjectFamilySection('project', {
			project_family: childFamily(40)
		})!;
		expect(shelf.content.length).toBeLessThanOrEqual(PROJECT_FAMILY_SECTION_MAX_CHARS);
		expect(shelf.slots).toMatchObject({ shelfShown: 12, shelfOmitted: 28 });
		expect(shelf.content).toContain('+28 more');

		const longTitles = childFamily(40);
		longTitles.shelf = longTitles.shelf.map((doc) => ({ ...doc, title: 'T'.repeat(300) }));
		const longShelf = buildProjectFamilySection('project', { project_family: longTitles })!;
		expect(longShelf.content.length).toBeLessThanOrEqual(PROJECT_FAMILY_SECTION_MAX_CHARS);
		expect(longShelf.content).toMatch(/\+\d+ more/);
		expect(longShelf.content).toContain('Read by document id');

		const hub = buildProjectFamilySection('project', { project_family: hubFamily(25) })!;
		expect(hub.content.length).toBeLessThanOrEqual(PROJECT_FAMILY_SECTION_MAX_CHARS);
		expect(hub.slots).toMatchObject({ childrenShown: 10, childrenOmitted: 15 });
		expect(hub.content).toContain('+15 more');
	});

	it('renders nothing outside a hierarchy, off project chat, or for a malformed family', () => {
		expect(buildProjectFamilySection('project', {})).toBeNull();
		expect(buildProjectFamilySection('project', { project_family: null })).toBeNull();
		expect(
			buildProjectFamilySection('project', {
				project_family: { ...hubFamily(0), child_count: 3 }
			})
		).toBeNull();
		expect(buildProjectFamilySection('project', { project_family: { shelf: [] } })).toBeNull();
		expect(buildProjectFamilySection('global', { project_family: childFamily() })).toBeNull();
	});

	it('adds one section after the Knowledge Map, and nothing without a family', () => {
		const without = envelopeFor(null);
		expect(without.sections.map((s) => s.id)).not.toContain('project_family');

		const withFamily = envelopeFor(childFamily());
		const ids = withFamily.sections.map((s) => s.id);
		expect(ids.indexOf('project_family')).toBe(ids.indexOf('project_knowledge_map') + 1);
		expect(withFamily.systemPrompt).toContain('## Project Hierarchy');
		// Each shelf doc id renders once: the family is not re-dumped elsewhere.
		expect(withFamily.systemPrompt.split(uuid(1)).length - 1).toBe(1);
		const added = withFamily.systemPrompt.length - without.systemPrompt.length;
		expect(added).toBeLessThanOrEqual(
			PROJECT_FAMILY_SECTION_MAX_CHARS + '\n\n## Project Hierarchy\n\n'.length
		);
	});

	it('renders for a steward, who drops the Knowledge Map but keeps the hierarchy', () => {
		const envelope = envelopeFor(childFamily(), stewardPacket());
		const ids = envelope.sections.map((s) => s.id);
		expect(ids).toContain('steward_charter');
		expect(ids).not.toContain('project_knowledge_map');
		expect(ids).toContain('project_family');
		expect(envelope.systemPrompt).toContain(`Part of Wayne Strategies [${PARENT_ID}].`);

		const hub = envelopeFor(hubFamily(), stewardPacket());
		expect(hub.systemPrompt).toContain('Inside this project:');
	});
});
