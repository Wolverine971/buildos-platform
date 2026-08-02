<!-- apps/web/src/routes/admin/experiments/question-tree/[runId]/+page.svelte -->
<script lang="ts">
	import { resolve } from '$app/paths';
	import { onDestroy, onMount } from 'svelte';
	import { MediaQuery } from 'svelte/reactivity';
	import type { RealtimeChannel } from '@supabase/supabase-js';
	import AdminPageHeader from '$lib/components/admin/AdminPageHeader.svelte';
	import QuestionTreeCanvas from '$lib/components/admin/question-tree/QuestionTreeCanvas.svelte';
	import QuestionTreeInspector from '$lib/components/admin/question-tree/QuestionTreeInspector.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import {
		Activity,
		Bot,
		ChevronDown,
		CircleAlert,
		CircleDot,
		Clock3,
		Download,
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
	let hasUserSelectedNode = $state(false);
	let searchQuery = $state('');
	let activeSearchIndex = $state(-1);
	let loading = $state(true);
	let refreshing = $state(false);
	let exporting = $state(false);
	let actionPending = $state<string | null>(null);
	let retryingNodeId = $state<string | null>(null);
	let error = $state<string | null>(null);
	let realtimeStatus = $state<RealtimeStatus>('connecting');
	let pollTimer: ReturnType<typeof setInterval> | null = null;
	let requestController: AbortController | null = null;
	let realtimeChannel: RealtimeChannel | null = null;
	let refreshAfterCurrentRequest = false;
	let destroyed = false;
	const isDesktop = new MediaQuery('(min-width: 1280px)', false);
	const searchListboxId = 'question-tree-search-results';

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
			: `Run finished with status ${humanize(detail.run.status)}.`;
	});
	const recentActivity = $derived.by(() => (detail?.events ?? []).slice(0, 4).map(describeEvent));
	const activeSearchNode = $derived(searchMatches[activeSearchIndex] ?? null);
	const mobileInspectorOpen = $derived(
		Boolean(selectedNode && hasUserSelectedNode && !isDesktop.current)
	);

	function humanize(value: string): string {
		return value
			.split('_')
			.map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
			.join(' ');
	}

	function modelPolicyLabel(value: QuestionTreeRunDetail['run']['model_policy']): string {
		return value === 'paid_floor_strict' ? 'Paid research model' : 'Free quota-limited model';
	}

	function selectNode(nodeId: string): void {
		selectedNodeId = nodeId;
		hasUserSelectedNode = true;
	}

	function closeInspector(): void {
		selectedNodeId = null;
		hasUserSelectedNode = false;
	}

	function searchOptionId(nodeId: string): string {
		return `question-tree-search-option-${nodeId}`;
	}

	function handleSearchInput(): void {
		activeSearchIndex = -1;
	}

	function handleSearchKeydown(event: KeyboardEvent): void {
		if (event.key === 'Escape') {
			searchQuery = '';
			activeSearchIndex = -1;
			return;
		}
		if (!searchMatches.length) return;
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			activeSearchIndex = (activeSearchIndex + 1) % searchMatches.length;
			return;
		}
		if (event.key === 'ArrowUp') {
			event.preventDefault();
			activeSearchIndex =
				activeSearchIndex <= 0 ? searchMatches.length - 1 : activeSearchIndex - 1;
			return;
		}
		if (event.key === 'Enter') {
			const targetNode = activeSearchNode ?? searchMatches[0];
			if (!targetNode) return;
			event.preventDefault();
			selectNode(targetNode.id);
		}
	}

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
		const purpose = payloadString(event, 'purpose')?.replaceAll('_', ' ');
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
			await loadRun({ afterCurrent: true });
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
			await loadRun({ afterCurrent: true });
		} catch (retryError) {
			error = retryError instanceof Error ? retryError.message : 'Unable to retry node';
		} finally {
			retryingNodeId = null;
		}
	}

	async function exportRun(): Promise<void> {
		if (exporting) return;
		exporting = true;
		error = null;
		try {
			const response = await fetch(
				`/api/admin/experiments/question-tree/runs/${data.runId}/export`
			);
			if (!response.ok) {
				const payload = (await response
					.json()
					.catch(() => null)) as ApiEnvelope<unknown> | null;
				throw new Error(payload?.error || 'Unable to export Question Tree run');
			}

			const disposition = response.headers.get('content-disposition');
			const filename =
				disposition?.match(/filename="([^"]+)"/i)?.[1] ?? `question-tree-${data.runId}.zip`;
			const url = URL.createObjectURL(await response.blob());
			const link = document.createElement('a');
			link.href = url;
			link.download = filename;
			document.body.appendChild(link);
			link.click();
			link.remove();
			URL.revokeObjectURL(url);
		} catch (exportError) {
			error =
				exportError instanceof Error
					? exportError.message
					: 'Unable to export Question Tree run';
		} finally {
			exporting = false;
		}
	}

	function formatDuration(ms: number): string {
		if (ms < 1000) return `${ms} ms`;
		const seconds = Math.round(ms / 1000);
		if (seconds < 60) return `${seconds} s`;
		const minutes = Math.floor(seconds / 60);
		const remainingSeconds = seconds % 60;
		return `${minutes}m ${remainingSeconds}s`;
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

{#snippet activityRow(item: ActivityItem)}
	<span
		class={[
			'mt-1 h-2 w-2 shrink-0 rounded-full',
			item.tone === 'working'
				? 'bg-warning'
				: item.tone === 'success'
					? 'bg-success'
					: item.tone === 'danger'
						? 'bg-destructive'
						: 'bg-muted-foreground/60'
		]}
	></span>
	<span class="min-w-0 flex-1">
		<span class="flex items-center justify-between gap-2">
			<span class="truncate text-xs font-bold text-foreground">{item.title}</span>
			<span class="flex shrink-0 items-center gap-1 text-2xs text-muted-foreground">
				<Clock3 class="h-3 w-3" />
				{formatActivityTime(item.createdAt)}
			</span>
		</span>
		<span class="mt-1 line-clamp-2 text-2xs leading-relaxed text-muted-foreground">
			{item.detail}
		</span>
	</span>
{/snippet}

<div class="question-tree-detail-page admin-page min-w-0 max-w-full overflow-x-hidden">
	<AdminPageHeader
		title="Question Tree Run"
		description={detail?.run.root_question ?? 'Loading model-only research tree'}
		icon={Network}
		backHref={resolve('/admin/experiments/question-tree')}
		backLabel="Question Tree runs"
	>
		{#snippet actions()}
			<div class="flex flex-wrap items-center gap-2">
				<Button
					variant="primary"
					size="sm"
					icon={Download}
					loading={exporting}
					onclick={exportRun}
					disabled={!detail || exporting}
					title="Download the complete research tree, synthesis, proposals, events, and raw data"
				>
					Export data
				</Button>
				<Button
					variant="outline"
					size="sm"
					icon={RefreshCw}
					loading={refreshing}
					onclick={() => loadRun()}
					disabled={refreshing}
				>
					Refresh
				</Button>
				{#if detail?.run.status === 'paused' || detail?.run.status === 'quota_paused'}
					<Button
						variant="primary"
						size="sm"
						icon={Play}
						onclick={() => controlRun('resume')}
						disabled={Boolean(actionPending)}
					>
						Resume
					</Button>
				{:else if detail && isQuestionTreeActive(detail.run.status)}
					<Button
						variant="outline"
						size="sm"
						icon={Pause}
						onclick={() => controlRun('pause')}
						disabled={Boolean(actionPending)}
					>
						Pause
					</Button>
					<Button
						variant="danger"
						size="sm"
						icon={Square}
						onclick={() => controlRun('cancel')}
						disabled={Boolean(actionPending)}
					>
						Cancel
					</Button>
				{:else if detail?.run.status === 'failed' || detail?.run.status === 'completed_partial'}
					<Button
						variant="primary"
						size="sm"
						icon={RotateCcw}
						onclick={() => controlRun('retry')}
						disabled={Boolean(actionPending)}
					>
						Retry failures
					</Button>
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
		<section class="admin-panel overflow-hidden">
			<div class="grid grid-cols-2 lg:grid-cols-4">
				{#each [['Status', humanize(detail.run.status)], ['Answered', `${detail.run.nodes_completed}/${detail.run.nodes_created}`], ['Depth', String(detail.run.deepest_depth)], ['Cost', `$${detail.run.usage.cost_usd.toFixed(4)}`]] as metric (metric[0])}
					<div
						class="border-b border-r border-border px-4 py-3 even:border-r-0 lg:border-b-0 lg:even:border-r lg:last:border-r-0"
					>
						<p class="micro-label">{metric[0]}</p>
						<p class="mt-1 truncate text-base font-bold text-foreground">{metric[1]}</p>
					</div>
				{/each}
			</div>
			<details class="group border-t border-border lg:border-t">
				<summary
					class="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2 text-xs font-semibold text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
				>
					<span>Run details</span>
					<ChevronDown
						class="h-4 w-4 transition-transform group-open:rotate-180 motion-reduce:transition-none"
					/>
				</summary>
				<div
					class="grid grid-cols-2 gap-x-6 gap-y-3 border-t border-border bg-muted/25 px-4 py-3 text-xs sm:grid-cols-4"
				>
					<div>
						<span class="text-muted-foreground">Frontier</span>
						<p class="font-bold text-foreground">{detail.run.frontier_count}</p>
					</div>
					<div>
						<span class="text-muted-foreground">Tokens</span>
						<p class="font-bold text-foreground">
							{detail.run.usage.total_tokens.toLocaleString()}
						</p>
					</div>
					<div>
						<span class="text-muted-foreground">Requests</span>
						<p class="font-bold text-foreground">
							{detail.run.provider_requests}/{detail.run.max_provider_requests}
						</p>
					</div>
					<div>
						<span class="text-muted-foreground">Model time</span>
						<p class="font-bold text-foreground">
							{formatDuration(detail.run.usage.latency_ms)}
						</p>
					</div>
				</div>
			</details>
		</section>

		<details class="admin-panel group" open>
			<summary
				class="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 text-base font-bold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
			>
				<span>Final synthesis</span>
				<span class="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
					{detail.run.synthesis
						? 'Ready'
						: detail.run.phase === 'synthesize'
							? 'Generating'
							: isQuestionTreeActive(detail.run.status)
								? 'Pending'
								: 'Not available'}
					<ChevronDown
						class="h-4 w-4 transition-transform group-open:rotate-180 motion-reduce:transition-none"
					/>
				</span>
			</summary>
			{#if detail.run.synthesis}
				<div class="space-y-6 border-t border-border px-5 py-5">
					<div>
						<p class="micro-label">Final thesis</p>
						<p class="mt-2 text-base font-semibold leading-relaxed text-foreground">
							{detail.run.synthesis.finalThesis}
						</p>
					</div>
					<div>
						<p class="micro-label">Final answer</p>
						<p class="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
							{detail.run.synthesis.finalAnswer}
						</p>
					</div>
					<div>
						<h3 class="text-sm font-bold text-foreground">Confidence assessment</h3>
						<p class="mt-1 text-xs text-muted-foreground">
							The synthesis model's classification of the material claims in this
							tree.
						</p>
						<div class="mt-3 grid gap-4 lg:grid-cols-3">
							{#each synthesisGroups as group (group.label)}
								<div class={['rounded-lg border p-3', group.className]}>
									<h4
										class="text-xs font-bold uppercase tracking-wide text-foreground"
									>
										{group.label}
									</h4>
									{#if group.items.length}
										<ul
											class="mt-2 space-y-1.5 text-xs leading-relaxed text-foreground"
										>
											{#each group.items as item (item)}
												<li class="flex gap-2">
													<span aria-hidden="true">•</span>
													<span>{item}</span>
												</li>
											{/each}
										</ul>
									{:else}
										<p class="mt-2 text-xs text-muted-foreground">
											None identified.
										</p>
									{/if}
								</div>
							{/each}
						</div>
					</div>

					<div class="grid gap-4 lg:grid-cols-2">
						<div class="rounded-lg border border-border bg-background p-4">
							<h3 class="text-xs font-bold uppercase tracking-wide text-foreground">
								Key evidence
							</h3>
							{#if detail.run.synthesis.keyEvidence.length}
								<ul class="mt-2 space-y-2 text-xs leading-relaxed text-foreground">
									{#each detail.run.synthesis.keyEvidence as evidence (`${evidence.finding}:${evidence.nodeNumbers.join(',')}`)}
										<li>
											{evidence.finding}
											{#if evidence.nodeNumbers.length}
												<span class="text-muted-foreground">
													· Nodes {evidence.nodeNumbers.join(', ')}
												</span>
											{/if}
										</li>
									{/each}
								</ul>
							{:else}
								<p class="mt-2 text-xs text-muted-foreground">None identified.</p>
							{/if}
						</div>
						<div class="rounded-lg border border-border bg-background p-4">
							<h3 class="text-xs font-bold uppercase tracking-wide text-foreground">
								Important disagreements
							</h3>
							{#if detail.run.synthesis.importantDisagreements.length}
								<ul class="mt-2 space-y-2 text-xs leading-relaxed text-foreground">
									{#each detail.run.synthesis.importantDisagreements as disagreement (`${disagreement.issue}:${disagreement.nodeNumbers.join(',')}`)}
										<li>
											{disagreement.issue}
											{#if disagreement.nodeNumbers.length}
												<span class="text-muted-foreground">
													· Nodes {disagreement.nodeNumbers.join(', ')}
												</span>
											{/if}
										</li>
									{/each}
								</ul>
							{:else}
								<p class="mt-2 text-xs text-muted-foreground">None identified.</p>
							{/if}
						</div>
						<div class="rounded-lg border border-border bg-background p-4">
							<h3 class="text-xs font-bold uppercase tracking-wide text-foreground">
								Recommended next research
							</h3>
							{#if detail.run.synthesis.recommendedNextResearch.length}
								<ul class="mt-2 space-y-2 text-xs leading-relaxed text-foreground">
									{#each detail.run.synthesis.recommendedNextResearch as item (item)}
										<li class="flex gap-2">
											<span aria-hidden="true">•</span>
											<span>{item}</span>
										</li>
									{/each}
								</ul>
							{:else}
								<p class="mt-2 text-xs text-muted-foreground">None identified.</p>
							{/if}
						</div>
						<div class="rounded-lg border border-border bg-background p-4">
							<h3 class="text-xs font-bold uppercase tracking-wide text-foreground">
								Limitations
							</h3>
							{#if detail.run.synthesis.limitations.length}
								<ul class="mt-2 space-y-2 text-xs leading-relaxed text-foreground">
									{#each detail.run.synthesis.limitations as item (item)}
										<li class="flex gap-2">
											<span aria-hidden="true">•</span>
											<span>{item}</span>
										</li>
									{/each}
								</ul>
							{:else}
								<p class="mt-2 text-xs text-muted-foreground">None identified.</p>
							{/if}
						</div>
					</div>
				</div>
			{:else}
				<div class="border-t border-border px-5 py-5 text-sm text-muted-foreground">
					{detail.run.phase === 'synthesize'
						? 'The synthesis agent is combining the completed research now.'
						: isQuestionTreeActive(detail.run.status)
							? 'The final synthesis will appear here after exploration finishes.'
							: 'This run ended before a final synthesis was recorded. The available node answers are still included in the export.'}
				</div>
			{/if}
		</details>

		<p class="sr-only" aria-live="polite">{phaseActivity}</p>
		<section class="admin-panel min-w-0 max-w-full overflow-hidden">
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
						<h2 class="text-xs font-bold text-foreground">
							{isQuestionTreeActive(detail.run.status)
								? 'Live execution'
								: 'Run activity'}
						</h2>
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
						? 'Live updates'
						: realtimeStatus === 'connecting'
							? 'Connecting'
							: 'Recovery polling'}
				</span>
			</header>

			<div class="min-w-0 divide-y divide-border">
				{#if recentActivity.length}
					{#each recentActivity as item (item.id)}
						{#if item.nodeId}
							<button
								type="button"
								class="flex min-h-14 w-full min-w-0 items-start gap-3 px-4 py-3 text-left transition hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
								onclick={() => selectNode(item.nodeId as string)}
							>
								{@render activityRow(item)}
							</button>
						{:else}
							<div class="flex min-h-14 min-w-0 items-start gap-3 px-4 py-3">
								{@render activityRow(item)}
							</div>
						{/if}
					{/each}
				{:else}
					<div class="flex min-w-0 items-center gap-3 px-4 py-4">
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
			{#if runningNodes.length}
				<div
					class="flex min-w-0 flex-wrap items-center gap-2 border-t border-border bg-warning/5 px-4 py-3"
				>
					<div class="mr-1 flex items-center gap-2 text-xs font-bold text-foreground">
						<Bot class="h-4 w-4 text-warning" /> Active agents
					</div>
					{#each runningNodes as node (node.id)}
						<button
							type="button"
							class="min-h-11 min-w-0 max-w-full truncate rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-2xs font-semibold text-foreground transition hover:bg-warning/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:max-w-64"
							onclick={() => selectNode(node.id)}
						>
							Node {node.node_number}: {node.question}
						</button>
					{/each}
				</div>
			{/if}
		</section>

		{#if detail.run.pause_reason}
			<div
				class="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-foreground"
			>
				<CircleAlert class="mt-0.5 h-4 w-4 shrink-0 text-warning" />
				<span>{detail.run.pause_reason}</span>
			</div>
		{/if}

		<section class="admin-panel min-w-0 max-w-full overflow-hidden">
			<header class="border-b border-border p-3 sm:p-4">
				<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<div>
						<h2 class="text-sm font-bold text-foreground">Research tree</h2>
						<p class="text-xs text-muted-foreground">
							Click a node to inspect it. Drag to pan, scroll or pinch to zoom, or use
							search for keyboard navigation.
						</p>
					</div>
					<label class="relative block w-full sm:w-80">
						<span class="sr-only">Find a research tree node</span>
						<Search
							class="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground"
						/>
						<input
							bind:value={searchQuery}
							type="search"
							placeholder="Find a node"
							role="combobox"
							aria-autocomplete="list"
							aria-expanded={Boolean(searchQuery.trim())}
							aria-controls={searchListboxId}
							aria-activedescendant={activeSearchNode
								? searchOptionId(activeSearchNode.id)
								: undefined}
							oninput={handleSearchInput}
							onkeydown={handleSearchKeydown}
							class="h-11 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
						/>
					</label>
				</div>
				{#if searchQuery.trim()}
					<p class="mt-3 text-2xs font-semibold text-muted-foreground" aria-live="polite">
						{searchMatches.length} match{searchMatches.length === 1
							? ''
							: 'es'}{searchMatches.length === 20 ? ' · showing the first 20' : ''}.
						Use the arrow keys to move and Enter to open.
					</p>
					<div
						id={searchListboxId}
						role="listbox"
						aria-label="Matching research tree nodes"
						class="mt-3 max-h-52 overflow-y-auto rounded-lg border border-border bg-background p-1"
					>
						{#if searchMatches.length}
							{#each searchMatches as node, index (node.id)}
								<button
									id={searchOptionId(node.id)}
									type="button"
									role="option"
									aria-selected={activeSearchIndex === index}
									tabindex="-1"
									class={[
										'flex min-h-11 w-full min-w-0 items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs transition hover:bg-muted',
										activeSearchIndex === index && 'bg-accent/10 text-accent'
									]}
									onmouseenter={() => (activeSearchIndex = index)}
									onclick={() => selectNode(node.id)}
								>
									<span class="shrink-0 font-bold text-muted-foreground">
										{node.node_kind === 'root'
											? 'Root'
											: `Node ${node.node_number}`}
									</span>
									<span class="truncate font-semibold text-foreground"
										>{node.question}</span
									>
								</button>
							{/each}
						{:else}
							<p class="px-2.5 py-3 text-xs text-muted-foreground">
								No matching nodes.
							</p>
						{/if}
					</div>
				{/if}
			</header>

			<div
				class={[
					'grid min-h-[72vh] min-w-0 max-w-full',
					selectedNode ? 'xl:grid-cols-[minmax(0,1fr)_400px]' : 'grid-cols-1'
				]}
			>
				<div class="h-[72vh] min-h-[540px] min-w-0 max-w-full overflow-hidden">
					<QuestionTreeCanvas
						nodes={detail.nodes}
						proposals={detail.proposals}
						{searchQuery}
						rootActive={detail.run.phase === 'seed' &&
							isQuestionTreeActive(detail.run.status)}
						bind:selectedNodeId
						onSelectNode={() => (hasUserSelectedNode = true)}
					/>
				</div>
				{#if selectedNode}
					<div
						class="hidden min-h-[420px] min-w-0 max-w-full overflow-hidden xl:block xl:h-[72vh]"
					>
						<QuestionTreeInspector
							node={selectedNode}
							proposals={detail.proposals}
							retrying={retryingNodeId === selectedNode.id}
							onRetry={retryNode}
							onSelectNode={selectNode}
							onClose={closeInspector}
						/>
					</div>
				{/if}
			</div>
		</section>

		<Modal
			isOpen={mobileInspectorOpen}
			onClose={closeInspector}
			title="Node details"
			size="lg"
			variant="bottom-sheet"
			showCloseButton={false}
			contentScrollable={false}
			customClasses="h-[88dvh]"
		>
			{#if selectedNode}
				<QuestionTreeInspector
					node={selectedNode}
					proposals={detail.proposals}
					retrying={retryingNodeId === selectedNode.id}
					onRetry={retryNode}
					onSelectNode={selectNode}
					onClose={closeInspector}
				/>
			{/if}
		</Modal>

		<footer
			class="flex flex-wrap items-center justify-between gap-2 text-2xs text-muted-foreground"
		>
			<span>Explorer model: {detail.run.explorer_model_requested}</span>
			<span
				>{modelPolicyLabel(detail.run.model_policy)} · prompt {detail.run
					.prompt_version}</span
			>
		</footer>
	{/if}
</div>

<style>
	.question-tree-detail-page :global(h1 + p) {
		display: -webkit-box;
		overflow: hidden;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
	}
</style>
