<!-- apps/web/src/lib/components/admin/chat/SessionDetailModal.svelte -->
<script lang="ts">
	import { Activity, AlertCircle } from 'lucide-svelte';
	import { tick } from 'svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import type { SessionFlowTarget } from '$lib/services/admin/chat-session-flow-targets';
	import type {
		AuditTimelineType as TimelineType,
		ChatSessionAuditPayload as SessionDetailPayload,
		ConversationTurn,
		LibriExtractionDisplay,
		LibriHandoffDisplay,
		PromptEvalScenario,
		TimelineGroup
	} from '$lib/services/admin/chat-session-audit-types';
	import AuditTimeline from './AuditTimeline.svelte';
	import ConversationReplay from './ConversationReplay.svelte';
	import LibriPanel from './LibriPanel.svelte';
	import SessionFlowVisuals from './SessionFlowVisuals.svelte';
	import SessionMetricsHeader from './SessionMetricsHeader.svelte';

	let {
		isOpen = $bindable(false),
		isLoadingDetail,
		detailError,
		sessionDetail,
		libriExtraction,
		libriHandoff,
		conversationTurns,
		visibleTimeline,
		replayTimeline,
		visibleTimelineGroups,
		evalScenarios,
		isLoadingEvalScenarios,
		selectedEvalScenarioByTurnId,
		runningEvalByTurnId,
		evalErrorByTurnId,
		showOnlyErrors = $bindable(false),
		timelineSearch = $bindable(''),
		expandedEventIds,
		eventTypeFilters,
		closeSessionDetail,
		exportSessionAudit,
		exportSessionBundle,
		resetTimelineFilters,
		toggleEventType,
		toggleEventExpansion,
		updateSelectedEvalScenario,
		runPromptEval
	}: {
		isOpen: boolean;
		isLoadingDetail: boolean;
		detailError: string | null;
		sessionDetail: SessionDetailPayload | null;
		libriExtraction: LibriExtractionDisplay;
		libriHandoff: LibriHandoffDisplay | null;
		conversationTurns: ConversationTurn[];
		visibleTimeline: SessionDetailPayload['timeline'];
		replayTimeline: SessionDetailPayload['timeline'];
		visibleTimelineGroups: TimelineGroup[];
		evalScenarios: PromptEvalScenario[];
		isLoadingEvalScenarios: boolean;
		selectedEvalScenarioByTurnId: Record<string, string>;
		runningEvalByTurnId: Record<string, boolean>;
		evalErrorByTurnId: Record<string, string | null>;
		showOnlyErrors: boolean;
		timelineSearch: string;
		expandedEventIds: Set<string>;
		eventTypeFilters: Record<TimelineType, boolean>;
		closeSessionDetail: () => void;
		exportSessionAudit: () => void;
		exportSessionBundle: () => void;
		resetTimelineFilters: () => void;
		toggleEventType: (type: TimelineType) => void;
		toggleEventExpansion: (eventId: string) => void;
		updateSelectedEvalScenario: (turnRunId: string, value: string) => void;
		runPromptEval: (turnRunId: string) => void | Promise<void>;
	} = $props();

	function openDetailsAround(element: HTMLElement, includeDescendants = false): void {
		let current: HTMLElement | null = element;
		while (current) {
			if (current instanceof HTMLDetailsElement) current.open = true;
			current = current.parentElement;
		}
		if (includeDescendants) {
			element.querySelectorAll('details').forEach((details) => {
				details.open = true;
			});
		}
	}

	async function revealFlowTarget(target: SessionFlowTarget): Promise<void> {
		if (target.auditEventId && !expandedEventIds.has(target.auditEventId)) {
			toggleEventExpansion(target.auditEventId);
		}
		await tick();

		let exactTarget = document.getElementById(target.domId);
		if (!exactTarget && target.kind === 'audit') {
			resetTimelineFilters();
			await tick();
			exactTarget = document.getElementById(target.domId);
		}
		const targetElement =
			exactTarget ??
			(target.fallbackDomId ? document.getElementById(target.fallbackDomId) : null);
		if (!targetElement) return;

		openDetailsAround(targetElement, target.kind === 'message');
		await tick();

		const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		targetElement.scrollIntoView({
			behavior: reduceMotion ? 'auto' : 'smooth',
			block: 'center'
		});
		const focusTarget =
			targetElement instanceof HTMLDetailsElement
				? targetElement.querySelector<HTMLElement>(':scope > summary')
				: targetElement;
		focusTarget?.focus({ preventScroll: true });
	}
</script>

<Modal
	bind:isOpen
	title="Chat Session Detail"
	size="xl"
	ariaLabel="Chat session detail"
	customClasses="!max-h-[94dvh] xl:!max-w-7xl"
	onClose={closeSessionDetail}
>
	{#if isLoadingDetail}
		<div class="p-3 space-y-2">
			{#each Array(8) as _, index (index)}
				<div class="border border-border rounded-lg p-2.5 animate-pulse">
					<div class="h-3 bg-muted rounded w-1/3 mb-2"></div>
					<div class="h-2.5 bg-muted rounded w-5/6"></div>
				</div>
			{/each}
		</div>
	{:else if detailError}
		<div class="p-3 text-sm text-destructive flex items-start gap-2">
			<AlertCircle class="h-4 w-4 mt-0.5 shrink-0" />
			<span>{detailError}</span>
		</div>
	{:else if sessionDetail}
		<div class="flex flex-col">
			<div class="p-3 border-b border-border space-y-3 bg-card">
				<SessionMetricsHeader
					{sessionDetail}
					onExport={exportSessionAudit}
					onExportBundle={exportSessionBundle}
				/>
				<LibriPanel {sessionDetail} {libriExtraction} {libriHandoff} />
			</div>

			<div class="p-3 space-y-4">
				{#key sessionDetail}
					<SessionFlowVisuals
						{sessionDetail}
						{conversationTurns}
						onRevealTarget={revealFlowTarget}
					/>
				{/key}
				<ConversationReplay {sessionDetail} {conversationTurns} />
				<AuditTimeline
					{visibleTimeline}
					{replayTimeline}
					{visibleTimelineGroups}
					{evalScenarios}
					{isLoadingEvalScenarios}
					{selectedEvalScenarioByTurnId}
					{runningEvalByTurnId}
					{evalErrorByTurnId}
					bind:showOnlyErrors
					bind:timelineSearch
					{expandedEventIds}
					{eventTypeFilters}
					{resetTimelineFilters}
					{toggleEventType}
					{toggleEventExpansion}
					{updateSelectedEvalScenario}
					{runPromptEval}
				/>
			</div>
		</div>
	{:else}
		<div class="p-8 text-center text-sm text-muted-foreground">
			<Activity class="h-10 w-10 mb-3 mx-auto opacity-60" />
			No session detail available.
		</div>
	{/if}
</Modal>
