export type ToolCallAssemblerProfile = 'default' | 'kimi';

export type ToolCallDelta = {
	id?: string;
	index?: number;
	type?: string;
	function?: {
		name?: string;
		arguments?: unknown;
	};
};

type IsCompleteJSON = (value: string) => boolean;

export class ToolCallAssembler {
	private pendingToolCalls = new Map<number, any>();
	private pendingToolCallOrder: number[] = [];
	private pendingToolCallIdToIndex = new Map<string, number>();
	private profile: ToolCallAssemblerProfile;
	private isCompleteJSON: IsCompleteJSON;

	constructor(options: { profile?: ToolCallAssemblerProfile; isCompleteJSON: IsCompleteJSON }) {
		this.profile = options.profile ?? 'default';
		this.isCompleteJSON = options.isCompleteJSON;
	}

	setProfile(profile: ToolCallAssemblerProfile): void {
		this.profile = profile;
	}

	hasPending(): boolean {
		return this.pendingToolCalls.size > 0;
	}

	drain(): any[] {
		const pending = this.pendingToolCallOrder
			.map((index) => this.pendingToolCalls.get(index))
			.filter(Boolean);
		this.clear();
		return pending;
	}

	clear(): void {
		this.pendingToolCalls.clear();
		this.pendingToolCallOrder.length = 0;
		this.pendingToolCallIdToIndex.clear();
	}

	ingest(toolCallDelta: ToolCallDelta): void {
		const index = this.resolveIndex(toolCallDelta);
		let pending = this.pendingToolCalls.get(index);

		if (!pending) {
			pending = {
				id: toolCallDelta.id || `toolcall_${index}`,
				type: 'function',
				function: {
					name: toolCallDelta.function?.name || '',
					arguments: ''
				}
			};
			this.pendingToolCalls.set(index, pending);
			if (!this.pendingToolCallOrder.includes(index)) {
				this.pendingToolCallOrder.push(index);
			}
			if (toolCallDelta.id) {
				this.pendingToolCallIdToIndex.set(toolCallDelta.id, index);
			}
		}

		if (toolCallDelta.id) {
			pending.id = toolCallDelta.id;
			this.pendingToolCallIdToIndex.set(toolCallDelta.id, index);
		}
		if (toolCallDelta.function?.name) {
			pending.function.name = toolCallDelta.function.name;
		}

		const deltaArgs = toolCallDelta.function?.arguments;
		if (typeof deltaArgs === 'string') {
			const nextArgs = deltaArgs;
			if (!pending.function.arguments) {
				pending.function.arguments = nextArgs;
			} else if (this.isCompleteJSON(nextArgs)) {
				const existingComplete = this.isCompleteJSON(pending.function.arguments);
				if (!existingComplete || nextArgs.length >= pending.function.arguments.length) {
					pending.function.arguments = nextArgs;
				} else {
					pending.function.arguments += nextArgs;
				}
			} else {
				pending.function.arguments += nextArgs;
			}
		} else if (deltaArgs && typeof deltaArgs === 'object') {
			try {
				pending.function.arguments = JSON.stringify(deltaArgs);
			} catch {
				// Ignore non-serializable argument payloads
			}
		}
	}

	private resolveIndex(toolCallDelta: ToolCallDelta): number {
		switch (this.profile) {
			case 'kimi':
				return this.resolveIndexDefault(toolCallDelta);
			case 'default':
			default:
				return this.resolveIndexDefault(toolCallDelta);
		}
	}

	private resolveIndexDefault(toolCallDelta: ToolCallDelta): number {
		const explicitIndex =
			typeof toolCallDelta?.index === 'number' ? toolCallDelta.index : undefined;
		const id =
			typeof toolCallDelta?.id === 'string' && toolCallDelta.id ? toolCallDelta.id : undefined;

		if (explicitIndex !== undefined) {
			if (id) {
				this.pendingToolCallIdToIndex.set(id, explicitIndex);
			}
			return explicitIndex;
		}

		if (id) {
			const existing = this.pendingToolCallIdToIndex.get(id);
			if (existing !== undefined) {
				return existing;
			}
			const nextIndex = this.pendingToolCallOrder.length;
			this.pendingToolCallIdToIndex.set(id, nextIndex);
			return nextIndex;
		}

		if (this.pendingToolCallOrder.length > 0) {
			if (this.pendingToolCallOrder.length === 1) {
				return this.pendingToolCallOrder[0];
			}
			const name = toolCallDelta.function?.name;
			if (name) {
				for (let i = this.pendingToolCallOrder.length - 1; i >= 0; i--) {
					const idx = this.pendingToolCallOrder[i];
					const pending = this.pendingToolCalls.get(idx);
					if (!pending?.function?.name || pending.function.name === name) {
						return idx;
					}
				}
			}
			return this.pendingToolCallOrder[this.pendingToolCallOrder.length - 1];
		}

		return this.pendingToolCallOrder.length;
	}
}

export const resolveToolCallAssemblerProfile = (
	provider?: string,
	model?: string
): ToolCallAssemblerProfile => {
	const normalizedProvider = provider?.toLowerCase() ?? '';
	const normalizedModel = model?.toLowerCase() ?? '';

	if (normalizedModel.startsWith('moonshotai/kimi')) {
		return 'kimi';
	}
	if (normalizedProvider.includes('moonshot')) {
		return 'kimi';
	}

	return 'default';
};
