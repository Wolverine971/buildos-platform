<!-- apps/web/src/lib/components/landing/public-project-preview/PublicProjectInsightRail.svelte -->
<script lang="ts">
	import { slide } from 'svelte/transition';
	import {
		Target,
		Flag,
		Calendar,
		ListChecks,
		AlertTriangle,
		ChevronDown,
		type Icon as IconType
	} from 'lucide-svelte';
	import type { GraphSourceData } from '$lib/components/ontology/graph/lib/graph.types';

	let {
		source
	}: {
		source: GraphSourceData;
	} = $props();

	type StackKey = 'goals' | 'milestones' | 'plans' | 'tasks' | 'risks';

	type StackEntry = {
		key: StackKey;
		label: string;
		icon: typeof IconType;
		iconColor: string;
		items: Array<{
			id: string;
			title: string;
			subtitle?: string | null;
			state?: string | null;
		}>;
	};

	let stacks = $derived<StackEntry[]>([
		{
			key: 'goals',
			label: 'Goals',
			icon: Target,
			iconColor: 'text-amber-500',
			items: (source.goals ?? []).map((g) => ({
				id: g.id,
				title: g.name,
				subtitle: g.description ?? g.goal ?? null,
				state: g.state_key ?? null
			}))
		},
		{
			key: 'milestones',
			label: 'Milestones',
			icon: Flag,
			iconColor: 'text-emerald-500',
			items: (source.milestones ?? []).map((m) => ({
				id: m.id,
				title: m.title,
				subtitle: m.description ?? m.milestone ?? null,
				state: null
			}))
		},
		{
			key: 'plans',
			label: 'Plans',
			icon: Calendar,
			iconColor: 'text-indigo-500',
			items: (source.plans ?? []).map((p) => ({
				id: p.id,
				title: p.name,
				subtitle: p.description ?? p.plan ?? null,
				state: p.state_key ?? null
			}))
		},
		{
			key: 'tasks',
			label: 'Tasks',
			icon: ListChecks,
			iconColor: 'text-muted-foreground',
			items: (source.tasks ?? []).map((t) => ({
				id: t.id,
				title: t.title,
				subtitle: t.description ?? null,
				state: t.state_key ?? null
			}))
		},
		{
			key: 'risks',
			label: 'Risks',
			icon: AlertTriangle,
			iconColor: 'text-red-500',
			items: (source.risks ?? []).map((r) => ({
				id: r.id,
				title: r.title,
				subtitle: r.content ?? null,
				state: r.state_key ?? null
			}))
		}
	]);

	// Default open: goals + plans (highest narrative value).
	let openKeys = $state<Set<StackKey>>(new Set<StackKey>(['goals', 'plans']));

	function toggle(key: StackKey) {
		const next = new Set(openKeys);
		if (next.has(key)) next.delete(key);
		else next.add(key);
		openKeys = next;
	}

	function formatState(state: string | null | undefined): string | null {
		if (!state) return null;
		return state.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
	}
</script>

<aside
	class="rounded-lg border border-border bg-card shadow-ink tx tx-frame tx-weak overflow-hidden"
>
	<header class="px-4 py-3 border-b border-border bg-muted/40">
		<p class="text-sm font-semibold text-foreground">Project rail</p>
		<p class="text-[10px] sm:text-xs text-muted-foreground">
			Goals, milestones, plans, tasks, and risks
		</p>
	</header>

	<ul class="divide-y divide-border">
		{#each stacks as stack (stack.key)}
			{@const isOpen = openKeys.has(stack.key)}
			{@const Icon = stack.icon}
			<li>
				<button
					type="button"
					onclick={() => toggle(stack.key)}
					class="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/40 transition-colors pressable"
					aria-expanded={isOpen}
				>
					<div
						class="h-7 w-7 rounded-md bg-muted/60 border border-border flex items-center justify-center shrink-0"
					>
						<Icon class="w-3.5 h-3.5 {stack.iconColor}" />
					</div>
					<div class="flex-1 min-w-0">
						<p class="text-sm font-semibold text-foreground">{stack.label}</p>
						<p class="text-[10px] sm:text-xs text-muted-foreground">
							{stack.items.length}
							{stack.items.length === 1 ? 'item' : 'items'}
						</p>
					</div>
					<ChevronDown
						class="w-4 h-4 text-muted-foreground transition-transform duration-150 {isOpen
							? 'rotate-180'
							: ''}"
					/>
				</button>

				{#if isOpen}
					<div class="border-t border-border bg-background/40" transition:slide={{ duration: 150 }}>
						{#if stack.items.length === 0}
							<p class="px-4 py-3 text-xs text-muted-foreground italic">
								None in this example.
							</p>
						{:else}
							<ul class="divide-y divide-border/60">
								{#each stack.items.slice(0, 8) as item (item.id)}
									<li class="px-4 py-2.5">
										<div class="flex items-start gap-2">
											<div class="min-w-0 flex-1">
												<p class="text-sm text-foreground leading-snug">
													{item.title}
												</p>
												{#if item.subtitle}
													<p
														class="mt-0.5 text-xs text-muted-foreground leading-relaxed line-clamp-2"
													>
														{item.subtitle}
													</p>
												{/if}
											</div>
											{#if item.state}
												<span
													class="text-[0.6rem] uppercase tracking-[0.15em] text-muted-foreground border border-border rounded-full px-1.5 py-0.5 shrink-0"
												>
													{formatState(item.state)}
												</span>
											{/if}
										</div>
									</li>
								{/each}
							</ul>
							{#if stack.items.length > 8}
								<p class="px-4 py-2 text-[11px] text-muted-foreground italic">
									+ {stack.items.length - 8} more in the full project
								</p>
							{/if}
						{/if}
					</div>
				{/if}
			</li>
		{/each}
	</ul>
</aside>
