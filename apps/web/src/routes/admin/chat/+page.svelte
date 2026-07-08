<!-- apps/web/src/routes/admin/chat/+page.svelte -->
<script lang="ts">
	import {
		MessageSquare,
		DollarSign,
		Zap,
		TrendingUp,
		AlertCircle,
		RefreshCw,
		Download,
		Activity,
		Clock,
		CheckCircle,
		XCircle,
		Sparkles,
		Image,
		HardDrive,
		Network
	} from 'lucide-svelte';
	import AdminPageHeader from '$lib/components/admin/AdminPageHeader.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import LlmUsageStatsPanel from '$lib/components/admin/chat/LlmUsageStatsPanel.svelte';
	import { browser } from '$app/environment';

	type DashboardTimeframe = '24h' | '7d' | '30d' | '90d' | '365d';
	type Trend = { direction: 'up' | 'down'; value: number };
	type DashboardKPIs = {
		totalSessions: number;
		newSessions: number;
		activeSessions: number;
		uniqueUsers: number;
		totalMessages: number;
		avgMessagesPerSession: number;
		totalTurns: number;
		completedTurns: number;
		failedTurns: number;
		cancelledTurns: number;
		staleTurns: number;
		turnSuccessRate: number;
		turnTrend: Trend;
		totalTokensUsed: number;
		billableRequests: number;
		billableCost: number;
		estimatedCost: number;
		isCostEstimated: boolean;
		avgTokensPerTurn: number;
		tokenTrend: Trend;
		costTrend: Trend;
		toolCalls: number;
		toolFailures: number;
		toolSuccessRate: number;
		validationFailures: number;
		avgToolsPerTurn: number;
		avgLlmPassesPerTurn: number;
		llmPasses: number;
		p95TurnDurationMs: number;
		avgTurnDurationMs: number;
		p95LlmResponseMs: number;
		historyCompressionRate: number;
		prewarmedContextRate: number;
		gatewayEnabledRate: number;
		cacheHitRate: number;
	};

	type DistributionMetric = {
		label: string;
		count: number;
		share: number;
		success_rate: number;
		tool_calls: number;
		p95_duration_ms: number;
	};

	type RuntimeDistribution = {
		first_actions: DistributionMetric[];
		context_types: DistributionMetric[];
		statuses: DistributionMetric[];
		cache_sources: DistributionMetric[];
	};

	type DataHealth = {
		rows: {
			sessions: number;
			messages: number;
			turnRuns: number;
			llmUsageLogs: number;
			llmPassEvents: number;
			skillGateEvents: number;
			toolExecutions: number;
			evalRuns: number;
		};
		truncated: Record<string, boolean>;
		hasBillableUsage: boolean;
		hasTurnTelemetry: boolean;
	};

	type SkillGateIssueType = 'missing_matching_skill' | 'wrong_format' | 'missing_contract';
	type SkillGateIssue = {
		turn_run_id: string | null;
		session_id: string | null;
		user_id: string | null;
		user_email: string;
		timestamp: string | null;
		issue_types: SkillGateIssueType[];
		expected_skill_ids: string[];
		expected_skill_formats: Record<string, string>;
		loaded_skill_ids: string[];
		matching_loaded_skill_ids: string[];
		loaded_skill_formats: Record<string, string>;
		skill_gate_violation_repaired: boolean;
		request_message: string | null;
		first_skill_path: string | null;
	};
	type SkillGateDiagnostics = {
		evaluated_turns: number;
		required_turns: number;
		satisfied_turns: number;
		unsatisfied_turns: number;
		wrong_format_turns: number;
		missing_contract_turns: number;
		repaired_turns: number;
		issue_turns: number;
		issue_rate: number;
		recent_issues: SkillGateIssue[];
	};

	type ChatMediaUsage = {
		kpis: {
			totalEvents: number;
			uploadRequests: number;
			uploadDedupes: number;
			duplicateAttemptRate: number;
			uploadedBytes: number;
			attachmentLinks: number;
			ocrQueued: number;
			ocrFailed: number;
			ocrFailureRate: number;
			liveVisionRequests: number;
			liveVisionFailures: number;
			liveVisionFailureRate: number;
			currentImageAssets: number;
			currentImageStorageBytes: number;
			averageImageBytes: number;
		};
		by_event_type: Array<{ event_type: string; count: number; bytes: number }>;
		by_source: Array<{ source: string; count: number; bytes: number }>;
		top_projects: Array<{
			project_id: string;
			project_name: string | null;
			event_count: number;
			upload_count: number;
			upload_bytes: number;
			dedupe_count: number;
			live_vision_requests: number;
			live_vision_failures: number;
			current_image_count: number;
			current_storage_bytes: number;
		}>;
		recent_events: Array<{
			id: string | null;
			created_at: string | null;
			event_type: string;
			source: string;
			project_id: string | null;
			project_name: string | null;
			asset_id: string | null;
			media_type: string | null;
			content_type: string | null;
			file_size_bytes: number;
			checksum_sha256_suffix: string | null;
		}>;
		data_health: {
			rows: {
				mediaEvents: number;
				imageAssets: number;
			};
			truncated: Record<string, boolean>;
		};
	};

	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let selectedTimeframe = $state<DashboardTimeframe>('7d');
	let autoRefresh = $state(false);
	let llmRefreshKey = $state(0);
	let llmDays = $derived(timeframeToDays(selectedTimeframe));
	let mediaUsageError = $state<string | null>(null);

	// Dashboard KPIs
	let dashboardKPIs = $state({
		totalSessions: 0,
		newSessions: 0,
		activeSessions: 0,
		uniqueUsers: 0,
		totalMessages: 0,
		avgMessagesPerSession: 0,
		totalTurns: 0,
		completedTurns: 0,
		failedTurns: 0,
		cancelledTurns: 0,
		staleTurns: 0,
		turnSuccessRate: 0,
		turnTrend: { direction: 'up' as 'up' | 'down', value: 0 },
		totalTokensUsed: 0,
		billableRequests: 0,
		billableCost: 0,
		estimatedCost: 0,
		isCostEstimated: false,
		avgTokensPerTurn: 0,
		tokenTrend: { direction: 'up' as 'up' | 'down', value: 0 },
		costTrend: { direction: 'up' as 'up' | 'down', value: 0 },
		toolCalls: 0,
		toolFailures: 0,
		toolSuccessRate: 0,
		validationFailures: 0,
		avgToolsPerTurn: 0,
		avgLlmPassesPerTurn: 0,
		llmPasses: 0,
		p95TurnDurationMs: 0,
		avgTurnDurationMs: 0,
		p95LlmResponseMs: 0,
		historyCompressionRate: 0,
		prewarmedContextRate: 0,
		gatewayEnabledRate: 0,
		cacheHitRate: 0
	} satisfies DashboardKPIs);

	// Activity feed
	let activityFeed = $state<
		Array<{
			timestamp: Date;
			type: string;
			severity: 'info' | 'success' | 'warning' | 'error';
			user_email: string;
			session_id: string | null;
			details: string;
			tokens_used?: number;
		}>
	>([]);

	let runtimeDistribution = $state<RuntimeDistribution>({
		first_actions: [],
		context_types: [],
		statuses: [],
		cache_sources: []
	});

	// Top users by activity
	let topUsers = $state<
		Array<{
			user_id: string;
			email: string;
			name: string | null;
			session_count: number;
			turn_count: number;
			message_count: number;
			tool_calls: number;
			total_cost: number;
			total_tokens: number;
			last_activity: string | null;
		}>
	>([]);
	let dataHealth = $state<DataHealth>({
		rows: {
			sessions: 0,
			messages: 0,
			turnRuns: 0,
			llmUsageLogs: 0,
			llmPassEvents: 0,
			skillGateEvents: 0,
			toolExecutions: 0,
			evalRuns: 0
		},
		truncated: {},
		hasBillableUsage: false,
		hasTurnTelemetry: false
	});
	let skillGateDiagnostics = $state<SkillGateDiagnostics>(createEmptySkillGateDiagnostics());
	let hasTruncatedDashboardData = $derived(
		Object.values(dataHealth.truncated ?? {}).some(Boolean)
	);
	let mediaUsage = $state<ChatMediaUsage>(createEmptyMediaUsage());
	let hasTruncatedMediaData = $derived(
		Object.values(mediaUsage.data_health.truncated ?? {}).some(Boolean)
	);

	// Load data on mount and when timeframe changes
	$effect(() => {
		if (!browser) return;
		selectedTimeframe;
		loadDashboard();
	});

	// Auto-refresh
	$effect(() => {
		if (!browser) return;
		if (autoRefresh) {
			const interval = setInterval(refreshDashboard, 30000); // 30 seconds
			return () => clearInterval(interval);
		}
	});

	function timeframeToDays(timeframe: DashboardTimeframe): string {
		switch (timeframe) {
			case '24h':
				return '1';
			case '90d':
				return '90';
			case '365d':
				return '365';
			case '30d':
				return '30';
			case '7d':
			default:
				return '7';
		}
	}

	async function refreshDashboard() {
		llmRefreshKey += 1;
		await loadDashboard();
	}

	async function loadDashboard() {
		if (!browser) return;
		isLoading = true;
		error = null;
		mediaUsageError = null;

		try {
			const [response, mediaResponse] = await Promise.all([
				fetch(`/api/admin/chat/dashboard?timeframe=${selectedTimeframe}`),
				fetch(`/api/admin/chat/media?timeframe=${selectedTimeframe}`)
			]);

			if (!response.ok) {
				throw new Error('Failed to load dashboard data');
			}

			const data = await response.json();

			if (data.success) {
				dashboardKPIs = data.data.kpis;
				activityFeed = data.data.activity_feed.map((event: any) => ({
					...event,
					timestamp: new Date(event.timestamp)
				}));
				runtimeDistribution = data.data.runtime_distribution;
				topUsers = data.data.top_users;
				dataHealth = data.data.data_health;
				skillGateDiagnostics =
					data.data.skill_gate_diagnostics ?? createEmptySkillGateDiagnostics();
			} else {
				throw new Error(data.message || 'Failed to load dashboard');
			}

			if (mediaResponse.ok) {
				const mediaData = await mediaResponse.json();
				if (mediaData.success) {
					mediaUsage = mediaData.data;
				} else {
					mediaUsageError = mediaData.message || 'Failed to load media usage';
				}
			} else {
				mediaUsageError = 'Failed to load media usage';
			}
		} catch (err) {
			console.error('Error loading chat dashboard:', err);
			error = err instanceof Error ? err.message : 'Failed to load dashboard';
		} finally {
			isLoading = false;
		}
	}

	function createEmptyMediaUsage(): ChatMediaUsage {
		return {
			kpis: {
				totalEvents: 0,
				uploadRequests: 0,
				uploadDedupes: 0,
				duplicateAttemptRate: 0,
				uploadedBytes: 0,
				attachmentLinks: 0,
				ocrQueued: 0,
				ocrFailed: 0,
				ocrFailureRate: 0,
				liveVisionRequests: 0,
				liveVisionFailures: 0,
				liveVisionFailureRate: 0,
				currentImageAssets: 0,
				currentImageStorageBytes: 0,
				averageImageBytes: 0
			},
			by_event_type: [],
			by_source: [],
			top_projects: [],
			recent_events: [],
			data_health: {
				rows: {
					mediaEvents: 0,
					imageAssets: 0
				},
				truncated: {}
			}
		};
	}

	function createEmptySkillGateDiagnostics(): SkillGateDiagnostics {
		return {
			evaluated_turns: 0,
			required_turns: 0,
			satisfied_turns: 0,
			unsatisfied_turns: 0,
			wrong_format_turns: 0,
			missing_contract_turns: 0,
			repaired_turns: 0,
			issue_turns: 0,
			issue_rate: 0,
			recent_issues: []
		};
	}

	function formatNumber(num: number): string {
		return new Intl.NumberFormat().format(num);
	}

	function formatCurrency(num: number): string {
		const value = Number.isFinite(num) ? num : 0;
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD',
			minimumFractionDigits: value > 0 && value < 0.01 ? 4 : 2,
			maximumFractionDigits: 4
		}).format(value);
	}

	function formatPercentage(num: number): string {
		return `${num.toFixed(1)}%`;
	}

	function formatDuration(ms: number): string {
		if (!Number.isFinite(ms) || ms <= 0) return '0ms';
		if (ms < 1000) return `${Math.round(ms)}ms`;
		return `${(ms / 1000).toFixed(1)}s`;
	}

	function formatCompact(num: number): string {
		return new Intl.NumberFormat('en-US', {
			notation: 'compact',
			maximumFractionDigits: 1
		}).format(Number.isFinite(num) ? num : 0);
	}

	function formatBytes(bytes: number): string {
		const value = Number.isFinite(bytes) ? Math.max(0, bytes) : 0;
		if (value < 1024) return `${Math.round(value)} B`;
		if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
		if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
		return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
	}

	function formatDateTime(value: string | null): string {
		if (!value) return 'Unknown time';
		const parsed = new Date(value);
		if (Number.isNaN(parsed.getTime())) return value;
		return parsed.toLocaleString();
	}

	function formatSkillList(values: string[]): string {
		if (!values.length) return 'none';
		return values.slice(0, 3).join(', ') + (values.length > 3 ? ` +${values.length - 3}` : '');
	}

	function skillGateIssueLabel(type: SkillGateIssueType): string {
		switch (type) {
			case 'missing_matching_skill':
				return 'No matching skill';
			case 'wrong_format':
				return 'Wrong format';
			case 'missing_contract':
				return 'Missing contract';
		}
	}

	function skillGateIssueClass(type: SkillGateIssueType): string {
		switch (type) {
			case 'missing_matching_skill':
				return 'bg-destructive/10 text-destructive border-destructive/30';
			case 'wrong_format':
				return 'bg-warning/10 text-warning border-warning/30';
			case 'missing_contract':
				return 'bg-info/10 text-info border-info/30';
		}
	}

	function trendPrefix(trend: Trend): string {
		return trend.direction === 'up' ? '+' : '-';
	}

	function trendClass(trend: Trend, higherIsBad = false): string {
		const isUp = trend.direction === 'up';
		const isBad = higherIsBad ? isUp : !isUp;
		return isBad ? 'text-destructive' : 'text-success';
	}

	function getActivityIcon(type: string) {
		switch (type) {
			case 'turn_completed':
				return CheckCircle;
			case 'turn_failed':
			case 'llm_failed':
			case 'tool_failed':
				return XCircle;
			case 'turn_cancelled':
				return AlertCircle;
			case 'tool_execution':
			case 'eval_run':
				return Zap;
			case 'message':
				return MessageSquare;
			default:
				return Activity;
		}
	}

	function distributionWidth(metric: DistributionMetric, rows: DistributionMetric[]): string {
		const max = Math.max(1, ...rows.map((row) => row.count));
		if (metric.count <= 0) return '0%';
		return `${Math.max(2, Math.min(100, (metric.count / max) * 100))}%`;
	}

	async function exportData() {
		if (!browser) return;
		try {
			const response = await fetch(
				`/api/admin/chat/export?timeframe=${selectedTimeframe}&format=json`
			);

			if (!response.ok) throw new Error('Failed to export data');

			const blob = await response.blob();
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `chat-analytics-${selectedTimeframe}-${new Date().toISOString().split('T')[0]}.json`;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
		} catch (err) {
			console.error('Export failed:', err);
			error = 'Failed to export data';
		}
	}
</script>

<svelte:head>
	<title>Chat Monitoring - Admin - BuildOS</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="admin-page">
	<!-- Header -->
	<AdminPageHeader
		title="Chat Monitoring"
		description="AI chat activity, model usage, cost, tokens, and system health"
		icon={MessageSquare}
		showBack={true}
	>
		{#snippet actions()}
			<div class="flex flex-wrap items-center gap-3">
				<!-- Auto Refresh -->
				<label class="flex items-center gap-2 cursor-pointer">
					<input
						type="checkbox"
						bind:checked={autoRefresh}
						class="h-4 w-4 rounded border-border bg-background text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
						aria-label="Enable auto refresh"
					/>
					<span class="text-sm text-muted-foreground">Auto Refresh</span>
				</label>

				<!-- Timeframe -->
				<Select
					bind:value={selectedTimeframe}
					onchange={(value) => {
						if (
							value === '24h' ||
							value === '7d' ||
							value === '30d' ||
							value === '90d' ||
							value === '365d'
						) {
							selectedTimeframe = value;
						}
					}}
					size="md"
					placeholder="Last 7 Days"
					aria-label="Select time range"
				>
					<option value="24h">Last 24 Hours</option>
					<option value="7d">Last 7 Days</option>
					<option value="30d">Last 30 Days</option>
					<option value="90d">Last 90 Days</option>
					<option value="365d">Last Year</option>
				</Select>

				<!-- Export -->
				<Button
					onclick={exportData}
					variant="primary"
					size="sm"
					icon={Download}
					class="pressable"
				>
					Export
				</Button>

				<!-- Refresh -->
				<Button
					onclick={refreshDashboard}
					disabled={isLoading}
					variant="secondary"
					size="sm"
					icon={RefreshCw}
					loading={isLoading}
					class="pressable"
				>
					Refresh
				</Button>
			</div>
		{/snippet}
	</AdminPageHeader>

	<!-- Navigation Cards -->
	<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
		<a
			href="/admin/chat/sessions"
			class="bg-card border border-border rounded-lg p-4 shadow-ink hover:shadow-ink-strong hover:border-accent transition-all motion-reduce:transition-none pressable focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
		>
			<div class="flex items-center gap-3">
				<MessageSquare class="h-7 w-7 text-info shrink-0" />
				<div>
					<h3 class="text-base font-semibold text-foreground">Sessions</h3>
					<p class="text-sm text-muted-foreground">View all chats</p>
				</div>
			</div>
		</a>

		<a
			href="/admin/chat/agents"
			class="bg-card border border-border rounded-lg p-4 shadow-ink hover:shadow-ink-strong hover:border-accent transition-all motion-reduce:transition-none pressable focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
		>
			<div class="flex items-center gap-3">
				<Activity class="h-7 w-7 text-accent shrink-0" />
				<div>
					<h3 class="text-base font-semibold text-foreground">Runtime</h3>
					<p class="text-sm text-muted-foreground">Turn analytics</p>
				</div>
			</div>
		</a>

		<a
			href="/admin/chat/costs"
			class="bg-card border border-border rounded-lg p-4 shadow-ink hover:shadow-ink-strong hover:border-accent transition-all motion-reduce:transition-none pressable focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
		>
			<div class="flex items-center gap-3">
				<DollarSign class="h-7 w-7 text-success shrink-0" />
				<div>
					<h3 class="text-base font-semibold text-foreground">Costs</h3>
					<p class="text-sm text-muted-foreground">Token analytics</p>
				</div>
			</div>
		</a>

		<a
			href="/admin/chat/tools"
			class="bg-card border border-border rounded-lg p-4 shadow-ink hover:shadow-ink-strong hover:border-accent transition-all motion-reduce:transition-none pressable focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
		>
			<div class="flex items-center gap-3">
				<Zap class="h-7 w-7 text-warning shrink-0" />
				<div>
					<h3 class="text-base font-semibold text-foreground">Tools</h3>
					<p class="text-sm text-muted-foreground">Tool usage</p>
				</div>
			</div>
		</a>

		<a
			href="/admin/chat/domains"
			class="bg-card border border-border rounded-lg p-4 shadow-ink hover:shadow-ink-strong hover:border-accent transition-all motion-reduce:transition-none pressable focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
		>
			<div class="flex items-center gap-3">
				<Network class="h-7 w-7 text-info shrink-0" />
				<div>
					<h3 class="text-base font-semibold text-foreground">Domains</h3>
					<p class="text-sm text-muted-foreground">Research queue</p>
				</div>
			</div>
		</a>

		<a
			href="/admin/chat/timing"
			class="bg-card border border-border rounded-lg p-4 shadow-ink hover:shadow-ink-strong hover:border-accent transition-all motion-reduce:transition-none pressable focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
		>
			<div class="flex items-center gap-3">
				<Clock class="h-7 w-7 text-info shrink-0" />
				<div>
					<h3 class="text-base font-semibold text-foreground">Timing</h3>
					<p class="text-sm text-muted-foreground">Latency metrics</p>
				</div>
			</div>
		</a>
	</div>

	{#if error}
		<div
			class="bg-destructive/10 border border-destructive/30 rounded-lg p-3 mb-6 tx tx-static tx-weak"
			role="alert"
		>
			<div class="flex items-center gap-2">
				<AlertCircle class="h-5 w-5 text-destructive shrink-0" />
				<p class="text-sm text-destructive">{error}</p>
			</div>
		</div>
	{/if}

	{#if hasTruncatedDashboardData}
		<div
			class="bg-warning/10 border border-warning/30 rounded-lg p-3 mb-6 tx tx-static tx-weak"
			role="status"
		>
			<div class="flex items-center gap-2">
				<AlertCircle class="h-5 w-5 text-warning shrink-0" />
				<p class="text-sm text-warning">
					Some dashboard source queries hit their row limit. Totals are directionally
					useful, but high-volume slices may be undercounted.
				</p>
			</div>
		</div>
	{/if}

	{#if !dataHealth.hasBillableUsage && dataHealth.hasTurnTelemetry}
		<div
			class="bg-info/10 border border-info/30 rounded-lg p-3 mb-6 tx tx-static tx-weak"
			role="status"
		>
			<div class="flex items-center gap-2">
				<DollarSign class="h-5 w-5 text-info shrink-0" />
				<p class="text-sm text-info">
					No chat-linked billing logs were found for this period, so cost uses model pass
					telemetry estimates.
				</p>
			</div>
		</div>
	{/if}

	{#if mediaUsageError}
		<div
			class="bg-warning/10 border border-warning/30 rounded-lg p-3 mb-6 tx tx-static tx-weak"
			role="status"
		>
			<div class="flex items-center gap-2">
				<Image class="h-5 w-5 text-warning shrink-0" />
				<p class="text-sm text-warning">{mediaUsageError}</p>
			</div>
		</div>
	{/if}

	{#if hasTruncatedMediaData}
		<div
			class="bg-warning/10 border border-warning/30 rounded-lg p-3 mb-6 tx tx-static tx-weak"
			role="status"
		>
			<div class="flex items-center gap-2">
				<HardDrive class="h-5 w-5 text-warning shrink-0" />
				<p class="text-sm text-warning">
					Media usage queries hit their row limit. Storage and upload counts may be
					undercounted for this period.
				</p>
			</div>
		</div>
	{/if}

	{#if isLoading}
		<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
			{#each Array(8) as _}
				<div
					class="bg-card border border-border rounded-lg p-4 shadow-ink animate-pulse motion-reduce:animate-none"
				>
					<div class="h-4 bg-muted rounded w-3/4 mb-2"></div>
					<div class="h-8 bg-muted rounded w-1/2"></div>
				</div>
			{/each}
		</div>
	{:else}
		<!-- Key Metrics Grid -->
		<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
			<!-- Chat Sessions -->
			<div class="bg-card border border-border rounded-lg p-4 shadow-ink tx tx-frame tx-weak">
				<div class="flex items-center justify-between">
					<div class="flex-1 min-w-0">
						<p
							class="text-xs font-medium text-muted-foreground uppercase tracking-wide"
						>
							Chat Sessions
						</p>
						<p class="text-2xl font-bold text-foreground mt-1">
							{formatNumber(dashboardKPIs.totalSessions)}
						</p>
					</div>
					<MessageSquare class="h-7 w-7 text-info shrink-0 ml-3" />
				</div>
				<div class="mt-2 text-xs text-muted-foreground">
					{formatNumber(dashboardKPIs.newSessions)} new • {formatNumber(
						dashboardKPIs.activeSessions
					)}
					active
				</div>
			</div>

			<!-- Active Users -->
			<div class="bg-card border border-border rounded-lg p-4 shadow-ink tx tx-frame tx-weak">
				<div class="flex items-center justify-between">
					<div class="flex-1 min-w-0">
						<p
							class="text-xs font-medium text-muted-foreground uppercase tracking-wide"
						>
							Active Users
						</p>
						<p class="text-2xl font-bold text-foreground mt-1">
							{formatNumber(dashboardKPIs.uniqueUsers)}
						</p>
					</div>
					<Activity class="h-7 w-7 text-info shrink-0 ml-3" />
				</div>
				<div class="mt-2 text-xs text-muted-foreground">
					{formatNumber(dashboardKPIs.totalMessages)} messages • avg {dashboardKPIs.avgMessagesPerSession.toFixed(
						1
					)}
					/session
				</div>
			</div>

			<!-- Turns -->
			<div class="bg-card border border-border rounded-lg p-4 shadow-ink tx tx-frame tx-weak">
				<div class="flex items-center justify-between">
					<div class="flex-1 min-w-0">
						<p
							class="text-xs font-medium text-muted-foreground uppercase tracking-wide"
						>
							Turns
						</p>
						<p class="text-2xl font-bold text-foreground mt-1">
							{formatNumber(dashboardKPIs.totalTurns)}
						</p>
					</div>
					<Zap class="h-7 w-7 text-success shrink-0 ml-3" />
				</div>
				<div class="mt-2 text-xs text-muted-foreground">
					{formatNumber(dashboardKPIs.completedTurns)} completed • {formatNumber(
						dashboardKPIs.failedTurns
					)}
					failed • {formatNumber(dashboardKPIs.cancelledTurns)} cancelled
					{#if dashboardKPIs.staleTurns}
						• {formatNumber(dashboardKPIs.staleTurns)} stale
					{/if}
				</div>
				<div class="mt-1 flex items-center gap-1 text-xs">
					{#if dashboardKPIs.turnTrend.direction === 'up'}
						<TrendingUp class="w-3.5 h-3.5 text-success" />
					{:else}
						<TrendingUp class="w-3.5 h-3.5 text-destructive rotate-180" />
					{/if}
					<span class={trendClass(dashboardKPIs.turnTrend)}>
						{trendPrefix(dashboardKPIs.turnTrend)}{dashboardKPIs.turnTrend.value}%
					</span>
					<span class="text-muted-foreground">vs prior period</span>
				</div>
			</div>

			<!-- Cost -->
			<div class="bg-card border border-border rounded-lg p-4 shadow-ink tx tx-frame tx-weak">
				<div class="flex items-center justify-between">
					<div class="flex-1 min-w-0">
						<p
							class="text-xs font-medium text-muted-foreground uppercase tracking-wide"
						>
							{dashboardKPIs.isCostEstimated ? 'Estimated Cost' : 'Billable Cost'}
						</p>
						<p class="text-2xl font-bold text-foreground mt-1">
							{formatCurrency(dashboardKPIs.estimatedCost)}
						</p>
					</div>
					<DollarSign class="h-7 w-7 text-warning shrink-0 ml-3" />
				</div>
				<div class="mt-2 text-xs text-muted-foreground">
					{#if dashboardKPIs.billableRequests > 0}
						{formatNumber(dashboardKPIs.billableRequests)} billable requests
					{:else}
						From LLM pass telemetry
					{/if}
				</div>
				<div class="mt-1 flex items-center gap-1 text-xs">
					{#if dashboardKPIs.costTrend.direction === 'up'}
						<TrendingUp class="w-3.5 h-3.5 text-destructive" />
					{:else}
						<TrendingUp class="w-3.5 h-3.5 text-success rotate-180" />
					{/if}
					<span class={trendClass(dashboardKPIs.costTrend, true)}>
						{trendPrefix(dashboardKPIs.costTrend)}{dashboardKPIs.costTrend.value}%
					</span>
					<span class="text-muted-foreground">vs prior period</span>
				</div>
			</div>

			<!-- Chat Tokens -->
			<div class="bg-card border border-border rounded-lg p-4 shadow-ink tx tx-frame tx-weak">
				<div class="flex items-center justify-between">
					<div class="flex-1 min-w-0">
						<p
							class="text-xs font-medium text-muted-foreground uppercase tracking-wide"
						>
							Chat Tokens
						</p>
						<p class="text-2xl font-bold text-foreground mt-1">
							{formatCompact(dashboardKPIs.totalTokensUsed)}
						</p>
					</div>
					<CheckCircle class="h-7 w-7 text-accent shrink-0 ml-3" />
				</div>
				<div class="mt-2 text-xs text-muted-foreground">
					{formatCompact(dashboardKPIs.avgTokensPerTurn)} per turn
				</div>
				<div class="mt-1 flex items-center gap-1 text-xs">
					{#if dashboardKPIs.tokenTrend.direction === 'up'}
						<TrendingUp class="w-3.5 h-3.5 text-destructive" />
					{:else}
						<TrendingUp class="w-3.5 h-3.5 text-success rotate-180" />
					{/if}
					<span class={trendClass(dashboardKPIs.tokenTrend, true)}>
						{trendPrefix(dashboardKPIs.tokenTrend)}{dashboardKPIs.tokenTrend.value}%
					</span>
					<span class="text-muted-foreground">vs prior period</span>
				</div>
			</div>

			<!-- Tool Calls -->
			<div class="bg-card border border-border rounded-lg p-4 shadow-ink tx tx-frame tx-weak">
				<div class="flex items-center justify-between">
					<div class="flex-1 min-w-0">
						<p
							class="text-xs font-medium text-muted-foreground uppercase tracking-wide"
						>
							Tool Calls
						</p>
						<p class="text-2xl font-bold text-foreground mt-1">
							{formatNumber(dashboardKPIs.toolCalls)}
						</p>
					</div>
					<Zap class="h-7 w-7 text-info shrink-0 ml-3" />
				</div>
				<div class="mt-2 text-xs text-muted-foreground">
					{formatPercentage(dashboardKPIs.toolSuccessRate)} success • {formatNumber(
						dashboardKPIs.toolFailures
					)}
					failed
				</div>
				<div class="mt-1 text-xs text-muted-foreground">
					{formatNumber(dashboardKPIs.validationFailures)} validation issues
				</div>
			</div>

			<!-- P95 Turn Duration -->
			<div class="bg-card border border-border rounded-lg p-4 shadow-ink tx tx-frame tx-weak">
				<div class="flex items-center justify-between">
					<div class="flex-1 min-w-0">
						<p
							class="text-xs font-medium text-muted-foreground uppercase tracking-wide"
						>
							P95 Turn
						</p>
						<p class="text-2xl font-bold text-foreground mt-1">
							{formatDuration(dashboardKPIs.p95TurnDurationMs)}
						</p>
					</div>
					<Clock class="h-7 w-7 text-info shrink-0 ml-3" />
				</div>
				<div class="mt-2 text-xs text-muted-foreground">
					Avg {formatDuration(dashboardKPIs.avgTurnDurationMs)} • LLM p95 {formatDuration(
						dashboardKPIs.p95LlmResponseMs
					)}
				</div>
			</div>

			<!-- Runtime Efficiency -->
			<div class="bg-card border border-border rounded-lg p-4 shadow-ink tx tx-frame tx-weak">
				<div class="flex items-center justify-between">
					<div class="flex-1 min-w-0">
						<p
							class="text-xs font-medium text-muted-foreground uppercase tracking-wide"
						>
							LLM Passes / Turn
						</p>
						<p class="text-2xl font-bold text-foreground mt-1">
							{dashboardKPIs.avgLlmPassesPerTurn.toFixed(2)}x
						</p>
					</div>
					<Sparkles class="h-7 w-7 text-success shrink-0 ml-3" />
				</div>
				<div class="mt-2 text-xs text-muted-foreground">
					{formatNumber(dashboardKPIs.llmPasses)} passes • {dashboardKPIs.avgToolsPerTurn.toFixed(
						1
					)}
					tools/turn
				</div>
				<div class="mt-1 text-xs text-muted-foreground">
					{formatPercentage(dashboardKPIs.historyCompressionRate)} compressed
				</div>
			</div>
		</div>

		<!-- Skill Gate Health -->
		<div
			class="bg-card border border-border rounded-lg p-4 shadow-ink tx tx-frame tx-weak mb-6"
		>
			<div class="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between mb-4">
				<div>
					<h3 class="text-sm font-semibold text-foreground">Skill Gate Health</h3>
					<p class="text-xs text-muted-foreground">
						Required skill loads, matching skill coverage, expected format, and contract
						presence
					</p>
				</div>
				<div
					class="inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium {skillGateDiagnostics.issue_turns >
					0
						? 'border-warning/30 bg-warning/10 text-warning'
						: 'border-success/30 bg-success/10 text-success'}"
				>
					{formatPercentage(skillGateDiagnostics.issue_rate)} issue rate
				</div>
			</div>

			<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
				<div class="rounded-lg border border-border bg-muted/30 p-3">
					<div class="flex items-center justify-between gap-3">
						<div>
							<p class="text-xs uppercase tracking-wide text-muted-foreground">
								Required Gates
							</p>
							<p class="text-xl font-bold text-foreground mt-1">
								{formatNumber(skillGateDiagnostics.required_turns)}
							</p>
						</div>
						<Network class="h-6 w-6 text-info shrink-0" />
					</div>
					<p class="text-xs text-muted-foreground mt-2">
						{formatNumber(skillGateDiagnostics.evaluated_turns)} evaluated turns
					</p>
				</div>

				<div class="rounded-lg border border-border bg-muted/30 p-3">
					<div class="flex items-center justify-between gap-3">
						<div>
							<p class="text-xs uppercase tracking-wide text-muted-foreground">
								Satisfied
							</p>
							<p class="text-xl font-bold text-success mt-1">
								{formatNumber(skillGateDiagnostics.satisfied_turns)}
							</p>
						</div>
						<CheckCircle class="h-6 w-6 text-success shrink-0" />
					</div>
					<p class="text-xs text-muted-foreground mt-2">
						{formatNumber(skillGateDiagnostics.repaired_turns)} repaired before final
					</p>
				</div>

				<div class="rounded-lg border border-border bg-muted/30 p-3">
					<div class="flex items-center justify-between gap-3">
						<div>
							<p class="text-xs uppercase tracking-wide text-muted-foreground">
								No Match
							</p>
							<p class="text-xl font-bold text-destructive mt-1">
								{formatNumber(skillGateDiagnostics.unsatisfied_turns)}
							</p>
						</div>
						<XCircle class="h-6 w-6 text-destructive shrink-0" />
					</div>
					<p class="text-xs text-muted-foreground mt-2">
						No matching loaded skill for required gate
					</p>
				</div>

				<div class="rounded-lg border border-border bg-muted/30 p-3">
					<div class="flex items-center justify-between gap-3">
						<div>
							<p class="text-xs uppercase tracking-wide text-muted-foreground">
								Quality Issues
							</p>
							<p class="text-xl font-bold text-warning mt-1">
								{formatNumber(
									skillGateDiagnostics.wrong_format_turns +
										skillGateDiagnostics.missing_contract_turns
								)}
							</p>
						</div>
						<AlertCircle class="h-6 w-6 text-warning shrink-0" />
					</div>
					<p class="text-xs text-muted-foreground mt-2">
						{formatNumber(skillGateDiagnostics.wrong_format_turns)} format • {formatNumber(
							skillGateDiagnostics.missing_contract_turns
						)}
						contract
					</p>
				</div>
			</div>

			{#if skillGateDiagnostics.recent_issues.length > 0}
				<div class="border-t border-border pt-4">
					<div
						class="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between mb-3"
					>
						<h4
							class="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
						>
							Recent Skill Gate Issues
						</h4>
						<div class="text-xs text-muted-foreground">
							{formatNumber(skillGateDiagnostics.issue_turns)} issue turns
						</div>
					</div>
					<div class="space-y-3">
						{#each skillGateDiagnostics.recent_issues.slice(0, 5) as issue}
							<div class="rounded-lg border border-border bg-muted/20 p-3">
								<div
									class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"
								>
									<div class="min-w-0 flex-1">
										<div class="mb-2 flex flex-wrap items-center gap-2">
											{#each issue.issue_types as type}
												<span
													class="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium {skillGateIssueClass(
														type
													)}"
												>
													{skillGateIssueLabel(type)}
												</span>
											{/each}
											{#if issue.skill_gate_violation_repaired}
												<span
													class="inline-flex items-center rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success"
												>
													Repaired
												</span>
											{/if}
										</div>
										<div class="text-sm font-medium text-foreground truncate">
											{issue.request_message ?? 'No request text captured'}
										</div>
										<div class="mt-1 text-xs text-muted-foreground">
											{issue.user_email} • {formatDateTime(issue.timestamp)}
										</div>
									</div>
									<div
										class="grid min-w-0 gap-2 text-xs sm:grid-cols-2 lg:w-[26rem]"
									>
										<div class="min-w-0">
											<div class="text-muted-foreground">Expected</div>
											<div class="truncate text-foreground">
												{formatSkillList(issue.expected_skill_ids)}
											</div>
										</div>
										<div class="min-w-0">
											<div class="text-muted-foreground">Loaded</div>
											<div class="truncate text-foreground">
												{formatSkillList(issue.loaded_skill_ids)}
											</div>
										</div>
										<div class="min-w-0">
											<div class="text-muted-foreground">Matching</div>
											<div class="truncate text-foreground">
												{formatSkillList(issue.matching_loaded_skill_ids)}
											</div>
										</div>
										<div class="min-w-0">
											<div class="text-muted-foreground">First skill</div>
											<div class="truncate text-foreground">
												{issue.first_skill_path ?? 'none'}
											</div>
										</div>
									</div>
								</div>
							</div>
						{/each}
					</div>
				</div>
			{:else}
				<div class="rounded-lg border border-success/20 bg-success/5 p-3">
					<div class="flex items-center gap-2 text-sm text-success">
						<CheckCircle class="h-4 w-4 shrink-0" />
						<span>No required skill-gate issues recorded in this period.</span>
					</div>
				</div>
			{/if}
		</div>

		<!-- Multimodal Media Usage -->
		<div
			class="bg-card border border-border rounded-lg p-4 shadow-ink tx tx-frame tx-weak mb-6"
		>
			<div class="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between mb-4">
				<div>
					<h3 class="text-sm font-semibold text-foreground">Multimodal Media</h3>
					<p class="text-xs text-muted-foreground">
						Project image storage, chat upload pressure, OCR, and live-vision events
					</p>
				</div>
				<div class="text-xs text-muted-foreground">
					{formatNumber(mediaUsage.data_health.rows.mediaEvents)} events • {formatNumber(
						mediaUsage.data_health.rows.imageAssets
					)}
					current images
				</div>
			</div>

			<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
				<div class="rounded-lg border border-border bg-muted/30 p-3">
					<div class="flex items-center justify-between gap-3">
						<div>
							<p class="text-xs uppercase tracking-wide text-muted-foreground">
								Storage
							</p>
							<p class="text-xl font-bold text-info mt-1">
								{formatBytes(mediaUsage.kpis.currentImageStorageBytes)}
							</p>
						</div>
						<HardDrive class="h-6 w-6 text-info shrink-0" />
					</div>
					<p class="text-xs text-muted-foreground mt-2">
						{formatNumber(mediaUsage.kpis.currentImageAssets)} images • avg {formatBytes(
							mediaUsage.kpis.averageImageBytes
						)}
					</p>
				</div>

				<div class="rounded-lg border border-border bg-muted/30 p-3">
					<div class="flex items-center justify-between gap-3">
						<div>
							<p class="text-xs uppercase tracking-wide text-muted-foreground">
								Uploads
							</p>
							<p class="text-xl font-bold text-success mt-1">
								{formatNumber(mediaUsage.kpis.uploadRequests)}
							</p>
						</div>
						<Image class="h-6 w-6 text-success shrink-0" />
					</div>
					<p class="text-xs text-muted-foreground mt-2">
						{formatBytes(mediaUsage.kpis.uploadedBytes)} new bytes • {formatPercentage(
							mediaUsage.kpis.duplicateAttemptRate
						)}
						dedupe rate
					</p>
				</div>

				<div class="rounded-lg border border-border bg-muted/30 p-3">
					<div class="flex items-center justify-between gap-3">
						<div>
							<p class="text-xs uppercase tracking-wide text-muted-foreground">OCR</p>
							<p class="text-xl font-bold text-warning mt-1">
								{formatNumber(mediaUsage.kpis.ocrQueued)}
							</p>
						</div>
						<CheckCircle class="h-6 w-6 text-warning shrink-0" />
					</div>
					<p class="text-xs text-muted-foreground mt-2">
						{formatNumber(mediaUsage.kpis.ocrFailed)} failed • {formatPercentage(
							mediaUsage.kpis.ocrFailureRate
						)}
						failure rate
					</p>
				</div>

				<div class="rounded-lg border border-border bg-muted/30 p-3">
					<div class="flex items-center justify-between gap-3">
						<div>
							<p class="text-xs uppercase tracking-wide text-muted-foreground">
								Live Vision
							</p>
							<p class="text-xl font-bold text-accent mt-1">
								{formatNumber(mediaUsage.kpis.liveVisionRequests)}
							</p>
						</div>
						<Sparkles class="h-6 w-6 text-accent shrink-0" />
					</div>
					<p class="text-xs text-muted-foreground mt-2">
						{formatNumber(mediaUsage.kpis.liveVisionFailures)} failed • {formatPercentage(
							mediaUsage.kpis.liveVisionFailureRate
						)}
						failure rate
					</p>
				</div>
			</div>

			<div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
				<div class="lg:col-span-2">
					<h4
						class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3"
					>
						Top Projects By Image Storage
					</h4>
					{#if mediaUsage.top_projects.length > 0}
						<div class="space-y-3">
							{#each mediaUsage.top_projects.slice(0, 5) as project}
								<div class="flex items-center justify-between gap-3">
									<div class="min-w-0 flex-1">
										<div class="text-sm font-medium text-foreground truncate">
											{project.project_name ?? project.project_id}
										</div>
										<div class="text-xs text-muted-foreground">
											{formatNumber(project.current_image_count)} images • {formatNumber(
												project.upload_count
											)}
											uploads • {formatNumber(project.dedupe_count)} dedupes
										</div>
									</div>
									<div class="text-right shrink-0">
										<div class="text-sm font-bold text-info">
											{formatBytes(project.current_storage_bytes)}
										</div>
										<div class="text-xs text-muted-foreground">
											{formatNumber(project.live_vision_requests)} vision
										</div>
									</div>
								</div>
							{/each}
						</div>
					{:else}
						<p class="text-muted-foreground text-center py-4 text-sm">
							No media project usage yet
						</p>
					{/if}
				</div>

				<div>
					<h4
						class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3"
					>
						Event Mix
					</h4>
					{#if mediaUsage.by_event_type.length > 0}
						<div class="space-y-2">
							{#each mediaUsage.by_event_type.slice(0, 6) as row}
								<div class="flex items-center justify-between gap-2 text-sm">
									<span class="text-foreground truncate">{row.event_type}</span>
									<span class="text-muted-foreground shrink-0">
										{formatNumber(row.count)}
									</span>
								</div>
							{/each}
						</div>
					{:else}
						<p class="text-muted-foreground text-center py-4 text-sm">
							No media events yet
						</p>
					{/if}
				</div>
			</div>
		</div>

		<!-- Runtime Distribution & Users -->
		<div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
			<!-- Runtime Distribution -->
			<div class="bg-card border border-border rounded-lg p-4 shadow-ink tx tx-frame tx-weak">
				<h3 class="text-sm font-semibold text-foreground mb-4">Runtime Routes</h3>
				{#if runtimeDistribution.first_actions.length > 0}
					<div class="space-y-4">
						{#each runtimeDistribution.first_actions.slice(0, 6) as route}
							<div>
								<div class="flex items-center justify-between gap-3 mb-2">
									<div class="min-w-0">
										<div class="text-sm font-medium text-foreground truncate">
											{route.label}
										</div>
										<div class="text-xs text-muted-foreground">
											{formatPercentage(route.share)} share • {formatPercentage(
												route.success_rate
											)}
											success • p95 {formatDuration(route.p95_duration_ms)}
										</div>
									</div>
									<span class="text-sm font-bold text-foreground shrink-0">
										{formatNumber(route.count)}
									</span>
								</div>
								<div class="w-full bg-muted rounded-full h-2.5">
									<div
										class="bg-info h-2.5 rounded-full transition-all duration-300 motion-reduce:transition-none"
										style="width: {distributionWidth(
											route,
											runtimeDistribution.first_actions
										)}"
									></div>
								</div>
							</div>
						{/each}
					</div>
					<div class="mt-4 text-xs text-muted-foreground">
						{formatPercentage(dashboardKPIs.gatewayEnabledRate)} gateway • {formatPercentage(
							dashboardKPIs.prewarmedContextRate
						)}
						prewarmed • {formatPercentage(dashboardKPIs.cacheHitRate)} cache hits
					</div>
				{:else}
					<p class="text-muted-foreground text-center py-4 text-sm">
						No runtime route data available
					</p>
				{/if}
			</div>

			<!-- Top Users -->
			<div class="bg-card border border-border rounded-lg p-4 shadow-ink tx tx-frame tx-weak">
				<h3 class="text-sm font-semibold text-foreground mb-4">Top Users</h3>
				{#if topUsers.length > 0}
					<div class="space-y-3 max-h-48 overflow-y-auto scrollbar-thin">
						{#each topUsers.slice(0, 5) as user}
							<div class="flex items-center justify-between gap-2">
								<div class="flex-1 min-w-0">
									<div class="text-sm font-medium text-foreground truncate">
										{user.email}
									</div>
									<div class="text-xs text-muted-foreground">
										{formatNumber(user.turn_count)} turns • {formatCompact(
											user.total_tokens
										)}
										tokens • {formatCurrency(user.total_cost)}
									</div>
								</div>
								<div class="text-sm font-bold text-info shrink-0">
									{formatNumber(user.session_count)} sessions
								</div>
							</div>
						{/each}
					</div>
				{:else}
					<p class="text-muted-foreground text-center py-4 text-sm">No data available</p>
				{/if}
			</div>
		</div>

		<!-- Real-time Activity Feed -->
		<div class="bg-card border border-border rounded-lg p-4 shadow-ink tx tx-frame tx-weak">
			<h3 class="text-sm font-semibold text-foreground mb-4">Recent Activity</h3>
			{#if activityFeed.length > 0}
				<div
					class="space-y-3 max-h-80 overflow-y-auto scrollbar-thin pr-2"
					role="log"
					aria-label="Recent activity feed"
				>
					{#each activityFeed as event}
						{@const ActivityIcon = getActivityIcon(event.type)}
						<div class="flex items-start gap-3 text-sm">
							<ActivityIcon class="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
							<div class="flex-1 min-w-0">
								<div class="text-foreground">
									<span class="font-medium">{event.user_email}</span>
									<span class="text-muted-foreground"> {event.details}</span>
								</div>
								<div class="text-xs text-muted-foreground mt-0.5">
									{event.timestamp.toLocaleString()}
									{#if event.tokens_used}
										· {formatNumber(event.tokens_used)} tokens
									{/if}
								</div>
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<p class="text-muted-foreground text-center py-8 text-sm">No recent activity</p>
			{/if}
		</div>
	{/if}

	<div class="mt-8">
		<LlmUsageStatsPanel days={llmDays} refreshKey={llmRefreshKey} />
	</div>
</div>
