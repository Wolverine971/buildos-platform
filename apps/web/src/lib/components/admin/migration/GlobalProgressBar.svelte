<!-- apps/web/src/lib/components/admin/migration/GlobalProgressBar.svelte -->
<!-- Overall migration progress with segmented bar -->
<script lang="ts">
	import { twMerge } from 'tailwind-merge';

	interface ProgressData {
		migrated: number;
		pending: number;
		failed: number;
		total: number;
		percentComplete: number;
	}

	let {
		progress,
		showLabels = true,
		size = 'md',
		class: className = ''
	}: {
		progress: ProgressData;
		showLabels?: boolean;
		size?: 'sm' | 'md' | 'lg';
		class?: string;
	} = $props();

	const sizeClasses = {
		sm: 'h-2',
		md: 'h-3',
		lg: 'h-4'
	};

	const migratedPercent = $derived(
		progress.total > 0 ? (progress.migrated / progress.total) * 100 : 0
	);
	const failedPercent = $derived(
		progress.total > 0 ? (progress.failed / progress.total) * 100 : 0
	);
	const pendingPercent = $derived(100 - migratedPercent - failedPercent);
</script>

<div class={twMerge('space-y-2', className)}>
	{#if showLabels}
		<div class="flex items-center justify-between text-sm">
			<span class="font-medium text-gray-900 dark:text-gray-100"> Migration Progress </span>
			<span class="text-gray-600 dark:text-gray-400">
				{progress.percentComplete.toFixed(1)}% complete
			</span>
		</div>
	{/if}

	<div
		class={twMerge(
			'relative w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800',
			sizeClasses[size]
		)}
	>
		<!-- Migrated (green) -->
		<div
			class="absolute left-0 top-0 h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500"
			style="width: {migratedPercent}%"
		></div>

		<!-- Failed (red) -->
		{#if failedPercent > 0}
			<div
				class="absolute top-0 h-full bg-gradient-to-r from-rose-500 to-rose-400 transition-all duration-500"
				style="left: {migratedPercent}%; width: {failedPercent}%"
			></div>
		{/if}

		<!-- Pending is the remaining gray background -->
	</div>

	{#if showLabels}
		<div class="flex justify-between text-xs text-gray-500 dark:text-gray-400">
			<div class="flex items-center gap-3">
				<span class="flex items-center gap-1">
					<span class="h-2 w-2 rounded-full bg-emerald-500"></span>
					{progress.migrated.toLocaleString()} migrated
				</span>
				{#if progress.failed > 0}
					<span class="flex items-center gap-1">
						<span class="h-2 w-2 rounded-full bg-rose-500"></span>
						{progress.failed.toLocaleString()} failed
					</span>
				{/if}
				<span class="flex items-center gap-1">
					<span class="h-2 w-2 rounded-full bg-gray-300 dark:bg-gray-600"></span>
					{progress.pending.toLocaleString()} pending
				</span>
			</div>
			<span class="font-medium">
				{progress.total.toLocaleString()} total
			</span>
		</div>
	{/if}
</div>
