// apps/worker/src/workers/agentic-chat/mutationAdapterRouter.ts
import {
	type AgenticChatMutatingToolPortV1,
	AgenticChatMutationAdapterError
} from './mutation-executor';
import {
	AGENTIC_CHAT_MUTATION_CAPABILITY_TOOLS_V1,
	type AgenticChatCustomMutationAdapterIdV1,
	type AgenticChatProviderMutationCapabilitiesV1,
	reviewedAgenticChatMutationSpecV1
} from './mutationToolCatalog';

type MutationInput = Parameters<AgenticChatMutatingToolPortV1['execute']>[0];
export type AgenticChatMutationAdapterEntry = readonly [string, AgenticChatMutatingToolPortV1];

/** Routes one already-admitted mutation to its independently gated adapter. */
export class AgenticChatMutationAdapterRouter implements AgenticChatMutatingToolPortV1 {
	private readonly adapters: ReadonlyMap<string, AgenticChatMutatingToolPortV1>;

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
				new AgenticChatMutationAdapterError(
					'known_failed',
					'mutation_adapter_not_allowlisted',
					`No mutation adapter is enabled for ${input.toolName}`
				)
			);
		}
		return adapter.execute(input);
	}
}

/**
 * The capability filter: turn the enabled capability map into the routable
 * tool set. Every enabled tool resolves from its reviewed execution row —
 * `executor: 'table'` shares the one table-driven adapter, `executor: 'custom'`
 * names its constructor — so rollout selection stays in the catalog and no
 * caller hand-maintains a per-tool registration list.
 */
export function selectAgenticChatMutationAdapterEntriesV1(input: {
	capabilities: AgenticChatProviderMutationCapabilitiesV1;
	tableAdapter: () => AgenticChatMutatingToolPortV1;
	customAdapters: Readonly<
		Record<AgenticChatCustomMutationAdapterIdV1, () => AgenticChatMutatingToolPortV1>
	>;
}): AgenticChatMutationAdapterEntry[] {
	const entries: AgenticChatMutationAdapterEntry[] = [];
	let tableAdapter: AgenticChatMutatingToolPortV1 | null = null;

	for (const [capability, toolName] of AGENTIC_CHAT_MUTATION_CAPABILITY_TOOLS_V1) {
		if (!input.capabilities[capability]) continue;
		const execution = reviewedAgenticChatMutationSpecV1(toolName)?.execution;
		if (!execution) {
			throw new Error(`Agentic Chat mutation ${toolName} has no reviewed execution row`);
		}
		if (execution.executor === 'custom') {
			entries.push([toolName, input.customAdapters[execution.adapter]()]);
			continue;
		}
		tableAdapter ??= input.tableAdapter();
		entries.push([toolName, tableAdapter]);
	}
	return entries;
}
