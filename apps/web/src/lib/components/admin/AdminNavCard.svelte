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
		padding={compact ? 'md' : 'lg'}
		interactive
		class="h-full admin-panel--tinted"
	>
		<div class={`flex h-full flex-col ${compact ? 'gap-3' : 'gap-4'}`}>
			<div class="flex items-start justify-between gap-4">
				<div class={`flex items-center ${compact ? 'gap-3' : 'gap-4'}`}>
					{#if icon}
						{@const Icon = icon}
						<span
							class={`flex ${compact ? 'h-10 w-10' : 'h-11 w-11'} items-center justify-center rounded-xl bg-gray-900/5 text-gray-700 dark:bg-white/5 dark:text-gray-200`}
						>
							<Icon class={compact ? 'h-5 w-5' : 'h-6 w-6'} />
						</span>
					{/if}
					<div>
						<p
							class={`font-semibold text-gray-900 dark:text-white ${compact ? 'text-sm' : 'text-base'}`}
						>
							{title}
						</p>
						{#if description}
							<p
								class={`text-gray-600 dark:text-gray-400 ${compact ? 'text-xs' : 'text-sm'}`}
							>
								{description}
							</p>
						{/if}
					</div>
				</div>

				{#if stat !== null && stat !== undefined && stat !== ''}
					<span
						class="rounded-2xl bg-gray-900/5 px-3 py-1 text-sm font-semibold text-gray-900 dark:bg-white/10 dark:text-white"
					>
						{stat}
					</span>
				{/if}
			</div>

			<div class="mt-auto flex items-center justify-between text-xs">
				{#if badge}
					<Badge variant="info" size="sm">{badge}</Badge>
				{:else}
					<span class="text-gray-600 dark:text-gray-400">{meta || 'Explore'}</span>
				{/if}

				<span class="text-xs font-medium text-gray-500 dark:text-gray-400">
					{active ? 'Active' : 'View'}
				</span>
			</div>
		</div>
	</AdminCard>
</a>
