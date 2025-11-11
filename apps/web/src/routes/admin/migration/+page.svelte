<!-- apps/web/src/routes/admin/migration/+page.svelte -->
<script lang="ts">
	// ============================================================
	// IMPORTS
	// ============================================================
	import { GitBranch } from 'lucide-svelte';
	import AdminPageHeader from '$lib/components/admin/AdminPageHeader.svelte';
	import AdminCard from '$lib/components/admin/AdminCard.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import type { PageData } from './$types';

	// ============================================================
	// PROPS & TYPES
	// ============================================================
	let { data }: { data: PageData } = $props();

	type RunRow = PageData['runs'][number];
	type ProjectRow = PageData['projects'][number];

	type TaskClassificationPreview = {
		typeKey: string;
		complexity: 'simple' | 'moderate' | 'complex';
		requiresDeepWork: boolean;
		isRecurring: boolean;
		reasoning: string;
	};

	type TaskPreviewRecord = {
		legacyTaskId: string;
		title: string;
		legacyStatus: string;
		phaseId: string | null;
		phaseName: string | null;
		ontoTaskId: string | null;
		suggestedOntoPlanId: string | null;
		recommendedTypeKey: string;
		recommendedStateKey: string;
		dueAt: string | null;
		priority: number | null;
		facetScale: string | null;
		calendarEventCount: number;
		status: string;
		notes: string;
		classification: TaskClassificationPreview;
		proposedPayload: Record<string, unknown>;
	};

	type TemplatePreviewPayload = {
		typeKey: string;
		realm: string | null;
		domain: string | null;
		deliverable: string | null;
		variant?: string | null;
		confidence?: number | null;
		rationale?: string | null;
		created?: boolean;
		creationPlanned?: {
			typeKey: string;
			name: string;
			realm: string | null;
			domain: string;
			deliverable: string;
			variant?: string | null;
			parentTypeKey?: string | null;
		} | null;
	};

	type TaskPreviewSummary = {
		total: number;
		alreadyMigrated: number;
		readyToMigrate: number;
		blocked: number;
		missingProject: number;
	};

	type CalendarPreviewEntry = {
		legacyEventId: string;
		taskId: string;
		taskOntoId: string | null;
		eventTitle: string | null;
		startAt: string | null;
		endAt: string | null;
		calendarId: string | null;
		syncSource: string | null;
		syncStatus: string;
		willLinkToTask: boolean;
	};

	type MigrationPreviewPayload = {
		projectId: string;
		projectName: string;
		projectStatus: string;
		contextDocumentId: string | null;
		contextMarkdown?: string | null;
		coreValues: Record<string, string | null>;
		planPreview?: {
			plans: Array<{
				legacyPhaseId: string | null;
				name: string;
				summary?: string;
				typeKey?: string;
				stateKey?: string;
				startDate?: string | null;
				endDate?: string | null;
				order?: number | null;
				confidence?: number | null;
			}>;
			reasoning?: string;
			confidence?: number;
			prompt?: string;
			contextPreview?: string | null;
			phasesPreview?: Array<{
				id: string;
				name: string;
				description: string | null;
				order: number;
				start_date: string;
				end_date: string;
				task_count: number;
				scheduling_method: string | null;
			}>;
		};
		taskPreview?: {
			summary: TaskPreviewSummary;
			tasks: TaskPreviewRecord[];
		};
		calendarPreview?: {
			stats: {
				totalEvents: number;
				linkableEvents: number;
				blockedEvents: number;
			};
			events: CalendarPreviewEntry[];
		};
		templatePreview?: TemplatePreviewPayload;
	};

	// ============================================================
	// STATE (Svelte 5 Runes)
	// ============================================================
	let selectedProjectId = $state<string | null>(null);
	let analysisResult = $state<any>(null);
	let activeRunSummary = $state<any>(null);
	let runList = $state<RunRow[]>(data.runs ?? []);
	let projectAction = $state<{
		id: string;
		type: 'analyze' | 'dry-run' | 'migrate' | 'tasks';
	} | null>(null);
	let message = $state<string | null>(null);
	let errorMessage = $state<string | null>(null);
	let selectedRunId = $state<string>('');
	let pauseReason = $state<string>('');
	let rollbackFromDate = $state<string>('');
	let previewData = $state<MigrationPreviewPayload[] | null>(null);
	let previewModalOpen = $state(false);
	let activePreviewIndex = $state(0);
	let taskPreviewProjectId = $state<string | null>(null);
	let taskMigrationLoading = $state(false);

	// ============================================================
	// DERIVED STATE
	// ============================================================
	// ✅ Fixed $derived syntax - no arrow function needed
	const activePreview = $derived(previewData?.[activePreviewIndex] ?? null);
	const hasProjects = data.projects.length > 0;

	// ============================================================
	// API HELPER FUNCTIONS
	// ============================================================
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

	const formatDate = (value?: string | null): string =>
		value ? new Date(value).toLocaleString() : '—';

	// ============================================================
	// MESSAGE HANDLING
	// ============================================================
	// Auto-clear messages after 4 seconds
	function setMessage(text: string | null) {
		message = text;
		if (text) {
			setTimeout(() => {
				if (message === text) {
					message = null;
				}
			}, 4000);
		}
	}

	// Auto-clear error messages after 6 seconds (longer for errors)
	function setError(text: string | null) {
		errorMessage = text;
		if (text) {
			setTimeout(() => {
				if (errorMessage === text) {
					errorMessage = null;
				}
			}, 6000);
		}
	}

	// ============================================================
	// PROJECT MIGRATION ACTIONS
	// ============================================================
	async function analyzeProject(projectId: string) {
		projectAction = { id: projectId, type: 'analyze' };
		setError(null);

		try {
			const result = await apiPost('/api/admin/migration/analyze', {
				projectIds: [projectId],
				includeArchived: true,
				limit: 1
			});

			analysisResult = result;
			selectedProjectId = projectId;
			openPreviewModal(result?.previews, null);
			setMessage('Analysis completed');
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to analyze project');
		} finally {
			projectAction = null;
		}
	}

	async function startMigration(projectId: string, dryRun: boolean) {
		projectAction = { id: projectId, type: dryRun ? 'dry-run' : 'migrate' };
		setError(null);

		try {
			const result = await apiPost('/api/admin/migration/start', {
				projectIds: [projectId],
				batchSize: 1,
				includeArchived: true,
				dryRun,
				orgId: null
			});

			if (result?.runId) {
				await refreshRuns(result.runId);
				setMessage(dryRun ? 'Dry run completed' : 'Migration completed');
			}
			if (dryRun) {
				openPreviewModal(result?.previews, null);
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to start migration');
		} finally {
			projectAction = null;
		}
	}

	async function previewTasks(projectId: string) {
		projectAction = { id: projectId, type: 'tasks' };
		setError(null);

		try {
			const result = await apiPost<{ preview: MigrationPreviewPayload }>(
				'/api/admin/migration/tasks/preview',
				{ projectId }
			);

			if (result?.preview) {
				openPreviewModal([result.preview], projectId);
				setMessage('Task preview ready');
			} else {
				setError('No preview available for this project');
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to preview tasks');
		} finally {
			projectAction = null;
		}
	}

	async function runTaskMigration(projectId: string) {
		if (!projectId) return;
		taskMigrationLoading = true;
		setError(null);

		try {
			const result = await apiPost<{
				tasks?: { summary?: { readyToMigrate?: number } };
				calendars?: { createdEvents?: number };
			}>('/api/admin/migration/tasks/run', { projectId });

			const migrated = result?.tasks?.summary?.readyToMigrate ?? 0;
			const events = result?.calendars?.createdEvents ?? 0;
			setMessage(
				`Task migration completed (${migrated} tasks processed, ${events} events linked).`
			);
			taskPreviewProjectId = null;
			previewModalOpen = false;
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to migrate tasks');
		} finally {
			taskMigrationLoading = false;
		}
	}

	function openPreviewModal(
		previews?: MigrationPreviewPayload[] | null,
		projectId: string | null = null
	) {
		if (previews && previews.length) {
			previewData = previews;
			activePreviewIndex = 0;
			taskPreviewProjectId = projectId;
			previewModalOpen = true;
		}
	}

	// ============================================================
	// RUN MANAGEMENT ACTIONS
	// ============================================================
	async function refreshRuns(runId?: string) {
		const params = new URLSearchParams();
		if (runId) {
			params.set('runId', runId);
		}

		try {
			const response = await fetch(
				`/api/admin/migration/status${params.size ? `?${params.toString()}` : ''}`
			);
			const body = await response.json().catch(() => ({}));

			if (!response.ok || !body?.success) {
				throw new Error(body?.error ?? 'Failed to fetch run status');
			}

			const runs: RunRow[] = body.data?.runs ?? [];
			if (runId && runs.length) {
				const firstRun = runs[0];
				if (firstRun) {
					activeRunSummary = firstRun;
					// ✅ Create new array for proper reactivity
					runList = [
						firstRun,
						...runList.filter((run) => run.run_id !== firstRun.run_id)
					];
				}
			} else if (!runId) {
				runList = runs;
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to refresh runs');
		}
	}

	async function validateRun(runId: string) {
		if (!runId) {
			setError('Select a run to validate');
			return;
		}

		try {
			const result = await apiPost('/api/admin/migration/validate', { runId });
			activeRunSummary = result;
			setMessage('Validation run triggered');
			await refreshRuns(runId);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to validate run');
		}
	}

	async function rollbackRun(runId: string) {
		if (!runId) {
			setError('Select a run to rollback');
			return;
		}

		try {
			await apiPost('/api/admin/migration/rollback', {
				runId,
				fromDate: rollbackFromDate || undefined
			});
			setMessage('Rollback marked in logs');
			await refreshRuns(runId);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to rollback');
		}
	}

	async function pauseRun(runId: string) {
		if (!runId || !pauseReason.trim()) {
			setError('Provide a run and pause reason');
			return;
		}

		try {
			await apiPost('/api/admin/migration/pause', {
				runId,
				reason: pauseReason.trim()
			});
			setMessage('Run paused');
			pauseReason = '';
			await refreshRuns(runId);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to pause run');
		}
	}

	async function resumeRun(runId: string) {
		if (!runId) {
			setError('Select a run to resume');
			return;
		}

		try {
			await apiPost('/api/admin/migration/resume', { runId });
			setMessage('Run resumed');
			await refreshRuns(runId);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to resume run');
		}
	}
</script>

<div class="admin-page space-y-6">
	<AdminPageHeader
		title="Ontology Migration"
		description="Inspect a user's legacy projects, run migrations, and review run history."
		icon={GitBranch}
		backHref="/admin"
		backLabel="Dashboard"
	/>

	{#if message}
		<AdminCard tone="success" padding="sm">{message}</AdminCard>
	{/if}

	{#if errorMessage}
		<AdminCard tone="danger" padding="sm">{errorMessage}</AdminCard>
	{/if}

	{#if previewData?.length}
		<div class="flex justify-end">
			<Button size="sm" variant="outline" onclick={() => (previewModalOpen = true)}>
				View LLM Output ({previewData.length})
			</Button>
		</div>
	{/if}

	<AdminCard>
		<form class="flex flex-wrap items-end gap-4" method="get">
			<div class="flex-1 min-w-[280px]">
				<label
					for="user-id-input"
					class="text-sm font-semibold text-slate-700 dark:text-slate-300"
				>
					User ID
				</label>
				<input
					id="user-id-input"
					class="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-slate-500 dark:focus:ring-slate-700"
					name="userId"
					value={data.targetUserId ?? ''}
					placeholder={data.defaultUserId}
				/>
			</div>
			<Button type="submit">Load Projects</Button>
		</form>

		{#if data.targetUser}
			<div class="mt-4 flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300">
				<span>
					<strong>User:</strong>
					{data.targetUser.name ?? 'Unknown'} ({data.targetUser.email})
				</span>
				<span><strong>Projects:</strong> {data.projects.length}</span>
			</div>
		{:else if data.targetUserId}
			<p class="mt-4 text-sm text-slate-500">User not found.</p>
		{/if}
	</AdminCard>

	{#if hasProjects}
		<AdminCard class="overflow-hidden">
			<table class="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
				<thead class="bg-slate-50 dark:bg-slate-900/40">
					<tr
						class="text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500"
					>
						<th class="px-5 py-3">Project</th>
						<th class="px-5 py-3">Status</th>
						<th class="px-5 py-3">Mapping</th>
						<th class="px-5 py-3 text-right">Actions</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-slate-200 dark:divide-slate-800">
					{#each data.projects as project}
						<tr class="hover:bg-slate-50/70 dark:hover:bg-slate-900/30">
							<td class="px-5 py-4">
								<div class="flex flex-col">
									<span class="font-semibold text-slate-900 dark:text-slate-100">
										{project.name}
									</span>
									<span class="text-xs text-slate-500">
										Updated {new Date(project.updated_at).toLocaleString()}
									</span>
								</div>
							</td>
							<td class="px-5 py-4">
								<Badge
									size="sm"
									variant={project.status === 'active' ? 'success' : 'info'}
								>
									{project.status}
								</Badge>
							</td>
							<td class="px-5 py-4">
								{#if project.hasMapping}
									<span class="text-xs text-emerald-600 dark:text-emerald-300">
										Migrated
									</span>
									{#if project.runtimeOntoId}
										<div class="text-[11px] text-slate-500">
											{project.runtimeOntoId}
										</div>
									{/if}
								{:else}
									<span class="text-xs text-slate-500">Pending</span>
								{/if}
							</td>
							<td class="px-5 py-4 text-right space-x-2">
								<Button
									size="sm"
									variant="secondary"
									loading={projectAction?.id === project.id &&
										projectAction.type === 'analyze'}
									onclick={() => analyzeProject(project.id)}
								>
									Analyze
								</Button>
								<Button
									size="sm"
									variant="outline"
									loading={projectAction?.id === project.id &&
										projectAction.type === 'dry-run'}
									onclick={() => startMigration(project.id, true)}
								>
									Dry Run
								</Button>
								<Button
									size="sm"
									variant="outline"
									loading={projectAction?.id === project.id &&
										projectAction.type === 'tasks'}
									onclick={() => previewTasks(project.id)}
								>
									Migrate Tasks
								</Button>
								<Button
									size="sm"
									variant="primary"
									loading={projectAction?.id === project.id &&
										projectAction.type === 'migrate'}
									onclick={() => startMigration(project.id, false)}
								>
									Migrate
								</Button>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</AdminCard>
	{/if}

	<div class="grid gap-6 lg:grid-cols-2">
		<AdminCard>
			<h3 class="text-base font-semibold text-slate-900 dark:text-slate-100">Analysis</h3>
			{#if analysisResult}
				<div class="mt-4 text-sm text-slate-600 dark:text-slate-300 space-y-2">
					<p class="font-semibold">Totals</p>
					<ul class="list-disc pl-5 space-y-1">
						<li>Projects: {analysisResult.totals?.projects ?? 0}</li>
						<li>Phases: {analysisResult.totals?.phases ?? 0}</li>
						<li>Tasks: {analysisResult.totals?.tasks ?? 0}</li>
						<li>Calendars: {analysisResult.totals?.calendars ?? 0}</li>
					</ul>
					{#if analysisResult.projects?.length}
						<p class="font-semibold mt-4">First Project Snapshot</p>
						<pre
							class="rounded bg-slate-100 p-3 text-xs text-slate-700 dark:bg-slate-900/60 dark:text-slate-200 overflow-auto">
{JSON.stringify(analysisResult.projects[0], null, 2)}
						</pre>
					{/if}
				</div>
			{:else}
				<p class="mt-4 text-sm text-slate-500">Run an analysis to see details.</p>
			{/if}
		</AdminCard>

		<AdminCard>
			<h3 class="text-base font-semibold text-slate-900 dark:text-slate-100">Recent Runs</h3>
			<div class="mt-4 space-y-3">
				{#if runList.length === 0}
					<p class="text-sm text-slate-500">No runs recorded yet.</p>
				{:else}
					{#each runList as run}
						<div class="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
							<div class="flex items-center justify-between text-sm">
								<span class="font-semibold text-slate-900 dark:text-slate-100">
									{run.run_id}
								</span>
								<Badge
									size="sm"
									variant={run.status === 'completed' ? 'success' : 'info'}
								>
									{run.status}
								</Badge>
							</div>
							<div class="mt-1 text-xs text-slate-500">
								Started {new Date(run.created_at).toLocaleString()}
							</div>
						</div>
					{/each}
				{/if}
			</div>
		</AdminCard>
	</div>

	<AdminCard>
		<h3 class="text-base font-semibold text-slate-900 dark:text-slate-100">Run Controls</h3>
		<div class="mt-4 grid gap-4 md:grid-cols-2">
			<div class="space-y-2">
				<label
					for="select-run"
					class="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
				>
					Select Run
				</label>
				<select
					id="select-run"
					class="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-slate-500 dark:focus:ring-slate-700"
					bind:value={selectedRunId}
				>
					<option value="">Choose…</option>
					{#each runList as run}
						<option value={run.run_id}>{run.run_id} ({run.status})</option>
					{/each}
				</select>
			</div>
			<div class="space-y-2">
				<label
					for="pause-reason"
					class="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
				>
					Pause Reason
				</label>
				<input
					id="pause-reason"
					class="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-slate-500 dark:focus:ring-slate-700"
					bind:value={pauseReason}
					placeholder="Reason for pause"
				/>
			</div>
		</div>

		<div class="mt-4 flex flex-wrap gap-2">
			<Button size="sm" variant="secondary" onclick={() => validateRun(selectedRunId)}>
				Validate
			</Button>
			<Button size="sm" variant="outline" onclick={() => rollbackRun(selectedRunId)}>
				Rollback
			</Button>
			<Button size="sm" variant="outline" onclick={() => pauseRun(selectedRunId)}>
				Pause
			</Button>
			<Button size="sm" variant="primary" onclick={() => resumeRun(selectedRunId)}>
				Resume
			</Button>
		</div>

		<div class="mt-4 space-y-2">
			<label
				for="rollback-date"
				class="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
			>
				Rollback From
			</label>
			<input
				id="rollback-date"
				type="datetime-local"
				class="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-slate-500 dark:focus:ring-slate-700"
				bind:value={rollbackFromDate}
			/>
		</div>
	</AdminCard>

	{#if previewData?.length}
		<Modal
			bind:isOpen={previewModalOpen}
			size="xl"
			title="LLM Migration Preview"
			onClose={() => {
				previewModalOpen = false;
				taskPreviewProjectId = null;
			}}
		>
			<!-- ✅ Improved modal layout with proper spacing and structure -->
			<div class="space-y-6 p-6">
				<!-- Project selector tabs -->
				<div
					class="flex flex-wrap gap-2 pb-4 border-b border-slate-200 dark:border-slate-700"
				>
					{#each previewData as preview, index}
						<Button
							variant={index === activePreviewIndex ? 'primary' : 'secondary'}
							size="sm"
							onclick={() => (activePreviewIndex = index)}
						>
							{preview.projectName}
						</Button>
					{/each}
				</div>

				{#if taskPreviewProjectId}
					<div class="flex justify-end">
						<Button
							variant="primary"
							size="sm"
							loading={taskMigrationLoading}
							onclick={() => runTaskMigration(taskPreviewProjectId)}
						>
							Write Tasks to Ontology
						</Button>
					</div>
				{/if}

				{#if activePreview}
					<!-- Project overview section -->
					<section class="space-y-4 text-sm">
						<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
							<div class="rounded-lg bg-slate-50 dark:bg-slate-900/50 p-4">
								<p
									class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1"
								>
									Project
								</p>
								<p class="font-semibold text-slate-900 dark:text-slate-100">
									{activePreview.projectName}
								</p>
							</div>
							<div class="rounded-lg bg-slate-50 dark:bg-slate-900/50 p-4">
								<p
									class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1"
								>
									Status
								</p>
								<p class="font-semibold text-slate-900 dark:text-slate-100">
									{activePreview.projectStatus}
								</p>
							</div>
							<div class="rounded-lg bg-slate-50 dark:bg-slate-900/50 p-4">
								<p
									class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1"
								>
									Context Doc
								</p>
								<p class="font-medium text-slate-700 dark:text-slate-300">
									{activePreview.contextDocumentId ?? 'Not yet created'}
								</p>
							</div>
							<div class="rounded-lg bg-slate-50 dark:bg-slate-900/50 p-4">
								<p
									class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1"
								>
									Plans Generated
								</p>
								<p class="font-semibold text-slate-900 dark:text-slate-100">
									{activePreview.planPreview?.plans?.length ?? 0}
								</p>
							</div>
						</div>

						{#if Object.keys(activePreview.coreValues ?? {}).length}
							<div class="rounded-lg bg-slate-50 dark:bg-slate-900/50 p-4">
								<p
									class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-3"
								>
									Core Values
								</p>
								<ul class="space-y-2 text-slate-700 dark:text-slate-300">
									{#each Object.entries(activePreview.coreValues ?? {}) as [key, value]}
										{#if value}
											<li class="flex items-start">
												<span class="font-medium min-w-[120px]">
													{key.replace('core_', '').replace(/_/g, ' ')}:
												</span>
												<span>{value}</span>
											</li>
										{/if}
									{/each}
								</ul>
							</div>
						{/if}
					</section>

					{#if activePreview.planPreview?.contextPreview || activePreview.contextMarkdown}
						<section>
							<p
								class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-3"
							>
								Context Snippet
							</p>
							<pre
								class="max-h-64 overflow-auto rounded-lg bg-slate-900 dark:bg-slate-950 p-4 text-xs text-slate-100 border border-slate-700">
{activePreview.planPreview?.contextPreview ?? activePreview.contextMarkdown ?? 'Not available.'}
							</pre>
						</section>
					{/if}

					{#if activePreview.planPreview?.reasoning}
						<section class="rounded-lg bg-slate-50 dark:bg-slate-900/50 p-4">
							<p
								class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2"
							>
								LLM Reasoning
							</p>
							<p class="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
								{activePreview.planPreview.reasoning}
							</p>
						</section>
					{/if}

					{#if activePreview.planPreview?.plans?.length}
						<section>
							<p
								class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-3"
							>
								Synthesized Plans
							</p>
							<div
								class="overflow-auto rounded-lg border border-slate-200 dark:border-slate-700"
							>
								<table class="min-w-full text-sm">
									<thead class="bg-slate-50 dark:bg-slate-900/50">
										<tr
											class="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
										>
											<th class="px-4 py-3">Plan</th>
											<th class="px-4 py-3">Legacy Phase</th>
											<th class="px-4 py-3">State</th>
											<th class="px-4 py-3">Confidence</th>
											<th class="px-4 py-3">Summary</th>
										</tr>
									</thead>
									<tbody
										class="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-slate-950"
									>
										{#each activePreview.planPreview.plans as plan}
											<tr
												class="hover:bg-slate-50 dark:hover:bg-slate-900/30 transition-colors"
											>
												<td
													class="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100"
												>
													{plan.name}
												</td>
												<td
													class="px-4 py-3 text-slate-500 dark:text-slate-400"
												>
													{plan.legacyPhaseId ?? '—'}
												</td>
												<td
													class="px-4 py-3 text-slate-700 dark:text-slate-300"
												>
													{plan.stateKey ?? 'planning'}
												</td>
												<td
													class="px-4 py-3 text-slate-700 dark:text-slate-300"
												>
													{plan.confidence
														? plan.confidence.toFixed(2)
														: '—'}
												</td>
												<td
													class="px-4 py-3 text-slate-600 dark:text-slate-300"
												>
													{plan.summary ?? '—'}
												</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						</section>
					{:else}
						<p class="text-sm text-slate-500 dark:text-slate-400 text-center py-8">
							No plan suggestions generated.
						</p>
					{/if}

					{#if activePreview.templatePreview}
						<section
							class="rounded-lg border border-slate-200 dark:border-slate-700 p-4 space-y-2"
						>
							<p
								class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
							>
								Template Classification
							</p>
							<div class="grid gap-4 sm:grid-cols-4">
								<div>
									<p class="text-xs text-slate-500 dark:text-slate-400">
										Type Key
									</p>
									<p class="font-semibold text-slate-900 dark:text-slate-100">
										{activePreview.templatePreview.typeKey}
									</p>
								</div>
								<div>
									<p class="text-xs text-slate-500 dark:text-slate-400">Realm</p>
									<p class="text-slate-700 dark:text-slate-300">
										{activePreview.templatePreview.realm ?? '—'}
									</p>
								</div>
								<div>
									<p class="text-xs text-slate-500 dark:text-slate-400">
										Confidence
									</p>
									<p class="text-slate-700 dark:text-slate-300">
										{activePreview.templatePreview.confidence?.toFixed(2) ??
											'—'}
									</p>
								</div>
								<div>
									<p class="text-xs text-slate-500 dark:text-slate-400">
										Created Now?
									</p>
									<p class="text-slate-700 dark:text-slate-300">
										{activePreview.templatePreview.created ? 'Yes' : 'Pending'}
									</p>
								</div>
							</div>
							<p class="text-sm text-slate-600 dark:text-slate-300">
								{activePreview.templatePreview.rationale ??
									'LLM did not provide rationale.'}
							</p>
							{#if activePreview.templatePreview.creationPlanned}
								<div class="rounded-lg bg-slate-50 dark:bg-slate-900/40 p-3">
									<p
										class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1"
									>
										Planned Template
									</p>
									<p class="text-sm text-slate-700 dark:text-slate-300">
										Parent: {activePreview.templatePreview.creationPlanned
											.parentTypeKey ?? 'None'}
									</p>
									<p class="text-sm text-slate-700 dark:text-slate-300">
										Realm: {activePreview.templatePreview.creationPlanned
											.realm ?? 'unclassified'}
									</p>
								</div>
							{/if}
						</section>
					{/if}

					{#if activePreview.taskPreview}
						<section class="space-y-4">
							<p
								class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
							>
								Task Migration Preview
							</p>
							<div class="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
								<div
									class="rounded-lg border border-slate-200 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-950"
								>
									<p class="text-xs text-slate-500 dark:text-slate-400">Total</p>
									<p
										class="text-lg font-semibold text-slate-900 dark:text-slate-100"
									>
										{activePreview.taskPreview.summary.total}
									</p>
								</div>
								<div
									class="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3 text-sm dark:border-emerald-700/40 dark:bg-emerald-900/30"
								>
									<p class="text-xs text-emerald-700 dark:text-emerald-200">
										Ready
									</p>
									<p
										class="text-lg font-semibold text-emerald-900 dark:text-emerald-100"
									>
										{activePreview.taskPreview.summary.readyToMigrate}
									</p>
								</div>
								<div
									class="rounded-lg border border-slate-200 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-950"
								>
									<p class="text-xs text-slate-500 dark:text-slate-400">
										Already Migrated
									</p>
									<p
										class="text-lg font-semibold text-slate-900 dark:text-slate-100"
									>
										{activePreview.taskPreview.summary.alreadyMigrated}
									</p>
								</div>
								<div
									class="rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-sm dark:border-amber-700/40 dark:bg-amber-900/30"
								>
									<p class="text-xs text-amber-700 dark:text-amber-200">
										Blocked
									</p>
									<p
										class="text-lg font-semibold text-amber-900 dark:text-amber-100"
									>
										{activePreview.taskPreview.summary.blocked}
									</p>
								</div>
								<div
									class="rounded-lg border border-slate-200 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-950"
								>
									<p class="text-xs text-slate-500 dark:text-slate-400">
										Missing Project
									</p>
									<p
										class="text-lg font-semibold text-slate-900 dark:text-slate-100"
									>
										{activePreview.taskPreview.summary.missingProject}
									</p>
								</div>
							</div>

							<div
								class="overflow-auto rounded-lg border border-slate-200 dark:border-slate-700 max-h-[420px]"
							>
								<table class="min-w-full text-sm">
									<thead
										class="bg-slate-50 dark:bg-slate-900/40 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
									>
										<tr>
											<th class="px-4 py-3 text-left">Task</th>
											<th class="px-4 py-3 text-left">Legacy State</th>
											<th class="px-4 py-3 text-left">Recommended</th>
											<th class="px-4 py-3 text-left">Type</th>
											<th class="px-4 py-3 text-left">Phase / Plan</th>
											<th class="px-4 py-3 text-left">Events</th>
											<th class="px-4 py-3 text-left">Notes</th>
										</tr>
									</thead>
									<tbody
										class="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-950"
									>
										{#each activePreview.taskPreview.tasks as task}
											<tr
												class="hover:bg-slate-50 dark:hover:bg-slate-900/30"
											>
												<td
													class="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100"
												>
													{task.title}
													<div
														class="text-xs text-slate-500 dark:text-slate-400"
													>
														{task.legacyTaskId}
													</div>
												</td>
												<td
													class="px-4 py-3 text-slate-600 dark:text-slate-300"
												>
													{task.legacyStatus}
												</td>
												<td
													class="px-4 py-3 text-slate-600 dark:text-slate-300"
												>
													{task.recommendedStateKey}
													<div
														class="text-xs text-slate-500 dark:text-slate-400"
													>
														Due {formatDate(task.dueAt)}
													</div>
												</td>
												<td
													class="px-4 py-3 text-slate-600 dark:text-slate-300"
												>
													{task.recommendedTypeKey}
													<div
														class="text-xs text-slate-500 dark:text-slate-400"
													>
														{task.facetScale ?? '—'}
													</div>
												</td>
												<td
													class="px-4 py-3 text-slate-600 dark:text-slate-300"
												>
													{task.phaseName ?? task.phaseId ?? '—'}
													<div
														class="text-xs text-slate-500 dark:text-slate-400"
													>
														{task.suggestedOntoPlanId ??
															'No plan mapping'}
													</div>
												</td>
												<td
													class="px-4 py-3 text-slate-600 dark:text-slate-300"
												>
													{task.calendarEventCount}
												</td>
												<td
													class="px-4 py-3 text-slate-600 dark:text-slate-300"
												>
													<div>{task.notes}</div>
													{#if task.classification.reasoning}
														<div
															class="mt-1 text-xs text-slate-500 dark:text-slate-400"
														>
															{task.classification.reasoning}
														</div>
													{/if}
												</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						</section>
					{/if}

					{#if activePreview.calendarPreview}
						<section class="space-y-4">
							<p
								class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
							>
								Calendar Event Alignment
							</p>
							<div class="grid gap-3 sm:grid-cols-3">
								<div
									class="rounded-lg border border-slate-200 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-950"
								>
									<p class="text-xs text-slate-500 dark:text-slate-400">
										Total Events
									</p>
									<p
										class="text-lg font-semibold text-slate-900 dark:text-slate-100"
									>
										{activePreview.calendarPreview.stats.totalEvents}
									</p>
								</div>
								<div
									class="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3 text-sm dark:border-emerald-700/40 dark:bg-emerald-900/30"
								>
									<p class="text-xs text-emerald-700 dark:text-emerald-200">
										Linkable
									</p>
									<p
										class="text-lg font-semibold text-emerald-900 dark:text-emerald-100"
									>
										{activePreview.calendarPreview.stats.linkableEvents}
									</p>
								</div>
								<div
									class="rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-sm dark:border-amber-700/40 dark:bg-amber-900/30"
								>
									<p class="text-xs text-amber-700 dark:text-amber-200">
										Blocked
									</p>
									<p
										class="text-lg font-semibold text-amber-900 dark:text-amber-100"
									>
										{activePreview.calendarPreview.stats.blockedEvents}
									</p>
								</div>
							</div>

							<div
								class="overflow-auto rounded-lg border border-slate-200 dark:border-slate-700 max-h-[320px]"
							>
								<table class="min-w-full text-sm">
									<thead
										class="bg-slate-50 dark:bg-slate-900/40 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"
									>
										<tr>
											<th class="px-4 py-3 text-left">Event</th>
											<th class="px-4 py-3 text-left">Task Mapping</th>
											<th class="px-4 py-3 text-left">Start</th>
											<th class="px-4 py-3 text-left">Status</th>
											<th class="px-4 py-3 text-left">Calendar</th>
										</tr>
									</thead>
									<tbody
										class="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-950"
									>
										{#each activePreview.calendarPreview.events as event}
											<tr
												class="hover:bg-slate-50 dark:hover:bg-slate-900/30"
											>
												<td
													class="px-4 py-3 text-slate-900 dark:text-slate-100"
												>
													{event.eventTitle ?? 'Untitled'}
													<div
														class="text-xs text-slate-500 dark:text-slate-400"
													>
														{event.legacyEventId}
													</div>
												</td>
												<td
													class="px-4 py-3 text-slate-600 dark:text-slate-300"
												>
													{event.taskOntoId ?? event.taskId}
													<div
														class="text-xs text-slate-500 dark:text-slate-400"
													>
														{event.willLinkToTask
															? 'Will link'
															: 'Blocked'}
													</div>
												</td>
												<td
													class="px-4 py-3 text-slate-600 dark:text-slate-300"
												>
													{formatDate(event.startAt)}
												</td>
												<td
													class="px-4 py-3 text-slate-600 dark:text-slate-300"
												>
													{event.syncStatus}
													<div
														class="text-xs text-slate-500 dark:text-slate-400"
													>
														{event.syncSource ?? 'legacy'}
													</div>
												</td>
												<td
													class="px-4 py-3 text-slate-600 dark:text-slate-300"
												>
													{event.calendarId ?? '—'}
												</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						</section>
					{/if}

					{#if activePreview.planPreview?.prompt}
						<section>
							<details
								class="rounded-lg border border-slate-200 dark:border-slate-700 p-4 bg-slate-50 dark:bg-slate-900/50 hover:bg-slate-100 dark:hover:bg-slate-900/70 transition-colors"
							>
								<summary
									class="cursor-pointer text-sm font-semibold text-slate-900 dark:text-slate-100"
								>
									Show Prompt
								</summary>
								<pre
									class="mt-4 max-h-64 overflow-auto rounded-lg bg-slate-900 dark:bg-slate-950 p-4 text-xs text-slate-100 border border-slate-700">
{activePreview.planPreview.prompt}
								</pre>
							</details>
						</section>
					{/if}
				{:else}
					<p class="text-sm text-slate-500 dark:text-slate-400 text-center py-8">
						No preview available.
					</p>
				{/if}
			</div>
		</Modal>
	{/if}
</div>
