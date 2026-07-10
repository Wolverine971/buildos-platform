<!-- apps/web/src/lib/components/agent/AgentChatActivityTabs.svelte -->
<script lang="ts">
	import {
		CheckCircle2,
		CircleDashed,
		Clock3,
		ExternalLink,
		ListChecks,
		MessageCircle,
		TerminalSquare,
		TriangleAlert,
		Wrench
	} from 'lucide-svelte';
	import type {
		AgentChatPanelTab,
		AgentTimelineEntityRef,
		AgentTimelineItem
	} from './agent-chat.types';

	interface Props {
		activeTab: AgentChatPanelTab;
		timelineItems: AgentTimelineItem[];
		onTabChange: (tab: AgentChatPanelTab) => void;
		onAskAboutItem?: (item: AgentTimelineItem) => void;
	}

	let { activeTab, timelineItems, onTabChange, onAskAboutItem }: Props = $props();

	const tabs: Array<{ id: AgentChatPanelTab; label: string }> = [
		{ id: 'chat', label: 'Chat' },
		{ id: 'steps', label: 'Steps' },
		{ id: 'tools', label: 'Tools' },
		{ id: 'changes', label: 'Changes' }
	];

	// Button refs for roving-tabindex keyboard navigation (WAI-ARIA tablist).
	let tabButtons = $state<(HTMLButtonElement | null)[]>([]);

	function handleTabKeydown(event: KeyboardEvent, index: number) {
		const lastIndex = tabs.length - 1;
		let nextIndex: number;
		switch (event.key) {
			case 'ArrowRight':
			case 'ArrowDown':
				nextIndex = index === lastIndex ? 0 : index + 1;
				break;
			case 'ArrowLeft':
			case 'ArrowUp':
				nextIndex = index === 0 ? lastIndex : index - 1;
				break;
			case 'Home':
				nextIndex = 0;
				break;
			case 'End':
				nextIndex = lastIndex;
				break;
			default:
				return;
		}
		event.preventDefault();
		const nextTab = tabs[nextIndex];
		if (!nextTab) return;
		// Automatic activation: moving focus selects the tab.
		onTabChange(nextTab.id);
		tabButtons[nextIndex]?.focus();
	}

	const stepItems = $derived(
		timelineItems.filter((item) => item.kind === 'step' || item.kind === 'status')
	);
	const toolItems = $derived(timelineItems.filter((item) => item.kind === 'tool'));
	const changeItems = $derived(timelineItems.filter((item) => item.kind === 'change'));
	const visibleItems = $derived.by(() => {
		if (activeTab === 'steps') return stepItems;
		if (activeTab === 'tools') return toolItems;
		if (activeTab === 'changes') return changeItems;
		return [];
	});

	function countFor(tab: AgentChatPanelTab): number | null {
		if (tab === 'chat') return null;
		if (tab === 'steps') return stepItems.length;
		if (tab === 'tools') return toolItems.length;
		return changeItems.length;
	}

	function displayCount(count: number): string {
		return count > 99 ? '99+' : String(count);
	}

	// Constructed once — Intl.DateTimeFormat allocation is expensive and this
	// formats per visible item on every timeline update.
	const timelineTimeFormatter = new Intl.DateTimeFormat(undefined, {
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit'
	});

	function formatTime(value: string): string {
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return 'Unknown time';
		return timelineTimeFormatter.format(date);
	}

	function statusMeta(status: AgentTimelineItem['status']) {
		switch (status) {
			case 'completed':
				return { icon: CheckCircle2, className: 'text-success', label: 'Completed' };
			case 'failed':
				return { icon: TriangleAlert, className: 'text-destructive', label: 'Failed' };
			case 'running':
				return { icon: CircleDashed, className: 'text-warning', label: 'Running' };
			case 'pending':
				return { icon: Clock3, className: 'text-muted-foreground', label: 'Queued' };
			case 'needs_input':
			case 'partial':
				return { icon: Clock3, className: 'text-warning', label: 'Needs input' };
			case 'cancelled':
				return {
					icon: TriangleAlert,
					className: 'text-muted-foreground',
					label: 'Cancelled'
				};
			default:
				// Humanize unknown statuses instead of leaking the raw enum.
				return {
					icon: CircleDashed,
					className: 'text-muted-foreground',
					label:
						String(status).charAt(0).toUpperCase() +
						String(status).slice(1).replace(/_/g, ' ')
				};
		}
	}

	function panelTitle(tab: AgentChatPanelTab): string {
		if (tab === 'steps') return 'Agent steps';
		if (tab === 'tools') return 'Tool calls';
		if (tab === 'changes') return 'Changes';
		return 'Chat';
	}

	function emptyText(tab: AgentChatPanelTab): string {
		if (tab === 'steps') return 'No agent steps have been recorded yet.';
		if (tab === 'tools') return 'No tool calls have been recorded yet.';
		if (tab === 'changes') return 'No created or updated entities have been recorded yet.';
		return '';
	}

	function entityLabel(ref: AgentTimelineEntityRef): string {
		const title = ref.title || ref.id;
		return `${ref.kind}: ${title}`;
	}
</script>

<div class="border-b border-border bg-card px-3 py-2 tx tx-frame tx-weak sm:px-4">
	<div
		class="grid grid-cols-4 gap-1 sm:flex sm:overflow-x-auto"
		role="tablist"
		aria-label="Agent chat views"
	>
		{#each tabs as tab, index (tab.id)}
			{@const count = countFor(tab.id)}
			<button
				bind:this={tabButtons[index]}
				type="button"
				role="tab"
				id={`agent-chat-tab-${tab.id}`}
				aria-selected={activeTab === tab.id}
				aria-controls={tab.id === 'chat' || activeTab === tab.id
					? `agent-chat-panel-${tab.id}`
					: undefined}
				aria-label={count === null ? tab.label : `${tab.label}, ${count} entries`}
				tabindex={activeTab === tab.id ? 0 : -1}
				class={`inline-flex min-w-0 items-center justify-center gap-1 rounded-md border px-1 py-1.5 text-[0.65rem] font-semibold transition pressable focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:shrink-0 sm:gap-1.5 sm:rounded-lg sm:px-3 sm:text-xs ${
					activeTab === tab.id
						? 'border-accent bg-accent text-accent-foreground shadow-ink'
						: 'border-border bg-background/70 text-muted-foreground hover:border-accent hover:text-foreground'
				}`}
				onclick={() => onTabChange(tab.id)}
				onkeydown={(event) => handleTabKeydown(event, index)}
			>
				<span class="min-w-0 truncate">{tab.label}</span>
				{#if count !== null}
					<span
						class={`shrink-0 rounded-full px-1 py-0.5 text-[0.65rem] sm:px-1.5 ${
							activeTab === tab.id
								? 'bg-accent-foreground/15 text-accent-foreground'
								: 'bg-muted text-muted-foreground'
						}`}
					>
						{displayCount(count)}
					</span>
				{/if}
			</button>
		{/each}
	</div>
</div>

{#if activeTab !== 'chat'}
	<div
		class="flex min-h-0 flex-1 flex-col bg-muted/40 focus-visible:outline-none"
		role="tabpanel"
		id={`agent-chat-panel-${activeTab}`}
		tabindex="0"
		aria-labelledby={`agent-chat-tab-${activeTab}`}
		aria-label={panelTitle(activeTab)}
	>
		<div
			class="flex items-center justify-between border-b border-border bg-card/70 px-3 py-2 text-xs sm:px-4"
		>
			<div class="flex items-center gap-2 font-semibold text-foreground">
				{#if activeTab === 'steps'}
					<ListChecks class="h-4 w-4 text-accent" />
				{:else if activeTab === 'tools'}
					<Wrench class="h-4 w-4 text-accent" />
				{:else}
					<TerminalSquare class="h-4 w-4 text-accent" />
				{/if}
				<span>{panelTitle(activeTab)}</span>
			</div>
			<span class="micro-label font-semibold text-muted-foreground">
				{visibleItems.length} entries
			</span>
		</div>

		<div class="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4">
			{#if visibleItems.length === 0}
				<div
					class="flex min-h-48 items-center justify-center rounded-lg border border-dashed border-border bg-card/60 px-4 text-center text-sm text-muted-foreground"
				>
					{emptyText(activeTab)}
				</div>
			{:else}
				<div class="space-y-2">
					{#each visibleItems as item (item.id)}
						{@const meta = statusMeta(item.status)}
						{@const StatusIcon = meta.icon}
						<article
							class="rounded-lg border border-border bg-card p-3 shadow-ink tx tx-thread tx-weak"
						>
							<div class="flex items-start gap-3">
								<span
									class={`mt-0.5 shrink-0 ${meta.className}`}
									title={meta.label}
								>
									<StatusIcon class="h-4 w-4" />
								</span>
								<div class="min-w-0 flex-1 space-y-2">
									<div class="flex items-start gap-2">
										<div
											class="min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 sm:flex"
										>
											<h3
												class="min-w-0 text-sm font-semibold text-foreground"
											>
												{item.title}
											</h3>
											<span
												class="text-[0.65rem] font-medium text-muted-foreground"
											>
												{formatTime(item.timestamp)}
											</span>
										</div>
										{#if onAskAboutItem}
											<button
												type="button"
												class="inline-flex shrink-0 items-center gap-1 rounded-md border border-border bg-background/70 px-2 py-1 text-[0.7rem] font-semibold text-muted-foreground transition hover:border-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
												title={`Ask about ${item.title}`}
												aria-label={`Ask about ${item.title}`}
												onclick={() => onAskAboutItem?.(item)}
											>
												<MessageCircle class="h-3.5 w-3.5" />
												<span>Ask</span>
											</button>
										{/if}
									</div>

									{#if item.summary}
										<p class="text-sm leading-relaxed text-muted-foreground">
											{item.summary}
										</p>
									{/if}

									{#if item.tool}
										<div class="flex flex-wrap gap-1.5 text-[0.65rem]">
											<span
												class="rounded-md border border-border bg-muted px-1.5 py-0.5 font-semibold text-muted-foreground"
											>
												{item.tool.name}
											</span>
											{#if item.tool.gatewayOp}
												<span
													class="rounded-md border border-border bg-muted px-1.5 py-0.5 font-semibold text-muted-foreground"
												>
													{item.tool.gatewayOp}
												</span>
											{/if}
											{#if typeof item.tool.durationMs === 'number'}
												<span
													class="rounded-md border border-border bg-muted px-1.5 py-0.5 font-semibold text-muted-foreground"
												>
													{item.tool.durationMs}ms
												</span>
											{/if}
										</div>
									{/if}

									{#if item.tool?.argsPreview || item.tool?.resultPreview || item.detailPreview}
										<details
											class="group rounded-lg border border-border bg-background/60"
										>
											<summary
												class="cursor-pointer px-2.5 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
											>
												Details
											</summary>
											<div class="space-y-2 border-t border-border p-2.5">
												{#if item.tool?.argsPreview}
													<div>
														<div
															class="mb-1 micro-label font-semibold text-muted-foreground"
														>
															Args preview
														</div>
														<pre
															class="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-2 text-xs text-foreground">{item
																.tool.argsPreview}</pre>
														{#if item.tool.argsFullJson}
															<details
																class="mt-2 rounded-md border border-border bg-card"
															>
																<summary
																	class="cursor-pointer px-2.5 py-1.5 text-[0.7rem] font-semibold text-muted-foreground hover:text-foreground"
																>
																	Full JSON
																</summary>
																<pre
																	class="max-h-96 overflow-auto whitespace-pre-wrap break-words border-t border-border bg-muted p-2 text-xs text-foreground">{item
																		.tool.argsFullJson}</pre>
															</details>
														{/if}
													</div>
												{/if}
												{#if item.tool?.resultPreview || item.detailPreview}
													<div>
														<div
															class="mb-1 micro-label font-semibold text-muted-foreground"
														>
															Result preview
														</div>
														<pre
															class="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-2 text-xs text-foreground">{item
																.tool?.resultPreview ??
																item.detailPreview}</pre>
														{#if item.tool?.resultFullJson}
															<details
																class="mt-2 rounded-md border border-border bg-card"
															>
																<summary
																	class="cursor-pointer px-2.5 py-1.5 text-[0.7rem] font-semibold text-muted-foreground hover:text-foreground"
																>
																	Full JSON
																</summary>
																<pre
																	class="max-h-96 overflow-auto whitespace-pre-wrap break-words border-t border-border bg-muted p-2 text-xs text-foreground">{item
																		.tool.resultFullJson}</pre>
															</details>
														{/if}
													</div>
												{/if}
											</div>
										</details>
									{/if}

									{#if item.entityRefs.length > 0 || item.projectRef}
										<div class="flex flex-wrap gap-1.5">
											{#if item.projectRef}
												<a
													href={item.projectRef.url ??
														`/projects/${item.projectRef.id}`}
													target="_blank"
													rel="noopener noreferrer"
													class="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-muted px-2 py-1 text-xs font-semibold text-foreground hover:border-accent hover:text-accent"
												>
													<span class="truncate">Project</span>
													<ExternalLink class="h-3 w-3 shrink-0" />
												</a>
											{/if}
											{#each item.entityRefs as ref (`${ref.kind}:${ref.id}:${ref.operation ?? ''}`)}
												{#if ref.url}
													<a
														href={ref.url}
														target="_blank"
														rel="noopener noreferrer"
														class="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-muted px-2 py-1 text-xs font-semibold text-foreground hover:border-accent hover:text-accent"
													>
														<span class="truncate"
															>{entityLabel(ref)}</span
														>
														<ExternalLink class="h-3 w-3 shrink-0" />
													</a>
												{:else}
													<span
														class="inline-flex max-w-full items-center rounded-md border border-border bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground"
													>
														<span class="truncate"
															>{entityLabel(ref)}</span
														>
													</span>
												{/if}
											{/each}
										</div>
									{/if}
								</div>
							</div>
						</article>
					{/each}
				</div>
			{/if}
		</div>
	</div>
{/if}
