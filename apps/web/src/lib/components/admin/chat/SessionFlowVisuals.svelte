<!-- apps/web/src/lib/components/admin/chat/SessionFlowVisuals.svelte -->
<script module lang="ts">
	let profileModulePromise: Promise<
		typeof import('$lib/services/admin/chat-session-flow-profile')
	> | null = null;
	let timeChartModulePromise: Promise<typeof import('./SessionTimeWaterfall.svelte')> | null =
		null;
	let costChartModulePromise: Promise<typeof import('./SessionCostWaterfall.svelte')> | null =
		null;

	function loadProfileModule() {
		profileModulePromise ??= import('$lib/services/admin/chat-session-flow-profile');
		return profileModulePromise;
	}

	function loadTimeChartModule() {
		timeChartModulePromise ??= import('./SessionTimeWaterfall.svelte');
		return timeChartModulePromise;
	}

	function loadCostChartModule() {
		costChartModulePromise ??= import('./SessionCostWaterfall.svelte');
		return costChartModulePromise;
	}
</script>

<script lang="ts">
	import type { Component } from 'svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { AlertCircle, Clock3, DollarSign } from '$lib/icons/lucide';
	import type {
		SessionFlowProfile,
		SessionFlowEvent
	} from '$lib/services/admin/chat-session-flow-profile';
	import type { SessionFlowTarget } from '$lib/services/admin/chat-session-flow-targets';
	import type {
		ChatSessionAuditPayload,
		ConversationTurn
	} from '$lib/services/admin/chat-session-audit-types';

	type ChartProps = {
		profile: SessionFlowProfile;
		onSelect: (event: SessionFlowEvent) => void | Promise<void>;
	};

	let {
		sessionDetail,
		conversationTurns,
		onRevealTarget
	}: {
		sessionDetail: ChatSessionAuditPayload;
		conversationTurns: ConversationTurn[];
		onRevealTarget: (target: SessionFlowTarget) => void | Promise<void>;
	} = $props();

	let profile = $state.raw<SessionFlowProfile | null>(null);
	let TimeChart = $state.raw<Component<ChartProps> | null>(null);
	let CostChart = $state.raw<Component<ChartProps> | null>(null);
	let showTimeChart = $state(false);
	let showCostChart = $state(false);
	let isLoadingTimeChart = $state(false);
	let isLoadingCostChart = $state(false);
	let timeChartError = $state('');
	let costChartError = $state('');

	let profileBuildPromise: Promise<SessionFlowProfile> | null = null;

	async function ensureProfile(): Promise<SessionFlowProfile> {
		if (profile) return profile;
		profileBuildPromise ??= loadProfileModule().then((profileModule) => {
			profile = profileModule.buildSessionFlowProfile({
				detail: sessionDetail,
				conversationTurns
			});
			return profile;
		});
		try {
			return await profileBuildPromise;
		} catch (error) {
			profileModulePromise = null;
			profileBuildPromise = null;
			throw error;
		}
	}

	async function toggleTimeChart(): Promise<void> {
		if (showTimeChart) {
			showTimeChart = false;
			return;
		}
		if (TimeChart && profile) {
			showTimeChart = true;
			return;
		}

		isLoadingTimeChart = true;
		timeChartError = '';
		try {
			const [chartModule] = await Promise.all([loadTimeChartModule(), ensureProfile()]);
			TimeChart = chartModule.default;
			showTimeChart = true;
		} catch {
			timeChartModulePromise = null;
			timeChartError = 'The time chart could not be loaded.';
		} finally {
			isLoadingTimeChart = false;
		}
	}

	async function toggleCostChart(): Promise<void> {
		if (showCostChart) {
			showCostChart = false;
			return;
		}
		if (CostChart && profile) {
			showCostChart = true;
			return;
		}

		isLoadingCostChart = true;
		costChartError = '';
		try {
			const [chartModule] = await Promise.all([loadCostChartModule(), ensureProfile()]);
			CostChart = chartModule.default;
			showCostChart = true;
		} catch {
			costChartModulePromise = null;
			costChartError = 'The cost chart could not be loaded.';
		} finally {
			isLoadingCostChart = false;
		}
	}

	function selectEvent(event: SessionFlowEvent): void | Promise<void> {
		return onRevealTarget(event.target);
	}
</script>

<section
	class="overflow-hidden rounded-lg border border-border bg-card shadow-ink"
	aria-label="Session flow visualizations"
>
	<div class="flex flex-wrap items-center justify-between gap-3 p-3">
		<div class="min-w-0">
			<div class="text-sm font-semibold text-foreground">Flow visualizations</div>
			<div class="text-xs text-muted-foreground">
				Compare where time and model spend accumulate across this session.
			</div>
		</div>
		<div class="flex flex-wrap gap-2">
			<Button
				variant={showTimeChart ? 'secondary' : 'outline'}
				size="sm"
				icon={Clock3}
				loading={isLoadingTimeChart}
				onclick={toggleTimeChart}
				aria-expanded={showTimeChart}
				aria-controls="session-time-waterfall"
			>
				{showTimeChart ? 'Hide time chart' : 'See time chart'}
			</Button>
			<Button
				variant={showCostChart ? 'secondary' : 'outline'}
				size="sm"
				icon={DollarSign}
				loading={isLoadingCostChart}
				onclick={toggleCostChart}
				aria-expanded={showCostChart}
				aria-controls="session-cost-waterfall"
			>
				{showCostChart ? 'Hide cost chart' : 'See cost chart'}
			</Button>
		</div>
	</div>

	{#if isLoadingTimeChart}
		<div class="border-t border-border p-3" aria-live="polite">
			<div
				class="h-36 animate-pulse rounded-lg border border-border bg-muted/50 motion-reduce:animate-none"
			></div>
			<div class="sr-only">Loading time chart</div>
		</div>
	{:else if timeChartError}
		<div
			class="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-destructive/5 p-3 text-sm"
			role="alert"
		>
			<span class="flex min-w-0 items-center gap-2 text-foreground">
				<AlertCircle class="h-4 w-4 shrink-0 text-destructive" />
				<span>{timeChartError}</span>
			</span>
			<Button variant="outline" size="sm" onclick={toggleTimeChart}>Retry</Button>
		</div>
	{:else if showTimeChart && TimeChart && profile}
		<div id="session-time-waterfall" class="border-t border-border">
			<TimeChart {profile} onSelect={selectEvent} />
		</div>
	{/if}

	{#if isLoadingCostChart}
		<div class="border-t border-border p-3" aria-live="polite">
			<div
				class="h-36 animate-pulse rounded-lg border border-border bg-muted/50 motion-reduce:animate-none"
			></div>
			<div class="sr-only">Loading cost chart</div>
		</div>
	{:else if costChartError}
		<div
			class="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-destructive/5 p-3 text-sm"
			role="alert"
		>
			<span class="flex min-w-0 items-center gap-2 text-foreground">
				<AlertCircle class="h-4 w-4 shrink-0 text-destructive" />
				<span>{costChartError}</span>
			</span>
			<Button variant="outline" size="sm" onclick={toggleCostChart}>Retry</Button>
		</div>
	{:else if showCostChart && CostChart && profile}
		<div id="session-cost-waterfall" class="border-t border-border">
			<CostChart {profile} onSelect={selectEvent} />
		</div>
	{/if}
</section>
