<!-- apps/web/src/lib/components/ontology/graph/NodeDetailsPanel.svelte -->
<script lang="ts">
	import {
		X,
		ExternalLink,
		Hexagon,
		FolderKanban,
		ListChecks,
		Calendar,
		Target,
		Flag,
		Layers,
		FileText,
		Link2,
		Users
	} from 'lucide-svelte';
	import type { GraphNode } from './lib/graph.types';

	let { node, onClose }: { node: GraphNode | null; onClose: () => void } = $props();

	// Type icons and colors
	const typeConfig: Record<string, { icon: typeof Hexagon; color: string; bgColor: string }> = {
		template: { icon: Hexagon, color: 'text-blue-500', bgColor: 'bg-blue-500/10' },
		project: { icon: FolderKanban, color: 'text-emerald-500', bgColor: 'bg-emerald-500/10' },
		task: { icon: ListChecks, color: 'text-muted-foreground', bgColor: 'bg-muted' },
		plan: { icon: Calendar, color: 'text-indigo-500', bgColor: 'bg-indigo-500/10' },
		goal: { icon: Target, color: 'text-amber-500', bgColor: 'bg-amber-500/10' },
		milestone: { icon: Flag, color: 'text-emerald-500', bgColor: 'bg-emerald-500/10' },
		output: { icon: Layers, color: 'text-purple-500', bgColor: 'bg-purple-500/10' },
		document: { icon: FileText, color: 'text-blue-500', bgColor: 'bg-blue-500/10' }
	};

	const config = $derived(typeConfig[node?.type ?? ''] ?? typeConfig.task);

	// Keys to exclude from metadata display (already shown elsewhere or internal)
	const excludedKeys = new Set([
		'id',
		'label',
		'type',
		'name',
		'title',
		'projectId',
		'project_id',
		'userId',
		'user_id',
		'createdAt',
		'created_at',
		'updatedAt',
		'updated_at'
	]);

	function formatMetadata(metadata: Record<string, unknown> | undefined) {
		if (!metadata) return [];

		return Object.entries(metadata)
			.filter(
				([key, value]) =>
					!excludedKeys.has(key) && value !== null && value !== undefined && value !== ''
			)
			.slice(0, 8) // Limit to 8 properties for density
			.map(([key, value]) => ({
				key: key
					.replace(/([A-Z])/g, ' $1')
					.replace(/_/g, ' ')
					.replace(/^./, (str) => str.toUpperCase())
					.trim(),
				value: formatValue(value),
				isJson: typeof value === 'object' && value !== null
			}));
	}

	function formatValue(value: unknown): string {
		if (typeof value === 'object' && value !== null) {
			return JSON.stringify(value, null, 2);
		}
		const str = String(value);
		return str.length > 100 ? str.slice(0, 100) + '...' : str;
	}

	function readString(
		metadata: Record<string, unknown> | undefined,
		...keys: string[]
	): string | null {
		if (!metadata) return null;
		for (const key of keys) {
			const value = metadata[key];
			if (typeof value === 'string' && value.length > 0) {
				return value;
			}
		}
		return null;
	}

	function getDetailUrl(current: GraphNode | null): string | null {
		if (!current) return null;
		const meta = current.metadata;
		switch (current.type) {
			case 'project':
				return `/projects/${current.id}`;
			case 'task':
			case 'plan':
			case 'goal':
			case 'milestone':
			case 'document': {
				const projectId = readString(meta, 'projectId', 'project_id');
				return projectId ? `/projects/${projectId}` : null;
			}
			case 'output': {
				const projectId = readString(meta, 'projectId', 'project_id');
				return projectId ? `/projects/${projectId}/outputs/${current.id}/edit` : null;
			}
			case 'template': {
				const typeKey = readString(meta, 'typeKey', 'type_key');
				return typeKey ? `/ontology/templates?detail=${encodeURIComponent(typeKey)}` : null;
			}
			default:
				return null;
		}
	}

	const detailUrl = $derived(getDetailUrl(node));
	const metadata = $derived(formatMetadata(node?.metadata));
</script>

<div class="h-full flex flex-col bg-card">
	<!-- Compact Header -->
	<header class="flex items-center gap-2 px-3 py-2 border-b border-border">
		<div
			class="flex items-center justify-center w-8 h-8 rounded-lg {config.bgColor} flex-shrink-0"
		>
			<svelte:component this={config.icon} class="w-4 h-4 {config.color}" />
		</div>
		<div class="flex-1 min-w-0">
			<h2 class="text-sm font-bold text-foreground truncate" title={node?.label}>
				{node?.label ?? 'Untitled'}
			</h2>
			<p class="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
				{node?.type ?? 'unknown'}
			</p>
		</div>
		<button
			type="button"
			class="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition pressable"
			onclick={onClose}
			aria-label="Close details panel"
		>
			<X class="w-4 h-4" />
		</button>
	</header>

	<!-- Stats Row -->
	<div class="flex border-b border-border">
		<div class="flex-1 flex items-center gap-1.5 px-3 py-2 border-r border-border">
			<Link2 class="w-3 h-3 text-muted-foreground" />
			<span class="text-xs font-bold text-foreground">{node?.connectedEdges ?? 0}</span>
			<span class="text-[0.6rem] text-muted-foreground">edges</span>
		</div>
		<div class="flex-1 flex items-center gap-1.5 px-3 py-2">
			<Users class="w-3 h-3 text-muted-foreground" />
			<span class="text-xs font-bold text-foreground">{node?.neighbors ?? 0}</span>
			<span class="text-[0.6rem] text-muted-foreground">neighbors</span>
		</div>
	</div>

	<!-- Scrollable Content -->
	<div class="flex-1 overflow-y-auto">
		<!-- ID -->
		<div class="px-3 py-2 border-b border-border/50 flex items-center justify-between">
			<span class="text-[0.65rem] uppercase tracking-wider text-muted-foreground">ID</span>
			<code
				class="text-[0.6rem] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded"
			>
				{(node?.id ?? '').toString().slice(0, 12)}...
			</code>
		</div>

		<!-- Properties -->
		{#if metadata.length > 0}
			<div class="px-3 py-2">
				<p
					class="text-[0.65rem] uppercase tracking-wider font-bold text-muted-foreground mb-2"
				>
					Properties
				</p>
				<dl class="space-y-1.5">
					{#each metadata as prop (prop.key)}
						<div class="flex items-start gap-2 text-xs">
							<dt
								class="text-muted-foreground flex-shrink-0 w-20 truncate"
								title={prop.key}
							>
								{prop.key}
							</dt>
							<dd class="flex-1 min-w-0">
								{#if prop.isJson}
									<pre
										class="text-[0.6rem] leading-tight text-foreground bg-muted p-1.5 rounded border border-border overflow-x-auto max-h-20">{prop.value}</pre>
								{:else}
									<span class="text-foreground break-words">{prop.value}</span>
								{/if}
							</dd>
						</div>
					{/each}
				</dl>
			</div>
		{:else}
			<div class="px-3 py-4 text-center">
				<p class="text-xs text-muted-foreground">No additional properties</p>
			</div>
		{/if}
	</div>

	<!-- Action Footer -->
	{#if detailUrl}
		<div class="px-3 py-2 border-t border-border">
			<a
				href={detailUrl}
				class="flex items-center justify-center gap-1.5 w-full h-8 text-xs font-bold rounded-lg bg-accent text-accent-foreground hover:bg-accent/90 shadow-ink pressable transition"
			>
				<ExternalLink class="w-3.5 h-3.5" />
				<span>View Details</span>
			</a>
		</div>
	{/if}
</div>
