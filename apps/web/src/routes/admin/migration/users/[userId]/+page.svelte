<!-- apps/web/src/routes/admin/migration/users/[userId]/+page.svelte -->
<!-- User detail view with migration status and actions -->
<script lang="ts">
	import {
		User,
		FolderGit2,
		CheckSquare,
		Play,
		Eye,
		RotateCcw,
		AlertTriangle,
		ExternalLink,
		Check,
		XCircle,
		Clock,
		Archive
	} from 'lucide-svelte';
	import AdminPageHeader from '$lib/components/admin/AdminPageHeader.svelte';
	import AdminCard from '$lib/components/admin/AdminCard.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import GlobalProgressBar from '$lib/components/admin/migration/GlobalProgressBar.svelte';
	import ConfirmationModal from '$lib/components/admin/migration/ConfirmationModal.svelte';
	import type { PageData } from './$types';
	import { invalidateAll } from '$app/navigation';

	let { data }: { data: PageData } = $props();

	// State
	let migrateLoading = $state(false);
	let retryLoading = $state(false);
	let successMessage = $state<string | null>(null);
	let errorMessage = $state<string | null>(null);
	let showMigrateAllModal = $state(false);
	let showProjectPreview = $state(false);
	let selectedProjectId = $state<string | null>(null);
	let previewData = $state<unknown>(null);

	// Message handling
	function setSuccess(msg: string) {
		successMessage = msg;
		setTimeout(() => {
			if (successMessage === msg) successMessage = null;
		}, 4000);
	}

	function setError(msg: string) {
		errorMessage = msg;
		setTimeout(() => {
			if (errorMessage === msg) errorMessage = null;
		}, 6000);
	}

	// API helpers
	async function apiPost<T>(url: string, payload: unknown): Promise<T> {
		const response = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload)
		});
		const body = await response.json().catch(() => ({}));
		if (!response.ok || !body?.success) {
			throw new Error(body?.error ?? body?.message ?? 'Request failed');
		}
		return body.data as T;
	}

	// Derived values
	const pendingProjects = $derived(data.projects.filter((p) => !p.isMigrated));
	const migratedProjects = $derived(data.projects.filter((p) => p.isMigrated));
	const hasErrors = $derived(data.errors.length > 0);

	// Handlers
	async function handleMigrateAll() {
		migrateLoading = true;
		try {
			const result = await apiPost<{ runId: string; totalProjects: number }>(
				'/api/admin/migration/start',
				{
					userId: data.user.id,
					skipAlreadyMigrated: true,
					skipCompletedTasks: true
				}
			);
			showMigrateAllModal = false;
			setSuccess(`Migration started: ${result.totalProjects} projects queued`);
			await invalidateAll();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to start migration');
		} finally {
			migrateLoading = false;
		}
	}

	async function handleMigrateProject(projectId: string) {
		migrateLoading = true;
		try {
			const result = await apiPost<{ runId: string; totalProjects: number }>(
				'/api/admin/migration/start',
				{
					projectIds: [projectId],
					skipCompletedTasks: true
				}
			);
			setSuccess(`Migration started for project`);
			await invalidateAll();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to start migration');
		} finally {
			migrateLoading = false;
		}
	}

	async function handleDryRun(projectId: string) {
		selectedProjectId = projectId;
		try {
			const result = await apiPost<{ previews: unknown[] }>('/api/admin/migration/start', {
				projectIds: [projectId],
				dryRun: true
			});
			previewData = result.previews;
			showProjectPreview = true;
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to generate preview');
		}
	}

	async function handleRetryUserErrors() {
		retryLoading = true;
		try {
			const result = await apiPost<{ retrying: number }>('/api/admin/migration/retry', {
				userId: data.user.id
			});
			setSuccess(`Retry initiated for ${result.retrying} errors`);
			await invalidateAll();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to retry');
		} finally {
			retryLoading = false;
		}
	}

	async function handleRetryProjectErrors(projectId: string) {
		retryLoading = true;
		try {
			const result = await apiPost<{ retrying: number }>('/api/admin/migration/retry', {
				projectId
			});
			setSuccess(`Retry initiated for project errors`);
			await invalidateAll();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to retry');
		} finally {
			retryLoading = false;
		}
	}

	function getStatusIcon(project: (typeof data.projects)[0]) {
		if (project.isMigrated && project.failedTaskCount === 0) return Check;
		if (project.failedTaskCount > 0) return AlertTriangle;
		if (project.status === 'archived') return Archive;
		return Clock;
	}

	function getStatusBadge(project: (typeof data.projects)[0]): {
		variant: 'success' | 'warning' | 'error' | 'default';
		label: string;
	} {
		if (project.isMigrated && project.failedTaskCount === 0) {
			return { variant: 'success', label: 'Migrated' };
		}
		if (project.failedTaskCount > 0) {
			return { variant: 'error', label: `${project.failedTaskCount} errors` };
		}
		if (project.isMigrated) {
			return { variant: 'warning', label: 'Partial' };
		}
		if (project.status === 'archived') {
			return { variant: 'default', label: 'Archived' };
		}
		return { variant: 'default', label: 'Pending' };
	}
</script>

<div class="space-y-6">
	<!-- Header -->
	<AdminPageHeader
		title="User Migration"
		description="View and manage migration status for this user."
		icon={User}
		backHref="/admin/migration"
		backLabel="Migration Dashboard"
	>
		{#snippet actions()}
			{#if hasErrors}
				<Button
					variant="outline"
					size="sm"
					onclick={handleRetryUserErrors}
					loading={retryLoading}
				>
					<RotateCcw class="h-4 w-4" />
					<span class="hidden sm:inline">Retry Errors</span>
				</Button>
			{/if}
			{#if pendingProjects.length > 0}
				<Button
					variant="primary"
					size="sm"
					onclick={() => (showMigrateAllModal = true)}
					loading={migrateLoading}
				>
					<Play class="h-4 w-4" />
					<span class="hidden sm:inline">Migrate All ({pendingProjects.length})</span>
					<span class="sm:hidden">Migrate ({pendingProjects.length})</span>
				</Button>
			{/if}
		{/snippet}
	</AdminPageHeader>

	<!-- Messages -->
	{#if successMessage}
		<AdminCard tone="success" padding="sm">{successMessage}</AdminCard>
	{/if}
	{#if errorMessage}
		<AdminCard tone="danger" padding="sm">{errorMessage}</AdminCard>
	{/if}

	<!-- User Info Card -->
	<AdminCard padding="lg">
		<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
			<div class="flex items-center gap-4">
				{#if data.user.avatarUrl}
					<img src={data.user.avatarUrl} alt="" class="h-16 w-16 rounded-full" />
				{:else}
					<div
						class="flex h-16 w-16 items-center justify-center rounded-full bg-purple-100 text-2xl font-semibold text-purple-600 dark:bg-purple-900/30 dark:text-purple-400"
					>
						{(data.user.name?.[0] ?? data.user.email[0] ?? '?').toUpperCase()}
					</div>
				{/if}
				<div>
					<h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100">
						{data.user.name ?? data.user.email}
					</h2>
					{#if data.user.name}
						<p class="text-sm text-gray-500 dark:text-gray-400">{data.user.email}</p>
					{/if}
					<p class="mt-1 text-xs text-gray-400 dark:text-gray-500 font-mono">
						{data.user.id}
					</p>
				</div>
			</div>
			<div class="grid grid-cols-3 gap-4 text-center">
				<div>
					<p class="text-2xl font-bold text-gray-900 dark:text-gray-100">
						{data.summary.totalProjects}
					</p>
					<p class="text-xs text-gray-500 dark:text-gray-400">Projects</p>
				</div>
				<div>
					<p class="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
						{data.summary.migratedProjects}
					</p>
					<p class="text-xs text-gray-500 dark:text-gray-400">Migrated</p>
				</div>
				<div>
					<p class="text-2xl font-bold text-amber-600 dark:text-amber-400">
						{data.summary.pendingProjects}
					</p>
					<p class="text-xs text-gray-500 dark:text-gray-400">Pending</p>
				</div>
			</div>
		</div>

		<!-- Progress Bar -->
		<div class="mt-6">
			<GlobalProgressBar
				progress={{
					migrated: data.summary.migratedProjects,
					pending: data.summary.pendingProjects,
					failed: data.summary.failedProjects,
					total: data.summary.totalProjects,
					percentComplete: data.summary.percentComplete
				}}
			/>
		</div>
	</AdminCard>

	<!-- Stats Cards -->
	<div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
		<AdminCard padding="md">
			<div class="text-center">
				<FolderGit2 class="mx-auto h-6 w-6 text-purple-500" />
				<p class="mt-2 text-2xl font-bold text-gray-900 dark:text-gray-100">
					{data.summary.migratedProjects}/{data.summary.totalProjects}
				</p>
				<p class="text-xs text-gray-500 dark:text-gray-400">Projects</p>
			</div>
		</AdminCard>
		<AdminCard padding="md">
			<div class="text-center">
				<CheckSquare class="mx-auto h-6 w-6 text-blue-500" />
				<p class="mt-2 text-2xl font-bold text-gray-900 dark:text-gray-100">
					{data.summary.migratedTasks}/{data.summary.totalTasks}
				</p>
				<p class="text-xs text-gray-500 dark:text-gray-400">Tasks</p>
			</div>
		</AdminCard>
		<AdminCard padding="md">
			<div class="text-center">
				<FolderGit2 class="mx-auto h-6 w-6 text-emerald-500" />
				<p class="mt-2 text-2xl font-bold text-gray-900 dark:text-gray-100">
					{data.summary.migratedPhases}/{data.summary.totalPhases}
				</p>
				<p class="text-xs text-gray-500 dark:text-gray-400">Phases</p>
			</div>
		</AdminCard>
		<AdminCard padding="md">
			<div class="text-center">
				<AlertTriangle
					class="mx-auto h-6 w-6 {data.errors.length > 0
						? 'text-rose-500'
						: 'text-gray-400'}"
				/>
				<p
					class="mt-2 text-2xl font-bold {data.errors.length > 0
						? 'text-rose-600 dark:text-rose-400'
						: 'text-gray-900 dark:text-gray-100'}"
				>
					{data.errors.length}
				</p>
				<p class="text-xs text-gray-500 dark:text-gray-400">Errors</p>
			</div>
		</AdminCard>
	</div>

	<!-- Projects List -->
	<AdminCard padding="lg">
		<h3 class="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">Projects</h3>

		{#if data.projects.length === 0}
			<p class="py-8 text-center text-gray-500 dark:text-gray-400">
				This user has no projects.
			</p>
		{:else}
			<!-- Mobile Card View -->
			<div class="block space-y-3 lg:hidden">
				{#each data.projects as project}
					{@const status = getStatusBadge(project)}
					<div
						class="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900"
					>
						<div class="flex items-start justify-between">
							<div>
								<p class="font-medium text-gray-900 dark:text-gray-100">
									{project.name}
								</p>
								<p class="text-xs text-gray-500 dark:text-gray-400">
									{project.migratedTaskCount}/{project.taskCount} tasks
								</p>
							</div>
							<Badge size="sm" variant={status.variant}>{status.label}</Badge>
						</div>
						<div class="mt-3 flex gap-2">
							{#if !project.isMigrated}
								<Button
									variant="primary"
									size="sm"
									onclick={() => handleMigrateProject(project.id)}
								>
									<Play class="h-3 w-3" />
									Migrate
								</Button>
								<Button
									variant="outline"
									size="sm"
									onclick={() => handleDryRun(project.id)}
								>
									<Eye class="h-3 w-3" />
									Preview
								</Button>
							{:else if project.failedTaskCount > 0}
								<Button
									variant="outline"
									size="sm"
									onclick={() => handleRetryProjectErrors(project.id)}
								>
									<RotateCcw class="h-3 w-3" />
									Retry
								</Button>
							{/if}
						</div>
					</div>
				{/each}
			</div>

			<!-- Desktop Table View -->
			<div
				class="hidden overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700 lg:block"
			>
				<table class="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700">
					<thead class="bg-gray-50 dark:bg-gray-900/50">
						<tr
							class="text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400"
						>
							<th class="px-4 py-3">Project</th>
							<th class="px-4 py-3">Status</th>
							<th class="px-4 py-3">Tasks</th>
							<th class="px-4 py-3">Phases</th>
							<th class="px-4 py-3 text-right">Actions</th>
						</tr>
					</thead>
					<tbody
						class="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-950"
					>
						{#each data.projects as project}
							{@const status = getStatusBadge(project)}
							{@const StatusIcon = getStatusIcon(project)}
							<tr
								class="transition-colors hover:bg-gray-50 dark:hover:bg-gray-900/30"
							>
								<td class="px-4 py-3">
									<div class="flex items-center gap-3">
										<div
											class="flex h-8 w-8 items-center justify-center rounded-lg {project.isMigrated
												? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
												: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}"
										>
											<StatusIcon class="h-4 w-4" />
										</div>
										<div>
											<p class="font-medium text-gray-900 dark:text-gray-100">
												{project.name}
											</p>
											<p class="text-xs text-gray-500 dark:text-gray-400">
												{project.status === 'archived'
													? 'Archived'
													: 'Active'}
												{#if project.ontoId}
													<span class="text-gray-400">•</span>
													<span class="font-mono"
														>{project.ontoId.slice(0, 8)}...</span
													>
												{/if}
											</p>
										</div>
									</div>
								</td>
								<td class="px-4 py-3">
									<Badge size="sm" variant={status.variant}>{status.label}</Badge>
								</td>
								<td class="px-4 py-3">
									<div class="flex items-center gap-2">
										<div
											class="h-2 w-16 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700"
										>
											<div
												class="h-full bg-emerald-500 transition-all"
												style="width: {project.taskCount > 0
													? (project.migratedTaskCount /
															project.taskCount) *
														100
													: 0}%"
											></div>
										</div>
										<span class="text-xs text-gray-700 dark:text-gray-300">
											{project.migratedTaskCount}/{project.taskCount}
										</span>
									</div>
								</td>
								<td class="px-4 py-3 text-gray-700 dark:text-gray-300">
									{project.migratedPhaseCount}/{project.phaseCount}
								</td>
								<td class="px-4 py-3 text-right">
									<div class="flex items-center justify-end gap-1">
										{#if !project.isMigrated}
											<Button
												variant="primary"
												size="sm"
												onclick={() => handleMigrateProject(project.id)}
											>
												<Play class="h-3 w-3" />
												Migrate
											</Button>
											<Button
												variant="outline"
												size="sm"
												onclick={() => handleDryRun(project.id)}
											>
												<Eye class="h-3 w-3" />
											</Button>
										{:else if project.failedTaskCount > 0}
											<Button
												variant="outline"
												size="sm"
												onclick={() => handleRetryProjectErrors(project.id)}
											>
												<RotateCcw class="h-3 w-3" />
												Retry
											</Button>
										{:else}
											<span
												class="text-xs text-emerald-600 dark:text-emerald-400"
												>Complete</span
											>
										{/if}
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</AdminCard>

	<!-- Errors Section -->
	{#if data.errors.length > 0}
		<AdminCard padding="lg">
			<div class="flex items-center justify-between mb-4">
				<h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100">
					Recent Errors ({data.errors.length})
				</h3>
				<a
					href="/admin/migration/errors?userId={data.user.id}"
					class="text-sm text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300"
				>
					View All
					<ExternalLink class="ml-1 inline h-3 w-3" />
				</a>
			</div>

			<div class="space-y-2">
				{#each data.errors.slice(0, 5) as error}
					<div
						class="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800"
					>
						<div class="flex items-start justify-between">
							<div>
								<p class="font-medium text-gray-900 dark:text-gray-100">
									{error.entityName}
								</p>
								<p class="text-xs text-gray-500 dark:text-gray-400">
									<span class="capitalize">{error.entityType}</span>
									<span class="text-gray-400">•</span>
									{error.projectName}
								</p>
							</div>
							<Badge
								size="sm"
								variant={error.errorCategory === 'recoverable'
									? 'warning'
									: error.errorCategory === 'fatal'
										? 'error'
										: 'info'}
							>
								{error.errorCategory ?? 'unknown'}
							</Badge>
						</div>
						<p class="mt-2 text-sm text-rose-700 dark:text-rose-300 line-clamp-2">
							{error.errorMessage}
						</p>
					</div>
				{/each}
			</div>
		</AdminCard>
	{/if}
</div>

<!-- Migrate All Confirmation Modal -->
<ConfirmationModal
	bind:isOpen={showMigrateAllModal}
	type="warning"
	title="Migrate All Pending Projects"
	message="This will migrate all unmigrated projects for this user."
	confirmLabel="Start Migration"
	cancelLabel="Cancel"
	isLoading={migrateLoading}
	details={[
		{ label: 'Pending Projects', value: pendingProjects.length },
		{ label: 'Total Tasks', value: data.summary.totalTasks - data.summary.migratedTasks }
	]}
	onConfirm={handleMigrateAll}
/>

<!-- Preview Modal -->
<Modal
	bind:isOpen={showProjectPreview}
	title="Migration Preview"
	size="lg"
	onClose={() => (showProjectPreview = false)}
>
	<div class="p-4">
		{#if previewData}
			<pre
				class="max-h-96 overflow-auto rounded-lg bg-gray-900 p-4 text-xs text-gray-100">{JSON.stringify(
					previewData,
					null,
					2
				)}</pre>
		{:else}
			<p class="text-gray-500 dark:text-gray-400">No preview data available.</p>
		{/if}
		<div class="mt-4 flex justify-end gap-2">
			<Button variant="outline" onclick={() => (showProjectPreview = false)}>Close</Button>
			{#if selectedProjectId}
				<Button
					variant="primary"
					onclick={() => {
						handleMigrateProject(selectedProjectId!);
						showProjectPreview = false;
					}}
				>
					<Play class="h-4 w-4" />
					Proceed with Migration
				</Button>
			{/if}
		</div>
	</div>
</Modal>
