// apps/worker/src/workers/agentic-chat/toolExecutionGraph.ts
import { createHash } from 'node:crypto';
import type { JsonObject } from '@buildos/shared-types';
import { type JsonValue, canonicalizeAgenticChatJson } from '@buildos/shared-types';

export const AGENTIC_CHAT_TOOL_EXECUTION_PLAN_VERSION_V1 =
	'agentic_chat_tool_execution_plan_v1' as const;

export type AgenticChatToolExecutionCallKindV1 = 'read' | 'mutation';

/**
 * Worker-owned conflict information. The acting model never supplies these
 * keys; adapters/catalog metadata derive them from exact domain arguments.
 */
export type AgenticChatToolExecutionResourceV1 = {
	key: string;
	access: 'read' | 'write';
};

export type AgenticChatToolExecutionCallInputV1 = {
	providerCallIndex: number;
	providerToolCallId: string;
	toolName: string;
	kind: AgenticChatToolExecutionCallKindV1;
	/** Worker policy for high-impact or conservatively unknown-scope calls. */
	executionPolicy?: 'parallel_safe' | 'serial';
	/** Includes optional worker-protocol `call_ref` and `after` sidecar fields. */
	arguments: JsonObject;
	resources?: readonly AgenticChatToolExecutionResourceV1[];
};

export type AgenticChatToolExecutionGraphInputV1 = {
	batchId: string;
	calls: readonly AgenticChatToolExecutionCallInputV1[];
	maxCalls: number;
};

export type AgenticChatToolExecutionEdgeV1 = {
	fromProviderToolCallId: string;
	toProviderToolCallId: string;
	source: 'model_after' | 'worker_conflict';
	conflictKey?: string;
};

export type AgenticChatCompiledToolCallV1 = Omit<
	AgenticChatToolExecutionCallInputV1,
	'arguments'
> & {
	/** Domain-only arguments. Scheduling sidecar fields have been removed. */
	arguments: JsonObject;
	callRef: string | null;
	after: readonly string[];
};

export type AgenticChatToolExecutionLayerV1 = {
	index: number;
	providerToolCallIds: readonly string[];
};

export type AgenticChatToolExecutionGraphV1 = {
	version: typeof AGENTIC_CHAT_TOOL_EXECUTION_PLAN_VERSION_V1;
	batchId: string;
	calls: readonly AgenticChatCompiledToolCallV1[];
	edges: readonly AgenticChatToolExecutionEdgeV1[];
	layers: readonly AgenticChatToolExecutionLayerV1[];
	canonicalPlanSha256: string;
};

export class AgenticChatToolExecutionGraphError extends Error {
	constructor(
		readonly code:
			| 'call_count_exceeded'
			| 'provider_call_index_invalid'
			| 'provider_tool_call_id_duplicate'
			| 'scheduling_metadata_invalid'
			| 'call_ref_duplicate'
			| 'dependency_missing'
			| 'dependency_cycle',
		message: string
	) {
		super(message);
		this.name = 'AgenticChatToolExecutionGraphError';
	}
}

/** Compile one provider response into a deterministic worker-owned DAG. */
export function compileAgenticChatToolExecutionGraphV1(
	input: AgenticChatToolExecutionGraphInputV1
): AgenticChatToolExecutionGraphV1 {
	if (!Number.isSafeInteger(input.maxCalls) || input.maxCalls < 1) {
		throw graphError('call_count_exceeded', 'Tool execution graph maxCalls must be positive');
	}
	if (input.calls.length > input.maxCalls) {
		throw graphError(
			'call_count_exceeded',
			`Tool execution batch contains ${input.calls.length} calls; maximum is ${input.maxCalls}`
		);
	}

	const orderedCalls = [...input.calls].sort(
		(left, right) => left.providerCallIndex - right.providerCallIndex
	);
	const seenProviderIds = new Set<string>();
	const seenCallRefs = new Map<string, string>();
	const compiledCalls: AgenticChatCompiledToolCallV1[] = [];

	for (let index = 0; index < orderedCalls.length; index += 1) {
		const call = orderedCalls[index]!;
		if (call.providerCallIndex !== index) {
			throw graphError(
				'provider_call_index_invalid',
				'Provider call indexes must be unique and contiguous from zero'
			);
		}
		if (!call.providerToolCallId || seenProviderIds.has(call.providerToolCallId)) {
			throw graphError(
				'provider_tool_call_id_duplicate',
				`Provider tool-call id is empty or duplicated: ${call.providerToolCallId}`
			);
		}
		seenProviderIds.add(call.providerToolCallId);

		const { callRef, after, domainArguments } = schedulingMetadata(call.arguments);
		if (callRef) {
			const existing = seenCallRefs.get(callRef);
			if (existing) {
				throw graphError(
					'call_ref_duplicate',
					`Scheduling call_ref ${callRef} is shared by ${existing} and ${call.providerToolCallId}`
				);
			}
			seenCallRefs.set(callRef, call.providerToolCallId);
		}

		compiledCalls.push({
			...call,
			executionPolicy: call.executionPolicy ?? 'parallel_safe',
			arguments: domainArguments,
			resources: normalizeResources(call.resources),
			callRef,
			after
		});
	}

	const edges: AgenticChatToolExecutionEdgeV1[] = [];
	const edgeKeys = new Set<string>();
	const addEdge = (edge: AgenticChatToolExecutionEdgeV1): void => {
		const key = `${edge.fromProviderToolCallId}\u0000${edge.toProviderToolCallId}`;
		if (edgeKeys.has(key)) return;
		edgeKeys.add(key);
		edges.push(edge);
	};

	for (const call of compiledCalls) {
		for (const dependencyRef of call.after) {
			const dependencyId = seenCallRefs.get(dependencyRef);
			if (!dependencyId) {
				throw graphError(
					'dependency_missing',
					`Scheduling dependency ${dependencyRef} does not resolve inside batch ${input.batchId}`
				);
			}
			addEdge({
				fromProviderToolCallId: dependencyId,
				toProviderToolCallId: call.providerToolCallId,
				source: 'model_after'
			});
		}
	}
	assertAcyclic(compiledCalls, edges);

	for (let leftIndex = 0; leftIndex < compiledCalls.length; leftIndex += 1) {
		const left = compiledCalls[leftIndex]!;
		for (let rightIndex = leftIndex + 1; rightIndex < compiledCalls.length; rightIndex += 1) {
			const right = compiledCalls[rightIndex]!;
			const conflictKey = workerConflictKey(left, right);
			if (!conflictKey) continue;
			if (
				hasPath(left.providerToolCallId, right.providerToolCallId, edges) ||
				hasPath(right.providerToolCallId, left.providerToolCallId, edges)
			) {
				continue;
			}
			addEdge({
				fromProviderToolCallId: left.providerToolCallId,
				toProviderToolCallId: right.providerToolCallId,
				source: 'worker_conflict',
				conflictKey
			});
		}
	}
	assertAcyclic(compiledCalls, edges);

	const layers = buildLayers(compiledCalls, edges);
	const canonicalPayload = {
		version: AGENTIC_CHAT_TOOL_EXECUTION_PLAN_VERSION_V1,
		batch_id: input.batchId,
		calls: compiledCalls.map((call) => ({
			provider_call_index: call.providerCallIndex,
			provider_tool_call_id: call.providerToolCallId,
			tool_name: call.toolName,
			kind: call.kind,
			execution_policy: call.executionPolicy,
			arguments: call.arguments,
			resources: call.resources,
			call_ref: call.callRef,
			after: call.after
		})),
		edges,
		layers
	};
	const canonicalPlanSha256 = createHash('sha256')
		.update(canonicalizeAgenticChatJson(canonicalPayload as unknown as JsonValue), 'utf8')
		.digest('hex');

	return {
		version: AGENTIC_CHAT_TOOL_EXECUTION_PLAN_VERSION_V1,
		batchId: input.batchId,
		calls: compiledCalls,
		edges,
		layers,
		canonicalPlanSha256
	};
}

export type AgenticChatToolExecutionResultV1<T> =
	| {
			providerToolCallId: string;
			status: 'fulfilled';
			value: T;
	  }
	| {
			providerToolCallId: string;
			/** The call completed durably but its domain outcome was unsuccessful. */
			status: 'failed';
			value: T;
	  }
	| {
			providerToolCallId: string;
			status: 'rejected';
			error: unknown;
	  }
	| {
			providerToolCallId: string;
			status: 'skipped';
			reason: 'dependency_failed' | 'cancelled';
			blockedBy: readonly string[];
	  };

export type AgenticChatToolExecutionRunV1<T> = {
	results: readonly AgenticChatToolExecutionResultV1<T>[];
	maxObservedConcurrency: number;
	callTimings: readonly AgenticChatToolExecutionCallTimingV1[];
	actualExecutionMs: number;
	estimatedSerialExecutionMs: number;
	parallelSavingsMs: number;
};

export type AgenticChatToolExecutionCallTimingV1 = {
	providerToolCallId: string;
	layerIndex: number;
	startedOffsetMs: number;
	durationMs: number;
};

export type AgenticChatToolExecutionLayerStartV1 = {
	layerIndex: number;
	calls: readonly AgenticChatCompiledToolCallV1[];
	containsMutation: boolean;
};

/**
 * Execute ready layers with bounded fan-out while retaining provider order in
 * the returned result vector.
 */
export function executeAgenticChatToolExecutionGraphV1<T>(_input: {
	graph: AgenticChatToolExecutionGraphV1;
	maxConcurrency: number;
	signal: AbortSignal;
	executeCall(call: AgenticChatCompiledToolCallV1, signal: AbortSignal): Promise<T>;
	/** Domain failures may be values because they still need provider feedback. */
	isSuccessfulResult?(value: T): boolean;
	onBeforeLayer?(layer: AgenticChatToolExecutionLayerStartV1): void | Promise<void>;
}): Promise<AgenticChatToolExecutionRunV1<T>> {
	const input = _input;
	if (!Number.isSafeInteger(input.maxConcurrency) || input.maxConcurrency < 1) {
		return Promise.reject(new Error('Tool execution graph concurrency must be positive'));
	}

	return (async () => {
		const runStartedAt = Date.now();
		const callsById = new Map(
			input.graph.calls.map((call) => [call.providerToolCallId, call] as const)
		);
		const modelDependencies = new Map<string, string[]>();
		for (const edge of input.graph.edges) {
			if (edge.source !== 'model_after') continue;
			const dependencies = modelDependencies.get(edge.toProviderToolCallId) ?? [];
			dependencies.push(edge.fromProviderToolCallId);
			modelDependencies.set(edge.toProviderToolCallId, dependencies);
		}
		const results = new Map<string, AgenticChatToolExecutionResultV1<T>>();
		const callTimings = new Map<string, AgenticChatToolExecutionCallTimingV1>();
		let active = 0;
		let maxObservedConcurrency = 0;

		const cancelRemaining = (): void => {
			for (const call of input.graph.calls) {
				if (results.has(call.providerToolCallId)) continue;
				results.set(call.providerToolCallId, cancelledResult(call.providerToolCallId));
			}
		};

		for (const layer of input.graph.layers) {
			if (input.signal.aborted) {
				cancelRemaining();
				break;
			}
			const readyCalls: AgenticChatCompiledToolCallV1[] = [];
			for (const providerToolCallId of layer.providerToolCallIds) {
				const call = callsById.get(providerToolCallId);
				if (!call)
					throw new Error(
						`Execution graph references unknown call ${providerToolCallId}`
					);
				const failedDependencies = (modelDependencies.get(providerToolCallId) ?? []).filter(
					(dependencyId) => results.get(dependencyId)?.status !== 'fulfilled'
				);
				if (failedDependencies.length > 0) {
					results.set(providerToolCallId, {
						providerToolCallId,
						status: 'skipped',
						reason: 'dependency_failed',
						blockedBy: failedDependencies
					});
					continue;
				}
				readyCalls.push(call);
			}

			if (readyCalls.length === 0) continue;
			await input.onBeforeLayer?.({
				layerIndex: layer.index,
				calls: readyCalls,
				containsMutation: readyCalls.some((call) => call.kind === 'mutation')
			});

			let cursor = 0;
			const worker = async (): Promise<void> => {
				while (cursor < readyCalls.length) {
					if (input.signal.aborted) return;
					const callIndex = cursor;
					cursor += 1;
					const call = readyCalls[callIndex]!;
					const callStartedAt = Date.now();
					active += 1;
					maxObservedConcurrency = Math.max(maxObservedConcurrency, active);
					try {
						const value = await input.executeCall(call, input.signal);
						results.set(call.providerToolCallId, {
							providerToolCallId: call.providerToolCallId,
							status:
								input.isSuccessfulResult?.(value) === false
									? 'failed'
									: 'fulfilled',
							value
						});
					} catch (error) {
						results.set(
							call.providerToolCallId,
							input.signal.aborted
								? cancelledResult(call.providerToolCallId)
								: {
										providerToolCallId: call.providerToolCallId,
										status: 'rejected',
										error
									}
						);
					} finally {
						callTimings.set(call.providerToolCallId, {
							providerToolCallId: call.providerToolCallId,
							layerIndex: layer.index,
							startedOffsetMs: Math.max(0, callStartedAt - runStartedAt),
							durationMs: Math.max(0, Date.now() - callStartedAt)
						});
						active -= 1;
					}
				}
			};
			await Promise.all(
				Array.from({ length: Math.min(input.maxConcurrency, readyCalls.length) }, () =>
					worker()
				)
			);
			if (input.signal.aborted) {
				cancelRemaining();
				break;
			}
		}

		const orderedCallTimings = input.graph.calls.flatMap((call) => {
			const timing = callTimings.get(call.providerToolCallId);
			return timing ? [timing] : [];
		});
		const actualExecutionMs = Math.max(0, Date.now() - runStartedAt);
		const estimatedSerialExecutionMs = orderedCallTimings.reduce(
			(total, timing) => total + timing.durationMs,
			0
		);
		return {
			results: input.graph.calls.map((call) => {
				const executionResult = results.get(call.providerToolCallId);
				if (!executionResult) {
					throw new Error(
						`Execution graph produced no result for ${call.providerToolCallId}`
					);
				}
				return executionResult;
			}),
			maxObservedConcurrency,
			callTimings: orderedCallTimings,
			actualExecutionMs,
			estimatedSerialExecutionMs,
			parallelSavingsMs: Math.max(0, estimatedSerialExecutionMs - actualExecutionMs)
		};
	})();
}

function graphError(
	code: AgenticChatToolExecutionGraphError['code'],
	message: string
): AgenticChatToolExecutionGraphError {
	return new AgenticChatToolExecutionGraphError(code, message);
}

function schedulingMetadata(arguments_: JsonObject): {
	callRef: string | null;
	after: string[];
	domainArguments: JsonObject;
} {
	const rawCallRef = arguments_.call_ref;
	const rawAfter = arguments_.after;
	if (
		rawCallRef !== undefined &&
		(typeof rawCallRef !== 'string' ||
			rawCallRef.length === 0 ||
			rawCallRef !== rawCallRef.trim())
	) {
		throw graphError(
			'scheduling_metadata_invalid',
			'Scheduling call_ref must be a nonempty trimmed string'
		);
	}
	if (rawAfter !== undefined && !Array.isArray(rawAfter)) {
		throw graphError('scheduling_metadata_invalid', 'Scheduling after must be a string array');
	}
	const after = (rawAfter ?? []) as JsonValue[];
	if (
		after.some(
			(value) => typeof value !== 'string' || value.length === 0 || value !== value.trim()
		)
	) {
		throw graphError(
			'scheduling_metadata_invalid',
			'Scheduling after must contain nonempty trimmed strings'
		);
	}
	const stringAfter = after as string[];
	if (new Set(stringAfter).size !== stringAfter.length) {
		throw graphError(
			'scheduling_metadata_invalid',
			'Scheduling after must not contain duplicate references'
		);
	}
	const domainArguments = Object.fromEntries(
		Object.entries(arguments_).filter(([key]) => key !== 'call_ref' && key !== 'after')
	) as JsonObject;
	return {
		callRef: typeof rawCallRef === 'string' ? rawCallRef : null,
		after: stringAfter,
		domainArguments
	};
}

function normalizeResources(
	resources: readonly AgenticChatToolExecutionResourceV1[] | undefined
): AgenticChatToolExecutionResourceV1[] {
	const unique = new Map<string, AgenticChatToolExecutionResourceV1>();
	for (const resource of resources ?? []) {
		const existing = unique.get(resource.key);
		unique.set(resource.key, {
			key: resource.key,
			access: existing?.access === 'write' || resource.access === 'write' ? 'write' : 'read'
		});
	}
	return [...unique.values()].sort((left, right) => left.key.localeCompare(right.key));
}

function workerConflictKey(
	left: AgenticChatCompiledToolCallV1,
	right: AgenticChatCompiledToolCallV1
): string | null {
	if (left.executionPolicy === 'serial' || right.executionPolicy === 'serial') {
		return 'worker:serial_policy';
	}
	const rightResources = new Map(
		(right.resources ?? []).map((resource) => [resource.key, resource.access] as const)
	);
	const conflicts = (left.resources ?? [])
		.filter((resource) => {
			const rightAccess = rightResources.get(resource.key);
			return rightAccess && (resource.access === 'write' || rightAccess === 'write');
		})
		.map((resource) => resource.key)
		.sort((first, second) => first.localeCompare(second));
	return conflicts[0] ?? null;
}

function hasPath(
	from: string,
	to: string,
	edges: readonly AgenticChatToolExecutionEdgeV1[]
): boolean {
	const outgoing = new Map<string, string[]>();
	for (const edge of edges) {
		const targets = outgoing.get(edge.fromProviderToolCallId) ?? [];
		targets.push(edge.toProviderToolCallId);
		outgoing.set(edge.fromProviderToolCallId, targets);
	}
	const pending = [from];
	const seen = new Set<string>();
	while (pending.length > 0) {
		const current = pending.pop()!;
		if (current === to) return true;
		if (seen.has(current)) continue;
		seen.add(current);
		pending.push(...(outgoing.get(current) ?? []));
	}
	return false;
}

function assertAcyclic(
	calls: readonly AgenticChatCompiledToolCallV1[],
	edges: readonly AgenticChatToolExecutionEdgeV1[]
): void {
	const indegree = new Map<string, number>(calls.map((call) => [call.providerToolCallId, 0]));
	const outgoing = new Map<string, string[]>();
	for (const edge of edges) {
		indegree.set(edge.toProviderToolCallId, (indegree.get(edge.toProviderToolCallId) ?? 0) + 1);
		const targets = outgoing.get(edge.fromProviderToolCallId) ?? [];
		targets.push(edge.toProviderToolCallId);
		outgoing.set(edge.fromProviderToolCallId, targets);
	}
	const ready = [...indegree.entries()].filter(([, degree]) => degree === 0).map(([id]) => id);
	let visited = 0;
	while (ready.length > 0) {
		const current = ready.shift()!;
		visited += 1;
		for (const target of outgoing.get(current) ?? []) {
			const nextDegree = (indegree.get(target) ?? 0) - 1;
			indegree.set(target, nextDegree);
			if (nextDegree === 0) ready.push(target);
		}
	}
	if (visited !== calls.length) {
		throw graphError('dependency_cycle', 'Tool execution graph contains a dependency cycle');
	}
}

function buildLayers(
	calls: readonly AgenticChatCompiledToolCallV1[],
	edges: readonly AgenticChatToolExecutionEdgeV1[]
): AgenticChatToolExecutionLayerV1[] {
	const order = new Map(calls.map((call) => [call.providerToolCallId, call.providerCallIndex]));
	const indegree = new Map<string, number>(calls.map((call) => [call.providerToolCallId, 0]));
	const outgoing = new Map<string, string[]>();
	for (const edge of edges) {
		indegree.set(edge.toProviderToolCallId, (indegree.get(edge.toProviderToolCallId) ?? 0) + 1);
		const targets = outgoing.get(edge.fromProviderToolCallId) ?? [];
		targets.push(edge.toProviderToolCallId);
		outgoing.set(edge.fromProviderToolCallId, targets);
	}
	const layers: AgenticChatToolExecutionLayerV1[] = [];
	let ready = calls
		.filter((call) => indegree.get(call.providerToolCallId) === 0)
		.map((call) => call.providerToolCallId);
	while (ready.length > 0) {
		ready.sort((left, right) => (order.get(left) ?? 0) - (order.get(right) ?? 0));
		const currentLayer = ready;
		layers.push({ index: layers.length, providerToolCallIds: currentLayer });
		const next: string[] = [];
		for (const current of currentLayer) {
			for (const target of outgoing.get(current) ?? []) {
				const nextDegree = (indegree.get(target) ?? 0) - 1;
				indegree.set(target, nextDegree);
				if (nextDegree === 0) next.push(target);
			}
		}
		ready = next;
	}
	return layers;
}

function cancelledResult<T>(providerToolCallId: string): AgenticChatToolExecutionResultV1<T> {
	return {
		providerToolCallId,
		status: 'skipped',
		reason: 'cancelled',
		blockedBy: []
	};
}
