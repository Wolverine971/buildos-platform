<!-- apps/web/src/lib/components/ontology/FSMStateVisualizer.svelte -->
<script lang="ts">
	import { onMount, createEventDispatcher } from 'svelte';
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
		if (currentState !== lastFetchedState) {
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

			// ✅ FIX: Extract from ApiResponse.data wrapper
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
	class="fsm-visualizer bg-gradient-to-br from-white to-gray-50/50 dark:from-gray-800 dark:to-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg p-3 sm:p-4 space-y-3 shadow-sm hover:shadow-md transition-shadow duration-200"
>
	<div class="flex items-center justify-between gap-3">
		<div class="min-w-0 flex-1">
			<p
				class="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold mb-1.5"
			>
				Current State: <span
					class="px-3 py-1 rounded-full bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/40 dark:to-indigo-950/40 text-blue-700 dark:text-blue-300 font-semibold capitalize text-xs sm:text-sm border border-blue-200 dark:border-blue-800/50"
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
			class="shrink-0 border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500 transition-colors"
		>
			<span class="hidden sm:inline text-xs">{loading ? 'Refreshing…' : 'Refresh'}</span>
		</Button>
	</div>

	{#if successInfo}
		<div
			class="flex items-start gap-2 p-2 rounded-lg bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-900/20 dark:to-green-900/20 border border-emerald-200 dark:border-emerald-800/50"
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
			class="flex items-start gap-2 p-2 rounded-lg bg-gradient-to-br from-rose-50 to-red-50 dark:from-rose-900/20 dark:to-red-900/20 border border-rose-200 dark:border-rose-800"
		>
			<AlertTriangle class="w-4 h-4 text-rose-600 dark:text-rose-400 flex-shrink-0 mt-0.5" />
			<div class="flex-1 min-w-0">
				<p class="text-xs font-medium text-rose-700 dark:text-rose-300 truncate">
					{fetchError}
				</p>
			</div>
		</div>
	{/if}

	{#if transitionError}
		<div
			class="flex items-start gap-2 p-2 rounded-lg bg-gradient-to-br from-rose-50 to-red-50 dark:from-rose-900/20 dark:to-red-900/20 border border-rose-200 dark:border-rose-800"
		>
			<AlertTriangle class="w-4 h-4 text-rose-600 dark:text-rose-400 flex-shrink-0 mt-0.5" />
			<div class="flex-1 min-w-0">
				<p class="text-xs font-medium text-rose-700 dark:text-rose-300 truncate">
					{transitionError}
				</p>
			</div>
		</div>
	{/if}

	{#if loading && transitions.length === 0}
		<div
			class="flex items-center justify-center py-6 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900/40 dark:to-gray-800/40 rounded-lg border border-gray-200 dark:border-gray-700"
		>
			<div class="flex items-center gap-2">
				<Loader class="w-4 h-4 text-blue-600 dark:text-blue-400 animate-spin" />
				<p class="text-xs font-medium text-gray-700 dark:text-gray-300">
					Loading transitions...
				</p>
			</div>
		</div>
	{:else if transitions.length === 0}
		<div
			class="flex items-center gap-2 p-2 rounded-lg bg-gradient-to-br from-gray-50 to-slate-50 dark:from-gray-900/40 dark:to-slate-900/40 border border-gray-200 dark:border-gray-700"
		>
			<ShieldCheck class="w-4 h-4 text-gray-500 dark:text-gray-400 flex-shrink-0" />
			<p class="text-xs text-gray-600 dark:text-gray-400">No transitions available</p>
		</div>
	{:else}
		<div class="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-3">
			{#each transitions as transition (transition.event)}
				<div
					class="flex flex-col gap-2 border border-gray-200 dark:border-gray-700 rounded-lg p-2.5 sm:p-3 bg-gradient-to-br from-gray-50/80 to-white dark:from-gray-900/40 dark:to-gray-800/40 hover:shadow-md hover:border-blue-300 dark:hover:border-blue-700 transition-all duration-200"
				>
					<div class="flex items-start justify-between gap-2">
						<div class="min-w-0 flex-1 space-y-1">
							<div class="flex items-center gap-1.5">
								<p
									class="text-xs sm:text-sm font-semibold text-gray-900 dark:text-white truncate"
								>
									{transition.event}
								</p>
								<span class="text-gray-400 dark:text-gray-500 text-xs">→</span>
								<span
									class="text-xs font-medium text-blue-600 dark:text-blue-400 truncate capitalize"
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
						<div class="space-y-1.5 pt-2 border-t border-gray-200 dark:border-gray-700">
							<p
								class="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400"
							>
								<AlertTriangle class="w-3 h-3" />
								Blocked
							</p>
							<div class="flex flex-wrap gap-1">
								{#each transition.failedGuards as guard, index (index)}
									<span
										class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-900/30 dark:to-yellow-900/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50"
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
	bind:isOpen={showConfirmModal}
	title="Confirm Transition"
	confirmText="Execute"
	cancelText="Cancel"
	confirmVariant="primary"
	icon="info"
	on:confirm={handleConfirmTransition}
	on:cancel={handleCancelTransition}
>
	<div slot="content" class="space-y-2">
		{#if pendingTransition}
			<div
				class="p-2 rounded-lg bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border border-blue-200 dark:border-blue-800/50 space-y-1.5"
			>
				<div class="flex items-center justify-between">
					<span
						class="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400"
						>Event</span
					>
					<span class="text-xs font-semibold text-blue-700 dark:text-blue-300"
						>{pendingTransition.event}</span
					>
				</div>

				<div class="flex items-center justify-between">
					<span
						class="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400"
						>Entity</span
					>
					<span class="text-xs text-gray-700 dark:text-gray-300 truncate"
						>{entityName || entityKind}</span
					>
				</div>

				<div class="pt-1.5 border-t border-blue-200 dark:border-blue-800/50">
					<div class="flex items-center gap-2 text-xs">
						<span class="font-medium text-gray-700 dark:text-gray-300 capitalize"
							>{localState}</span
						>
						<span class="text-gray-400 dark:text-gray-500">→</span>
						<span class="font-semibold text-blue-700 dark:text-blue-300 capitalize"
							>{pendingTransition.to}</span
						>
					</div>
				</div>
			</div>
		{/if}

		<p class="text-xs text-gray-600 dark:text-gray-400">
			This will execute the transition and any associated actions.
		</p>
	</div>
</ConfirmationModal>
