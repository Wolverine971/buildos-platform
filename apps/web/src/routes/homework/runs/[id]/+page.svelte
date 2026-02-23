<!-- apps/web/src/routes/homework/runs/[id]/+page.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import WorkspaceTreeNode from '$lib/components/homework/WorkspaceTreeNode.svelte';
	import DocumentModal from '$lib/components/ontology/DocumentModal.svelte';
	import RichMarkdownEditor from '$lib/components/ui/RichMarkdownEditor.svelte';

	interface WorkspaceDoc {
		id: string;
		title: string;
		type_key: string;
		state_key: string;
		project_id: string;
		props: Record<string, any>;
		updated_at: string;
		created_at: string;
		children?: WorkspaceDoc[];
	}

	interface WorkspaceEdge {
		id: string;
		src_id: string;
		dst_id: string;
		rel: string;
		props: Record<string, any>;
	}

	interface ScratchpadDoc {
		id: string;
		content: string | null;
		title: string;
		updated_at?: string;
	}

	interface ExecutorPadDoc {
		id: string;
		title: string;
		content: string | null;
		props: Record<string, any>;
		updated_at: string;
		created_at: string;
	}

	interface HomeworkRunIteration {
		id: string;
		iteration: number;
		status: string;
		summary: string | null;
		started_at: string | null;
		ended_at: string | null;
		error: string | null;
		error_fingerprint: string | null;
		metrics: Record<string, any>;
		progress_delta: any;
		artifacts: any;
		branch_id: string | null;
	}

	interface HomeworkRunEvent {
		id: string;
		seq: number;
		iteration: number;
		event: Record<string, any>;
		created_at: string;
	}

	interface HomeworkRun {
		id: string;
		objective: string;
		status: string;
		iteration: number;
		duration_ms: number | null;
		metrics: Record<string, any>;
		budgets: Record<string, any>;
		report: any;
		stop_reason: any;
	}

	interface Props {
		data: {
			run: HomeworkRun;
			iterations: HomeworkRunIteration[];
			events: HomeworkRunEvent[];
			workspaceDocs: WorkspaceDoc[];
			workspaceEdges: WorkspaceEdge[];
			scratchpad: ScratchpadDoc | null;
			executorPads: ExecutorPadDoc[];
		};
	}

	let { data }: Props = $props();

	let run = $state(data.run);
	let iterations = $state(data.iterations);
	let events = $state(data.events);
	let workspaceDocs = $state(data.workspaceDocs ?? []);
	let workspaceEdges = $state(data.workspaceEdges ?? []);
	let scratchpad = $state(data.scratchpad);
	let executorPads = $state(data.executorPads ?? []);
	const latestPlan = $derived.by(() => {
		const firstIter = iterations[0];
		const plan = (firstIter?.artifacts?.plan as any) || (run?.metrics?.plan as any) || null;
		return plan;
	});
	let polling = $state<ReturnType<typeof setInterval> | null>(null);
	let updating = $state(false);
	let pollError = $state<string | null>(null);
	let pollFailureCount = $state(0);
	let showLiveModal = $state(false);
	let actionError = $state<string | null>(null);
	let userAnswer = $state('');
	let userAnswerInput: HTMLTextAreaElement | null = null;
	let userAnswerFocused = $state(false);
	let expandedIterations = $state<Set<string>>(new Set());
	let expandedEvents = $state<Set<string>>(new Set());
	let scratchpadExpanded = $state(true);
	let scratchpadContent = $state('');
	let scratchpadSaveStatus = $state<'idle' | 'saving' | 'saved' | 'error'>('idle');
	let showDocumentModal = $state(false);
	let selectedDocumentId = $state<string | null>(null);
	const waitingQuestions = $derived.by(() => {
		for (const row of events) {
			if (row?.event?.type !== 'run_waiting_on_user') continue;
			if (!Array.isArray(row.event.questions)) continue;
			const questions = row.event.questions
				.filter((question: unknown): question is string => typeof question === 'string')
				.map((question: string) => question.trim())
				.filter((question: string) => question.length > 0);
			if (questions.length > 0) return questions;
		}

		const stopReasonDetail =
			run?.stop_reason &&
			typeof run.stop_reason === 'object' &&
			!Array.isArray(run.stop_reason) &&
			typeof run.stop_reason.detail === 'string'
				? run.stop_reason.detail.trim()
				: '';

		return stopReasonDetail ? [stopReasonDetail] : [];
	});
	const requiresUserAnswer = $derived.by(
		() => run.status === 'waiting_on_user' && waitingQuestions.length > 0
	);
	const canContinueWaitingRun = $derived.by(
		() => !requiresUserAnswer || userAnswer.trim().length > 0
	);
	const pausePollingForAnswer = $derived.by(
		() =>
			run.status === 'waiting_on_user' && (userAnswerFocused || userAnswer.trim().length > 0)
	);

	const toggleIteration = (id: string) => {
		const newSet = new Set(expandedIterations);
		if (newSet.has(id)) {
			newSet.delete(id);
		} else {
			newSet.add(id);
		}
		expandedIterations = newSet;
	};

	const toggleEvent = (id: string) => {
		const newSet = new Set(expandedEvents);
		if (newSet.has(id)) {
			newSet.delete(id);
		} else {
			newSet.add(id);
		}
		expandedEvents = newSet;
	};

	const formatDate = (dateStr: string | null) => {
		if (!dateStr) return '—';
		return new Date(dateStr).toLocaleString('en-US', {
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	};

	const formatDuration = (start: string | null, end: string | null) => {
		if (!start || !end) return '—';
		const ms = new Date(end).getTime() - new Date(start).getTime();
		const seconds = Math.floor(ms / 1000);
		if (seconds < 60) return `${seconds}s`;
		const minutes = Math.floor(seconds / 60);
		const remainingSeconds = seconds % 60;
		return `${minutes}m ${remainingSeconds}s`;
	};

	const getMetric = (metrics: any, key: string) => {
		if (!metrics || typeof metrics !== 'object') return 0;
		return typeof metrics[key] === 'number' ? metrics[key] : 0;
	};

	const getBudget = (key: string) => {
		const b = run?.budgets;
		if (!b || typeof b !== 'object') return null;
		return b[key];
	};

	const formatMinutes = (ms: number | null) => {
		if (!ms || isNaN(ms as number)) return '—';
		return `${Math.round((ms as number) / 60000)} min`;
	};

	const runningMs = $derived.by(() => {
		const running = getMetric(run.metrics, 'running_ms');
		if (running) return running;
		if (run.duration_ms) return run.duration_ms;
		return 0;
	});

	let treeRoots = $derived.by(() => {
		const nodes = new Map();
		const children = new Map();
		for (const doc of workspaceDocs) {
			nodes.set(doc.id, { ...doc, children: [] });
			children.set(doc.id, []);
		}
		for (const edge of workspaceEdges) {
			if (!nodes.has(edge.src_id) || !nodes.has(edge.dst_id)) continue;
			children.get(edge.src_id).push(edge.dst_id);
		}
		for (const [id, childIds] of children.entries()) {
			nodes.get(id).children = childIds.map((childId: string) => nodes.get(childId));
		}
		const childSet = new Set();
		for (const childIds of children.values()) {
			for (const id of childIds) childSet.add(id);
		}
		return Array.from(nodes.values()).filter((node) => !childSet.has(node.id));
	});

	const refresh = async (options: { force?: boolean } = {}) => {
		if (!options.force && pausePollingForAnswer) return;
		if (updating) return;
		updating = true;
		pollError = null;
		try {
			const res = await fetch(
				`/api/homework/runs/${run.id}?include_workspace=true&include_iterations=true&include_events=true`
			);

			if (!res.ok) {
				throw new Error(`HTTP ${res.status}: ${res.statusText}`);
			}

			const json = await res.json();

			if (json?.error) {
				throw new Error(json.error);
			}

			if (json?.data?.run) {
				run = json.data.run;
				iterations = json.data.iterations ?? iterations;
				events = json.data.events ?? events;
				workspaceDocs = json.data.workspaceDocs ?? workspaceDocs;
				workspaceEdges = json.data.workspaceEdges ?? workspaceEdges;
				scratchpad = json.data.scratchpad ?? scratchpad;
				executorPads = json.data.executorPads ?? executorPads;
				pollFailureCount = 0;
			}
		} catch (err) {
			pollFailureCount++;
			const message = err instanceof Error ? err.message : 'Unknown error';
			pollError = `Failed to refresh: ${message}`;

			// Stop polling after 3 failures
			if (pollFailureCount >= 3 && polling) {
				clearInterval(polling);
				polling = null;
				pollError = `Polling stopped after ${pollFailureCount} failures. Refresh page to retry.`;
			}
		} finally {
			updating = false;
		}
	};

	const cancelRun = async () => {
		actionError = null;
		const res = await fetch(`/api/homework/runs/${run.id}/cancel`, { method: 'POST' });
		if (!res.ok) {
			const payload = await res.json().catch(() => null);
			actionError =
				payload?.message || payload?.error || `Failed to cancel run (${res.status}).`;
			return;
		}
		await refresh({ force: true });
	};

	const continueRun = async () => {
		actionError = null;
		const answerText = userAnswer.trim();
		if (run.status === 'waiting_on_user' && requiresUserAnswer && !answerText) {
			actionError = 'Answer the blocking question(s) before continuing.';
			return;
		}

		const res = await fetch(`/api/homework/runs/${run.id}/respond`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(answerText ? { answers: answerText } : {})
		});
		if (!res.ok) {
			const payload = await res.json().catch(() => null);
			actionError =
				payload?.message || payload?.error || `Failed to continue run (${res.status}).`;
			return;
		}
		userAnswer = '';
		userAnswerFocused = false;
		await refresh({ force: true });
	};

	const saveScratchpad = async (content: string): Promise<void> => {
		if (!scratchpad?.id) return;
		scratchpadSaveStatus = 'saving';
		try {
			const res = await fetch(`/api/homework/scratchpad/${scratchpad.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ content })
			});
			if (res.ok) {
				const json = await res.json();
				scratchpad = { ...scratchpad, content, updated_at: json.data?.updated_at };
				scratchpadSaveStatus = 'saved';
			} else {
				scratchpadSaveStatus = 'error';
			}
		} catch {
			scratchpadSaveStatus = 'error';
		}
	};

	const deleteScratchpad = async () => {
		if (!scratchpad?.id) return;
		if (
			!confirm(
				'Are you sure you want to delete this scratchpad? This action cannot be undone.'
			)
		) {
			return;
		}
		try {
			const res = await fetch(`/api/homework/scratchpad/${scratchpad.id}`, {
				method: 'DELETE'
			});
			if (res.ok) {
				scratchpad = null;
				scratchpadContent = '';
			}
		} catch (error) {
			console.error('Failed to delete scratchpad:', error);
		}
	};

	// Get project_id from the first workspace document (they all share the same project)
	const workspaceProjectId = $derived(workspaceDocs[0]?.project_id ?? null);

	const openDocumentModal = (nodeId: string) => {
		selectedDocumentId = nodeId;
		showDocumentModal = true;
	};

	const closeDocumentModal = () => {
		showDocumentModal = false;
		selectedDocumentId = null;
	};

	const focusAnswerComposer = () => {
		userAnswerInput?.scrollIntoView({ behavior: 'smooth', block: 'center' });
		userAnswerInput?.focus();
	};

	let lastScratchpadUpdate = $state(0);
	let lastScratchpadEdit = $state(0);

	// Initialize scratchpad content
	$effect(() => {
		if (scratchpad?.content && !scratchpadContent) {
			scratchpadContent = scratchpad.content;
			lastScratchpadUpdate = Date.now();
		}
	});

	// Sync scratchpad content when scratchpad changes (e.g., from polling)
	// Bug #3: Only update if we've been idle for 2+ seconds to avoid race with user edits
	$effect(() => {
		if (scratchpad?.content && scratchpadSaveStatus === 'idle') {
			const now = Date.now();
			const timeSinceLastUpdate = now - lastScratchpadUpdate;
			const timeSinceLastEdit = now - lastScratchpadEdit;

			// Only update if content differs AND:
			// 1. We've been idle for 2+ seconds (not actively typing)
			// 2. Save is idle (not currently saving)
			if (
				scratchpadContent !== scratchpad.content &&
				timeSinceLastUpdate > 2000 &&
				timeSinceLastEdit > 2000
			) {
				scratchpadContent = scratchpad.content;
				lastScratchpadUpdate = now;
			}
		}
	});

	onMount(() => {
		polling = setInterval(() => {
			void refresh();
		}, 5000);
		return () => {
			if (polling) clearInterval(polling);
		};
	});
</script>

<!-- Mode A: Dense detail view for homework run -->
<section class="p-3 sm:p-4 max-w-7xl mx-auto">
	<!-- Header -->
	<header class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
		<div class="flex-1 min-w-0">
			<h1 class="text-2xl sm:text-3xl font-semibold text-foreground mb-1">Homework Run</h1>
			<p class="text-sm text-muted-foreground">{run.objective}</p>
		</div>
		<div class="flex items-center gap-2 shrink-0">
			<button
				onclick={() => (showLiveModal = true)}
				class="px-3 py-1.5 text-sm bg-card border border-border text-foreground rounded-lg shadow-ink pressable hover:border-accent hover:bg-accent/5 transition-all"
			>
				Live View
			</button>
			{#if run.status === 'running' || run.status === 'queued'}
				<button
					onclick={cancelRun}
					class="px-3 py-1.5 text-sm bg-card border border-border text-foreground rounded-lg shadow-ink pressable hover:border-accent hover:bg-accent/5 transition-all"
				>
					Cancel
				</button>
			{:else if run.status === 'waiting_on_user'}
				<button
					onclick={focusAnswerComposer}
					class="px-3 py-1.5 text-sm bg-accent text-accent-foreground rounded-lg shadow-ink pressable hover:opacity-90 transition-all font-semibold"
				>
					Answer Questions
				</button>
			{:else if run.status === 'stopped'}
				<button
					onclick={continueRun}
					class="px-3 py-1.5 text-sm bg-accent text-accent-foreground rounded-lg shadow-ink pressable hover:opacity-90 transition-all font-semibold"
				>
					Continue
				</button>
			{/if}
		</div>
	</header>

	<!-- Poll error banner -->
	{#if pollError}
		<div
			class="px-3 py-2 mb-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg tx tx-pulse tx-weak"
		>
			<p class="text-sm font-medium text-red-900 dark:text-red-100">Data refresh error</p>
			<p class="text-xs text-red-700 dark:text-red-300">{pollError}</p>
		</div>
	{/if}

	{#if actionError && run.status !== 'waiting_on_user'}
		<div
			class="px-3 py-2 mb-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg"
		>
			<p class="text-sm text-red-700 dark:text-red-300">{actionError}</p>
		</div>
	{/if}

	<!-- Waiting banner -->
	{#if run.status === 'waiting_on_user'}
		<div
			class="px-3 py-2 mb-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg tx tx-pulse tx-weak"
		>
			<p class="text-sm font-medium text-blue-900 dark:text-blue-100">Action required.</p>
			<p class="text-xs text-blue-700 dark:text-blue-300">
				{waitingQuestions.length > 0
					? `Answer ${waitingQuestions.length} blocking question${waitingQuestions.length === 1 ? '' : 's'} below and continue.`
					: 'Add answers below and press Continue.'}
			</p>
			{#if pausePollingForAnswer}
				<p class="text-xs text-blue-700 dark:text-blue-300 mt-1">
					Live refresh is paused while you type.
				</p>
			{/if}
		</div>
	{/if}

	<!-- Metrics summary grid -->
	<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3 mb-4">
		<!-- Status -->
		<div
			class="p-3 bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak wt-paper"
		>
			<div class="micro-label text-muted-foreground mb-1">STATUS</div>
			<div
				class="text-base font-semibold capitalize {run.status === 'running'
					? 'text-blue-600 dark:text-blue-400'
					: run.status === 'stopped'
						? 'text-amber-600 dark:text-amber-400'
						: run.status === 'completed'
							? 'text-emerald-600 dark:text-emerald-400'
							: run.status === 'waiting_on_user'
								? 'text-purple-600 dark:text-purple-400'
								: 'text-foreground'}"
			>
				{run.status}
			</div>
		</div>

		<!-- Iterations -->
		<div
			class="p-3 bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak wt-paper"
		>
			<div class="micro-label text-muted-foreground mb-1">ITERATIONS</div>
			<div class="text-base font-semibold text-foreground">{run.iteration ?? 0}</div>
		</div>

		<!-- Cost -->
		<div
			class="p-3 bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak wt-paper"
		>
			<div class="micro-label text-muted-foreground mb-1">COST (LIVE)</div>
			<div class="text-base font-semibold text-foreground">
				${getMetric(run.metrics, 'cost_total_usd').toFixed(4)}
			</div>
		</div>

		<!-- Tokens -->
		<div
			class="p-3 bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak wt-paper"
		>
			<div class="micro-label text-muted-foreground mb-1">TOKENS</div>
			<div class="text-base font-semibold text-foreground">
				{getMetric(run.metrics, 'tokens_total')}
			</div>
		</div>

		<!-- Running Time -->
		<div
			class="p-3 bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak wt-paper"
		>
			<div class="micro-label text-muted-foreground mb-1">RUNNING TIME</div>
			<div class="text-base font-semibold text-foreground">{formatMinutes(runningMs)}</div>
		</div>

		<!-- Budget (time) -->
		<div
			class="p-3 bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak wt-paper"
		>
			<div class="micro-label text-muted-foreground mb-1">BUDGET (TIME)</div>
			<div class="text-base font-semibold text-foreground">
				{formatMinutes(getBudget('max_wall_clock_ms') ?? null)}
			</div>
		</div>

		<!-- Budget (cost) -->
		<div
			class="p-3 bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak wt-paper"
		>
			<div class="micro-label text-muted-foreground mb-1">BUDGET (COST)</div>
			<div class="text-base font-semibold text-foreground">
				{#if getBudget('max_cost_usd')}${getBudget('max_cost_usd')}{:else}—{/if}
			</div>
		</div>

		<!-- Budget (tokens) -->
		<div
			class="p-3 bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak wt-paper"
		>
			<div class="micro-label text-muted-foreground mb-1">BUDGET (TOKENS)</div>
			<div class="text-base font-semibold text-foreground">
				{#if getBudget('max_total_tokens')}{getBudget('max_total_tokens')}{:else}—{/if}
			</div>
		</div>
	</div>

	<!-- Run Report -->
	{#if run.report}
		<section class="mb-6">
			<h2 class="text-lg font-semibold text-foreground mb-3">Run Report</h2>
			<div
				class="p-4 bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak wt-card"
			>
				<h3 class="text-base font-semibold text-foreground mb-2">
					{run.report.title || 'Homework Report'}
				</h3>
				<p class="text-sm text-muted-foreground mb-4">
					{run.report.summary || 'No summary available.'}
				</p>

				<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
					<!-- Stopping Reason -->
					<div>
						<div class="micro-label text-muted-foreground mb-1">STOPPING REASON</div>
						<p class="text-sm text-foreground font-medium">
							{run.report.stopping_reason?.type || run.stop_reason?.type || 'unknown'}
						</p>
						{#if run.report.stopping_reason?.detail || run.stop_reason?.detail}
							<p class="text-xs text-muted-foreground mt-1">
								{run.report.stopping_reason?.detail || run.stop_reason?.detail}
							</p>
						{/if}
					</div>

					<!-- Metrics -->
					<div>
						<div class="micro-label text-muted-foreground mb-1">METRICS</div>
						<div class="text-sm space-y-0.5">
							<p class="text-muted-foreground">
								Iterations: <span class="text-foreground font-medium"
									>{run.report.metrics?.iterations ?? run.iteration}</span
								>
							</p>
							<p class="text-muted-foreground">
								Total Cost: <span class="text-foreground font-medium"
									>${run.report.metrics?.total_cost_usd ??
										getMetric(run.metrics, 'cost_total_usd')}</span
								>
							</p>
							<p class="text-muted-foreground">
								Total Tokens: <span class="text-foreground font-medium"
									>{run.report.metrics?.total_tokens ??
										getMetric(run.metrics, 'tokens_total')}</span
								>
							</p>
						</div>
					</div>
				</div>

				<!-- What Changed -->
				{#if run.report.what_changed}
					<div class="mt-4 pt-4 border-t border-border">
						<div class="micro-label text-muted-foreground mb-2">WHAT CHANGED</div>
						<div class="space-y-1 text-sm">
							{#if run.report.what_changed.created?.length}
								<p class="text-muted-foreground">
									<span class="font-medium text-foreground">Created:</span>
									{run.report.what_changed.created
										.map((item: any) => item.title || item.id)
										.join(', ')}
								</p>
							{/if}
							{#if run.report.what_changed.updated?.length}
								<p class="text-muted-foreground">
									<span class="font-medium text-foreground">Updated:</span>
									{run.report.what_changed.updated
										.map((item: any) => item.title || item.id)
										.join(', ')}
								</p>
							{/if}
							{#if run.report.what_changed.linked?.length}
								<p class="text-muted-foreground">
									<span class="font-medium text-foreground">Linked:</span>
									{run.report.what_changed.linked.length}
								</p>
							{/if}
						</div>
					</div>
				{/if}
			</div>
		</section>
	{/if}

	<!-- Scratchpad -->
	<section class="mb-6">
		<div class="flex items-center justify-between mb-3">
			<div class="flex items-center gap-3">
				<h2 class="text-lg font-semibold text-foreground">Scratchpad</h2>
				{#if scratchpadSaveStatus === 'saving'}
					<span class="text-xs text-muted-foreground animate-pulse">Saving...</span>
				{:else if scratchpadSaveStatus === 'saved'}
					<span class="text-xs text-emerald-600 dark:text-emerald-400">Saved</span>
				{:else if scratchpadSaveStatus === 'error'}
					<span class="text-xs text-destructive">Save failed</span>
				{/if}
			</div>
			<div class="flex items-center gap-2">
				{#if scratchpad}
					<button
						onclick={deleteScratchpad}
						class="px-3 py-1.5 text-sm text-destructive border border-destructive/30 bg-destructive/5 rounded-lg pressable hover:bg-destructive/10 transition-all"
						title="Delete scratchpad"
					>
						Delete
					</button>
				{/if}
				<button
					onclick={() => (scratchpadExpanded = !scratchpadExpanded)}
					class="px-3 py-1.5 text-sm bg-card border border-border text-foreground rounded-lg shadow-ink pressable hover:border-accent hover:bg-accent/5 transition-all"
				>
					{scratchpadExpanded ? 'Collapse' : 'Expand'}
				</button>
			</div>
		</div>

		{#if !scratchpadExpanded}
			<button
				onclick={() => (scratchpadExpanded = true)}
				class="w-full text-left p-4 bg-card border border-border rounded-lg shadow-ink hover:border-accent/50 transition-colors"
			>
				<p class="text-sm text-muted-foreground">
					{#if scratchpad?.content}
						{@const preview = scratchpad.content.substring(0, 200)}
						{@const hasMore = scratchpad.content.length > 200}
						{preview}{hasMore ? '...' : ''}
					{:else}
						No scratchpad content yet. Click to expand and edit.
					{/if}
				</p>
			</button>
		{:else if scratchpad}
			<RichMarkdownEditor
				bind:value={scratchpadContent}
				onchange={() => {
					lastScratchpadEdit = Date.now();
				}}
				placeholder="Write your notes here... Use markdown for formatting. Press mic to dictate."
				rows={16}
				maxLength={50000}
				enableVoice={true}
				voiceNoteSource="homework-scratchpad"
				helpText="Changes are saved when you click away or press Cmd+S. Markdown supported."
			/>
			<div class="flex items-center justify-end gap-2 mt-3">
				<button
					onclick={() => saveScratchpad(scratchpadContent)}
					disabled={scratchpadSaveStatus === 'saving'}
					class="px-4 py-2 text-sm bg-accent text-accent-foreground rounded-lg shadow-ink pressable hover:opacity-90 transition-all font-semibold disabled:opacity-50"
				>
					{scratchpadSaveStatus === 'saving' ? 'Saving...' : 'Save Scratchpad'}
				</button>
			</div>
		{:else}
			<div class="p-4 bg-muted border border-border rounded-lg">
				<p class="text-sm text-muted-foreground">
					No scratchpad available for this homework run.
				</p>
			</div>
		{/if}
	</section>

	<!-- Plan Overview -->
	{#if latestPlan}
		<section class="mb-6">
			<div class="flex items-center justify-between mb-3">
				<h2 class="text-lg font-semibold text-foreground">Plan</h2>
				{#if latestPlan.iteration}
					<span class="text-xs text-muted-foreground">
						Updated iteration {latestPlan.iteration}
					</span>
				{/if}
			</div>
			<div
				class="p-4 bg-card border border-border rounded-lg shadow-ink tx tx-thread tx-weak wt-paper space-y-4"
			>
				<!-- Plan Steps with Status Pills -->
				{#if latestPlan.steps?.length}
					<div>
						<div class="flex items-center gap-2 mb-3">
							<h3 class="text-sm font-semibold text-foreground">Steps</h3>
							<span class="text-xs text-muted-foreground">
								({latestPlan.steps.filter((s: any) => s.status === 'done')
									.length}/{latestPlan.steps.length} done)
							</span>
						</div>
						<ul class="space-y-2">
							{#each latestPlan.steps as step, idx}
								{@const status = step.status ?? 'pending'}
								{@const owner = step.owner ?? 'planner'}
								{@const iteration = step.iteration ?? latestPlan.iteration}
								<li
									class="flex items-start gap-3 p-2 rounded-lg {status === 'done'
										? 'bg-emerald-50/50 dark:bg-emerald-950/20'
										: status === 'doing'
											? 'bg-blue-50/50 dark:bg-blue-950/20'
											: status === 'blocked'
												? 'bg-amber-50/50 dark:bg-amber-950/20'
												: 'bg-muted/30'}"
								>
									<!-- Step number -->
									<span
										class="shrink-0 w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-medium {status ===
										'done'
											? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
											: status === 'doing'
												? 'bg-blue-500/20 text-blue-700 dark:text-blue-300'
												: status === 'blocked'
													? 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
													: 'bg-muted text-muted-foreground'}"
									>
										{idx + 1}
									</span>

									<!-- Step content -->
									<div class="flex-1 min-w-0">
										<div class="flex items-center gap-2 flex-wrap">
											<!-- Step title -->
											<span
												class="text-sm font-medium {status === 'done'
													? 'text-emerald-900 dark:text-emerald-100 line-through'
													: 'text-foreground'}"
											>
												{step.title}
											</span>

											<!-- Status pill -->
											<span
												class="px-1.5 py-0.5 text-[0.6rem] uppercase tracking-wider font-semibold rounded {status ===
												'pending'
													? 'bg-muted text-muted-foreground'
													: status === 'doing'
														? 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300'
														: status === 'blocked'
															? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
															: 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'}"
											>
												{status}
											</span>
										</div>

										<!-- Owner and iteration metadata -->
										<div class="flex items-center gap-2 mt-1 text-[10px]">
											<span
												class="px-1 py-0.5 rounded {owner === 'executor'
													? 'bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300'
													: 'bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'}"
											>
												{owner}
											</span>
											{#if iteration}
												<span class="text-muted-foreground">
													iter #{iteration}
												</span>
											{/if}
											{#if step.id}
												<span class="text-muted-foreground font-mono">
													{step.id}
												</span>
											{/if}
										</div>
									</div>
								</li>
							{/each}
						</ul>
					</div>
				{/if}

				<!-- Remaining Work -->
				{#if latestPlan.remaining_work?.length}
					<div class="pt-3 border-t border-border">
						<h3 class="text-sm font-semibold text-foreground mb-2">Remaining Work</h3>
						<ul class="space-y-1">
							{#each latestPlan.remaining_work as item}
								<li class="flex items-start gap-2 text-sm text-foreground/90">
									<span class="text-muted-foreground">•</span>
									<span>{item}</span>
								</li>
							{/each}
						</ul>
					</div>
				{/if}

				<!-- Completion Evidence -->
				{#if latestPlan.completion_evidence?.length}
					<div class="pt-3 border-t border-border">
						<h3 class="text-sm font-semibold text-foreground mb-2">
							Completion Evidence
						</h3>
						<ul class="space-y-1">
							{#each latestPlan.completion_evidence as item}
								<li
									class="flex items-start gap-2 text-sm text-emerald-700 dark:text-emerald-300"
								>
									<svg
										class="w-4 h-4 shrink-0 mt-0.5"
										fill="currentColor"
										viewBox="0 0 20 20"
									>
										<path
											fill-rule="evenodd"
											d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
											clip-rule="evenodd"
										/>
									</svg>
									<span>{item}</span>
								</li>
							{/each}
						</ul>
					</div>
				{/if}

				<!-- Next Action Hint -->
				<div class="pt-3 border-t border-border">
					<div class="flex items-center gap-2">
						<span class="text-xs text-muted-foreground">Next action:</span>
						{#if latestPlan.next_action_hint}
							{@const hint = latestPlan.next_action_hint}
							<span
								class="px-2 py-0.5 text-xs font-medium rounded {hint === 'execute'
									? 'bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
									: hint === 'replan'
										? 'bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300'
										: hint === 'ask_user'
											? 'bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300'
											: hint === 'stop'
												? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
												: 'bg-muted text-muted-foreground'}"
							>
								{hint}
							</span>
						{:else}
							<span
								class="px-2 py-0.5 text-xs font-medium rounded bg-muted text-muted-foreground"
							>
								n/a
							</span>
						{/if}
					</div>
				</div>
			</div>
		</section>
	{/if}

	<!-- Workspace Tree -->
	<section class="mb-6">
		<div class="flex items-center justify-between mb-3">
			<h2 class="text-lg font-semibold text-foreground">Workspace Tree</h2>
			{#if workspaceDocs.length > 0}
				<span class="text-xs text-muted-foreground">
					{workspaceDocs.length} document{workspaceDocs.length !== 1 ? 's' : ''}
				</span>
			{/if}
		</div>
		{#if workspaceDocs.length === 0}
			<div class="p-4 bg-muted border border-border rounded-lg">
				<p class="text-sm text-muted-foreground">No workspace documents yet.</p>
			</div>
		{:else}
			<div
				class="p-3 bg-card border border-border rounded-lg shadow-ink tx tx-thread tx-weak wt-paper"
			>
				{#each treeRoots as node}
					<WorkspaceTreeNode {node} onOpenDocument={openDocumentModal} />
				{/each}
			</div>
			<p class="mt-2 text-xs text-muted-foreground">
				Click "Open" on any node to view or edit its content. Executor scratchpads appear as
				children under the main scratchpad.
			</p>
		{/if}
	</section>

	<!-- Executor Scratchpads Summary (collapsed by default, shows count) -->
	{#if executorPads.length > 0}
		<section class="mb-6">
			<details class="group">
				<summary
					class="flex items-center justify-between cursor-pointer p-3 bg-card border border-border rounded-lg shadow-ink hover:border-accent/50 transition-colors"
				>
					<div class="flex items-center gap-2">
						<h2 class="text-sm font-semibold text-foreground">Executor Scratchpads</h2>
						<span
							class="px-2 py-0.5 text-xs bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 rounded-full"
						>
							{executorPads.length}
						</span>
					</div>
					<svg
						class="w-4 h-4 text-muted-foreground transition-transform group-open:rotate-180"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M19 9l-7 7-7-7"
						/>
					</svg>
				</summary>
				<div class="mt-2 text-xs text-muted-foreground p-3 bg-muted/50 rounded-lg">
					<p>
						Executor scratchpads are shown as child nodes under the main scratchpad in
						the Workspace Tree above. Click on any executor node to view its full
						content.
					</p>
					<ul class="mt-2 space-y-1">
						{#each executorPads as pad}
							<li class="flex items-center gap-2">
								<span class="font-mono text-[10px] text-muted-foreground"
									>{pad.props?.branch_id ?? 'n/a'}</span
								>
								<span class="text-foreground">{pad.title}</span>
							</li>
						{/each}
					</ul>
				</div>
			</details>
		</section>
	{/if}

	<!-- User Input (prominent when waiting on questions) -->
	{#if run.status === 'waiting_on_user'}
		<section
			class="mb-6 p-4 sm:p-5 bg-amber-50/80 dark:bg-amber-950/20 border-2 border-amber-300 dark:border-amber-700 rounded-xl shadow-ink tx tx-grid tx-weak"
		>
			<div class="flex items-start gap-3 mb-4">
				<div
					class="shrink-0 w-8 h-8 rounded-full bg-amber-200 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200 flex items-center justify-center"
				>
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20 10 10 0 000-20z"
						/>
					</svg>
				</div>
				<div class="min-w-0">
					<p
						class="text-xs font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-300"
					>
						Homework blocked
					</p>
					<h2 class="text-xl font-semibold text-foreground">
						Answer these question{waitingQuestions.length === 1 ? '' : 's'} to continue
					</h2>
					<p class="text-sm text-amber-900/80 dark:text-amber-200/80 mt-1">
						The run will stay paused until you submit your response.
					</p>
				</div>
			</div>

			{#if waitingQuestions.length > 0}
				<ol class="space-y-2 mb-4">
					{#each waitingQuestions as question, idx}
						<li
							class="p-3 bg-background/70 border border-amber-200 dark:border-amber-800 rounded-lg"
						>
							<p
								class="text-xs font-semibold text-amber-800 dark:text-amber-300 mb-1"
							>
								Question {idx + 1}
							</p>
							<p class="text-sm text-foreground">{question}</p>
						</li>
					{/each}
				</ol>
			{:else}
				<p class="text-sm text-muted-foreground mb-4">
					No explicit question payload was returned. Add clarifications and continue.
				</p>
			{/if}

			{#if actionError}
				<div
					class="mb-3 px-3 py-2 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg"
				>
					<p class="text-sm text-red-700 dark:text-red-300">{actionError}</p>
				</div>
			{/if}

			<label
				for="homework-user-answer"
				class="text-xs font-medium text-muted-foreground uppercase tracking-wider"
			>
				Your response
			</label>
			<div class="relative tx tx-grid tx-weak rounded-lg overflow-hidden mt-1 mb-3">
				<textarea
					id="homework-user-answer"
					bind:this={userAnswerInput}
					bind:value={userAnswer}
					rows="6"
					placeholder="Type your answer and clarifications here..."
					onfocus={() => {
						userAnswerFocused = true;
					}}
					onblur={() => {
						userAnswerFocused = false;
					}}
					class="relative z-10 w-full px-3 py-2 text-sm bg-background border border-border rounded-lg shadow-ink-inner focus:border-accent focus:ring-2 focus:ring-ring text-foreground placeholder:text-muted-foreground outline-none resize-y transition-colors"
				></textarea>
			</div>

			<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
				{#if pausePollingForAnswer}
					<p class="text-xs text-amber-800 dark:text-amber-300">
						Background refresh paused while you compose your answer.
					</p>
				{:else}
					<p class="text-xs text-muted-foreground">Background refresh every 5 seconds.</p>
				{/if}
				<button
					onclick={continueRun}
					disabled={!canContinueWaitingRun || updating}
					class="px-4 py-2 bg-accent text-accent-foreground rounded-lg font-semibold shadow-ink pressable hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
				>
					Continue Homework
				</button>
			</div>
		</section>
	{/if}

	<!-- Iterations -->
	<section class="mb-6">
		<h2 class="text-lg font-semibold text-foreground mb-3">Iterations</h2>
		{#if iterations.length === 0}
			<div class="p-4 bg-muted border border-border rounded-lg">
				<p class="text-sm text-muted-foreground">No iterations yet.</p>
			</div>
		{:else}
			<div class="bg-card border border-border rounded-lg shadow-ink overflow-hidden">
				<ul class="divide-y divide-border">
					{#each iterations as iteration}
						<li class="transition-colors hover:bg-muted/30">
							<!-- Header (always visible, clickable) -->
							<button
								onclick={() => toggleIteration(iteration.id)}
								class="w-full px-4 py-3 text-left pressable"
							>
								<div
									class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
								>
									<div class="flex items-center gap-2 flex-wrap">
										<span class="text-sm font-semibold text-foreground"
											>Iteration {iteration.iteration}</span
										>
										<span
											class="px-2 py-0.5 text-[0.65rem] uppercase tracking-wider font-medium rounded-full {iteration.status ===
											'running'
												? 'bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
												: iteration.status === 'completed'
													? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
													: iteration.status === 'failed'
														? 'bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-300'
														: 'bg-muted text-muted-foreground'}"
										>
											{iteration.status}
										</span>
										{#if iteration.error}
											<span
												class="px-2 py-0.5 text-[0.65rem] uppercase tracking-wider font-medium bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-300 rounded-full"
											>
												Error
											</span>
										{/if}
									</div>
									<div
										class="flex items-center gap-3 text-xs text-muted-foreground"
									>
										{#if iteration.started_at}
											<span>{formatDate(iteration.started_at)}</span>
										{/if}
										{#if iteration.started_at && iteration.ended_at}
											<span class="font-medium"
												>{formatDuration(
													iteration.started_at,
													iteration.ended_at
												)}</span
											>
										{/if}
										<svg
											class="w-4 h-4 transition-transform"
											class:rotate-180={expandedIterations.has(iteration.id)}
											fill="none"
											stroke="currentColor"
											viewBox="0 0 24 24"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M19 9l-7 7-7-7"
											/>
										</svg>
									</div>
								</div>
								<p class="text-sm text-muted-foreground mt-1">
									{iteration.summary || 'No summary yet.'}
								</p>
							</button>

							<!-- Expanded Details -->
							{#if expandedIterations.has(iteration.id)}
								<div
									class="px-4 pb-4 space-y-3 border-t border-border bg-muted/20 tx tx-grain tx-weak"
								>
									<!-- Error Details -->
									{#if iteration.error}
										<div>
											<div
												class="micro-label text-red-600 dark:text-red-400 mb-1"
											>
												ERROR
											</div>
											<div
												class="p-2 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded text-xs text-red-900 dark:text-red-100 font-mono"
											>
												{iteration.error}
											</div>
											{#if iteration.error_fingerprint}
												<p class="text-xs text-muted-foreground mt-1">
													Fingerprint: {iteration.error_fingerprint}
												</p>
											{/if}
										</div>
									{/if}

									<!-- Metrics -->
									{#if iteration.metrics}
										<div>
											<div class="micro-label text-muted-foreground mb-1">
												METRICS
											</div>
											<div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
												{#each Object.entries(iteration.metrics) as [key, value]}
													<div
														class="p-2 bg-card border border-border rounded text-xs tx tx-frame tx-weak"
													>
														<div
															class="text-muted-foreground capitalize mb-0.5"
														>
															{key.replace(/_/g, ' ')}
														</div>
														<div class="font-semibold text-foreground">
															{typeof value === 'number'
																? value.toLocaleString()
																: String(value)}
														</div>
													</div>
												{/each}
											</div>
										</div>
									{/if}

									<!-- Progress Delta -->
									{#if iteration.progress_delta}
										<div>
											<div class="micro-label text-muted-foreground mb-1">
												PROGRESS DELTA
											</div>
											<pre
												class="p-2 bg-card border border-border rounded text-xs text-foreground overflow-auto max-h-48 whitespace-pre-wrap">{JSON.stringify(
													iteration.progress_delta,
													null,
													2
												)}</pre>
										</div>
									{/if}

									<!-- Artifacts -->
									{#if iteration.artifacts}
										<div>
											<div class="micro-label text-muted-foreground mb-1">
												ARTIFACTS
											</div>
											<pre
												class="p-2 bg-card border border-border rounded text-xs text-foreground overflow-auto max-h-48 whitespace-pre-wrap">{JSON.stringify(
													iteration.artifacts,
													null,
													2
												)}</pre>
										</div>
									{/if}

									<!-- Timestamps -->
									<div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
										{#if iteration.started_at}
											<div>
												<span class="text-muted-foreground">Started:</span>
												<span class="text-foreground ml-1"
													>{formatDate(iteration.started_at)}</span
												>
											</div>
										{/if}
										{#if iteration.ended_at}
											<div>
												<span class="text-muted-foreground">Ended:</span>
												<span class="text-foreground ml-1"
													>{formatDate(iteration.ended_at)}</span
												>
											</div>
										{/if}
										{#if iteration.branch_id}
											<div class="sm:col-span-2">
												<span class="text-muted-foreground">Branch ID:</span
												>
												<span class="text-foreground ml-1 font-mono"
													>{iteration.branch_id}</span
												>
											</div>
										{/if}
									</div>
								</div>
							{/if}
						</li>
					{/each}
				</ul>
			</div>
		{/if}
	</section>

	<!-- Events -->
	<section class="mb-6">
		<h2 class="text-lg font-semibold text-foreground mb-3">Events</h2>
		{#if events.length === 0}
			<div class="p-4 bg-muted border border-border rounded-lg">
				<p class="text-sm text-muted-foreground">No events recorded yet.</p>
			</div>
		{:else}
			<div class="bg-card border border-border rounded-lg shadow-ink overflow-hidden">
				<ul class="divide-y divide-border">
					{#each events as event}
						<li class="transition-colors hover:bg-muted/30">
							<!-- Header (always visible, clickable) -->
							<button
								onclick={() => toggleEvent(event.id)}
								class="w-full px-4 py-2 text-left pressable"
							>
								<div class="flex items-center justify-between gap-2">
									<div class="flex items-center gap-2 flex-wrap">
										<code
											class="text-xs font-mono font-semibold text-foreground"
											>{event.event?.type || 'event'}</code
										>
										<span class="text-xs text-muted-foreground"
											>#{event.seq}</span
										>
										<span class="text-xs text-muted-foreground"
											>Iteration {event.iteration}</span
										>
									</div>
									<div class="flex items-center gap-2">
										<span class="text-xs text-muted-foreground"
											>{formatDate(event.created_at)}</span
										>
										<svg
											class="w-4 h-4 transition-transform text-muted-foreground"
											class:rotate-180={expandedEvents.has(event.id)}
											fill="none"
											stroke="currentColor"
											viewBox="0 0 24 24"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M19 9l-7 7-7-7"
											/>
										</svg>
									</div>
								</div>
							</button>

							<!-- Expanded Details -->
							{#if expandedEvents.has(event.id)}
								<div
									class="px-4 pb-3 border-t border-border bg-muted/20 tx tx-grain tx-weak"
								>
									<div class="micro-label text-muted-foreground mb-2 mt-2">
										EVENT DATA
									</div>
									<pre
										class="p-3 bg-card border border-border rounded text-xs text-foreground overflow-auto max-h-96 whitespace-pre-wrap">{JSON.stringify(
											event.event,
											null,
											2
										)}</pre>
								</div>
							{/if}
						</li>
					{/each}
				</ul>
			</div>
		{/if}
	</section>

	<!-- Live View Modal -->
	{#if showLiveModal}
		<div
			class="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4"
			role="dialog"
			aria-modal="true"
			onclick={() => (showLiveModal = false)}
			onkeydown={(e) => e.key === 'Escape' && (showLiveModal = false)}
		>
			<div
				class="bg-card border border-border rounded-lg shadow-ink-strong tx tx-frame tx-weak wt-plate w-full max-w-3xl max-h-[85vh] overflow-auto"
				role="document"
				onclick={(e) => e.stopPropagation()}
				onkeydown={(e) => e.stopPropagation()}
			>
				<!-- Modal Header -->
				<div class="flex items-center justify-between px-4 py-3 border-b border-border">
					<h2 class="text-lg font-semibold text-foreground">Live Homework</h2>
					<button
						onclick={() => (showLiveModal = false)}
						class="px-3 py-1.5 text-sm bg-muted text-foreground rounded-lg hover:bg-accent/10 transition-colors"
					>
						Close
					</button>
				</div>

				<!-- Modal Body -->
				<div class="p-4 space-y-4">
					<!-- Status -->
					<div>
						<div class="micro-label text-muted-foreground mb-1">STATUS</div>
						<div class="flex items-center gap-2">
							<span class="text-sm font-medium text-foreground capitalize"
								>{run.status}</span
							>
							<span class="text-xs text-muted-foreground"
								>Iteration {run.iteration ?? 0}</span
							>
						</div>
					</div>

					<!-- Cost & Tokens -->
					<div class="grid grid-cols-2 gap-4">
						<div>
							<div class="micro-label text-muted-foreground mb-1">COST</div>
							<p class="text-sm font-medium text-foreground">
								${getMetric(run.metrics, 'cost_total_usd').toFixed(4)}
							</p>
						</div>
						<div>
							<div class="micro-label text-muted-foreground mb-1">TOKENS</div>
							<p class="text-sm font-medium text-foreground">
								{getMetric(run.metrics, 'tokens_total')}
							</p>
						</div>
					</div>

					<!-- Scratchpad -->
					<div>
						<div class="micro-label text-muted-foreground mb-2">SCRATCHPAD</div>
						<pre
							class="p-3 bg-muted border border-border rounded-lg text-xs text-foreground overflow-auto max-h-64 whitespace-pre-wrap">{scratchpad?.content ||
								'No scratchpad yet.'}</pre>
					</div>

					<!-- Recent Events -->
					<div>
						<div class="micro-label text-muted-foreground mb-2">RECENT EVENTS</div>
						<div class="bg-muted border border-border rounded-lg overflow-hidden">
							<ul class="divide-y divide-border max-h-48 overflow-auto">
								{#each events.slice(0, 10) as event}
									<li class="px-3 py-2 flex items-center gap-2">
										<code class="text-xs font-mono text-foreground"
											>{event.event?.type || 'event'}</code
										>
										<span class="text-xs text-muted-foreground"
											>#{event.seq}</span
										>
									</li>
								{/each}
							</ul>
						</div>
					</div>
				</div>
			</div>
		</div>
	{/if}
</section>

<!-- Workspace Document Modal - Reuse DocumentModal from ontology -->
{#if workspaceProjectId}
	<DocumentModal
		projectId={workspaceProjectId}
		documentId={selectedDocumentId}
		bind:isOpen={showDocumentModal}
		onClose={closeDocumentModal}
		onSaved={() => refresh({ force: true })}
		onDeleted={() => refresh({ force: true })}
	/>
{/if}
