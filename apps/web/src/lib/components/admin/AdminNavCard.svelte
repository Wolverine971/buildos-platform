<!-- apps/web/src/lib/components/admin/AdminNavCard.svelte -->
<script lang="ts">
	import type { ComponentType } from 'svelte';
	import { twMerge } from 'tailwind-merge';
	import AdminCard from './AdminCard.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';

	let {
		title,
		description = '',
		href = '#',
		icon = null,
		stat = null,
		badge = null,
		active = false,
		meta = '',
		compact = false
	}: {
		title: string;
		description?: string;
		href?: string;
		icon?: ComponentType | null;
		stat?: string | number | null;
		badge?: string | null;
		active?: boolean;
		meta?: string;
		compact?: boolean;
	} = $props();
</script>

<a
	{href}
	class={twMerge(
		'block focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-xl',
		active && 'order-first'
	)}
>
	<AdminCard
		tone={active ? 'brand' : 'default'}
		padding={compact ? 'sm' : 'md'}
		interactive
		class="h-full admin-panel--tinted"
	>
		{#if compact}
			<!-- Compact: Vertical stacked layout for better title visibility -->
			<div class="flex h-full flex-col gap-2">
				<div class="flex items-start justify-between gap-2">
					{#if icon}
						{@const Icon = icon}
						<span
							class="flex flex-shrink-0 h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground"
						>
							<Icon class="h-4 w-4" />
						</span>
					{/if}
					{#if stat !== null && stat !== undefined && stat !== ''}
						<span
							class="flex-shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[0.65rem] font-semibold text-foreground"
						>
							{stat}
						</span>
					{/if}
				</div>
				<div class="flex-1 min-w-0">
					<p class="font-semibold text-foreground text-sm leading-tight">
						{title}
					</p>
					{#if description}
						<p class="text-muted-foreground text-xs mt-0.5 line-clamp-1">
							{description}
						</p>
					{/if}
				</div>
				{#if badge}
					<div class="mt-auto pt-1">
						<Badge variant="info" size="sm">{badge}</Badge>
					</div>
				{/if}
			</div>
		{:else}
			<!-- Standard: Horizontal layout -->
			<div class="flex h-full flex-col gap-3">
				<div class="flex items-start justify-between gap-3">
					<div class="flex items-center flex-1 min-w-0 gap-3">
						{#if icon}
							{@const Icon = icon}
							<span
								class="flex flex-shrink-0 h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground"
							>
								<Icon class="h-5 w-5" />
							</span>
						{/if}
						<div class="min-w-0 flex-1">
							<p class="font-semibold text-foreground text-base truncate">
								{title}
							</p>
							{#if description}
								<p class="text-muted-foreground text-sm mt-1 truncate">
									{description}
								</p>
							{/if}
						</div>
					</div>

					{#if stat !== null && stat !== undefined && stat !== ''}
						<span
							class="flex-shrink-0 rounded-lg bg-muted px-2 py-0.5 text-xs font-semibold text-foreground"
						>
							{stat}
						</span>
					{/if}
				</div>

				<div
					class="mt-auto flex items-center justify-between text-xs pt-1 border-t border-border/50"
				>
					{#if badge}
						<Badge variant="info" size="sm">{badge}</Badge>
					{:else}
						<span class="text-muted-foreground text-xs">{meta || 'Explore'}</span>
					{/if}

					<span class="text-xs font-medium text-muted-foreground">
						{active ? 'Active' : 'View'}
					</span>
				</div>
			</div>
		{/if}
	</AdminCard>
</a>
