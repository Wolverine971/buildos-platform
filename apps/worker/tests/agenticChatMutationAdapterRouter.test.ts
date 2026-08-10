import { describe, expect, it, vi } from 'vitest';
import { AgenticChatMutationAdapterRouter } from '../src/workers/agentic-chat/mutationAdapterRouter';

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
