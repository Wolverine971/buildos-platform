// apps/web/src/lib/components/projects/desktop/desktop-rules.test.ts
import { describe, expect, it } from 'vitest';
import type { ProjectListSummary } from '../project-list';
import {
	groupDesktop,
	indexProjects,
	isOnDesktop,
	monogram,
	relativeDay,
	shortName
} from './desktop-model';
import { confirmCopy, dropVerdict } from './desktop-rules';

function project(id: string, overrides: Partial<ProjectListSummary> = {}): ProjectListSummary {
	return {
		id,
		name: id,
		description: null,
		icon_svg: null,
		icon_concept: null,
		icon_generated_at: null,
		icon_generation_source: null,
		icon_generation_prompt: null,
		type_key: 'project.business.consulting',
		state_key: 'active',
		props: {},
		facet_context: null,
		facet_scale: null,
		facet_stage: null,
		created_at: '2026-09-01T00:00:00Z',
		updated_at: '2026-09-20T00:00:00Z',
		task_count: 0,
		goal_count: 0,
		plan_count: 0,
		document_count: 0,
		owner_actor_id: 'actor',
		access_role: 'owner',
		access_level: 'admin',
		is_shared: false,
		next_step_short: null,
		next_step_long: null,
		next_step_source: null,
		next_step_updated_at: null,
		has_collaborators: false,
		parent_project_id: null,
		...overrides
	};
}

const hub = project('hub', { name: 'Wayne Strategies', updated_at: '2026-09-10T00:00:00Z' });
const redline = project('redline', {
	name: 'Redline Training Company Website',
	parent_project_id: 'hub',
	updated_at: '2026-09-30T00:00:00Z'
});
const uxm = project('uxm', { name: 'UXM Training Website', updated_at: '2026-09-05T00:00:00Z' });
const shared = project('shared', {
	name: 'Shared Plan',
	access_level: 'read',
	state_key: 'paused'
});
const editor = project('editor', { name: 'Editor Project', access_level: 'write' });
const index = indexProjects([hub, redline, uxm, shared, editor]);

describe('desktop model', () => {
	it('keeps sub-projects inside their parent and lifts busy folders', () => {
		expect(isOnDesktop(redline, index)).toBe(false);
		expect(isOnDesktop(hub, index)).toBe(true);
		const tops = [hub, uxm, shared, editor].filter((p) => isOnDesktop(p, index));
		// The hub's own update is old, but Redline inside it was touched last.
		expect(groupDesktop(tops, index, 'recent')[0]!.projects[0]!.id).toBe('hub');
		expect(index.children.get('hub')!.map((p) => p.id)).toEqual(['redline']);
	});

	it('groups by activity in a fixed order and drops empty groups', () => {
		const pulses: Record<string, 'moving' | 'parked' | null> = {
			hub: 'parked',
			uxm: 'moving',
			shared: null
		};
		const groups = groupDesktop([hub, uxm, shared], index, 'activity', (p) => pulses[p.id]!);
		expect(groups.map((g) => [g.key, g.projects.map((p) => p.id)])).toEqual([
			['moving', ['uxm']],
			['parked', ['hub']],
			['unknown', ['shared']]
		]);
	});

	it('draws stable monograms and short names', () => {
		expect(monogram('The Cadre Content Operations')).toBe('CC');
		expect(monogram('9takes')).toBe('9T');
		expect(monogram('Libri')).toBe('LI');
		expect(shortName('Specialist Pilot Smoke — Synthetic Sep 20')).toBe(
			'Specialist Pilot Smoke'
		);
		expect(relativeDay('2026-09-28T12:00:00Z', Date.parse('2026-10-01T12:00:00Z'))).toBe(
			'3 days ago'
		);
	});
});

describe('drop rules', () => {
	it('nests a top-level project into another top-level project', () => {
		expect(
			dropVerdict({ kind: 'project', id: 'uxm' }, { kind: 'project', id: 'hub' }, index)
		).toEqual({ ok: true, action: 'nest', targetId: 'hub' });
	});

	it('moves a sub-project to another parent and takes it out to the top level', () => {
		expect(
			dropVerdict({ kind: 'project', id: 'redline' }, { kind: 'project', id: 'uxm' }, index)
		).toEqual({ ok: true, action: 'renest', targetId: 'uxm' });
		expect(dropVerdict({ kind: 'project', id: 'redline' }, { kind: 'desktop' }, index)).toEqual(
			{
				ok: true,
				action: 'unnest',
				targetId: null
			}
		);
	});

	it('stays quiet where nothing would change', () => {
		expect(dropVerdict({ kind: 'project', id: 'uxm' }, { kind: 'desktop' }, index)).toBeNull();
		expect(
			dropVerdict({ kind: 'project', id: 'redline' }, { kind: 'project', id: 'hub' }, index)
		).toBeNull();
		expect(
			dropVerdict({ kind: 'project', id: 'hub' }, { kind: 'project', id: 'hub' }, index)
		).toBeNull();
		expect(
			dropVerdict(
				{ kind: 'document', id: 'd', projectId: 'uxm' },
				{ kind: 'project', id: 'uxm' },
				index
			)
		).toBeNull();
	});

	it('explains the one-level rule from both sides', () => {
		expect(
			dropVerdict({ kind: 'project', id: 'uxm' }, { kind: 'project', id: 'redline' }, index)
		).toEqual({
			ok: false,
			reason: 'Redline Training Company Website is inside Wayne Strategies. Projects nest one level deep.'
		});
		expect(
			dropVerdict({ kind: 'project', id: 'hub' }, { kind: 'project', id: 'uxm' }, index)
		).toEqual({
			ok: false,
			reason: 'Wayne Strategies holds projects, so it stays at the top level.'
		});
	});

	it('requires admin on both projects to nest, and edit access to receive docs or tasks', () => {
		expect(
			dropVerdict({ kind: 'project', id: 'uxm' }, { kind: 'project', id: 'editor' }, index)
		).toMatchObject({
			ok: false,
			reason: expect.stringContaining('needs admin access on both')
		});
		expect(
			dropVerdict(
				{ kind: 'task', id: 't', projectId: 'uxm' },
				{ kind: 'project', id: 'shared' },
				index
			)
		).toEqual({ ok: false, reason: 'You can view Shared Plan but not add to it.' });
		expect(
			dropVerdict(
				{ kind: 'document', id: 'd', projectId: 'uxm' },
				{ kind: 'project', id: 'editor' },
				index
			)
		).toEqual({ ok: true, action: 'move', targetId: 'editor' });
		expect(
			dropVerdict({ kind: 'document', id: 'd', projectId: 'uxm' }, { kind: 'desktop' }, index)
		).toEqual({ ok: false, reason: 'Docs and tasks belong to a project.' });
	});

	it('writes the confirm in plain words', () => {
		expect(
			confirmCopy({ kind: 'project', id: 'uxm' }, 'nest', index, { targetId: 'hub' })
		).toEqual({
			title: 'Put UXM Training Website inside Wayne Strategies?',
			body: "It shows under Wayne Strategies and can read Wayne Strategies's shared docs. People invited only to UXM Training Website still can't see Wayne Strategies.",
			cta: 'Move inside'
		});
		expect(
			confirmCopy({ kind: 'project', id: 'redline' }, 'unnest', index, { targetId: null })
				.title
		).toBe('Take Redline Training Company Website out of Wayne Strategies?');
		expect(
			confirmCopy({ kind: 'document', id: 'd', projectId: 'uxm' }, 'move', index, {
				title: 'Rate card',
				targetId: 'hub',
				nestedCount: 2
			}).body
		).toBe('Its 2 nested docs move with it. Links keep working.');
	});
});
