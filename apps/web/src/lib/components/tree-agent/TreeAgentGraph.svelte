<!-- apps/web/src/lib/components/tree-agent/TreeAgentGraph.svelte -->
<script lang="ts">
	import cytoscape from 'cytoscape';
	import dagre from 'cytoscape-dagre';
	import {
		normalizeTreeAgentEvent,
		type TreeAgentEventRow,
		type TreeAgentNodeStatus
	} from '@buildos/shared-types';
	import { supabase as browserSupabase } from '$lib/supabase';
	import { TreeAgentRealtimeService } from '$lib/services/treeAgentRealtime.service';
	import {
		treeAgentGraphStore,
		type TreeAgentGraphEdge,
		type TreeAgentGraphNode
	} from '$lib/stores/treeAgentGraph.store';

	// Register Cytoscape plugins once
	const CYTOSCAPE_PLUGINS_KEY = '__buildos_tree_agent_cytoscape_registered__';
	if (!(cytoscape as any)[CYTOSCAPE_PLUGINS_KEY]) {
		cytoscape.use(dagre);
		(cytoscape as any)[CYTOSCAPE_PLUGINS_KEY] = true;
	}

	interface Props {
		runId: string;
		contextType?: 'global' | 'project';
		projectName?: string;
	}

	let { runId, contextType = 'global', projectName }: Props = $props();

	let container: HTMLElement;
	let cy: cytoscape.Core | null = null;
	let nodes = $state<TreeAgentGraphNode[]>([]);
	let edges = $state<TreeAgentGraphEdge[]>([]);
	let layoutTimer: ReturnType<typeof setTimeout> | null = null;
	let unsubscribeNodes: (() => void) | null = null;
	let unsubscribeEdges: (() => void) | null = null;

	function statusPalette(status: TreeAgentNodeStatus) {
		// Inkprint semantic colors mapped to status states
		// tx-bloom: creation/planning (orange)
		// tx-grain: execution/active (amber)
		// tx-pulse: waiting/urgent (blue)
		// tx-frame: completed/canonical (green)
		// tx-static: failed/error (red)
		// tx-thread: blocked/waiting (slate)
		switch (status) {
			case 'planning':
			case 'delegating':
				return { bg: '#ffedd5', border: '#ea580c' }; // tx-bloom: warm, ideation
			case 'executing':
				return { bg: '#fef3c7', border: '#d97706' }; // tx-grain: active work, amber
			case 'aggregating':
				return { bg: '#e0f2fe', border: '#0284c7' }; // tx-pulse: coordination, blue
			case 'waiting':
				return { bg: '#e2e8f0', border: '#64748b' }; // tx-thread: dependencies, slate
			case 'completed':
				return { bg: '#dcfce7', border: '#16a34a' }; // tx-frame: canonical, green
			case 'failed':
				return { bg: '#fee2e2', border: '#dc2626' }; // tx-static: error, red
			case 'blocked':
				return { bg: '#fde68a', border: '#b45309' }; // tx-pulse: blocker, amber
			default:
				return { bg: '#f1f5f9', border: '#64748b' }; // neutral
		}
	}

	function toCyNode(node: TreeAgentGraphNode): cytoscape.ElementDefinition {
		const palette = statusPalette(node.status);
		const toolLine = node.lastTool
			? `TOOL: ${node.lastTool.name} [${node.lastTool.status.toUpperCase()}]`
			: null;
		const label = [node.title, node.status.toUpperCase(), toolLine].filter(Boolean).join('\n');
		return {
			data: {
				id: node.id,
				label,
				status: node.status,
				role: node.role,
				toolStatus: node.lastTool?.status ?? null,
				bg: palette.bg,
				border: palette.border
			}
		};
	}

	function toCyEdge(edge: TreeAgentGraphEdge): cytoscape.ElementDefinition {
		return {
			data: {
				id: edge.id,
				source: edge.source,
				target: edge.target
			}
		};
	}

	function scheduleLayout() {
		if (!cy) return;
		if (layoutTimer) clearTimeout(layoutTimer);
		layoutTimer = setTimeout(() => {
			if (!cy) return;
			cy.layout({
				name: 'dagre',
				rankDir: 'TB',
				nodeSep: 40,
				rankSep: 60,
				animate: true,
				animationDuration: 300
			} as any).run();
			layoutTimer = null;
		}, 250);
	}

	function syncGraph() {
		if (!cy) return;

		const nextNodes = new Map(nodes.map((n) => [n.id, toCyNode(n)]));
		const nextEdges = new Map(edges.map((e) => [e.id, toCyEdge(e)]));

		cy.batch(() => {
			// Upsert nodes
			for (const [id, def] of nextNodes.entries()) {
				const existing = cy!.getElementById(id);
				if (existing.length > 0) {
					existing.data(def.data as any);
				} else {
					cy!.add(def);
				}
			}
			// Remove stale nodes
			cy!.nodes().forEach((node) => {
				if (!nextNodes.has(node.id())) node.remove();
			});

			// Upsert edges
			for (const [id, def] of nextEdges.entries()) {
				const existing = cy!.getElementById(id);
				if (existing.length > 0) {
					existing.data(def.data as any);
				} else {
					cy!.add(def);
				}
			}
			// Remove stale edges
			cy!.edges().forEach((edge) => {
				if (!nextEdges.has(edge.id())) edge.remove();
			});
		});

		scheduleLayout();
	}

	async function loadInitialEvents() {
		// Reset store before applying events to avoid state inconsistency
		treeAgentGraphStore.reset(runId);

		const res = await fetch(`/api/tree-agent/runs/${runId}?include_events=true`);
		const json = await res.json().catch(() => null);
		const rows = (json?.data?.events ?? []) as TreeAgentEventRow[];
		if (!rows.length) return;

		const events = rows
			.map(normalizeTreeAgentEvent)
			.filter((e): e is NonNullable<typeof e> => Boolean(e))
			.sort((a, b) => a.seq - b.seq);

		treeAgentGraphStore.applyEvents(events);
	}

	function initializeCytoscape() {
		if (cy) {
			cy.destroy();
			cy = null;
		}

		cy = cytoscape({
			container,
			elements: [],
			style: [
				{
					selector: 'node',
					style: {
						shape: 'round-rectangle',
						width: 120,
						height: 70,
						'background-color': 'data(bg)',
						'border-color': 'data(border)',
						'border-width': 3,
						label: 'data(label)',
						'font-size': 10,
						'font-family': 'system-ui, sans-serif',
						'text-wrap': 'wrap',
						'text-max-width': '110px',
						color: '#0f172a', // Semantic: text-foreground
						'text-valign': 'center',
						'text-halign': 'center'
					}
				},
				{
					selector: 'edge',
					style: {
						width: 2,
						'line-color': '#cbd5e1', // Semantic: border-border (slate-200)
						'target-arrow-color': '#cbd5e1', // Match edge color
						'target-arrow-shape': 'triangle',
						'curve-style': 'bezier'
					}
				},
				{
					selector: 'node[status = "planning"], node[status = "delegating"]',
					style: {
						'border-style': 'dashed'
					}
				},
				{
					selector: 'node[status = "failed"]',
					style: {
						'border-width': 4
					}
				}
			],
			layout: { name: 'dagre', rankDir: 'TB' } as any,
			minZoom: 0.2,
			maxZoom: 3
		});
	}

	$effect(() => {
		// Initialize on mount
		initializeCytoscape();

		// Async initialization - non-blocking
		(async () => {
			await loadInitialEvents();
			if (browserSupabase) {
				await TreeAgentRealtimeService.initialize(runId, browserSupabase);
			}
		})();

		// Subscribe to store changes
		unsubscribeNodes = treeAgentGraphStore.nodes.subscribe((value) => {
			nodes = value;
			syncGraph();
		});
		unsubscribeEdges = treeAgentGraphStore.edges.subscribe((value) => {
			edges = value;
			syncGraph();
		});

		// Cleanup on destroy
		return () => {
			if (layoutTimer) clearTimeout(layoutTimer);
			unsubscribeNodes?.();
			unsubscribeEdges?.();
			TreeAgentRealtimeService.cleanup();
			if (cy) cy.destroy();
			cy = null;
		};
	});
</script>

<div class="flex flex-col w-full h-full bg-background">
	<!-- Context Indicator Banner -->
	{#if contextType === 'project' && projectName}
		<div class="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/30 tx tx-frame tx-weak wt-paper">
			<span class="text-lg">📁</span>
			<span class="text-sm font-medium text-foreground">Project-Scoped Context:</span>
			<span class="text-sm font-semibold text-foreground">{projectName}</span>
		</div>
	{:else if contextType === 'project'}
		<div class="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/30 tx tx-frame tx-weak wt-paper">
			<span class="text-lg">📁</span>
			<span class="text-sm font-medium text-foreground">Project-Scoped Context</span>
		</div>
	{:else if contextType === 'global'}
		<div class="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/30 tx tx-frame tx-weak wt-paper">
			<span class="text-lg">🌐</span>
			<span class="text-sm font-medium text-foreground">Global Context</span>
		</div>
	{/if}

	<!-- Graph Container -->
	<div bind:this={container} class="tree-agent-graph flex-1 w-full bg-background"></div>
</div>

<style>
	.tree-agent-graph {
		touch-action: pan-x pan-y pinch-zoom;
		-webkit-user-select: none;
		user-select: none;
	}
</style>
