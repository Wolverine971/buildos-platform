<!-- apps/web/src/lib/components/homework/WorkspaceTreeNode.svelte -->
<script lang="ts">
	import { FileText, FolderOpen, Notebook, GitBranch } from 'lucide-svelte';

	interface Props {
		node: {
			id: string;
			title: string;
			type_key?: string;
			state_key?: string;
			created_at?: string;
			updated_at?: string;
			props?: Record<string, any>;
			children?: any[];
		};
		onOpenDocument?: (nodeId: string) => void;
	}

	let { node, onOpenDocument }: Props = $props();

	let isExpanded = $state(true);

	// Extract doc_role from props for visual hints
	const docRole = $derived(node.props?.doc_role as string | undefined);
	const branchId = $derived(node.props?.branch_id as string | undefined);

	// Determine if this is an executor scratchpad
	const isExecutorScratchpad = $derived(docRole === 'scratchpad_exec');
	const isScratchpad = $derived(docRole === 'scratchpad' || docRole === 'scratchpad_exec');
	const isWorkspace = $derived(docRole === 'workspace');

	// Get display title with role suffix for executor scratchpads
	const displayTitle = $derived(isExecutorScratchpad ? `${node.title} (exec)` : node.title);

	// Get role badge text
	const roleBadge = $derived.by(() => {
		if (docRole === 'workspace') return 'workspace';
		if (docRole === 'scratchpad') return 'scratchpad';
		if (docRole === 'scratchpad_exec') return 'executor';
		return null;
	});

	// Get role badge styling
	const roleBadgeClass = $derived.by(() => {
		if (docRole === 'workspace')
			return 'bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300';
		if (docRole === 'scratchpad')
			return 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300';
		if (docRole === 'scratchpad_exec')
			return 'bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300';
		return 'bg-muted text-muted-foreground';
	});

	// Get icon background styling based on role
	const iconBgClass = $derived.by(() => {
		if (docRole === 'workspace') return 'bg-blue-500/10';
		if (docRole === 'scratchpad') return 'bg-emerald-500/10';
		if (docRole === 'scratchpad_exec') return 'bg-purple-500/10';
		return 'bg-accent/10';
	});

	// Get icon color styling based on role
	const iconColorClass = $derived.by(() => {
		if (docRole === 'workspace') return 'text-blue-500';
		if (docRole === 'scratchpad') return 'text-emerald-500';
		if (docRole === 'scratchpad_exec') return 'text-purple-500';
		return 'text-accent';
	});

	const formatDate = (dateStr?: string) => {
		if (!dateStr) return '—';
		return new Date(dateStr).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	};

	const toggleExpanded = () => {
		isExpanded = !isExpanded;
	};

	const handleOpenDocument = (e: Event) => {
		e.stopPropagation();
		onOpenDocument?.(node.id);
	};
</script>

<div class="mb-2">
	<!-- Header - always visible -->
	<div
		class="flex items-center gap-2 p-2 rounded-lg bg-card border border-border hover:border-accent/50 transition-colors group"
	>
		<!-- Expand/collapse button -->
		<button
			onclick={toggleExpanded}
			class="shrink-0 w-6 h-6 flex items-center justify-center rounded hover:bg-muted transition-colors"
			aria-label={isExpanded ? 'Collapse' : 'Expand'}
		>
			<svg
				class="w-4 h-4 text-muted-foreground transition-transform {isExpanded
					? 'rotate-90'
					: ''}"
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M9 5l7 7-7 7"
				/>
			</svg>
		</button>

		<!-- Icon - varies by doc_role -->
		<div class="shrink-0 w-8 h-8 flex items-center justify-center rounded {iconBgClass}">
			{#if isWorkspace}
				<FolderOpen class="w-4 h-4 {iconColorClass}" />
			{:else if isScratchpad}
				{#if isExecutorScratchpad}
					<GitBranch class="w-4 h-4 {iconColorClass}" />
				{:else}
					<Notebook class="w-4 h-4 {iconColorClass}" />
				{/if}
			{:else}
				<FileText class="w-4 h-4 {iconColorClass}" />
			{/if}
		</div>

		<!-- Title, role badge, and type -->
		<div class="flex-1 min-w-0">
			<div class="flex items-center gap-2 flex-wrap">
				<span class="font-medium text-sm text-foreground truncate">{displayTitle}</span>
				{#if roleBadge}
					<span
						class="px-1.5 py-0.5 text-[0.6rem] uppercase tracking-wider font-medium rounded {roleBadgeClass}"
					>
						{roleBadge}
					</span>
				{/if}
			</div>
			<div class="flex items-center gap-2 text-xs text-muted-foreground">
				{#if branchId && isExecutorScratchpad}
					<span class="font-mono text-[10px]">{branchId}</span>
					<span>•</span>
				{/if}
				{#if node.type_key}
					<span>{node.type_key}</span>
				{/if}
			</div>
		</div>

		<!-- Open button -->
		<button
			onclick={handleOpenDocument}
			class="shrink-0 px-3 py-1.5 text-xs bg-accent/10 text-accent rounded-lg border border-accent/20 hover:bg-accent hover:text-accent-foreground transition-all pressable opacity-0 group-hover:opacity-100"
		>
			Open
		</button>
	</div>

	<!-- Expanded metadata and children -->
	{#if isExpanded}
		<div class="ml-8 mt-2 space-y-2">
			<!-- Metadata -->
			<div
				class="p-3 bg-muted/50 border border-border rounded-lg space-y-1.5 text-xs tx tx-grain tx-weak"
			>
				<div class="grid grid-cols-2 gap-x-4 gap-y-1">
					{#if docRole}
						<div>
							<span class="text-muted-foreground">Role:</span>
							<span class="ml-1 text-foreground font-medium">{docRole}</span>
						</div>
					{/if}
					{#if node.state_key}
						<div>
							<span class="text-muted-foreground">State:</span>
							<span class="ml-1 text-foreground font-medium capitalize"
								>{node.state_key.replace('_', ' ')}</span
							>
						</div>
					{/if}
					{#if branchId}
						<div>
							<span class="text-muted-foreground">Branch:</span>
							<span class="ml-1 text-foreground font-mono">{branchId}</span>
						</div>
					{/if}
					<div>
						<span class="text-muted-foreground">Created:</span>
						<span class="ml-1 text-foreground">{formatDate(node.created_at)}</span>
					</div>
					<div class="col-span-2">
						<span class="text-muted-foreground">Updated:</span>
						<span class="ml-1 text-foreground">{formatDate(node.updated_at)}</span>
					</div>
					<div class="col-span-2">
						<span class="text-muted-foreground">ID:</span>
						<span class="ml-1 text-foreground font-mono text-[10px]">{node.id}</span>
					</div>
				</div>
			</div>

			<!-- Children -->
			{#if node.children?.length}
				<div class="space-y-1 pl-3 border-l-2 border-border">
					{#each node.children as child}
						<svelte:self node={child} {onOpenDocument} />
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</div>
