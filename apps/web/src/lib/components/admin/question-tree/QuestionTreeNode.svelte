<!-- apps/web/src/lib/components/admin/question-tree/QuestionTreeNode.svelte -->
<script lang="ts">
	import { Handle, Position } from '@xyflow/svelte';
	import { Bot, CircleAlert, CircleCheck, CircleDashed, FileQuestion } from '$lib/icons/lucide';
	import type { QuestionTreeNode } from '$lib/services/question-tree/types';

	type NodeData = Record<string, unknown> & {
		node: QuestionTreeNode;
		matched?: boolean;
		rootActive?: boolean;
		spotlighted?: boolean;
	};

	let { data, selected = false }: { data: NodeData; selected?: boolean } = $props();

	const node = $derived(data.node);
	const statusLabel = $derived(
		node.node_kind === 'root' ? (data.rootActive ? 'seeding' : 'root') : node.status
	);
	const StatusIcon = $derived(
		node.node_kind === 'root'
			? data.rootActive
				? Bot
				: FileQuestion
			: node.status === 'running'
				? Bot
				: node.status === 'completed'
					? CircleCheck
					: node.status === 'failed'
						? CircleAlert
						: CircleDashed
	);
	const statusClasses = $derived(
		node.node_kind === 'root'
			? data.rootActive
				? 'border-warning bg-warning/10'
				: 'border-accent bg-accent/10'
			: node.status === 'running'
				? 'border-warning bg-warning/10'
				: node.status === 'completed'
					? 'border-success/70 bg-success/10'
					: node.status === 'failed'
						? 'border-destructive/70 bg-destructive/10'
						: node.status === 'cancelled'
							? 'border-border bg-muted/80 opacity-70'
							: 'border-border bg-card'
	);
</script>

<div
	class={[
		'question-tree-node w-[250px] rounded-lg border-2 p-3 shadow-ink transition-[opacity,filter,box-shadow] duration-150',
		statusClasses,
		selected && 'ring-2 ring-accent ring-offset-2 ring-offset-background',
		data.matched && 'outline outline-2 outline-info outline-offset-2',
		data.spotlighted === false && 'opacity-40 grayscale-[0.35]'
	]}
>
	<Handle
		type="target"
		position={Position.Left}
		class="!h-2.5 !w-2.5 !bg-muted-foreground"
		aria-hidden="true"
		role="presentation"
		tabindex={-1}
	/>
	<div class="flex items-start gap-2.5">
		<span
			class={[
				'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border bg-background',
				(node.status === 'running' || data.rootActive) &&
					'animate-pulse motion-reduce:animate-none'
			]}
		>
			<StatusIcon class="h-3.5 w-3.5" />
		</span>
		<div class="min-w-0 flex-1">
			<div class="mb-1.5 flex items-center justify-between gap-2">
				<span class="micro-label">
					{node.node_kind === 'root' ? 'Original question' : `Node ${node.node_number}`}
				</span>
				<span
					class="rounded-md bg-background/80 px-1.5 py-0.5 text-2xs font-semibold text-muted-foreground"
				>
					{statusLabel}
				</span>
			</div>
			<p class="line-clamp-4 text-xs font-semibold leading-relaxed text-foreground">
				{node.question}
			</p>
			<div class="mt-2 flex items-center justify-between text-2xs text-muted-foreground">
				<span>Depth {node.depth}</span>
				{#if node.confidence !== null}
					<span>{Math.round(node.confidence * 100)}% confidence</span>
				{/if}
			</div>
		</div>
	</div>
	<Handle
		type="source"
		position={Position.Right}
		class="!h-2.5 !w-2.5 !bg-muted-foreground"
		aria-hidden="true"
		role="presentation"
		tabindex={-1}
	/>
</div>

<style>
	.question-tree-node {
		font-family: inherit;
		cursor: pointer;
		animation: question-tree-node-arrive 320ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
	}

	@keyframes question-tree-node-arrive {
		from {
			opacity: 0;
			transform: translateX(-10px) scale(0.96);
		}
		to {
			opacity: 1;
			transform: translateX(0) scale(1);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.question-tree-node {
			animation: none;
			transition: none;
		}
	}
</style>
