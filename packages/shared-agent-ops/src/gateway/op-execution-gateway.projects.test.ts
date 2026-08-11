import { beforeEach, describe, expect, it, vi } from 'vitest';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';

const existingProject = {
	id: PROJECT_ID,
	name: 'Fixture project',
	description: 'Old description',
	state_key: 'planning',
	start_at: null,
	end_at: null,
	props: {
		retained: true,
		preferences: { system: true },
		agent_workspace: { domain_profile: 'fiction_story' }
	}
};

const mocks = vi.hoisted(() => ({
	loadCoreEntityForAccess: vi.fn(),
	logUpdate: vi.fn(async () => undefined)
}));

vi.mock('./op-execution-gateway.entity-access', async (importOriginal) => ({
	...(await importOriginal<typeof import('./op-execution-gateway.entity-access')>()),
	loadCoreEntityForAccess: mocks.loadCoreEntityForAccess
}));

vi.mock('../ops/async-activity-logger', () => ({
	logUpdateAsync: mocks.logUpdate
}));

import { ONTO_PROJECT_MUTATION_SELECT } from './op-execution-gateway.config';
import { updateProject } from './op-execution-gateway.projects';

function context(admin: unknown) {
	return {
		admin,
		userId: USER_ID,
		scope: {
			mode: 'read_write',
			allowed_ops: [],
			project_ids: [PROJECT_ID],
			write_project_ids: [PROJECT_ID]
		}
	} as never;
}

describe('project gateway update parity', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.loadCoreEntityForAccess.mockResolvedValue({
			kind: 'project',
			entity: existingProject,
			project: { id: PROJECT_ID, name: 'Fixture project' },
			projectId: PROJECT_ID
		});
	});

	it('merges sanitized props, normalizes blank description, and returns the public row', async () => {
		const updatePayloads: Record<string, unknown>[] = [];
		const selected: string[] = [];
		const query = {
			update: vi.fn((payload: Record<string, unknown>) => {
				updatePayloads.push(payload);
				return {
					eq: () => ({
						select: (columns: string) => {
							selected.push(columns);
							return {
								single: async () => ({
									data: {
										...existingProject,
										...payload,
										facet_stage: 'execution'
									},
									error: null
								})
							};
						}
					})
				};
			})
		};
		const admin = { from: vi.fn(() => query) };

		const result = await updateProject(context(admin), {
			project_id: PROJECT_ID,
			description: '   ',
			state_key: 'active',
			props: {
				color: 'blue',
				preferences: { overwrite: true },
				agent_workspace: { mode: 'living_reference' }
			}
		});

		expect(updatePayloads[0]).toMatchObject({
			description: null,
			state_key: 'active',
			props: {
				retained: true,
				color: 'blue',
				preferences: { system: true },
				agent_workspace: { domain_profile: 'fiction_story' }
			}
		});
		expect(selected).toEqual([ONTO_PROJECT_MUTATION_SELECT]);
		expect(mocks.logUpdate).toHaveBeenCalledOnce();
		expect(result).toMatchObject({
			project: {
				id: PROJECT_ID,
				description: null,
				state_key: 'active',
				facet_stage: 'execution',
				props: {
					retained: true,
					color: 'blue',
					agent_workspace: { domain_profile: 'fiction_story' }
				}
			},
			message: 'Updated ontology project "Fixture project".'
		});
		expect(JSON.stringify(result)).not.toContain('preferences');
	});

	it('rejects a props-only patch when every supplied key is server-owned', async () => {
		const admin = { from: vi.fn() };

		await expect(
			updateProject(context(admin), {
				project_id: PROJECT_ID,
				props: {
					preferences: { hidden: true },
					agent_workspace: { mode: 'living_reference' }
				}
			})
		).rejects.toMatchObject({
			code: 'VALIDATION_ERROR',
			message: 'At least one writable project field is required'
		});
		expect(admin.from).not.toHaveBeenCalled();
		expect(mocks.logUpdate).not.toHaveBeenCalled();
	});
});
