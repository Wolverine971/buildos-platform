<!-- apps/web/src/routes/admin/experiments/question-tree/[runId]/+page.svelte -->
<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import type { RealtimeChannel } from '@supabase/supabase-js';
	import AdminPageHeader from '$lib/components/admin/AdminPageHeader.svelte';
	import QuestionTreeCanvas from '$lib/components/admin/question-tree/QuestionTreeCanvas.svelte';
	import QuestionTreeInspector from '$lib/components/admin/question-tree/QuestionTreeInspector.svelte';
	import {
		Activity,
		Bot,
		CircleAlert,
		CircleDot,
		Clock3,
		Loader2,
		Network,
		Pause,
		Play,
		RefreshCw,
		RotateCcw,
		Search,
		Square
	} from '$lib/icons/lucide';
	import { supabase } from '$lib/supabase';
	import {
		applyQuestionTreeRealtimeChange,
		reconcileQuestionTreeDetail,
		type QuestionTreeRealtimeEvent,
		type QuestionTreeRealtimeTable
	} from '$lib/services/question-tree/realtime';
	import type {
		ApiEnvelope,
		QuestionTreeCreateResult,
		QuestionTreeEvent,
		QuestionTreeNode,
		QuestionTreeRunDetail
	} from '$lib/services/question-tree/types';
	import { isQuestionTreeActive } from '$lib/services/question-tree/types';

	type RealtimeStatus = 'connecting' | 'live' | 'fallback';
	type RealtimePayload = {
		eventType: QuestionTreeRealtimeEvent;
		new: Record<string, unknown>;
		old: Record<string, unknown>;
	};
	type ActivityItem = {
		id: string;
		nodeId: string | null;
		title: string;
		detail: string;
		createdAt: string;
		tone: 'neutral' | 'working' | 'success' | 'danger';
	};

	const POLL_INTERVAL_MS = 12_000;
	const bootstrapKey = (runId: string) => `question-tree:${runId}:bootstrap`;

	let { data }: { data: { runId: string } } = $props();

	let detail = $state.raw<QuestionTreeRunDetail | null>(null);
	let selectedNodeId = $state<string | null>(null);
	let searchQuery = $state('');
	let loading = $state(true);
	let refreshing = $state(false);
	let actionPending = $state<string | null>(null);
	let retryingNodeId = $state<string | null>(null);
	let error = $state<string | null>(null);
	let realtimeStatus = $state<RealtimeStatus>('connecting');
	let pollTimer: ReturnType<typeof setInterval> | null = null;
	let requestController: AbortController | null = null;
	let realtimeChannel: RealtimeChannel | null = null;
	let refreshAfterCurrentRequest = false;
	let destroyed = false;

	const selectedNode = $derived(detail?.nodes.find((node) => node.id === selectedNodeId) ?? null);
	const runningNodes = $derived(detail?.nodes.filter((node) => node.status === 'running') ?? []);
	const searchMatches = $derived.by(() => {
		const query = searchQuery.trim().toLowerCase();
		if (!detail || !query) return [] as QuestionTreeNode[];
		const nodeIds = new Set(
			detail.proposals
				.filter((proposal) =>
					[proposal.question, proposal.why_it_matters, proposal.target_claim]
						.filter(Boolean)
						.some((value) => value?.toLowerCase().includes(query))
				)
				.map((proposal) => proposal.source_node_id)
		);
		return detail.nodes
			.filter(
				(node) =>
					nodeIds.has(node.id) ||
					[node.question, node.answer, node.thesis]
						.filter(Boolean)
						.some((value) => value?.toLowerCase().includes(query))
			)
			.slice(0, 20);
	});
	const synthesisGroups = $derived(
		detail?.run.synthesis
			? [
					{
						label: 'Probably right',
						items: detail.run.synthesis.probablyRight,
						className: 'border-success/40 bg-success/10'
					},
					{
						label: 'Probably wrong',
						items: detail.run.synthesis.probablyWrong,
						className: 'border-destructive/40 bg-destructive/10'
					},
					{
						label: 'Still unsure',
						items: detail.run.synthesis.stillUnsure,
						className: 'border-warning/40 bg-warning/10'
					}
				]
			: []
	);
	const phaseActivity = $derived.by(() => {
		if (!detail) return 'Connecting to the run…';
		if (detail.run.status === 'paused' || detail.run.status === 'quota_paused')
			return 'Run paused. The current tree is preserved.';
		if (detail.run.phase === 'seed') {
			return detail.run.status === 'queued'
				? 'Root captured. Waiting for the seed agent to fire.'
				: 'The seed agent is finding the first high-value unknowns.';
		}
		if (detail.run.phase === 'explore') {
			if (runningNodes.length > 0)
				return `${runningNodes.length} agent${runningNodes.length === 1 ? ' is' : 's are'} answering nodes now.`;
			if (detail.run.frontier_count > 0)
				return 'Answers are in. The scheduler is choosing the strongest next questions.';
			return 'Waiting for the next question nodes to be admitted.';
		}
		if (detail.run.phase === 'synthesize')
			return 'Exploration is complete. The synthesis agent is combining the tree.';
		return detail.run.status === 'completed'
			? 'Research complete. Every retained result is available in the graph.'
			: `Run finished with status ${detail.run.status.replace('_', ' ')}.`;
	});
	const recentActivity = $derived.by(() => (detail?.events ?? []).slice(0, 6).map(describeEvent));

	function payloadString(event: QuestionTreeEvent, key: string): string | null {
		const value = event.payload[key];
		return typeof value === 'string' || typeof value === 'number' ? String(value) : null;
	}

	function nodeLabel(event: QuestionTreeEvent): string {
		const number = payloadString(event, 'node_number');
		if (number === '0') return 'Root';
		if (number) return `Node ${number}`;
		const node = detail?.nodes.find((entry) => entry.id === event.node_id);
		return node?.node_kind === 'root' ? 'Root' : node ? `Node ${node.node_number}` : 'Agent';
	}

	function describeEvent(event: QuestionTreeEvent): ActivityItem {
		const label = nodeLabel(event);
		const question = payloadString(event, 'question');
		const purpose = payloadString(event, 'purpose')?.replace('_', ' ');
		const count = payloadString(event, 'follow_up_count');
		if (event.event_type === 'run.created') {
			return {
				id: event.id,
				nodeId: event.node_id,
				title: 'Root question queued',
				detail: question ?? 'The first node is ready.',
				createdAt: event.created_at,
				tone: 'neutral'
			};
		}
		if (event.event_type === 'node.started') {
			return {
				id: event.id,
				nodeId: event.node_id,
				title: `${label} fired`,
				detail: question ?? 'An agent is processing this question.',
				createdAt: event.created_at,
				tone: 'working'
			};
		}
		if (event.event_type === 'node.retry_requested') {
			return {
				id: event.id,
				nodeId: event.node_id,
				title: `${label} retry queued`,
				detail: question ?? 'The failed node is waiting for another agent.',
				createdAt: event.created_at,
				tone: 'working'
			};
		}
		if (event.event_type === 'node.completed') {
			return {
				id: event.id,
				nodeId: event.node_id,
				title: `${label} answered`,
				detail: count
					? `${count} follow-up question${count === '1' ? '' : 's'} proposed.`
					: 'Answer returned.',
				createdAt: event.created_at,
				tone: 'success'
			};
		}
		if (event.event_type === 'proposal.spawned') {
			return {
				id: event.id,
				nodeId: event.node_id,
				title: `${label} joined the graph`,
				detail: 'Queued for an available question agent.',
				createdAt: event.created_at,
				tone: 'neutral'
			};
		}
		if (event.event_type === 'proposal.recorded') {
			return {
				id: event.id,
				nodeId: event.node_id,
				title: `${label} proposed a question`,
				detail: purpose
					? `${purpose}: ${question ?? 'Follow-up recorded.'}`
					: (question ?? 'Follow-up recorded.'),
				createdAt: event.created_at,
				tone: 'neutral'
			};
		}
		if (event.event_type === 'node.failed' || event.event_type === 'run.failed') {
			return {
				id: event.id,
				nodeId: event.node_id,
				title: event.event_type === 'node.failed' ? `${label} failed` : 'Run failed',
				detail: payloadString(event, 'error') ?? 'The worker recorded an error.',
				createdAt: event.created_at,
				tone: 'danger'
			};
		}
		if (event.event_type === 'run.phase_changed') {
			const phase = payloadString(event, 'phase') ?? 'next';
			return {
				id: event.id,
				nodeId: event.node_id,
				title: `Entered ${phase} phase`,
				detail:
					phase === 'explore'
						? 'The first questions can now be admitted to the graph.'
						: 'The worker advanced the run.',
				createdAt: event.created_at,
				tone: phase === 'synthesize' ? 'working' : 'neutral'
			};
		}
		if (event.event_type === 'run.completed') {
			return {
				id: event.id,
				nodeId: null,
				title: 'Synthesis complete',
				detail: 'The final answer is ready.',
				createdAt: event.created_at,
				tone: 'success'
			};
		}
		return {
			id: event.id,
			nodeId: event.node_id,
			title: event.event_type.replaceAll('.', ' '),
			detail: 'The worker updated the run.',
			createdAt: event.created_at,
			tone: 'neutral'
		};
	}

	function hydrateBootstrap(): void {
		try {
			const raw = sessionStorage.getItem(bootstrapKey(data.runId));
			if (!raw) return;
			sessionStorage.removeItem(bootstrapKey(data.runId));
			const bootstrap = JSON.parse(raw) as QuestionTreeCreateResult;
			if (bootstrap.run.id !== data.runId || bootstrap.root_node.run_id !== data.runId)
				return;
			detail = {
				run: bootstrap.run,
				nodes: [bootstrap.root_node],
				proposals: [],
				events: []
			};
			selectedNodeId = bootstrap.root_node.id;
			loading = false;
		} catch {
			// A normal detail fetch below replaces an invalid or unavailable bootstrap.
		}
	}

	async function loadRun(options: { initial?: boolean; afterCurrent?: boolean } = {}) {
		if (requestController) {
			if (options.afterCurrent) refreshAfterCurrentRequest = true;
			return;
		}
		const controller = new AbortController();
		requestController = controller;
		if (options.initial && !detail) loading = true;
		else refreshing = true;
		try {
			const response = await fetch(
				`/api/admin/experiments/question-tree/runs/${data.runId}`,
				{
					signal: controller.signal
				}
			);
			const payload = (await response.json()) as ApiEnvelope<QuestionTreeRunDetail>;
			if (!response.ok || !payload.success || !payload.data) {
				throw new Error(payload.error || 'Unable to load Question Tree run');
			}
			detail = reconcileQuestionTreeDetail(detail, payload.data);
			if (!selectedNodeId) selectedNodeId = payload.data.run.root_node_id;
			error = null;
		} catch (loadError) {
			if ((loadError as DOMException)?.name !== 'AbortError') {
				error =
					loadError instanceof Error
						? loadError.message
						: 'Unable to load Question Tree run';
			}
		} finally {
			if (requestController === controller) requestController = null;
			loading = false;
			refreshing = false;
			if (refreshAfterCurrentRequest && !destroyed) {
				refreshAfterCurrentRequest = false;
				queueMicrotask(() => void loadRun());
			}
		}
	}

	function applyRealtimePayload(
		table: QuestionTreeRealtimeTable,
		payload: RealtimePayload
	): void {
		const row = payload.eventType === 'DELETE' ? payload.old : payload.new;
		if (!detail) {
			void loadRun({ initial: true, afterCurrent: true });
			return;
		}
		detail = applyQuestionTreeRealtimeChange(detail, table, payload.eventType, row);
		if (!selectedNodeId) selectedNodeId = detail.run.root_node_id;
		error = null;
	}

	function setupRealtime(): void {
		if (!supabase) {
			realtimeStatus = 'fallback';
			return;
		}
		const channel = supabase.channel(`admin-question-tree:${data.runId}`);
		const tables: QuestionTreeRealtimeTable[] = [
			'question_tree_nodes',
			'question_tree_proposals',
			'question_tree_events'
		];
		channel.on(
			'postgres_changes',
			{
				event: '*',
				schema: 'public',
				table: 'question_tree_runs',
				filter: `id=eq.${data.runId}`
			},
			(payload) => applyRealtimePayload('question_tree_runs', payload as RealtimePayload)
		);
		for (const table of tables) {
			channel.on(
				'postgres_changes',
				{
					event: '*',
					schema: 'public',
					table,
					filter: `run_id=eq.${data.runId}`
				},
				(payload) => applyRealtimePayload(table, payload as RealtimePayload)
			);
		}
		realtimeChannel = channel;
		channel.subscribe((status) => {
			if (status === 'SUBSCRIBED') {
				realtimeStatus = 'live';
				void loadRun({ afterCurrent: true });
			} else if (
				status === 'CHANNEL_ERROR' ||
				status === 'TIMED_OUT' ||
				status === 'CLOSED'
			) {
				realtimeStatus = 'fallback';
			}
		});
	}

	async function controlRun(action: 'pause' | 'resume' | 'cancel' | 'retry') {
		if (!detail || actionPending) return;
		actionPending = action;
		error = null;
		try {
			const response = await fetch(
				`/api/admin/experiments/question-tree/runs/${data.runId}/control`,
				{
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ action })
				}
			);
			const payload = (await response.json()) as ApiEnvelope<unknown>;
			if (!response.ok || !payload.success)
				throw new Error(payload.error || `Unable to ${action} run`);
			await loadRun();
		} catch (controlError) {
			error =
				controlError instanceof Error ? controlError.message : `Unable to ${action} run`;
		} finally {
			actionPending = null;
		}
	}

	async function retryNode(nodeId: string) {
		if (!detail || retryingNodeId) return;
		retryingNodeId = nodeId;
		error = null;
		try {
			const response = await fetch(
				`/api/admin/experiments/question-tree/runs/${data.runId}/nodes/${nodeId}/retry`,
				{ method: 'POST' }
			);
			const payload = (await response.json()) as ApiEnvelope<unknown>;
			if (!response.ok || !payload.success) {
				throw new Error(payload.error || 'Unable to retry node');
			}
			await loadRun();
		} catch (retryError) {
			error = retryError instanceof Error ? retryError.message : 'Unable to retry node';
		} finally {
			retryingNodeId = null;
		}
	}

	function formatDuration(ms: number): string {
		if (ms < 1000) return `${ms} ms`;
		return `${(ms / 1000).toFixed(1)} s`;
	}

	function formatActivityTime(value: string): string {
		return new Intl.DateTimeFormat(undefined, {
			hour: 'numeric',
			minute: '2-digit',
			second: '2-digit'
		}).format(new Date(value));
	}

	onMount(() => {
		hydrateBootstrap();
		void loadRun({ initial: !detail });
		setupRealtime();
		pollTimer = setInterval(() => {
			if (!detail || isQuestionTreeActive(detail.run.status))
				void loadRun({ initial: !detail });
		}, POLL_INTERVAL_MS);
	});

	onDestroy(() => {
		destroyed = true;
		if (pollTimer) clearInterval(pollTimer);
		requestController?.abort();
		if (realtimeChannel && supabase) void supabase.removeChannel(realtimeChannel);
	});
</script>

<svelte:head>
	<title>Question Tree Run - Admin - BuildOS</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="admin-page min-w-0 max-w-full overflow-x-hidden">
	<AdminPageHeader
		title="Question Tree Run"
		description={detail?.run.root_question ?? 'Loading model-only research tree'}
		icon={Network}
		backHref="/admin/experiments/question-tree"
	>
		{#snippet actions()}
			<div class="flex flex-wrap items-center gap-2">
				<button
					type="button"
					class="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-xs font-bold text-foreground shadow-ink hover:bg-muted disabled:opacity-50"
					onclick={() => loadRun()}
					disabled={refreshing}
				>
					<RefreshCw
						class={refreshing
							? 'h-3.5 w-3.5 animate-spin motion-reduce:animate-none'
							: 'h-3.5 w-3.5'}
					/>
					Refresh
				</button>
				{#if detail?.run.status === 'paused' || detail?.run.status === 'quota_paused'}
					<button
						type="button"
						class="inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-3 text-xs font-bold text-accent-foreground shadow-ink disabled:opacity-50"
						onclick={() => controlRun('resume')}
						disabled={Boolean(actionPending)}
					>
						<Play class="h-3.5 w-3.5" /> Resume
					</button>
				{:else if detail && isQuestionTreeActive(detail.run.status)}
					<button
						type="button"
						class="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-xs font-bold text-foreground shadow-ink hover:bg-muted disabled:opacity-50"
						onclick={() => controlRun('pause')}
						disabled={Boolean(actionPending)}
					>
						<Pause class="h-3.5 w-3.5" /> Pause
					</button>
					<button
						type="button"
						class="inline-flex h-9 items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 text-xs font-bold text-destructive hover:bg-destructive/15 disabled:opacity-50"
						onclick={() => controlRun('cancel')}
						disabled={Boolean(actionPending)}
					>
						<Square class="h-3.5 w-3.5" /> Cancel
					</button>
				{:else if detail?.run.status === 'failed' || detail?.run.status === 'completed_partial'}
					<button
						type="button"
						class="inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-3 text-xs font-bold text-accent-foreground shadow-ink disabled:opacity-50"
						onclick={() => controlRun('retry')}
						disabled={Boolean(actionPending)}
					>
						<RotateCcw class="h-3.5 w-3.5" /> Retry failures
					</button>
				{/if}
			</div>
		{/snippet}
	</AdminPageHeader>

	{#if error}
		<div
			class="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
		>
			{error}
		</div>
	{/if}

	{#if loading && !detail}
		<div
			class="admin-panel flex min-h-[50vh] items-center justify-center gap-2 text-sm text-muted-foreground"
		>
			<Loader2 class="h-5 w-5 animate-spin motion-reduce:animate-none" /> Loading Question Tree
		</div>
	{:else if detail}
		<section class="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
			{#each [['Status', detail.run.status.replace('_', ' ')], ['Answered', `${detail.run.nodes_completed}/${detail.run.nodes_created}`], ['Depth', String(detail.run.deepest_depth)], ['Frontier', String(detail.run.frontier_count)], ['Tokens', detail.run.usage.total_tokens.toLocaleString()], ['Cost', `$${detail.run.usage.cost_usd.toFixed(6)}`]] as metric (metric[0])}
				<div class="admin-panel px-3 py-2.5">
					<p class="text-2xs font-bold uppercase tracking-wide text-muted-foreground">
						{metric[0]}
					</p>
					<p class="mt-1 truncate text-sm font-bold text-foreground">{metric[1]}</p>
				</div>
			{/each}
		</section>

		<section class="admin-panel min-w-0 max-w-full overflow-hidden" aria-live="polite">
			<header
				class="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3"
			>
				<div class="flex min-w-0 flex-1 items-center gap-2">
					<span
						class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent"
					>
						<Activity class="h-4 w-4" />
					</span>
					<div class="min-w-0">
						<h2 class="text-xs font-bold text-foreground">Live execution</h2>
						<p class="line-clamp-2 text-2xs text-muted-foreground">{phaseActivity}</p>
					</div>
				</div>
				<span
					class={[
						'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-2xs font-bold',
						realtimeStatus === 'live'
							? 'border-success/40 bg-success/10 text-success'
							: realtimeStatus === 'connecting'
								? 'border-warning/40 bg-warning/10 text-warning'
								: 'border-border bg-muted text-muted-foreground'
					]}
				>
					<CircleDot
						class={realtimeStatus === 'fallback'
							? 'h-3 w-3'
							: 'h-3 w-3 animate-pulse motion-reduce:animate-none'}
					/>
					{realtimeStatus === 'live'
						? 'Live websocket'
						: realtimeStatus === 'connecting'
							? 'Connecting'
							: 'Recovery polling'}
				</span>
			</header>

			<div class="grid min-w-0 gap-2 p-3 sm:grid-cols-2 2xl:grid-cols-3">
				{#if recentActivity.length}
					{#each recentActivity as item (item.id)}
						<button
							type="button"
							class={[
								'min-w-0 max-w-full overflow-hidden rounded-lg border p-3 text-left transition',
								item.tone === 'working'
									? 'border-warning/40 bg-warning/10'
									: item.tone === 'success'
										? 'border-success/40 bg-success/10'
										: item.tone === 'danger'
											? 'border-destructive/40 bg-destructive/10'
											: 'border-border bg-background',
								item.nodeId && 'hover:border-accent/60 hover:bg-muted/60'
							]}
							onclick={() => {
								if (item.nodeId) selectedNodeId = item.nodeId;
							}}
							disabled={!item.nodeId}
						>
							<div class="flex items-center justify-between gap-2">
								<p class="truncate text-xs font-bold text-foreground">
									{item.title}
								</p>
								<span
									class="flex shrink-0 items-center gap-1 text-2xs text-muted-foreground"
								>
									<Clock3 class="h-3 w-3" />
									{formatActivityTime(item.createdAt)}
								</span>
							</div>
							<p
								class="mt-1.5 line-clamp-2 text-2xs leading-relaxed text-muted-foreground"
							>
								{item.detail}
							</p>
						</button>
					{/each}
				{:else}
					<div
						class="flex min-w-0 items-center gap-3 rounded-lg border border-dashed border-border bg-background p-3 sm:col-span-2 2xl:col-span-3"
					>
						<Loader2
							class="h-4 w-4 shrink-0 animate-spin text-warning motion-reduce:animate-none"
						/>
						<div>
							<p class="text-xs font-bold text-foreground">The root node is ready</p>
							<p class="mt-0.5 text-2xs text-muted-foreground">{phaseActivity}</p>
						</div>
					</div>
				{/if}
			</div>
		</section>

		{#if runningNodes.length}
			<section
				class="admin-panel flex min-w-0 max-w-full flex-wrap items-center gap-2 overflow-hidden px-4 py-3"
			>
				<div class="mr-1 flex items-center gap-2 text-xs font-bold text-foreground">
					<Bot class="h-4 w-4 text-warning" /> Active agents
				</div>
				{#each runningNodes as node (node.id)}
					<button
						type="button"
						class="min-w-0 max-w-full truncate rounded-full border border-warning/40 bg-warning/10 px-2.5 py-1 text-2xs font-semibold text-foreground hover:bg-warning/15 sm:max-w-64"
						onclick={() => (selectedNodeId = node.id)}
					>
						Node {node.node_number}: {node.question}
					</button>
				{/each}
			</section>
		{/if}

		{#if detail.run.pause_reason}
			<div
				class="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-foreground"
			>
				<CircleAlert class="mt-0.5 h-4 w-4 shrink-0 text-warning" />
				<span>{detail.run.pause_reason}</span>
			</div>
		{/if}

		{#if detail.run.synthesis}
			<details class="admin-panel" open={detail.run.phase === 'done'}>
				<summary class="cursor-pointer px-5 py-4 text-base font-bold text-foreground"
					>Final synthesis</summary
				>
				<div class="space-y-5 border-t border-border px-5 py-5">
					<div>
						<p class="text-2xs font-bold uppercase tracking-wide text-muted-foreground">
							Final thesis
						</p>
						<p class="mt-2 text-base font-semibold leading-relaxed text-foreground">
							{detail.run.synthesis.finalThesis}
						</p>
					</div>
					<p class="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
						{detail.run.synthesis.finalAnswer}
					</p>
					<div class="grid gap-4 lg:grid-cols-3">
						{#each synthesisGroups as group (group.label)}
							<div class={['rounded-lg border p-3', group.className]}>
								<h3
									class="text-xs font-bold uppercase tracking-wide text-foreground"
								>
									{group.label}
								</h3>
								<ul
									class="mt-2 space-y-1.5 text-xs leading-relaxed text-foreground"
								>
									{#each group.items as item (item)}<li>• {item}</li>{/each}
								</ul>
							</div>
						{/each}
					</div>
				</div>
			</details>
		{/if}

		<section class="admin-panel min-w-0 max-w-full overflow-hidden">
			<header class="border-b border-border p-3 sm:p-4">
				<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<div>
						<h2 class="text-sm font-bold text-foreground">Research tree</h2>
						<p class="text-xs text-muted-foreground">
							Select any node to inspect its answer and produced questions.
						</p>
					</div>
					<label class="relative block w-full sm:w-80">
						<Search
							class="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"
						/>
						<input
							bind:value={searchQuery}
							type="search"
							placeholder="Search questions and answers"
							class="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-xs text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
						/>
					</label>
				</div>
				{#if searchQuery.trim()}
					<div class="mt-3 flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
						{#if searchMatches.length}
							{#each searchMatches as node (node.id)}
								<button
									type="button"
									class="max-w-72 truncate rounded-md bg-muted px-2 py-1 text-2xs font-semibold text-foreground hover:bg-accent hover:text-accent-foreground"
									onclick={() => (selectedNodeId = node.id)}
								>
									Node {node.node_number}: {node.question}
								</button>
							{/each}
						{:else}
							<span class="text-xs text-muted-foreground">No matches.</span>
						{/if}
					</div>
				{/if}
			</header>

			<div
				class={[
					'grid min-h-[68vh] min-w-0 max-w-full',
					selectedNode ? 'xl:grid-cols-[minmax(0,1fr)_400px]' : 'grid-cols-1'
				]}
			>
				<div class="h-[68vh] min-h-[520px] min-w-0 max-w-full overflow-hidden">
					<QuestionTreeCanvas
						nodes={detail.nodes}
						proposals={detail.proposals}
						{searchQuery}
						rootActive={detail.run.phase === 'seed' &&
							isQuestionTreeActive(detail.run.status)}
						bind:selectedNodeId
					/>
				</div>
				{#if selectedNode}
					<div class="min-h-[420px] min-w-0 max-w-full overflow-hidden xl:h-[68vh]">
						<QuestionTreeInspector
							node={selectedNode}
							proposals={detail.proposals}
							retrying={retryingNodeId === selectedNode.id}
							onRetry={retryNode}
							onClose={() => (selectedNodeId = null)}
						/>
					</div>
				{/if}
			</div>
		</section>

		<footer
			class="flex flex-wrap items-center justify-between gap-2 text-2xs text-muted-foreground"
		>
			<span>Model: {detail.run.explorer_model_requested} · {detail.run.model_policy}</span>
			<span
				>{detail.run.provider_requests}/{detail.run.max_provider_requests} provider requests
				· {formatDuration(detail.run.usage.latency_ms)} total model latency</span
			>
		</footer>
	{/if}
</div>
