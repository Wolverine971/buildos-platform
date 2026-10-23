// packages/shared-agent-ops/src/gateway/op-execution-gateway.access-wall.test.ts
import { describe, expect, it } from 'vitest';
import {
	ACCESS_WALL,
	buildAccessNeeded,
	effectiveMemberAgentAccess,
	explainAccessWall
} from './op-execution-gateway.access-wall';
import { ExternalToolGatewayError } from './op-execution-gateway.responses';

const PROJECT = '11111111-1111-4111-8111-111111111111';

describe('buildAccessNeeded', () => {
	it('never names a project the connection cannot read, and links the person (wall 1)', () => {
		const wall = buildAccessNeeded({
			wall: ACCESS_WALL.projectNotGranted,
			projectId: PROJECT,
			ownerName: 'Sam'
		});
		expect(wall).toEqual({
			wall: 'project_not_granted',
			who_can_fix: 'you',
			project_id: PROJECT,
			next: { open_url: null },
			link: 'grant',
			say_to_user:
				"That project isn't connected to me yet. Tap the link to let me in, then I'll try again."
		});
	});

	it('offers to ask the owner for owner walls, after the person says yes (walls 3 to 5)', () => {
		const off = buildAccessNeeded({
			wall: ACCESS_WALL.ownerTurnedAgentsOff,
			projectId: PROJECT,
			ownerName: 'Sam',
			need: 'agents_write'
		});
		expect(off).toMatchObject({
			who_can_fix: 'owner',
			owner_name: 'Sam',
			need: 'agents_write',
			next: {
				tool: 'request_project_access',
				args: { project_id: PROJECT, need: 'agents_write' },
				ask_your_person_first: true
			}
		});
		expect(off).not.toHaveProperty('project_name');
		expect(off.say_to_user).toBe(
			"Sam turned off agents for you in that project, so I can't open it. Only Sam can turn them back on. Want me to ask Sam?"
		);

		const viewer = buildAccessNeeded({
			wall: ACCESS_WALL.viewerOnly,
			projectId: PROJECT,
			projectName: '9takes',
			need: 'edit'
		});
		expect(viewer.project_name).toBe('9takes');
		expect(viewer.say_to_user).toContain('ask the owner to make you an editor');
	});

	it('tells an OAuth connection to reconnect, and a key to tap (wall 2)', () => {
		expect(
			buildAccessNeeded({
				wall: ACCESS_WALL.connectionReadOnly,
				projectId: null,
				connectionReadOnly: true,
				viaOAuth: true
			}).say_to_user
		).toMatch(
			/^You connected me without permission to make changes\. Open the link to reconnect/
		);
		const key = buildAccessNeeded({
			wall: ACCESS_WALL.connectionReadOnly,
			projectId: PROJECT,
			projectName: '9takes',
			connectionReadOnly: false
		});
		expect(key).toMatchObject({ link: 'allow_writes', next: { open_url: null } });
		expect(key.say_to_user).toContain('"9takes"');
	});

	it('rules ask nobody (walls 6 and 7)', () => {
		const lane = buildAccessNeeded({
			wall: ACCESS_WALL.outsideGuestLane,
			projectId: PROJECT,
			projectName: '9takes',
			ownerName: 'Sam'
		});
		expect(lane).toMatchObject({ who_can_fix: 'nobody', next: null });
		expect(lane.say_to_user).toContain('ask Sam to assign it to you');
		const archive = buildAccessNeeded({
			wall: ACCESS_WALL.outsideGuestLane,
			projectId: PROJECT,
			projectName: '9takes',
			archive: true
		});
		expect(archive.say_to_user).toContain("can't archive or restore");
		const ownerItems = buildAccessNeeded({
			wall: ACCESS_WALL.outsideGuestLane,
			projectId: PROJECT,
			projectName: '9takes',
			ownerName: 'Sam',
			ownerItems: true
		});
		expect(ownerItems).toMatchObject({ who_can_fix: 'nobody', next: null });
		expect(ownerItems.say_to_user).toContain('Goals, plans, and the rest stay with Sam');
		expect(ownerItems.say_to_user).not.toContain('assign it to you');
		const cap = buildAccessNeeded({ wall: ACCESS_WALL.dailyLimit, projectId: PROJECT });
		expect(cap.say_to_user).toMatch(/paused until tomorrow\. The owner was told/);
	});
});

describe('effectiveMemberAgentAccess', () => {
	it('lifts editors to write under standing approval, never viewers, and Off always wins', () => {
		const editor = { role_key: 'editor', access: 'write' };
		expect(effectiveMemberAgentAccess({ ...editor, agent_access: 'read' }, false)).toBe('read');
		expect(effectiveMemberAgentAccess({ ...editor, agent_access: 'read' }, true)).toBe('write');
		expect(effectiveMemberAgentAccess({ ...editor, agent_access: 'off' }, true)).toBe('off');
		expect(
			effectiveMemberAgentAccess(
				{ role_key: 'viewer', access: 'read', agent_access: 'read' },
				true
			)
		).toBe('read');
		expect(effectiveMemberAgentAccess({ ...editor, agent_access: null }, true)).toBe('off');
	});
});

describe('explainAccessWall', () => {
	const context = { admin: {}, userId: 'user-1', scope: { mode: 'read_write' as const } };

	it('passes through anything it cannot explain without touching the database', async () => {
		const notFound = new ExternalToolGatewayError('NOT_FOUND', 'Task not found');
		expect(await explainAccessWall(context, 'onto.task.get', notFound)).toBe(notFound);
		const noProject = new ExternalToolGatewayError('FORBIDDEN', 'No', { reason: 'other' });
		expect(await explainAccessWall(context, 'onto.task.get', noProject)).toBe(noProject);
		const explained = new ExternalToolGatewayError('FORBIDDEN', 'No', {
			reason: 'write_not_granted',
			project_id: PROJECT,
			access_needed: { wall: 'viewer_only' }
		});
		expect(await explainAccessWall(context, 'onto.task.create', explained)).toBe(explained);
	});

	it('leaves the refusal as it was when a lookup fails', async () => {
		const admin = {
			rpc: async () => ({ data: null, error: { message: 'boom' } }),
			from: () => {
				throw new Error('boom');
			}
		};
		const error = new ExternalToolGatewayError('FORBIDDEN', 'No', {
			reason: 'write_not_granted',
			project_id: PROJECT
		});
		expect(await explainAccessWall({ ...context, admin }, 'onto.task.create', error)).toBe(
			error
		);
	});
});
