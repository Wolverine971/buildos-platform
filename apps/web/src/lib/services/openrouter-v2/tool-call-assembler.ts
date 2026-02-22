// apps/web/src/lib/services/openrouter-v2/tool-call-assembler.ts

import type { OpenRouterToolCall, OpenRouterToolCallDelta } from './types';

function stringifyToolArgs(value: unknown): string {
	if (typeof value === 'string') {
		return value;
	}
	if (value === undefined || value === null) {
		return '';
	}
	try {
		return JSON.stringify(value);
	} catch {
		return '';
	}
}

export class ToolCallAssembler {
	private pendingByIndex = new Map<number, OpenRouterToolCall>();
	private order: number[] = [];
	private indexById = new Map<string, number>();

	ingest(delta: OpenRouterToolCallDelta): void {
		const index = this.resolveIndex(delta);
		let pending = this.pendingByIndex.get(index);

		if (!pending) {
			pending = {
				id: delta.id || `toolcall_${index}`,
				type: 'function',
				function: {
					name: '',
					arguments: ''
				}
			};
			this.pendingByIndex.set(index, pending);
			this.order.push(index);
		}

		if (delta.id) {
			pending.id = delta.id;
			this.indexById.set(delta.id, index);
		}

		if (delta.function?.name) {
			pending.function.name = delta.function.name;
		}

		const nextArgs = stringifyToolArgs(delta.function?.arguments);
		if (nextArgs.length > 0) {
			pending.function.arguments += nextArgs;
		}
	}

	hasPending(): boolean {
		return this.order.length > 0;
	}

	drain(): OpenRouterToolCall[] {
		const calls = this.order
			.map((index) => this.pendingByIndex.get(index))
			.filter(Boolean) as OpenRouterToolCall[];
		this.clear();
		return calls;
	}

	clear(): void {
		this.pendingByIndex.clear();
		this.order = [];
		this.indexById.clear();
	}

	private resolveIndex(delta: OpenRouterToolCallDelta): number {
		if (typeof delta.index === 'number') {
			if (delta.id) {
				this.indexById.set(delta.id, delta.index);
			}
			return delta.index;
		}

		if (delta.id) {
			const existing = this.indexById.get(delta.id);
			if (typeof existing === 'number') {
				return existing;
			}
			const next = this.order.length;
			this.indexById.set(delta.id, next);
			return next;
		}

		if (this.order.length === 0) {
			return 0;
		}

		const lastIndex = this.order[this.order.length - 1];
		return typeof lastIndex === 'number' ? lastIndex : 0;
	}
}

export function isValidJsonObject(value: string): boolean {
	const trimmed = value.trim();
	if (!trimmed) return false;
	try {
		JSON.parse(trimmed);
		return true;
	} catch {
		return false;
	}
}
