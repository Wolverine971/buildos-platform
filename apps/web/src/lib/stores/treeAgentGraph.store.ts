// apps/web/src/lib/stores/treeAgentGraph.store.ts
import { derived, writable } from 'svelte/store';
import type {
	TreeAgentEvent,
	TreeAgentNodeStatus,
	TreeAgentResult,
	TreeAgentRoleState
} from '@buildos/shared-types';

export interface TreeAgentGraphNode {
	id: string;
	parentId?: string;
	title: string;
	reason?: string;
	successCriteria?: string[];
	status: TreeAgentNodeStatus;
	role: TreeAgentRoleState;
	depth: number;
	bandIndex: number;
	stepIndex: number;
	scratchpadDocId?: string;
	artifactIds: string[];
	documentIds: string[];
	result?: TreeAgentResult;
	lastTool?: {
		name: string;
		status: 'running' | 'ok' | 'error';
		phase?: string;
		updatedAt?: string;
	};
	lastSeq: number;
	lastUpdatedAt?: string;
}

export interface TreeAgentGraphEdge {
	id: string;
	source: string;
	target: string;
	kind: 'delegates';
}

interface TreeAgentGraphState {
	runId: string | null;
	nodes: Map<string, TreeAgentGraphNode>;
	edges: Map<string, TreeAgentGraphEdge>;
	lastSeq: number;
}

const initialState: TreeAgentGraphState = {
	runId: null,
	nodes: new Map(),
	edges: new Map(),
	lastSeq: 0
};

function edgeId(source: string, target: string) {
	return `${source}__${target}`;
}

class TreeAgentGraphStore {
	private store = writable<TreeAgentGraphState>(initialState);

	public subscribe = this.store.subscribe;

	public nodes = derived(this.store, ($state) => Array.from($state.nodes.values()));
	public edges = derived(this.store, ($state) => Array.from($state.edges.values()));
	public stats = derived(this.store, ($state) => {
		let active = 0;
		let completed = 0;
		let failed = 0;
		for (const node of $state.nodes.values()) {
			if (node.status === 'completed') completed += 1;
			else if (node.status === 'failed') failed += 1;
			else active += 1;
		}
		return {
			runId: $state.runId,
			lastSeq: $state.lastSeq,
			nodeCount: $state.nodes.size,
			edgeCount: $state.edges.size,
			activeCount: active,
			completedCount: completed,
			failedCount: failed
		};
	});

	public reset(runId: string | null = null) {
		this.store.set({
			runId,
			nodes: new Map(),
			edges: new Map(),
			lastSeq: 0
		});
	}

	public applyEvents(events: TreeAgentEvent[]) {
		for (const event of events) this.applyEvent(event);
	}

	public applyEvent(event: TreeAgentEvent) {
		this.store.update((state) => {
			const nextRunId = state.runId ?? event.runId;
			if (state.runId && state.runId !== event.runId) {
				// Ignore events from other runs to avoid cross-run bleed.
				return state;
			}

			// Skip old or duplicate events.
			if (event.seq <= state.lastSeq) {
				return { ...state, runId: nextRunId };
			}

			const nodes = new Map(state.nodes);
			const edges = new Map(state.edges);
			const current = nodes.get(event.nodeId);
			const baseNode: TreeAgentGraphNode = current ?? {
				id: event.nodeId,
				title: 'Untitled',
				status: 'planning',
				role: 'planner',
				depth: 0,
				bandIndex: 0,
				stepIndex: 0,
				artifactIds: [],
				documentIds: [],
				lastSeq: 0
			};

			switch (event.type) {
				case 'tree.node_created': {
					const parentId = event.payload.parentNodeId;
					const node: TreeAgentGraphNode = {
						...baseNode,
						parentId,
						title: event.payload.title,
						reason: event.payload.reason,
						successCriteria: event.payload.successCriteria,
						depth: event.payload.depth,
						bandIndex: event.payload.bandIndex,
						stepIndex: event.payload.stepIndex,
						lastSeq: event.seq,
						lastUpdatedAt: event.createdAt
					};
					nodes.set(node.id, node);
					if (parentId) {
						const id = edgeId(parentId, node.id);
						edges.set(id, { id, source: parentId, target: node.id, kind: 'delegates' });
					}
					break;
				}
				case 'tree.node_status': {
					const node: TreeAgentGraphNode = {
						...baseNode,
						status: event.payload.status,
						role: event.payload.role,
						lastSeq: event.seq,
						lastUpdatedAt: event.createdAt
					};
					nodes.set(node.id, node);
					break;
				}
				case 'tree.scratchpad_linked': {
					const node: TreeAgentGraphNode = {
						...baseNode,
						scratchpadDocId: event.payload.scratchpadDocId,
						lastSeq: event.seq,
						lastUpdatedAt: event.createdAt
					};
					nodes.set(node.id, node);
					break;
				}
				case 'tree.tool_call_requested': {
					const node: TreeAgentGraphNode = {
						...baseNode,
						lastTool: {
							name: event.payload.toolName,
							status: 'running',
							phase: event.payload.phase ?? baseNode.lastTool?.phase,
							updatedAt: event.payload.startedAt ?? event.createdAt
						},
						lastSeq: event.seq,
						lastUpdatedAt: event.createdAt
					};
					nodes.set(node.id, node);
					break;
				}
				case 'tree.tool_call_result': {
					const node: TreeAgentGraphNode = {
						...baseNode,
						lastTool: {
							name: event.payload.toolName,
							status: event.payload.ok ? 'ok' : 'error',
							phase: event.payload.phase ?? baseNode.lastTool?.phase,
							updatedAt: event.payload.completedAt ?? event.createdAt
						},
						lastSeq: event.seq,
						lastUpdatedAt: event.createdAt
					};
					nodes.set(node.id, node);
					break;
				}
				case 'tree.artifact_created': {
					const nextArtifactIds = baseNode.artifactIds.includes(event.payload.artifactId)
						? baseNode.artifactIds
						: [...baseNode.artifactIds, event.payload.artifactId];
					const nextDocumentIds =
						event.payload.documentId &&
						!baseNode.documentIds.includes(event.payload.documentId)
							? [...baseNode.documentIds, event.payload.documentId]
							: baseNode.documentIds;
					const node: TreeAgentGraphNode = {
						...baseNode,
						artifactIds: nextArtifactIds,
						documentIds: nextDocumentIds,
						lastSeq: event.seq,
						lastUpdatedAt: event.createdAt
					};
					nodes.set(node.id, node);
					break;
				}
				case 'tree.node_result': {
					const node: TreeAgentGraphNode = {
						...baseNode,
						result: event.payload.result,
						artifactIds: event.payload.result.artifactIds ?? baseNode.artifactIds,
						documentIds: event.payload.result.documentIds ?? baseNode.documentIds,
						lastSeq: event.seq,
						lastUpdatedAt: event.createdAt
					};
					nodes.set(node.id, node);
					break;
				}
				case 'tree.node_completed': {
					const node: TreeAgentGraphNode = {
						...baseNode,
						status: 'completed',
						lastSeq: event.seq,
						lastUpdatedAt: event.createdAt
					};
					nodes.set(node.id, node);
					break;
				}
				case 'tree.node_failed': {
					const node: TreeAgentGraphNode = {
						...baseNode,
						status: 'failed',
						lastSeq: event.seq,
						lastUpdatedAt: event.createdAt
					};
					nodes.set(node.id, node);
					break;
				}
				default: {
					// For now we treat other events as metadata-only.
					const node: TreeAgentGraphNode = {
						...baseNode,
						lastSeq: event.seq,
						lastUpdatedAt: event.createdAt
					};
					nodes.set(node.id, node);
				}
			}

			return {
				runId: nextRunId,
				nodes,
				edges,
				lastSeq: event.seq
			};
		});
	}
}

export const treeAgentGraphStore = new TreeAgentGraphStore();
