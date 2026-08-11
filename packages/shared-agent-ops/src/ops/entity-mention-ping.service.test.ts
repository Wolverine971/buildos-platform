import { beforeEach, describe, expect, it, vi } from 'vitest';

const { ensureActorIdMock, notifyEntityMentionsAddedMock } = vi.hoisted(() => ({
	ensureActorIdMock: vi.fn(),
	notifyEntityMentionsAddedMock: vi.fn()
}));

vi.mock('../ontology/ontology-projects.service', () => ({
	ensureActorId: ensureActorIdMock
}));

vi.mock('./entity-mention-notification.service', () => ({
	notifyEntityMentionsAdded: notifyEntityMentionsAddedMock
}));

import {
	EntityMentionPingServiceError,
	buildEntityMentionPingToolResult,
	pingOntoEntity
} from './entity-mention-ping.service';

const PROJECT_ID = '10000000-0000-4000-8000-000000000001';
const ENTITY_ID = '20000000-0000-4000-8000-000000000002';
const ACTOR_ID = '30000000-0000-4000-8000-000000000003';
const OWNER_ACTOR_ID = '40000000-0000-4000-8000-000000000004';
const USER_ID = '50000000-0000-4000-8000-000000000005';
const RECIPIENT_ID = '60000000-0000-4000-8000-000000000006';
const RECIPIENT_ACTOR_ID = '70000000-0000-4000-8000-000000000007';

class QueryBuilderMock implements PromiseLike<{ data: any; error: any }> {
	constructor(
		private readonly table: string,
		private readonly responses: Record<string, { data: any; error: any }>
	) {}

	select() {
		return this;
	}
	eq() {
		return this;
	}
	is() {
		return this;
	}
	in() {
		return this;
	}
	maybeSingle() {
		return Promise.resolve(this.responses[this.table] ?? { data: null, error: null });
	}
	then<TResult1 = { data: any; error: any }, TResult2 = never>(
		onfulfilled?:
			| ((value: { data: any; error: any }) => TResult1 | PromiseLike<TResult1>)
			| null,
		onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
	): PromiseLike<TResult1 | TResult2> {
		return Promise.resolve(this.responses[this.table] ?? { data: null, error: null }).then(
			onfulfilled,
			onrejected
		);
	}
}

function client(options: { access?: boolean; memberActorIds?: string[] } = {}) {
	const responses = {
		onto_projects: {
			data: { id: PROJECT_ID, name: 'Launch', created_by: OWNER_ACTOR_ID },
			error: null
		},
		onto_tasks: {
			data: { id: ENTITY_ID, project_id: PROJECT_ID, title: 'Review launch' },
			error: null
		},
		onto_actors: {
			data: [{ id: RECIPIENT_ACTOR_ID, user_id: RECIPIENT_ID }],
			error: null
		},
		onto_project_members: {
			data: (options.memberActorIds ?? [RECIPIENT_ACTOR_ID]).map((actor_id) => ({
				actor_id
			})),
			error: null
		}
	};
	return {
		rpc: vi.fn(async () => ({ data: options.access ?? true, error: null })),
		from: vi.fn((table: string) => new QueryBuilderMock(table, responses))
	};
}

describe('entity mention ping service', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		ensureActorIdMock.mockResolvedValue(ACTOR_ID);
		notifyEntityMentionsAddedMock.mockResolvedValue({ notifiedUserIds: [RECIPIENT_ID] });
	});

	it('uses authenticated access and returns an exact notification receipt', async () => {
		const supabase = client();
		const result = await pingOntoEntity({
			client: supabase as never,
			projectId: PROJECT_ID,
			entityType: 'task',
			entityId: ENTITY_ID,
			mentionedUserIds: [RECIPIENT_ID],
			messageSuffix: ' Please review. ',
			source: 'agent_ping',
			caller: { kind: 'authenticated', userId: USER_ID, actorDisplayName: 'DJ' }
		});

		expect(supabase.rpc).toHaveBeenCalledWith('current_actor_has_project_member_access', {
			p_project_id: PROJECT_ID,
			p_required_access: 'write'
		});
		expect(notifyEntityMentionsAddedMock).toHaveBeenCalledOnce();
		expect(notifyEntityMentionsAddedMock).toHaveBeenCalledWith(
			expect.objectContaining({
				projectId: PROJECT_ID,
				entityType: 'task',
				entityId: ENTITY_ID,
				actorUserId: USER_ID,
				actorDisplayName: 'DJ',
				mentionedUserIds: [RECIPIENT_ID],
				messageSuffix: 'Please review.'
			})
		);
		expect(result).toEqual({
			project_id: PROJECT_ID,
			entity_type: 'task',
			entity_id: ENTITY_ID,
			mentioned_user_ids: [RECIPIENT_ID],
			notified_user_ids: [RECIPIENT_ID]
		});
		expect(buildEntityMentionPingToolResult(result)).toMatchObject({
			message: 'Tagged 1 collaborator on the task.'
		});
	});

	it('uses the actor-explicit access RPC for a service-role worker', async () => {
		const supabase = client();
		await pingOntoEntity({
			client: supabase as never,
			projectId: PROJECT_ID,
			entityType: 'task',
			entityId: ENTITY_ID,
			mentionedUserIds: [RECIPIENT_ID],
			source: 'agent_ping',
			caller: { kind: 'worker', userId: USER_ID }
		});

		expect(supabase.rpc).toHaveBeenCalledWith('actor_has_project_member_access', {
			p_actor_id: ACTOR_ID,
			p_project_id: PROJECT_ID,
			p_required_access: 'write'
		});
		expect(notifyEntityMentionsAddedMock).toHaveBeenCalledWith(
			expect.objectContaining({ actorDisplayName: 'BuildOS agent' })
		);
	});

	it('fails before dispatch for access or membership rejection', async () => {
		await expect(
			pingOntoEntity({
				client: client({ access: false }) as never,
				projectId: PROJECT_ID,
				entityType: 'task',
				entityId: ENTITY_ID,
				mentionedUserIds: [RECIPIENT_ID],
				source: 'agent_ping',
				caller: { kind: 'worker', userId: USER_ID }
			})
		).rejects.toMatchObject({
			code: 'access_denied',
			disposition: 'known_failed'
		} satisfies Partial<EntityMentionPingServiceError>);

		await expect(
			pingOntoEntity({
				client: client({ memberActorIds: [] }) as never,
				projectId: PROJECT_ID,
				entityType: 'task',
				entityId: ENTITY_ID,
				mentionedUserIds: [RECIPIENT_ID],
				source: 'agent_ping',
				caller: { kind: 'worker', userId: USER_ID }
			})
		).rejects.toMatchObject({
			code: 'ineligible_recipients',
			disposition: 'known_failed'
		} satisfies Partial<EntityMentionPingServiceError>);

		const throwingClient = client();
		throwingClient.rpc.mockRejectedValueOnce(new Error('database unavailable'));
		await expect(
			pingOntoEntity({
				client: throwingClient as never,
				projectId: PROJECT_ID,
				entityType: 'task',
				entityId: ENTITY_ID,
				mentionedUserIds: [RECIPIENT_ID],
				source: 'agent_ping',
				caller: { kind: 'worker', userId: USER_ID }
			})
		).rejects.toMatchObject({
			code: 'database_error',
			disposition: 'known_failed'
		} satisfies Partial<EntityMentionPingServiceError>);
		expect(notifyEntityMentionsAddedMock).not.toHaveBeenCalled();
	});

	it('marks incomplete delivery as uncertain after the one allowed attempt', async () => {
		notifyEntityMentionsAddedMock.mockResolvedValueOnce({ notifiedUserIds: [] });

		await expect(
			pingOntoEntity({
				client: client() as never,
				projectId: PROJECT_ID,
				entityType: 'task',
				entityId: ENTITY_ID,
				mentionedUserIds: [RECIPIENT_ID],
				source: 'agent_ping',
				caller: { kind: 'worker', userId: USER_ID }
			})
		).rejects.toMatchObject({
			code: 'delivery_incomplete',
			disposition: 'outcome_uncertain'
		} satisfies Partial<EntityMentionPingServiceError>);
		expect(notifyEntityMentionsAddedMock).toHaveBeenCalledOnce();
	});
});
