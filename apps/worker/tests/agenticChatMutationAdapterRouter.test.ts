import { describe, expect, it, vi } from 'vitest';
import {
	AgenticChatMutationAdapterRouter,
	selectAgenticChatMutationAdapterEntriesV1
} from '../src/workers/agentic-chat/mutationAdapterRouter';
import {
	AGENTIC_CHAT_MUTATION_SURFACE_AUDIT_V1,
	ALL_AGENTIC_CHAT_MUTATION_CAPABILITIES_V1,
	normalizeAgenticChatMutationCapabilitiesV1
} from '../src/workers/agentic-chat/mutationToolCatalog';

describe('AgenticChatMutationAdapterRouter', () => {
	it('dispatches by admitted tool name and rejects missing adapters', async () => {
		const execute = vi.fn(async () => ({ ok: true }));
		const router = new AgenticChatMutationAdapterRouter([
			['create_onto_task', { execute } as never]
		]);
		const input = { toolName: 'create_onto_task' } as never;

		await expect(router.execute(input)).resolves.toEqual({ ok: true });
		expect(execute).toHaveBeenCalledWith(input);
		await expect(
			router.execute({ toolName: 'update_onto_task' } as never)
		).rejects.toMatchObject({
			disposition: 'known_failed',
			failureCode: 'mutation_adapter_not_allowlisted'
		});
	});

	it('rejects duplicate tool registrations', () => {
		const adapter = { execute: vi.fn() } as never;
		expect(
			() =>
				new AgenticChatMutationAdapterRouter([
					['create_onto_task', adapter],
					['create_onto_task', adapter]
				])
		).toThrow('duplicate tool names');
	});
});

describe('selectAgenticChatMutationAdapterEntriesV1', () => {
	function ports() {
		const tableAdapter = { execute: vi.fn() } as never;
		const createProject = { execute: vi.fn() } as never;
		const delegate = { execute: vi.fn() } as never;
		return {
			tableAdapter: vi.fn(() => tableAdapter),
			customAdapters: {
				create_onto_project: vi.fn(() => createProject),
				delegate_task: vi.fn(() => delegate)
			},
			instances: { tableAdapter, createProject, delegate }
		};
	}

	it('installs nothing when no capability is enabled', () => {
		const { tableAdapter, customAdapters } = ports();

		expect(
			selectAgenticChatMutationAdapterEntriesV1({
				capabilities: normalizeAgenticChatMutationCapabilitiesV1(undefined),
				tableAdapter,
				customAdapters
			})
		).toEqual([]);
		expect(tableAdapter).not.toHaveBeenCalled();
	});

	it('shares one table adapter across every enabled table row', () => {
		const { tableAdapter, customAdapters, instances } = ports();

		const entries = selectAgenticChatMutationAdapterEntriesV1({
			capabilities: normalizeAgenticChatMutationCapabilitiesV1({
				createOntoTask: true,
				updateOntoTask: true,
				updateOntoGoal: true
			}),
			tableAdapter,
			customAdapters
		});

		expect(entries.map(([toolName]) => toolName).sort()).toEqual([
			'create_onto_task',
			'update_onto_goal',
			'update_onto_task'
		]);
		expect(tableAdapter).toHaveBeenCalledOnce();
		expect(entries.every(([, adapter]) => adapter === instances.tableAdapter)).toBe(true);
	});

	it('routes the two remaining custom rows to their named constructors', () => {
		const { tableAdapter, customAdapters, instances } = ports();

		const entries = selectAgenticChatMutationAdapterEntriesV1({
			capabilities: normalizeAgenticChatMutationCapabilitiesV1({
				createOntoProject: true,
				delegateTask: true
			}),
			tableAdapter,
			customAdapters
		});

		expect(entries).toEqual([
			['create_onto_project', instances.createProject],
			['delegate_task', instances.delegate]
		]);
		expect(tableAdapter).not.toHaveBeenCalled();
	});

	it('covers every reviewed capability when all are enabled', () => {
		const { tableAdapter, customAdapters } = ports();

		const entries = selectAgenticChatMutationAdapterEntriesV1({
			capabilities: ALL_AGENTIC_CHAT_MUTATION_CAPABILITIES_V1,
			tableAdapter,
			customAdapters
		});

		expect(entries.map(([toolName]) => toolName).sort()).toEqual(
			[...AGENTIC_CHAT_MUTATION_SURFACE_AUDIT_V1.reviewedToolNames].sort()
		);
	});
});
