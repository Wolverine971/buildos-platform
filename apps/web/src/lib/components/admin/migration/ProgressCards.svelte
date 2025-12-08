<!-- apps/web/src/lib/components/admin/migration/ProgressCards.svelte -->
<!-- Displays 4 stat cards: Projects, Tasks, Users, Errors -->
<script lang="ts">
	import { FolderGit2, CheckSquare, Users, AlertTriangle } from 'lucide-svelte';
	import AdminStatCard from '../AdminStatCard.svelte';

	export interface ProgressStats {
		projects: {
			total: number;
			migrated: number;
			pending: number;
			failed: number;
			percentComplete: number;
		};
		tasks: {
			total: number;
			migrated: number;
			pending: number;
			percentComplete: number;
		};
		users: {
			total: number;
			withProjects: number;
			fullyMigrated: number;
			partiallyMigrated: number;
			notStarted: number;
		};
		errors: {
			total: number;
			recoverable: number;
			dataErrors: number;
			fatal: number;
		};
	}

	let { stats }: { stats: ProgressStats } = $props();

	const formatPercent = (value: number) => `${value.toFixed(1)}%`;
	const formatNumber = (value: number) => value.toLocaleString();
</script>

<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
	<!-- Projects Card -->
	<AdminStatCard
		title="Projects"
		value={formatNumber(stats.projects.migrated)}
		subtitle={`of ${formatNumber(stats.projects.total)} migrated`}
		trend={stats.projects.percentComplete > 0 ? 'up' : 'neutral'}
		trendValue={formatPercent(stats.projects.percentComplete)}
		icon={FolderGit2}
		iconColor="purple"
	>
		<div class="mt-2 flex gap-2 text-xs">
			<span class="text-emerald-600 dark:text-emerald-400">
				{formatNumber(stats.projects.migrated)} done
			</span>
			<span class="text-gray-400">|</span>
			<span class="text-amber-600 dark:text-amber-400">
				{formatNumber(stats.projects.pending)} pending
			</span>
			{#if stats.projects.failed > 0}
				<span class="text-gray-400">|</span>
				<span class="text-rose-600 dark:text-rose-400">
					{formatNumber(stats.projects.failed)} failed
				</span>
			{/if}
		</div>
	</AdminStatCard>

	<!-- Tasks Card -->
	<AdminStatCard
		title="Tasks"
		value={formatNumber(stats.tasks.migrated)}
		subtitle={`of ${formatNumber(stats.tasks.total)} migrated`}
		trend={stats.tasks.percentComplete > 0 ? 'up' : 'neutral'}
		trendValue={formatPercent(stats.tasks.percentComplete)}
		icon={CheckSquare}
		iconColor="blue"
	>
		<div class="mt-2 flex gap-2 text-xs">
			<span class="text-emerald-600 dark:text-emerald-400">
				{formatNumber(stats.tasks.migrated)} done
			</span>
			<span class="text-gray-400">|</span>
			<span class="text-amber-600 dark:text-amber-400">
				{formatNumber(stats.tasks.pending)} pending
			</span>
		</div>
	</AdminStatCard>

	<!-- Users Card -->
	<AdminStatCard
		title="Users"
		value={formatNumber(stats.users.fullyMigrated)}
		subtitle={`of ${formatNumber(stats.users.withProjects)} fully migrated`}
		trend={stats.users.fullyMigrated > 0 ? 'up' : 'neutral'}
		trendValue={`${stats.users.withProjects > 0 ? Math.round((stats.users.fullyMigrated / stats.users.withProjects) * 100) : 0}%`}
		icon={Users}
		iconColor="emerald"
	>
		<div class="mt-2 flex gap-2 text-xs">
			<span class="text-emerald-600 dark:text-emerald-400">
				{formatNumber(stats.users.fullyMigrated)} complete
			</span>
			<span class="text-gray-400">|</span>
			<span class="text-amber-600 dark:text-amber-400">
				{formatNumber(stats.users.partiallyMigrated)} partial
			</span>
			<span class="text-gray-400">|</span>
			<span class="text-gray-500 dark:text-gray-400">
				{formatNumber(stats.users.notStarted)} not started
			</span>
		</div>
	</AdminStatCard>

	<!-- Errors Card -->
	<AdminStatCard
		title="Errors"
		value={formatNumber(stats.errors.total)}
		subtitle={stats.errors.total > 0 ? 'need attention' : 'no errors'}
		trend={stats.errors.total > 0 ? 'down' : 'neutral'}
		trendValue={stats.errors.total > 0
			? `${formatNumber(stats.errors.recoverable)} retryable`
			: 'All clear'}
		icon={AlertTriangle}
		iconColor={stats.errors.total > 0 ? 'rose' : 'emerald'}
	>
		{#if stats.errors.total > 0}
			<div class="mt-2 flex gap-2 text-xs">
				<span class="text-amber-600 dark:text-amber-400">
					{formatNumber(stats.errors.recoverable)} recoverable
				</span>
				<span class="text-gray-400">|</span>
				<span class="text-orange-600 dark:text-orange-400">
					{formatNumber(stats.errors.dataErrors)} data
				</span>
				<span class="text-gray-400">|</span>
				<span class="text-rose-600 dark:text-rose-400">
					{formatNumber(stats.errors.fatal)} fatal
				</span>
			</div>
		{/if}
	</AdminStatCard>
</div>
