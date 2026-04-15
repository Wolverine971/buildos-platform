// apps/web/src/lib/components/agent/agent-chat-skill-activity.test.ts
import { describe, expect, it } from 'vitest';
import type { SkillActivityEvent } from '@buildos/shared-types';
import type { ActivityEntry } from './agent-chat.types';
import {
	extractSkillPathFromSkillLoadArgs,
	formatSkillActivityContent,
	upsertSkillActivityEntries
} from './agent-chat-skill-activity';

function buildEvent(action: SkillActivityEvent['action'], path = 'onto.project.create.skill') {
	return {
		type: 'skill_activity' as const,
		action,
		path,
		via: 'skill_load' as const
	};
}

describe('agent chat skill activity helpers', () => {
	it('formats skill activity labels', () => {
		expect(formatSkillActivityContent(buildEvent('requested'))).toBe(
			'Loading skill onto.project.create.skill'
		);
		expect(formatSkillActivityContent(buildEvent('loaded'))).toBe(
			'Skill onto.project.create.skill loaded'
		);
	});

	it('extracts skill ids from skill_load arguments', () => {
		expect(
			extractSkillPathFromSkillLoadArgs(JSON.stringify({ skill: 'libri_knowledge' }))
		).toBe('libri_knowledge');
		expect(extractSkillPathFromSkillLoadArgs({ id: 'document_workspace' })).toBe(
			'document_workspace'
		);
		expect(extractSkillPathFromSkillLoadArgs('{bad json')).toBeNull();
	});

	it('replaces a requested entry with the loaded state on the same line', () => {
		const requested = buildEvent('requested');
		const loaded = buildEvent('loaded');
		const requestedActivities = upsertSkillActivityEntries([], requested, {
			createId: () => 'skill-1',
			now: new Date('2026-04-08T10:00:00.000Z')
		});

		const nextActivities = upsertSkillActivityEntries(requestedActivities, loaded, {
			createId: () => 'skill-2',
			now: new Date('2026-04-08T10:00:05.000Z')
		});

		expect(nextActivities).toHaveLength(1);
		expect(nextActivities[0]).toMatchObject({
			id: 'skill-1',
			content: 'Skill onto.project.create.skill loaded',
			status: 'completed'
		});
		expect(nextActivities[0]?.metadata?.skillAction).toBe('loaded');
		expect(nextActivities[0]?.timestamp).toEqual(new Date('2026-04-08T10:00:00.000Z'));
	});

	it('appends a fresh requested entry after a prior load completed', () => {
		const firstPass: ActivityEntry[] = upsertSkillActivityEntries([], buildEvent('requested'), {
			createId: () => 'skill-1',
			now: new Date('2026-04-08T10:00:00.000Z')
		});
		const completedPass = upsertSkillActivityEntries(firstPass, buildEvent('loaded'), {
			createId: () => 'skill-2',
			now: new Date('2026-04-08T10:00:05.000Z')
		});

		const retriedActivities = upsertSkillActivityEntries(
			completedPass,
			buildEvent('requested'),
			{
				createId: () => 'skill-3',
				now: new Date('2026-04-08T10:01:00.000Z')
			}
		);

		expect(retriedActivities).toHaveLength(2);
		expect(retriedActivities[0]).toMatchObject({
			id: 'skill-1',
			content: 'Skill onto.project.create.skill loaded',
			status: 'completed'
		});
		expect(retriedActivities[1]).toMatchObject({
			id: 'skill-3',
			content: 'Loading skill onto.project.create.skill',
			status: 'pending'
		});
	});

	it('updates an existing skill_load tool activity instead of appending a duplicate', () => {
		const activities: ActivityEntry[] = [
			{
				id: 'tool-1',
				content: 'Loading skill libri_knowledge',
				timestamp: new Date('2026-04-08T10:00:00.000Z'),
				activityType: 'tool_call',
				status: 'pending',
				toolCallId: 'call-1',
				metadata: {
					toolName: 'skill_load',
					arguments: JSON.stringify({ skill: 'libri_knowledge' }),
					status: 'pending'
				}
			}
		];

		const nextActivities = upsertSkillActivityEntries(
			activities,
			buildEvent('loaded', 'libri_knowledge'),
			{
				createId: () => 'skill-1',
				now: new Date('2026-04-08T10:00:05.000Z')
			}
		);

		expect(nextActivities).toHaveLength(1);
		expect(nextActivities[0]).toMatchObject({
			id: 'tool-1',
			content: 'Skill libri_knowledge loaded',
			activityType: 'tool_call',
			status: 'completed',
			toolCallId: 'call-1'
		});
		expect(nextActivities[0]?.metadata).toMatchObject({
			toolName: 'skill_load',
			skillPath: 'libri_knowledge',
			skillVia: 'skill_load',
			skillAction: 'loaded'
		});
	});
});
