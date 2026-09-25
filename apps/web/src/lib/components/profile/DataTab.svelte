<!-- apps/web/src/lib/components/profile/DataTab.svelte -->
<!--
	Settings → Your data. Every line states something the code enforces; the claim
	list with its enforcing code is in docs/privacy/CLAIMS.md (tasker 103, PANEL).
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import {
		AlertCircle,
		Bot,
		Calendar,
		CircleCheck,
		Coffee,
		Cpu,
		Database,
		Download,
		FileText,
		FolderKanban,
		Globe,
		Image,
		LoaderCircle,
		Mail,
		MessageSquare,
		Mic,
		RefreshCw,
		Trash2
	} from '$lib/icons/lucide';
	import Button from '$lib/components/ui/Button.svelte';
	import TabHeader from './_shared/TabHeader.svelte';
	import { AGENT_CLIENT_PROFILES } from '$lib/agent-call/agent-client-profiles';
	import { DATA_EXPORT_REQUESTS_PER_DAY, RETENTION_WINDOWS } from '$lib/privacy/retention-policy';
	import {
		formatBytes,
		formatDateTime,
		formatRelativeTime,
		isActiveExport,
		plural,
		type ConnectedAgent,
		type DataPanelPayload,
		type DataSummary,
		type ExportStatusPayload,
		type UserDataExportView
	} from '$lib/privacy/user-data';

	interface Props {
		fetcher?: typeof fetch;
	}

	let { fetcher = fetch }: Props = $props();

	const EXPORT_POLL_MS = 5_000;
	const W = RETENTION_WINDOWS;
	const manageLinkClass =
		'inline-flex min-h-[44px] items-center rounded-md px-2 text-xs font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

	let summary = $state.raw<DataSummary | null>(null);
	let exportView = $state.raw<UserDataExportView | null>(null);
	let remainingToday = $state(DATA_EXPORT_REQUESTS_PER_DAY);
	let loading = $state(true);
	let loadError = $state<string | null>(null);
	let requesting = $state(false);
	let exportError = $state<string | null>(null);
	let now = $state(new Date());

	let traceRows = $derived(
		summary
			? [
					{
						count: summary.traces.toolTraces,
						one: 'tool trace',
						many: 'tool traces',
						detail: 'What a tool was asked and what it returned.',
						window: W.toolTraces.label
					},
					{
						count: summary.traces.promptSnapshots,
						one: 'prompt snapshot',
						many: 'prompt snapshots',
						detail: 'The assembled prompt for a reply, kept for debugging.',
						window: W.promptSnapshots.label
					},
					{
						count: summary.traces.aiUsageRecords,
						one: 'AI usage record',
						many: 'AI usage records',
						detail: 'Which model ran and what it cost. Not your prompts or replies.',
						window: W.aiUsage.label
					}
				]
			: []
	);
	let exportActive = $derived(isActiveExport(exportView));
	let canStartExport = $derived(!exportActive && !requesting && remainingToday > 0);

	async function readApi<T>(response: Response): Promise<T> {
		const payload = await response.json().catch(() => null);
		if (!response.ok || !payload?.success) {
			const error = new Error(payload?.error || 'Request failed') as Error & {
				status?: number;
				details?: unknown;
			};
			error.status = response.status;
			error.details = payload?.details;
			throw error;
		}
		return payload.data as T;
	}

	async function loadPanel() {
		loading = true;
		loadError = null;
		try {
			const data = await readApi<DataPanelPayload>(
				await fetcher('/api/account/data-summary')
			);
			summary = data.summary;
			exportView = data.export;
			remainingToday = data.remainingToday;
			now = new Date();
		} catch (error) {
			console.error('[Your data] Failed to load summary:', error);
			loadError = 'Your data summary could not be loaded right now.';
		} finally {
			loading = false;
		}
	}

	async function refreshExport() {
		try {
			const data = await readApi<ExportStatusPayload>(await fetcher('/api/account/exports'));
			exportView = data.export;
			remainingToday = data.remainingToday;
			now = new Date();
		} catch (error) {
			console.error('[Your data] Failed to refresh export:', error);
		}
	}

	async function startExport() {
		if (!canStartExport) return;
		requesting = true;
		exportError = null;
		try {
			const data = await readApi<{ export: UserDataExportView }>(
				await fetcher('/api/account/exports', { method: 'POST' })
			);
			exportView = data.export;
			now = new Date();
			void refreshExport();
		} catch (error) {
			const status = (error as { status?: number }).status;
			if (status === 429) {
				remainingToday = 0;
				const next = (error as { details?: { nextAllowedAt?: string } }).details
					?.nextAllowedAt;
				exportError = next
					? `You've used today's ${DATA_EXPORT_REQUESTS_PER_DAY} exports. You can start another after ${formatDateTime(next)}.`
					: `You've used today's ${DATA_EXPORT_REQUESTS_PER_DAY} exports. Try again tomorrow.`;
			} else {
				exportError =
					error instanceof Error && error.message !== 'Request failed'
						? error.message
						: 'Your export could not be started. Please try again.';
			}
		} finally {
			requesting = false;
		}
	}

	// Poll while an export is queued or running, only while the page is visible.
	$effect(() => {
		if (!exportActive) return;
		let timer: ReturnType<typeof setTimeout> | undefined;
		let stopped = false;
		const arm = () => {
			if (stopped || timer !== undefined || document.visibilityState === 'hidden') return;
			timer = setTimeout(tick, EXPORT_POLL_MS);
		};
		const tick = async () => {
			timer = undefined;
			await refreshExport();
			arm();
		};
		const onVisibilityChange = () => {
			if (document.visibilityState === 'hidden') {
				clearTimeout(timer);
				timer = undefined;
			} else {
				arm();
			}
		};
		document.addEventListener('visibilitychange', onVisibilityChange);
		arm();
		return () => {
			stopped = true;
			clearTimeout(timer);
			document.removeEventListener('visibilitychange', onVisibilityChange);
		};
	});

	onMount(() => {
		void loadPanel();
	});

	function agentName(agent: ConnectedAgent): string {
		if (agent.name) return agent.name;
		const profile = AGENT_CLIENT_PROFILES.find((entry) => entry.provider === agent.provider);
		return profile?.label ?? agent.provider;
	}

	function since(iso: string | null, fallback: string): string {
		return iso ? formatRelativeTime(iso, now) : fallback;
	}

	function failureMessage(code: string | null): string {
		if (code === 'account_deletion_pending') {
			return 'This account is being deleted, so it can’t be exported.';
		}
		if (code === 'stale') {
			return 'That export stalled. Please try again.';
		}
		return 'That export didn’t finish. Please try again.';
	}
</script>

<div class="min-w-0 space-y-4 sm:space-y-5">
	<TabHeader
		icon={Database}
		title="Your data"
		description="What BuildOS keeps, what it only reads, and how long anything stays."
	>
		{#snippet actions()}
			<Button
				variant="primary"
				size="sm"
				icon={Download}
				loading={requesting}
				disabled={!canStartExport || loading}
				onclick={startExport}
				class="pressable"
			>
				<span class="sm:hidden">Download</span>
				<span class="hidden sm:inline">Download my data</span>
			</Button>
		{/snippet}
	</TabHeader>

	{#if exportError}
		<p
			class="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-foreground tx tx-static tx-weak"
			role="alert"
		>
			<AlertCircle class="mt-0.5 h-4 w-4 flex-shrink-0 text-destructive" aria-hidden="true" />
			<span>{exportError}</span>
		</p>
	{/if}

	{#if exportView && exportView.status !== 'expired'}
		<div aria-live="polite">
			{#if exportActive}
				<div
					class="flex items-start gap-3 rounded-lg border border-border bg-card p-3 sm:p-4 shadow-ink tx tx-grain tx-weak"
					role="status"
				>
					<LoaderCircle
						class="mt-0.5 h-4 w-4 flex-shrink-0 animate-spin text-accent motion-reduce:animate-none"
						aria-hidden="true"
					/>
					<div class="min-w-0">
						<p class="text-sm font-semibold text-foreground">
							{exportView.status === 'queued'
								? 'Your export is in line…'
								: 'Packing your data…'}
						</p>
						<p class="mt-0.5 text-xs text-muted-foreground">
							Started {formatRelativeTime(exportView.requestedAt, now)}. You can leave
							this page; the download will be here when you come back.
						</p>
					</div>
				</div>
			{:else if exportView.status === 'ready'}
				<div
					class="rounded-lg border border-success/30 bg-success/10 p-3 sm:p-4 shadow-ink tx tx-grain tx-weak"
				>
					<div class="flex items-start gap-3">
						<CircleCheck
							class="mt-0.5 h-4 w-4 flex-shrink-0 text-success"
							aria-hidden="true"
						/>
						<div class="min-w-0 flex-1">
							<p class="text-sm font-semibold text-foreground">
								Your export is ready{exportView.byteSize !== null
									? ` · ${formatBytes(exportView.byteSize)}`
									: ''}
							</p>
							<p class="mt-0.5 text-xs text-muted-foreground">
								The link works until {formatDateTime(exportView.expiresAt)}, then
								the file is deleted.
								{#if exportView.downloadPaths.length > 1}
									It comes in {exportView.downloadPaths.length} parts; each part is
									a complete zip.
								{/if}
							</p>
							<div class="mt-3 flex flex-wrap gap-2">
								{#each exportView.downloadPaths as path, index (path)}
									<a
										href={path}
										data-sveltekit-reload
										rel="nofollow"
										class="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-semibold text-foreground shadow-ink pressable hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
									>
										<Download class="h-4 w-4" aria-hidden="true" />
										{exportView.downloadPaths.length > 1
											? `Part ${index + 1}`
											: 'Download zip'}
									</a>
								{/each}
							</div>
						</div>
					</div>
				</div>
			{:else if exportView.status === 'failed'}
				<div
					class="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3 sm:p-4 shadow-ink tx tx-static tx-weak"
				>
					<AlertCircle
						class="mt-0.5 h-4 w-4 flex-shrink-0 text-destructive"
						aria-hidden="true"
					/>
					<p class="text-sm text-foreground">{failureMessage(exportView.errorCode)}</p>
				</div>
			{/if}
		</div>
	{/if}

	{#if !exportActive && remainingToday === 0 && !exportError}
		<p class="text-xs text-muted-foreground">
			You've used today's {DATA_EXPORT_REQUESTS_PER_DAY} exports. You can start another tomorrow.
		</p>
	{/if}

	{#if loading}
		<div
			class="flex min-h-48 items-center justify-center rounded-lg border border-border bg-card p-6 text-center shadow-ink"
			role="status"
			aria-live="polite"
		>
			<div>
				<RefreshCw
					class="mx-auto h-6 w-6 animate-spin text-accent motion-reduce:animate-none"
					aria-hidden="true"
				/>
				<p class="mt-3 text-sm font-medium text-foreground">Counting your data…</p>
			</div>
		</div>
	{:else if loadError || !summary}
		<div
			class="rounded-lg border border-destructive/30 bg-destructive/10 p-5 text-center shadow-ink tx tx-static tx-weak"
		>
			<AlertCircle class="mx-auto h-6 w-6 text-destructive" aria-hidden="true" />
			<p class="mt-2 text-sm font-semibold text-foreground">{loadError}</p>
			<Button class="mt-4" variant="outline" size="sm" icon={RefreshCw} onclick={loadPanel}>
				Retry
			</Button>
		</div>
	{:else}
		{@const workspace = summary.workspace}
		{@const connections = summary.connections}

		<!-- What BuildOS keeps -->
		<section
			class="rounded-lg border border-border bg-card p-4 sm:p-5 shadow-ink tx tx-frame tx-weak"
			aria-labelledby="data-keeps-heading"
		>
			<div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
				<h3 id="data-keeps-heading" class="micro-label font-semibold text-accent">
					What BuildOS keeps
				</h3>
				<p class="text-xs text-muted-foreground">Yours until you delete it.</p>
			</div>
			<ul class="mt-3 space-y-2 text-sm text-foreground">
				<li class="flex items-start gap-2.5">
					<FolderKanban
						class="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground"
						aria-hidden="true"
					/>
					<span>
						{plural(workspace.projects, 'project', 'projects')} · {plural(
							workspace.documents,
							'doc',
							'docs'
						)} · {plural(workspace.tasks, 'task', 'tasks')}
					</span>
				</li>
				<li class="flex items-start gap-2.5">
					<MessageSquare
						class="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground"
						aria-hidden="true"
					/>
					<span>
						{plural(workspace.chats, 'chat', 'chats')} · {plural(
							workspace.messages,
							'message',
							'messages'
						)}
					</span>
				</li>
				<li class="flex items-start gap-2.5">
					<Mic
						class="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground"
						aria-hidden="true"
					/>
					<span>
						{plural(workspace.voiceNotes, 'voice note', 'voice notes')}
						<span class="text-muted-foreground">(audio + transcript)</span>
					</span>
				</li>
				<li class="flex items-start gap-2.5">
					<Coffee
						class="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground"
						aria-hidden="true"
					/>
					<span>{plural(workspace.dailyBriefs, 'daily brief', 'daily briefs')}</span>
				</li>
				{#if workspace.uploads > 0}
					<li class="flex items-start gap-2.5">
						<Image
							class="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground"
							aria-hidden="true"
						/>
						<span>{plural(workspace.uploads, 'uploaded file', 'uploaded files')}</span>
					</li>
				{/if}
			</ul>
			<p class="mt-3 text-xs leading-relaxed text-muted-foreground">
				Voice audio stays with its note until you delete the note. Projects, docs, tasks,
				and voice notes you delete leave your workspace right away and are erased from
				storage {W.deletedItems.label} later.
			</p>
		</section>

		<!-- What BuildOS reads but doesn't keep -->
		<section
			class="rounded-lg border border-border bg-card p-4 sm:p-5 shadow-ink tx tx-thread tx-weak"
			aria-labelledby="data-reads-heading"
		>
			<h3 id="data-reads-heading" class="micro-label font-semibold text-accent">
				What BuildOS reads but doesn’t keep
			</h3>
			<dl class="mt-3 space-y-3 text-sm">
				<div class="grid gap-1 sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-3">
					<dt class="flex items-center gap-2 font-semibold text-foreground">
						<Mail class="h-4 w-4 text-muted-foreground" aria-hidden="true" />Gmail
					</dt>
					<dd class="text-muted-foreground">
						{#if connections.gmail.connected}
							Read only when you use it, in a chat or in Settings. The search terms,
							message ids, and counts stay {W.toolTraces.label}; a log of each read,
							with no email content, stays {W.accessAudit.label}.
						{:else if connections.gmail.needsReconnect}
							Needs reconnecting. Nothing is read until you do.
						{:else}
							Not connected.
						{/if}
					</dd>
				</div>
				<div class="grid gap-1 sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-3">
					<dt class="flex items-center gap-2 font-semibold text-foreground">
						<Calendar
							class="h-4 w-4 text-muted-foreground"
							aria-hidden="true"
						/>Calendar
					</dt>
					<dd class="text-muted-foreground">
						{#if connections.calendar.connected}
							Events BuildOS didn’t create aren’t saved with your work. Chat keeps
							only their times and ids, plus any search terms, {W.toolTraces.label}. A
							calendar analysis keeps only the title and time of the events behind
							each suggestion, then deletes them within {W.calendarAnalysisEvents
								.label}.
						{:else}
							Not connected.
						{/if}
					</dd>
				</div>
				<div class="grid gap-1 sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-3">
					<dt class="flex items-center gap-2 font-semibold text-foreground">
						<Globe class="h-4 w-4 text-muted-foreground" aria-hidden="true" />Web pages
					</dt>
					<dd class="text-muted-foreground">
						Page text is used for the answer, then dropped. Search terms, links, and
						titles stay {W.toolTraces.label}. Background agent runs keep the pages they
						fetch
						{W.agentWebPages.label}.
					</dd>
				</div>
			</dl>
			<p class="mt-3 text-xs leading-relaxed text-muted-foreground">
				If the assistant quotes something it read, that reply is part of your chat.
			</p>
		</section>

		<!-- Short-lived traces -->
		<section class="wt-ghost p-4 sm:p-5" aria-labelledby="data-traces-heading">
			<div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
				<h3 id="data-traces-heading" class="micro-label font-semibold text-accent">
					Short-lived traces
				</h3>
				<p class="text-xs text-muted-foreground">Deleted automatically.</p>
			</div>
			<ul class="mt-3 space-y-2.5 text-sm">
				{#each traceRows as trace (trace.one)}
					<li class="flex items-start justify-between gap-3">
						<div class="min-w-0">
							<p class="font-medium text-foreground">
								{plural(trace.count, trace.one, trace.many)}
							</p>
							<p class="text-xs text-muted-foreground">{trace.detail}</p>
						</div>
						<span
							class="flex-shrink-0 rounded-full border border-border bg-muted px-2 py-0.5 text-2xs font-medium text-muted-foreground"
						>
							{trace.window}
						</span>
					</li>
				{/each}
			</ul>
		</section>

		<!-- AI -->
		<div
			class="flex items-start gap-3 rounded-lg border border-info/30 bg-info/10 p-3 sm:p-4 shadow-ink"
		>
			<Cpu class="mt-0.5 h-4 w-4 flex-shrink-0 text-info" aria-hidden="true" />
			<div class="min-w-0 text-sm">
				<p class="font-semibold text-foreground">
					AI: every model call is zero-retention, except voice.
				</p>
				<p class="mt-0.5 text-xs leading-relaxed text-muted-foreground">
					BuildOS sends AI requests only to providers that agree not to store or train on
					them. Voice transcription and read-aloud briefs go to OpenAI, which may keep
					them for up to 30 days.
				</p>
			</div>
		</div>

		<!-- Connected -->
		<section
			class="rounded-lg border border-border bg-card p-4 sm:p-5 shadow-ink"
			aria-labelledby="data-connected-heading"
		>
			<h3 id="data-connected-heading" class="micro-label font-semibold text-accent">
				Connected
			</h3>
			<ul class="mt-2 divide-y divide-border text-sm">
				<li class="flex items-center justify-between gap-3 py-1.5">
					<span class="flex min-w-0 items-center gap-2">
						<Mail
							class="h-4 w-4 flex-shrink-0 text-muted-foreground"
							aria-hidden="true"
						/>
						<span class="truncate text-foreground">
							Gmail
							<span class="text-muted-foreground">
								· {connections.gmail.connected
									? `last read ${since(connections.gmail.lastReadAt, 'not read yet')}`
									: connections.gmail.needsReconnect
										? 'needs reconnecting'
										: 'not connected'}
							</span>
						</span>
					</span>
					<a href="/profile?tab=email" class={manageLinkClass}>Manage</a>
				</li>
				<li class="flex items-center justify-between gap-3 py-1.5">
					<span class="flex min-w-0 items-center gap-2">
						<Calendar
							class="h-4 w-4 flex-shrink-0 text-muted-foreground"
							aria-hidden="true"
						/>
						<span class="truncate text-foreground">
							Calendar
							<span class="text-muted-foreground">
								· {connections.calendar.connected
									? `synced ${since(connections.calendar.lastSyncedAt, 'not yet')}`
									: 'not connected'}
							</span>
						</span>
					</span>
					<a href="/profile?tab=calendar" class={manageLinkClass}>Manage</a>
				</li>
				{#each connections.agents as agent (agent.id)}
					<li class="flex items-center justify-between gap-3 py-1.5">
						<span class="flex min-w-0 items-center gap-2">
							<Bot
								class="h-4 w-4 flex-shrink-0 text-muted-foreground"
								aria-hidden="true"
							/>
							<span class="truncate text-foreground">
								{agentName(agent)}
								<span class="text-muted-foreground">
									· {agent.lastUsedAt
										? `used ${formatRelativeTime(agent.lastUsedAt, now)}`
										: 'not used yet'}
								</span>
							</span>
						</span>
						<a href="/profile?tab=agent-keys" class={manageLinkClass}>Manage</a>
					</li>
				{:else}
					<li class="flex items-center justify-between gap-3 py-1.5">
						<span class="flex min-w-0 items-center gap-2">
							<Bot
								class="h-4 w-4 flex-shrink-0 text-muted-foreground"
								aria-hidden="true"
							/>
							<span class="text-muted-foreground">No agents connected</span>
						</span>
						<a href="/profile?tab=agent-keys" class={manageLinkClass}>Manage</a>
					</li>
				{/each}
			</ul>
		</section>

		<!-- Delete -->
		<div
			class="flex flex-col gap-3 rounded-lg border border-destructive/30 bg-card p-4 sm:flex-row sm:items-center sm:p-5 shadow-ink tx tx-static tx-weak"
		>
			<a
				href="/profile?section=delete"
				class="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-destructive px-3 text-sm font-semibold text-destructive shadow-ink pressable hover:bg-destructive hover:text-destructive-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
			>
				<Trash2 class="h-4 w-4" aria-hidden="true" />
				Delete my account
			</a>
			<p class="text-xs leading-relaxed text-muted-foreground">
				Access ends right away. Your data is erased within {W.accountDeletion.label}.
			</p>
		</div>

		<p class="flex items-start gap-2 text-2xs text-muted-foreground">
			<FileText class="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
			<span>
				Your download holds your profile, projects, docs, tasks, chats, briefs, voice notes,
				uploads, and contacts. It leaves out tool traces and any passwords, keys, or tokens.
			</span>
		</p>
	{/if}
</div>
