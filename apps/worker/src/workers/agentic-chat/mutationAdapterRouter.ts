import {
	type AgenticChatFixtureMutatingToolPortV1,
	AgenticChatFixtureMutationAdapterError
} from './fixtureMutationExecutor';

type MutationInput = Parameters<AgenticChatFixtureMutatingToolPortV1['execute']>[0];
export type AgenticChatMutationAdapterEntry = readonly [
	string,
	AgenticChatFixtureMutatingToolPortV1
];

/** Routes one already-admitted mutation to its independently gated adapter. */
export class AgenticChatMutationAdapterRouter implements AgenticChatFixtureMutatingToolPortV1 {
	private readonly adapters: ReadonlyMap<string, AgenticChatFixtureMutatingToolPortV1>;

	constructor(entries: ReadonlyArray<AgenticChatMutationAdapterEntry>) {
		this.adapters = new Map(entries);
		if (this.adapters.size !== entries.length) {
			throw new Error('Mutation adapter router contains duplicate tool names');
		}
	}

	execute(input: MutationInput) {
		const adapter = this.adapters.get(input.toolName);
		if (!adapter) {
			return Promise.reject(
				new AgenticChatFixtureMutationAdapterError(
					'known_failed',
					'mutation_adapter_not_allowlisted',
					`No mutation adapter is enabled for ${input.toolName}`
				)
			);
		}
		return adapter.execute(input);
	}
}
