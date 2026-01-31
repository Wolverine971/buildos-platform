<!-- apps/web/src/lib/components/admin/SessionDetailModal.svelte -->
<script lang="ts">
	import {
		X,
		User,
		MessageSquare,
		Bot,
		CheckCircle,
		XCircle,
		Clock,
		ChevronDown,
		ChevronUp,
		Sparkles,
		Wrench,
		Zap,
		Timer,
		Activity
	} from 'lucide-svelte';
	import { marked } from 'marked';
	import { browser } from '$app/environment';

	interface Props {
		sessionId: string | null;
		onClose: () => void;
	}

	let { sessionId, onClose }: Props = $props();

	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let sessionData = $state<any>(null);

	// Expandable sections
	let showTiming = $state(true);
	let showAgentPlan = $state(true);
	let showExecutions = $state(true);
	let showTools = $state(false);
	let expandedExecutions = $state<Set<string>>(new Set());

	// Timing formatting helpers
	function formatMs(ms: number | null | undefined): string {
		if (ms === null || ms === undefined) return '-';
		if (ms < 1000) return `${Math.round(ms)}ms`;
		return `${(ms / 1000).toFixed(2)}s`;
	}

	function formatTimestamp(ts: string | null): string {
		if (!ts) return '-';
		return new Date(ts).toLocaleTimeString('en-US', {
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
			fractionalSecondDigits: 3
		});
	}

	function getTimingWarningClass(metric: string, value: number | null): string {
		if (value === null) return 'text-foreground';
		if (metric === 'ttfr' && value > 10000) return 'text-red-500';
		if (metric === 'ttfr' && value > 5000) return 'text-amber-500';
		if (metric === 'tool_selection' && value > 2000) return 'text-red-500';
		if (metric === 'tool_selection' && value > 1000) return 'text-amber-500';
		if (metric === 'plan_execution' && value > 10000) return 'text-red-500';
		if (metric === 'plan_execution' && value > 5000) return 'text-amber-500';
		return 'text-foreground';
	}

	// Load session data when sessionId changes
	$effect(() => {
		if (sessionId && browser) {
			loadSessionData();
		}
	});

	async function loadSessionData() {
		if (!sessionId) return;

		isLoading = true;
		error = null;

		try {
			const response = await fetch(`/api/admin/chat/sessions/${sessionId}`);

			if (!response.ok) {
				throw new Error('Failed to load session');
			}

			const data = await response.json();

			if (data.success) {
				sessionData = data.data;
			} else {
				throw new Error(data.message || 'Failed to load session');
			}
		} catch (err) {
			console.error('Error loading session:', err);
			error = err instanceof Error ? err.message : 'Failed to load session';
		} finally {
			isLoading = false;
		}
	}

	function formatMarkdown(content: string): string {
		return marked(content || '', { breaks: true }) as string;
	}

	function formatDate(dateString: string): string {
		return new Date(dateString).toLocaleString();
	}

	function formatNumber(num: number): string {
		return new Intl.NumberFormat().format(num);
	}

	function formatCurrency(num: number): string {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD',
			minimumFractionDigits: 2
		}).format(num);
	}

	function toggleExecution(id: string) {
		if (expandedExecutions.has(id)) {
			expandedExecutions.delete(id);
		} else {
			expandedExecutions.add(id);
		}
		expandedExecutions = new Set(expandedExecutions);
	}

	function handleBackdropClick(event: MouseEvent) {
		if (event.target === event.currentTarget) {
			onClose();
		}
	}
</script>

{#if sessionId}
	<!-- Modal Backdrop -->
	<div
		class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
		role="dialog"
		aria-modal="true"
		aria-label="Session details dialog"
		tabindex="0"
		onclick={handleBackdropClick}
		onkeydown={(e) => {
			if (e.key === 'Escape') {
				onClose();
			}
		}}
	>
		<!-- Modal Content -->
		<div
			class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col"
		>
			<!-- Header -->
			<div
				class="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700"
			>
				<div class="flex-1">
					{#if isLoading}
						<div
							class="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/2 animate-pulse"
						></div>
					{:else if sessionData}
						<h2 class="text-xl font-semibold text-gray-900 dark:text-white">
							{sessionData.session.title}
						</h2>
						<div
							class="flex items-center space-x-3 mt-1 text-sm text-gray-600 dark:text-gray-400"
						>
							<span>{sessionData.session.user.email}</span>
							<span>•</span>
							<span>{formatDate(sessionData.session.created_at)}</span>
							<span>•</span>
							<span class="capitalize">{sessionData.session.context_type}</span>
						</div>
					{/if}
				</div>
				<!-- Inkprint close button -->
				<button
					type="button"
					onclick={onClose}
					class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground shadow-ink transition-all pressable hover:border-red-600/50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:border-red-400/50 dark:hover:text-red-400"
					aria-label="Close modal"
				>
					<X class="h-4 w-4" />
				</button>
			</div>

			<!-- Body -->
			<div class="flex-1 overflow-y-auto p-6 space-y-6">
				{#if isLoading}
					<div class="space-y-4">
						{#each Array(3) as _}
							<div
								class="h-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"
							></div>
						{/each}
					</div>
				{:else if error}
					<div
						class="bg-red-50 border border-red-200 rounded-lg p-4 dark:bg-red-900/20 dark:border-red-800"
					>
						<p class="text-red-800 dark:text-red-200">{error}</p>
					</div>
				{:else if sessionData}
					<!-- Session Metrics -->
					<div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
						<div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
							<div class="text-xs text-gray-500 dark:text-gray-400">Messages</div>
							<div class="text-xl font-semibold text-gray-900 dark:text-white">
								{formatNumber(sessionData.session.message_count)}
							</div>
						</div>
						<div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
							<div class="text-xs text-gray-500 dark:text-gray-400">Tokens</div>
							<div class="text-xl font-semibold text-gray-900 dark:text-white">
								{formatNumber(sessionData.session.total_tokens)}
							</div>
						</div>
						<div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
							<div class="text-xs text-gray-500 dark:text-gray-400">Tool Calls</div>
							<div class="text-xl font-semibold text-gray-900 dark:text-white">
								{formatNumber(sessionData.session.tool_call_count)}
							</div>
						</div>
						<div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
							<div class="text-xs text-gray-500 dark:text-gray-400">Cost</div>
							<div class="text-xl font-semibold text-gray-900 dark:text-white">
								{formatCurrency(sessionData.session.cost_estimate)}
							</div>
						</div>
					</div>

					<!-- Timing Metrics -->
					{#if sessionData.timing_metrics}
						<div class="border border-gray-200 dark:border-gray-700 rounded-lg">
							<button
								onclick={() => (showTiming = !showTiming)}
								class="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
							>
								<div class="flex items-center space-x-2">
									<Timer class="h-5 w-5 text-cyan-600" />
									<span class="font-semibold text-gray-900 dark:text-white"
										>Timing Metrics</span
									>
									{#if sessionData.timing_metrics.breakdown.ttfr_ms && sessionData.timing_metrics.breakdown.ttfr_ms > 5000}
										<span
											class="px-2 py-1 text-xs rounded-full {sessionData
												.timing_metrics.breakdown.ttfr_ms > 10000
												? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
												: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200'}"
										>
											Slow
										</span>
									{/if}
								</div>
								{#if showTiming}
									<ChevronUp class="h-5 w-5 text-gray-500" />
								{:else}
									<ChevronDown class="h-5 w-5 text-gray-500" />
								{/if}
							</button>

							{#if showTiming}
								<div
									class="p-4 border-t border-gray-200 dark:border-gray-700 space-y-4"
								>
									<!-- Timeline Visualization -->
									<div>
										<h4
											class="font-medium text-gray-900 dark:text-white mb-3 flex items-center gap-2"
										>
											<Activity class="h-4 w-4" />
											Timeline
										</h4>
										<div class="relative">
											<!-- Timeline bar -->
											<div
												class="h-2 bg-gray-200 dark:bg-gray-700 rounded-full mb-4"
											></div>

											<!-- Timeline markers -->
											<div
												class="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs"
											>
												<div class="flex flex-col">
													<span class="text-muted-foreground"
														>Message Received</span
													>
													<span class="font-mono text-foreground">
														{formatTimestamp(
															sessionData.timing_metrics.timeline
																.message_received_at
														)}
													</span>
												</div>
												<div class="flex flex-col">
													<span class="text-muted-foreground"
														>First Event</span
													>
													<span class="font-mono text-foreground">
														{formatTimestamp(
															sessionData.timing_metrics.timeline
																.first_event_at
														)}
													</span>
												</div>
												<div class="flex flex-col">
													<span class="text-muted-foreground"
														>First Response</span
													>
													<span class="font-mono text-foreground">
														{formatTimestamp(
															sessionData.timing_metrics.timeline
																.first_response_at
														)}
													</span>
												</div>
												{#if sessionData.timing_metrics.timeline.plan_created_at}
													<div class="flex flex-col">
														<span class="text-muted-foreground"
															>Plan Created</span
														>
														<span class="font-mono text-foreground">
															{formatTimestamp(
																sessionData.timing_metrics.timeline
																	.plan_created_at
															)}
														</span>
													</div>
												{/if}
												{#if sessionData.timing_metrics.timeline.plan_execution_started_at}
													<div class="flex flex-col">
														<span class="text-muted-foreground"
															>Execution Started</span
														>
														<span class="font-mono text-foreground">
															{formatTimestamp(
																sessionData.timing_metrics.timeline
																	.plan_execution_started_at
															)}
														</span>
													</div>
												{/if}
												{#if sessionData.timing_metrics.timeline.plan_completed_at}
													<div class="flex flex-col">
														<span class="text-muted-foreground"
															>Plan Completed</span
														>
														<span class="font-mono text-foreground">
															{formatTimestamp(
																sessionData.timing_metrics.timeline
																	.plan_completed_at
															)}
														</span>
													</div>
												{/if}
											</div>
										</div>
									</div>

									<!-- Breakdown Panel -->
									<div>
										<h4 class="font-medium text-gray-900 dark:text-white mb-3">
											Breakdown
										</h4>
										<div
											class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3"
										>
											<div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
												<div
													class="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1"
												>
													<Clock class="h-3 w-3" /> TTFR
												</div>
												<div
													class="text-lg font-semibold {getTimingWarningClass(
														'ttfr',
														sessionData.timing_metrics.breakdown.ttfr_ms
													)}"
												>
													{formatMs(
														sessionData.timing_metrics.breakdown.ttfr_ms
													)}
												</div>
											</div>
											<div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
												<div
													class="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1"
												>
													<Zap class="h-3 w-3" /> TTFE
												</div>
												<div
													class="text-lg font-semibold text-gray-900 dark:text-white"
												>
													{formatMs(
														sessionData.timing_metrics.breakdown.ttfe_ms
													)}
												</div>
											</div>
											<div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
												<div
													class="text-xs text-gray-500 dark:text-gray-400"
												>
													Context Build
												</div>
												<div
													class="text-lg font-semibold text-gray-900 dark:text-white"
												>
													{formatMs(
														sessionData.timing_metrics.breakdown
															.context_build_ms
													)}
												</div>
											</div>
											<div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
												<div
													class="text-xs text-gray-500 dark:text-gray-400"
												>
													Tool Selection
												</div>
												<div
													class="text-lg font-semibold {getTimingWarningClass(
														'tool_selection',
														sessionData.timing_metrics.breakdown
															.tool_selection_ms
													)}"
												>
													{formatMs(
														sessionData.timing_metrics.breakdown
															.tool_selection_ms
													)}
												</div>
											</div>
											{#if sessionData.timing_metrics.breakdown.clarification_ms}
												<div
													class="bg-gray-50 dark:bg-gray-700 rounded-lg p-3"
												>
													<div
														class="text-xs text-gray-500 dark:text-gray-400"
													>
														Clarification
													</div>
													<div
														class="text-lg font-semibold text-gray-900 dark:text-white"
													>
														{formatMs(
															sessionData.timing_metrics.breakdown
																.clarification_ms
														)}
													</div>
												</div>
											{/if}
											{#if sessionData.timing_metrics.breakdown.plan_creation_ms}
												<div
													class="bg-gray-50 dark:bg-gray-700 rounded-lg p-3"
												>
													<div
														class="text-xs text-gray-500 dark:text-gray-400"
													>
														Plan Creation
													</div>
													<div
														class="text-lg font-semibold text-gray-900 dark:text-white"
													>
														{formatMs(
															sessionData.timing_metrics.breakdown
																.plan_creation_ms
														)}
													</div>
												</div>
											{/if}
											{#if sessionData.timing_metrics.breakdown.plan_execution_ms}
												<div
													class="bg-gray-50 dark:bg-gray-700 rounded-lg p-3"
												>
													<div
														class="text-xs text-gray-500 dark:text-gray-400"
													>
														Plan Execution
													</div>
													<div
														class="text-lg font-semibold {getTimingWarningClass(
															'plan_execution',
															sessionData.timing_metrics.breakdown
																.plan_execution_ms
														)}"
													>
														{formatMs(
															sessionData.timing_metrics.breakdown
																.plan_execution_ms
														)}
													</div>
												</div>
											{/if}
											{#if sessionData.timing_metrics.breakdown.planning_overhead_ms}
												<div
													class="bg-gray-50 dark:bg-gray-700 rounded-lg p-3"
												>
													<div
														class="text-xs text-gray-500 dark:text-gray-400"
													>
														Planning Overhead
													</div>
													<div
														class="text-lg font-semibold text-gray-900 dark:text-white"
													>
														{formatMs(
															sessionData.timing_metrics.breakdown
																.planning_overhead_ms
														)}
													</div>
												</div>
											{/if}
										</div>

										<!-- Plan Summary -->
										{#if sessionData.timing_metrics.breakdown.plan_status}
											<div class="mt-3 flex items-center gap-3 text-sm">
												<span class="text-gray-500 dark:text-gray-400"
													>Plan:</span
												>
												<span
													class="px-2 py-1 text-xs rounded-full font-medium {sessionData
														.timing_metrics.breakdown.plan_status ===
													'completed'
														? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
														: sessionData.timing_metrics.breakdown
																	.plan_status === 'failed'
															? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
															: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'}"
												>
													{sessionData.timing_metrics.breakdown
														.plan_status}
												</span>
												{#if sessionData.timing_metrics.breakdown.plan_step_count}
													<span class="text-gray-500 dark:text-gray-400">
														{sessionData.timing_metrics.breakdown
															.plan_step_count} steps
													</span>
												{/if}
												{#if sessionData.timing_metrics.breakdown.plan_latency_share}
													<span class="text-gray-500 dark:text-gray-400">
														({sessionData.timing_metrics.breakdown.plan_latency_share.toFixed(
															0
														)}% of TTFR)
													</span>
												{/if}
											</div>
										{/if}
									</div>
								</div>
							{/if}
						</div>
					{/if}

					<!-- Agent Plan -->
					{#if sessionData.agent_plan}
						<div class="border border-gray-200 dark:border-gray-700 rounded-lg">
							<button
								onclick={() => (showAgentPlan = !showAgentPlan)}
								class="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
							>
								<div class="flex items-center space-x-2">
									<Bot class="h-5 w-5 text-purple-600" />
									<span class="font-semibold text-gray-900 dark:text-white"
										>Agent Plan</span
									>
									<span
										class="px-2 py-1 text-xs rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200"
									>
										{sessionData.agent_plan.strategy}
									</span>
								</div>
								{#if showAgentPlan}
									<ChevronUp class="h-5 w-5 text-gray-500" />
								{:else}
									<ChevronDown class="h-5 w-5 text-gray-500" />
								{/if}
							</button>

							{#if showAgentPlan}
								<div class="p-4 border-t border-gray-200 dark:border-gray-700">
									<h4 class="font-medium text-gray-900 dark:text-white mb-2">
										Execution Steps
									</h4>
									<ol class="space-y-2">
										{#each sessionData.agent_plan.steps as step, index}
											<li class="flex items-start space-x-2">
												<span
													class="flex-shrink-0 w-6 h-6 rounded-full bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 flex items-center justify-center text-xs font-medium"
												>
													{index + 1}
												</span>
												<span
													class="flex-1 text-sm text-gray-700 dark:text-gray-300"
													>{step}</span
												>
											</li>
										{/each}
									</ol>
								</div>
							{/if}
						</div>
					{/if}

					<!-- Agent Executions (Agent-to-Agent Conversations) -->
					{#if sessionData.agent_executions?.length > 0}
						<div class="border border-gray-200 dark:border-gray-700 rounded-lg">
							<button
								onclick={() => (showExecutions = !showExecutions)}
								class="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
							>
								<div class="flex items-center space-x-2">
									<Zap class="h-5 w-5 text-blue-600" />
									<span class="font-semibold text-gray-900 dark:text-white"
										>Executor Conversations</span
									>
									<span
										class="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
									>
										{sessionData.agent_executions.length}
									</span>
								</div>
								{#if showExecutions}
									<ChevronUp class="h-5 w-5 text-gray-500" />
								{:else}
									<ChevronDown class="h-5 w-5 text-gray-500" />
								{/if}
							</button>

							{#if showExecutions}
								<div class="border-t border-gray-200 dark:border-gray-700">
									{#each sessionData.agent_executions as execution, index}
										<div
											class="border-b border-gray-200 dark:border-gray-700 last:border-b-0"
										>
											<button
												onclick={() => toggleExecution(execution.id)}
												class="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
											>
												<div class="flex items-center space-x-3">
													<span
														class="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 flex items-center justify-center text-sm font-medium"
													>
														{index + 1}
													</span>
													<div class="text-left">
														<div
															class="font-medium text-gray-900 dark:text-white"
														>
															Step {execution.step_number ||
																index + 1}
														</div>
														<div
															class="text-xs text-gray-500 dark:text-gray-400"
														>
															{execution.messages?.length || 0} messages
														</div>
													</div>
												</div>
												{#if expandedExecutions.has(execution.id)}
													<ChevronUp class="h-5 w-5 text-gray-500" />
												{:else}
													<ChevronDown class="h-5 w-5 text-gray-500" />
												{/if}
											</button>

											{#if expandedExecutions.has(execution.id)}
												<div
													class="p-4 space-y-3 bg-gray-50 dark:bg-gray-900"
												>
													{#each execution.messages as message}
														<div
															class="border-l-4 {message.role ===
															'user'
																? 'border-blue-500'
																: 'border-purple-500'} pl-4 py-2"
														>
															<div
																class="flex items-center space-x-2 mb-1"
															>
																<span
																	class="text-xs font-medium text-gray-500 dark:text-gray-400"
																>
																	{message.role === 'user'
																		? 'Planner → Executor'
																		: 'Executor Response'}
																</span>
																{#if message.tokens_used}
																	<span
																		class="text-xs text-gray-400 dark:text-gray-500"
																	>
																		{formatNumber(
																			message.tokens_used
																		)} tokens
																	</span>
																{/if}
															</div>
															<div
																class="prose prose-sm dark:prose-invert max-w-none"
															>
																{@html formatMarkdown(
																	message.content
																)}
															</div>
														</div>
													{/each}
												</div>
											{/if}
										</div>
									{/each}
								</div>
							{/if}
						</div>
					{/if}

					<!-- Tool Executions -->
					{#if sessionData.tool_executions?.length > 0}
						<div class="border border-gray-200 dark:border-gray-700 rounded-lg">
							<button
								onclick={() => (showTools = !showTools)}
								class="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
							>
								<div class="flex items-center space-x-2">
									<Wrench class="h-5 w-5 text-orange-600" />
									<span class="font-semibold text-gray-900 dark:text-white"
										>Tool Executions</span
									>
									<span
										class="px-2 py-1 text-xs rounded-full bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200"
									>
										{sessionData.tool_executions.length}
									</span>
								</div>
								{#if showTools}
									<ChevronUp class="h-5 w-5 text-gray-500" />
								{:else}
									<ChevronDown class="h-5 w-5 text-gray-500" />
								{/if}
							</button>

							{#if showTools}
								<div
									class="p-4 border-t border-gray-200 dark:border-gray-700 space-y-2"
								>
									{#each sessionData.tool_executions as tool}
										<div
											class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded"
										>
											<div class="flex items-center space-x-3">
												{#if tool.success}
													<CheckCircle class="h-4 w-4 text-green-600" />
												{:else}
													<XCircle class="h-4 w-4 text-red-600" />
												{/if}
												<div>
													<div
														class="font-medium text-sm text-gray-900 dark:text-white"
													>
														{tool.tool_name}
													</div>
													<div
														class="text-xs text-gray-500 dark:text-gray-400"
													>
														{formatDate(tool.created_at)}
													</div>
												</div>
											</div>
											{#if tool.execution_time_ms}
												<span
													class="text-xs text-gray-500 dark:text-gray-400"
												>
													{tool.execution_time_ms}ms
												</span>
											{/if}
										</div>
									{/each}
								</div>
							{/if}
						</div>
					{/if}

					<!-- Compressions -->
					{#if sessionData.compressions?.length > 0}
						<div class="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
							<div class="flex items-center space-x-2 mb-3">
								<Sparkles class="h-5 w-5 text-green-600" />
								<span class="font-semibold text-gray-900 dark:text-white"
									>Compressions</span
								>
							</div>
							<div class="space-y-2">
								{#each sessionData.compressions as compression}
									<div class="flex items-center justify-between text-sm">
										<span class="text-gray-600 dark:text-gray-400">
											{formatDate(compression.created_at)}
										</span>
										<span class="text-gray-900 dark:text-white">
											{formatNumber(compression.original_tokens)} → {formatNumber(
												compression.compressed_tokens
											)} tokens
											<span class="text-green-600 font-medium ml-2">
												-{Math.round(
													((compression.original_tokens -
														compression.compressed_tokens) /
														compression.original_tokens) *
														100
												)}%
											</span>
										</span>
									</div>
								{/each}
							</div>
						</div>
					{/if}

					<!-- Conversation Thread -->
					<div class="border border-gray-200 dark:border-gray-700 rounded-lg">
						<div class="p-4 border-b border-gray-200 dark:border-gray-700">
							<div class="flex items-center space-x-2">
								<MessageSquare class="h-5 w-5 text-cyan-600" />
								<span class="font-semibold text-gray-900 dark:text-white"
									>Conversation</span
								>
								<span
									class="px-2 py-1 text-xs rounded-full bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200"
								>
									{sessionData.messages?.length || 0} messages
								</span>
							</div>
						</div>
						<div class="p-4 space-y-4 max-h-96 overflow-y-auto">
							{#each sessionData.messages as message}
								<div class="flex items-start space-x-3">
									{#if message.role === 'user'}
										<User class="h-5 w-5 text-blue-600 flex-shrink-0 mt-1" />
									{:else}
										<Bot class="h-5 w-5 text-purple-600 flex-shrink-0 mt-1" />
									{/if}
									<div class="flex-1">
										<div class="flex items-center space-x-2 mb-1">
											<span
												class="text-xs font-medium text-gray-500 dark:text-gray-400"
											>
												{message.role === 'user' ? 'User' : 'Assistant'}
											</span>
											<span class="text-xs text-gray-400 dark:text-gray-500">
												{formatDate(message.created_at)}
											</span>
											{#if message.total_tokens}
												<span
													class="text-xs text-gray-400 dark:text-gray-500"
												>
													{formatNumber(message.total_tokens)} tokens
												</span>
											{/if}
										</div>
										<div class="prose prose-sm dark:prose-invert max-w-none">
											{@html formatMarkdown(message.content)}
										</div>

										<!-- Tool Calls Display -->
										{#if message.role === 'assistant' && message.tool_calls && message.tool_calls.length > 0}
											<div class="mt-3 space-y-2">
												<div
													class="text-xs font-medium text-gray-500 dark:text-gray-400 flex items-center gap-2"
												>
													<Wrench class="h-3 w-3" />
													Tool Calls ({message.tool_calls.length})
												</div>
												{#each message.tool_calls as toolCall}
													<details
														class="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-3 text-xs"
													>
														<summary
															class="cursor-pointer font-medium text-orange-800 dark:text-orange-300 flex items-center justify-between hover:text-orange-900 dark:hover:text-orange-200"
														>
															<span class="flex items-center gap-2">
																<Wrench class="h-3 w-3" />
																{toolCall.function?.name ||
																	'unknown'}
															</span>
															<ChevronDown class="h-3 w-3" />
														</summary>
														<div class="mt-3 space-y-2">
															<div>
																<div
																	class="font-medium text-gray-600 dark:text-gray-400 mb-1"
																>
																	Arguments:
																</div>
																<pre
																	class="bg-white dark:bg-gray-900 p-2 rounded overflow-x-auto text-[10px] text-gray-700 dark:text-gray-300">{JSON.stringify(
																		JSON.parse(
																			toolCall.function
																				?.arguments || '{}'
																		),
																		null,
																		2
																	)}</pre>
															</div>
															{#if toolCall.id}
																<div
																	class="text-[10px] text-gray-500 dark:text-gray-400"
																>
																	ID: {toolCall.id}
																</div>
															{/if}
														</div>
													</details>
												{/each}
											</div>
										{/if}

										<!-- Tool Result Display -->
										{#if message.role === 'tool' && message.tool_result}
											<div
												class="mt-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3"
											>
												<div
													class="text-xs font-medium text-green-700 dark:text-green-300 flex items-center gap-2 mb-2"
												>
													<CheckCircle class="h-3 w-3" />
													Tool Result: {message.tool_name || 'unknown'}
												</div>
												<details class="text-xs">
													<summary
														class="cursor-pointer text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300"
													>
														View result
													</summary>
													<pre
														class="mt-2 bg-white dark:bg-gray-900 p-2 rounded overflow-x-auto text-[10px] text-gray-700 dark:text-gray-300">{JSON.stringify(
															message.tool_result,
															null,
															2
														)}</pre>
												</details>
												{#if message.tool_call_id}
													<div
														class="mt-2 text-[10px] text-gray-500 dark:text-gray-400"
													>
														Call ID: {message.tool_call_id}
													</div>
												{/if}
											</div>
										{/if}

										{#if message.error_message}
											<div
												class="mt-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-xs text-red-800 dark:text-red-200"
											>
												Error: {message.error_message}
											</div>
										{/if}
									</div>
								</div>
							{/each}
						</div>
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}
