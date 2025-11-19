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
		'block focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
		active && 'order-first'
	)}
>
	<AdminCard
		tone={active ? 'brand' : 'default'}
		padding={compact ? 'sm' : 'md'}
		interactive
		class="h-full admin-panel--tinted"
	>
		<div class={`flex h-full flex-col ${compact ? 'gap-2' : 'gap-3'}`}>
			<div class="flex items-start justify-between gap-3">
				<div class={`flex items-center flex-1 min-w-0 ${compact ? 'gap-2.5' : 'gap-3'}`}>
					{#if icon}
						{@const Icon = icon}
						<span
							class={`flex flex-shrink-0 ${compact ? 'h-8 w-8' : 'h-9 w-9'} items-center justify-center rounded-lg bg-gray-900/5 text-gray-700 dark:bg-white/5 dark:text-gray-200`}
						>
							<Icon class={compact ? 'h-4 w-4' : 'h-5 w-5'} />
						</span>
					{/if}
					<div class="min-w-0 flex-1">
						<p
							class={`font-semibold text-gray-900 dark:text-white truncate ${compact ? 'text-sm' : 'text-base'}`}
						>
							{title}
						</p>
						{#if description}
							<p
								class={`text-gray-600 dark:text-gray-400 truncate ${compact ? 'text-xs mt-0.5' : 'text-sm mt-1'}`}
							>
								{description}
							</p>
						{/if}
					</div>
				</div>

				{#if stat !== null && stat !== undefined && stat !== ''}
					<span
						class="flex-shrink-0 rounded-lg bg-gray-900/5 px-2 py-0.5 text-xs font-semibold text-gray-900 dark:bg-white/10 dark:text-white"
					>
						{stat}
					</span>
				{/if}
			</div>

			{#if badge || !compact}
				<div
					class="mt-auto flex items-center justify-between text-xs pt-1 border-t border-gray-200/50 dark:border-gray-700/50"
				>
					{#if badge}
						<Badge variant="info" size="sm">{badge}</Badge>
					{:else}
						<span class="text-gray-500 dark:text-gray-500 text-xs"
							>{meta || 'Explore'}</span
						>
					{/if}

					<span class="text-xs font-medium text-gray-500 dark:text-gray-500">
						{active ? 'Active' : 'View'}
					</span>
				</div>
			{/if}
		</div>
	</AdminCard>
</a>
