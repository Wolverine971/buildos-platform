<!-- apps/web/src/lib/components/ontology/FSMStateVisualizer.svelte -->
<!--
	FSM State Visualizer - Inkprint Design System

	Full FSM visualization with transitions, guards, and actions.
-->
<script lang="ts">
	import { onMount, createEventDispatcher } from 'svelte';
	import { browser } from '$app/environment';
	import { RefreshCw, AlertTriangle, ShieldCheck, Loader } from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import ConfirmationModal from '$lib/components/ui/ConfirmationModal.svelte';

	type Guard = Record<string, unknown>;
	type TransitionAction = Record<string, unknown>;

	export type FSMTransitionDisplay = {
		event: string;
		to: string;
		guards: Guard[];
		actions: TransitionAction[];
		failedGuards: Guard[];
		can_run: boolean;
	};

	interface Props {
		entityId: string;
		entityKind: string;
		currentState: string;
		entityName?: string;
		initialTransitions?: FSMTransitionDisplay[];
		confirmBeforeRun?: boolean;
		onstatechange?: (data: { state: string; actions: string[]; event: string }) => void;
		onrefresh?: (data: { transitions: FSMTransitionDisplay[] }) => void;
		showGuardEditCTA?: boolean;
	}

	const dispatch = createEventDispatcher<{ requestedit: void }>();

	const {
		entityId,
		entityKind,
		currentState,
		entityName = '',
		initialTransitions = [],
		confirmBeforeRun = true,
		onstatechange,
		onrefresh,
		showGuardEditCTA = false
	}: Props = $props();

	const normalizeTransition = (
		transition: Partial<FSMTransitionDisplay> & { failed_guards?: Guard[] }
	): FSMTransitionDisplay => ({
		event: transition.event ?? '',
		to: transition.to ?? '',
		guards: Array.isArray(transition.guards) ? (transition.guards as Guard[]) : [],
		actions: Array.isArray(transition.actions)
			? (transition.actions as TransitionAction[])
			: [],
		failedGuards: Array.isArray(transition.failedGuards)
			? (transition.failedGuards as Guard[])
			: Array.isArray(transition.failed_guards)
				? ((transition.failed_guards as Guard[]) ?? [])
				: [],
		can_run: typeof transition.can_run === 'boolean' ? transition.can_run : true
	});

	const normalizedInitial = Array.isArray(initialTransitions)
		? initialTransitions.map((transition) => normalizeTransition(transition))
		: [];

	let transitions = $state<FSMTransitionDisplay[]>(normalizedInitial);
	let loading = $state(false);
	let executingEvent = $state<string | null>(null);
	let fetchError = $state<string | null>(null);
	let transitionError = $state<string | null>(null);
	let successInfo = $state<{ event: string; to: string; actions: string[] } | null>(null);
	let localState = $state(currentState);
	let lastFetchedState = currentState;

	// Confirmation modal state
	let showConfirmModal = $state(false);
	let pendingTransition = $state<{ event: string; to: string } | null>(null);

	onMount(() => {
		if (transitions.length === 0) {
			void refreshTransitions();
		}
	});

	$effect(() => {
		if (currentState !== localState) {
			localState = currentState;
		}
	});

	$effect(() => {
		// Only fetch on client-side to avoid SSR fetch warning
		if (browser && currentState !== lastFetchedState) {
			void refreshTransitions();
		}
	});

	async function refreshTransitions() {
		if (!entityId || !entityKind) return;

		loading = true;
		fetchError = null;

		try {
			const params = new URLSearchParams({
				id: entityId,
				kind: entityKind
			});
			const response = await fetch(`/api/onto/fsm/transitions?${params.toString()}`);

			if (!response.ok) {
				const body = await response.json().catch(() => ({}));
				throw new Error(body.error || body.message || 'Failed to load transitions');
			}

			const payload = await response.json();
			const normalized =
				(payload.data?.transitions ?? []).map((transition: Partial<FSMTransitionDisplay>) =>
					normalizeTransition(transition)
				) ?? [];
			transitions = normalized;
			lastFetchedState = currentState;
			onrefresh?.({ transitions });
		} catch (err) {
			console.error('[FSM] Failed to fetch transitions:', err);
			fetchError = err instanceof Error ? err.message : 'Failed to load transitions';
		} finally {
			loading = false;
		}
	}

	function initiateTransition(event: string, to: string) {
		if (confirmBeforeRun) {
			pendingTransition = { event, to };
			showConfirmModal = true;
		} else {
			void executeTransition(event, to);
		}
	}

	function handleConfirmTransition() {
		if (pendingTransition) {
			void executeTransition(pendingTransition.event, pendingTransition.to);
		}
		showConfirmModal = false;
		pendingTransition = null;
	}

	function handleCancelTransition() {
		showConfirmModal = false;
		pendingTransition = null;
	}

	async function executeTransition(event: string, to: string) {
		transitionError = null;
		successInfo = null;
		executingEvent = event;

		try {
			const response = await fetch('/api/onto/fsm/transition', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					object_kind: entityKind,
					object_id: entityId,
					event
				})
			});

			const payload = await response.json().catch(() => ({}));

			if (!response.ok) {
				throw new Error(payload.error || payload.message || 'Transition failed');
			}

			const stateAfter = payload.data?.state_after as string;
			const actionsRun = (payload.data?.actions_run ?? []) as string[];

			localState = stateAfter;
			successInfo = { event, to: stateAfter, actions: actionsRun };
			onstatechange?.({ state: stateAfter, actions: actionsRun, event });

			await refreshTransitions();
		} catch (err) {
			console.error('[FSM] Transition failed:', err);
			transitionError = err instanceof Error ? err.message : 'Transition failed';
		} finally {
			executingEvent = null;
		}
	}

	function guardLabel(rawGuard: Guard): string {
		if (!rawGuard || typeof rawGuard !== 'object') {
			return String(rawGuard);
		}

		const guard = rawGuard as Record<string, unknown>;
		const type =
			typeof guard.type === 'string' && guard.type.length > 0
				? (guard.type as string)
				: 'guard';
		const key = typeof guard.key === 'string' ? (guard.key as string) : undefined;
		const value = typeof guard.value === 'string' ? (guard.value as string) : undefined;
		const path = typeof guard.path === 'string' ? (guard.path as string) : undefined;
		const pattern = typeof guard.pattern === 'string' ? (guard.pattern as string) : undefined;
		const keys = Array.isArray(guard.keys) ? (guard.keys as string[]) : undefined;
		const values = Array.isArray(guard.values) ? (guard.values as string[]) : undefined;

		switch (type) {
			case 'has_property':
				return path ? `property: ${path}` : 'property set';
			case 'has_facet':
				return key && value ? `facet ${key}=${value}` : 'facet check';
			case 'facet_in':
				return key && values ? `facet ${key} in [${values.join(', ')}]` : 'facet set';
			case 'all_facets_set':
				return keys && keys.length
					? `facets required: ${keys.join(', ')}`
					: 'facets required';
			case 'type_key_matches':
				return pattern ? `type matches ${pattern}` : 'type matches';
			default:
				return type;
		}
	}

	function actionLabel(rawAction: TransitionAction): string {
		if (!rawAction || typeof rawAction !== 'object') {
			return String(rawAction);
		}

		const action = rawAction as Record<string, unknown>;
		const name = typeof action.name === 'string' ? (action.name as string) : undefined;
		const type = typeof action.type === 'string' ? (action.type as string) : undefined;
		const act = typeof action.action === 'string' ? (action.action as string) : undefined;

		if (name) return name;
		if (type) return type;
		if (act) return act;

		try {
			return JSON.stringify(action);
		} catch (err) {
			return String(rawAction);
		}
	}
</script>

<div
	class="fsm-visualizer bg-card border border-border rounded-lg p-3 sm:p-4 space-y-3 shadow-ink tx tx-frame tx-weak"
>
	<div class="flex items-center justify-between gap-3">
		<div class="min-w-0 flex-1">
			<p
				class="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5"
			>
				Current State: <span
					class="px-3 py-1 rounded-lg bg-accent/10 text-accent font-semibold capitalize text-xs sm:text-sm border border-accent/20"
				>
					{localState}
				</span>
			</p>
		</div>

		<Button
			variant="outline"
			size="sm"
			onclick={() => refreshTransitions()}
			disabled={loading}
			{loading}
			icon={RefreshCw}
			class="shrink-0 border-border hover:border-accent transition-colors"
		>
			<span class="hidden sm:inline text-xs">{loading ? 'Refreshing…' : 'Refresh'}</span>
		</Button>
	</div>

	{#if successInfo}
		<div
			class="flex items-start gap-2 p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 tx tx-grain tx-weak"
		>
			<ShieldCheck
				class="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5"
			/>
			<div class="flex-1 min-w-0">
				<p class="text-xs font-medium text-emerald-700 dark:text-emerald-300 truncate">
					"{successInfo.event}" → {successInfo.to}
				</p>
				{#if successInfo.actions.length}
					<p class="text-[10px] text-emerald-600 dark:text-emerald-400 truncate">
						{successInfo.actions.join(', ')}
					</p>
				{/if}
			</div>
		</div>
	{/if}

	{#if fetchError}
		<div
			class="flex items-start gap-2 p-2 rounded-lg bg-red-500/10 border border-red-500/20 tx tx-static tx-weak"
		>
			<AlertTriangle class="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
			<div class="flex-1 min-w-0">
				<p class="text-xs font-medium text-red-700 dark:text-red-300 truncate">
					{fetchError}
				</p>
			</div>
		</div>
	{/if}

	{#if transitionError}
		<div
			class="flex items-start gap-2 p-2 rounded-lg bg-red-500/10 border border-red-500/20 tx tx-static tx-weak"
		>
			<AlertTriangle class="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
			<div class="flex-1 min-w-0">
				<p class="text-xs font-medium text-red-700 dark:text-red-300 truncate">
					{transitionError}
				</p>
			</div>
		</div>
	{/if}

	{#if loading && transitions.length === 0}
		<div
			class="flex items-center justify-center py-6 bg-muted rounded-lg border border-border"
		>
			<div class="flex items-center gap-2">
				<Loader class="w-4 h-4 text-accent animate-spin" />
				<p class="text-xs font-medium text-muted-foreground">
					Loading transitions...
				</p>
			</div>
		</div>
	{:else if transitions.length === 0}
		<div
			class="flex items-center gap-2 p-2 rounded-lg bg-muted border border-border"
		>
			<ShieldCheck class="w-4 h-4 text-muted-foreground flex-shrink-0" />
			<p class="text-xs text-muted-foreground">No transitions available</p>
		</div>
	{:else}
		<div class="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-3">
			{#each transitions as transition (transition.event)}
				<div
					class="flex flex-col gap-2 border border-border rounded-lg p-2.5 sm:p-3 bg-card hover:border-accent/50 transition-all duration-200 shadow-ink"
				>
					<div class="flex items-start justify-between gap-2">
						<div class="min-w-0 flex-1 space-y-1">
							<div class="flex items-center gap-1.5">
								<p
									class="text-xs sm:text-sm font-semibold text-foreground truncate"
								>
									{transition.event}
								</p>
								<span class="text-muted-foreground text-xs">→</span>
								<span
									class="text-xs font-medium text-accent truncate capitalize"
								>
									{transition.to}
								</span>
							</div>
						</div>
						<Button
							variant="primary"
							size="sm"
							onclick={() => initiateTransition(transition.event, transition.to)}
							disabled={Boolean(executingEvent) || loading || !transition.can_run}
							loading={executingEvent === transition.event}
							class="shrink-0 text-xs px-2 py-1"
						>
							{!transition.can_run
								? 'Blocked'
								: executingEvent === transition.event
									? 'Running…'
									: 'Execute'}
						</Button>
					</div>

					{#if !transition.can_run && transition.failedGuards?.length}
						<div class="space-y-1.5 pt-2 border-t border-border">
							<p
								class="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400"
							>
								<AlertTriangle class="w-3 h-3" />
								Blocked
							</p>
							<div class="flex flex-wrap gap-1">
								{#each transition.failedGuards as guard, index (index)}
									<span
										class="inline-flex items-center px-1.5 py-0.5 rounded-lg text-[10px] font-medium bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20"
										title={JSON.stringify(guard, null, 2)}
									>
										{guardLabel(guard)}
									</span>
								{/each}
							</div>
						</div>
					{/if}

					{#if !transition.can_run && showGuardEditCTA}
						<Button
							variant="outline"
							size="sm"
							class="w-full text-xs py-1"
							onclick={() => dispatch('requestedit')}
						>
							Update Details
						</Button>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>

<!-- Confirmation Modal -->
<ConfirmationModal
	isOpen={showConfirmModal}
	title="Confirm Transition"
	confirmText="Execute"
	cancelText="Cancel"
	confirmVariant="primary"
	icon="info"
	on:confirm={handleConfirmTransition}
	on:cancel={handleCancelTransition}
>
	{#snippet content()}
		<div class="space-y-2">
			{#if pendingTransition}
				<div
					class="p-2 rounded-lg bg-accent/5 border border-accent/20 space-y-1.5"
				>
					<div class="flex items-center justify-between">
						<span
							class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
							>Event</span
						>
						<span class="text-xs font-semibold text-accent"
							>{pendingTransition.event}</span
						>
					</div>

					<div class="flex items-center justify-between">
						<span
							class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
							>Entity</span
						>
						<span class="text-xs text-foreground truncate"
							>{entityName || entityKind}</span
						>
					</div>

					<div class="pt-1.5 border-t border-accent/20">
						<div class="flex items-center gap-2 text-xs">
							<span class="font-medium text-muted-foreground capitalize"
								>{localState}</span
							>
							<span class="text-muted-foreground">→</span>
							<span class="font-semibold text-accent capitalize"
								>{pendingTransition.to}</span
							>
						</div>
					</div>
				</div>
			{/if}

			<p class="text-xs text-muted-foreground">
				This will execute the transition and any associated actions.
			</p>
		</div>
	{/snippet}
</ConfirmationModal>
