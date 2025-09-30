<!-- apps/web/src/lib/components/briefs/DailyBriefSection.svelte -->
<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import {
		Plus,
		ChevronDown,
		ChevronUp,
		Loader2,
		Clock,
		RefreshCw,
		Download,
		Copy,
		Sparkles,
		ArrowRight,
		Mail
	} from 'lucide-svelte';
	import {
		BriefClientService,
		streamingStatus,
		streamingBriefData,
		briefGenerationCompleted
	} from '$lib/services/briefClient.service';
	import { RealtimeBriefService } from '$lib/services/realtimeBrief.service';
	import type { DailyBrief, StreamingBriefData, StreamingStatus } from '$lib/types/daily-brief';
	import { renderMarkdown } from '$lib/utils/markdown';
	import { toastService } from '$lib/stores/toast.store';
	import Button from '$lib/components/ui/Button.svelte';
	import { getContext } from 'svelte';
	import { briefPreferencesStore } from '$lib/stores/briefPreferences';

	export let user: { id: string; email: string; is_admin: boolean } | null = null;

	// Get supabase client from context
	let supabaseClient: any = null;
	try {
		supabaseClient = getContext('supabase');
	} catch (e) {
		console.warn('Supabase context not available');
	}

	// Component state
	let isExpanded = false;
	let dailyBrief: DailyBrief | null = null;
	let isLoading = true;
	let currentDate = '';
	let userTimezone = '';
	let emailOptInLoading = false;

	// Email opt-in state
	$: briefPreferences = $briefPreferencesStore.preferences;
	$: hasEmailOptIn = briefPreferences?.email_daily_brief || false;

	// Reactive streaming data
	let currentStreamingStatus: StreamingStatus;
	let currentStreamingData: StreamingBriefData;

	// Subscribe to stores
	const unsubscribeStatus = streamingStatus.subscribe((value) => {
		currentStreamingStatus = value;
	});

	const unsubscribeData = streamingBriefData.subscribe((value) => {
		currentStreamingData = value;
	});

	const unsubscribeCompletion = briefGenerationCompleted.subscribe((value) => {
		if (value) {
			fetchTodaysBrief();
		}
	});

	// Get user's timezone and today's date
	function getUserTimezone(): string {
		return Intl.DateTimeFormat().resolvedOptions().timeZone;
	}

	function getTodayInTimezone(timezone: string): string {
		const formatter = new Intl.DateTimeFormat('en-CA', {
			timeZone: timezone,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit'
		});
		return formatter.format(new Date());
	}

	// Fetch today's brief
	async function fetchTodaysBrief() {
		if (!browser) return;

		isLoading = true;
		try {
			const params = new URLSearchParams();
			params.set('date', currentDate);
			params.set('view', 'single');
			params.set('timezone', userTimezone);

			const response = await fetch(`/briefs?${params.toString()}`);
			if (!response.ok) {
				throw new Error('Failed to fetch brief data');
			}

			const result = await response.json();
			if (result.success) {
				dailyBrief = result.data.dailyBrief;
			}
		} catch (error) {
			console.error("Error fetching today's brief:", error);
		} finally {
			isLoading = false;
		}
	}

	// Generate daily brief
	async function generateDailyBrief(forceRegenerate = false) {
		if (!browser || !user) return;

		try {
			// Initialize RealtimeBriefService if needed
			if (!RealtimeBriefService.isInitialized() && supabaseClient) {
				await RealtimeBriefService.initialize(user.id, supabaseClient, userTimezone);
			}

			await BriefClientService.startStreamingGeneration({
				briefDate: currentDate,
				forceRegenerate,
				user,
				timezone: userTimezone,
				supabaseClient
			});
		} catch (err) {
			console.error('Error starting generation:', err);
			const errorMessage =
				err instanceof Error ? err.message : 'Failed to start brief generation';
			toastService.error(errorMessage);
		}
	}

	// Cancel generation
	function cancelGeneration() {
		BriefClientService.cancelGeneration();
	}

	// Export brief
	async function exportBrief() {
		if (!dailyBrief) return;
		try {
			await BriefClientService.exportBrief(dailyBrief);
			toastService.success('Brief exported successfully');
		} catch (err) {
			console.error('Error exporting brief:', err);
			toastService.error('Failed to export brief');
		}
	}

	// Copy brief
	async function copyBrief() {
		if (!dailyBrief) return;
		try {
			await BriefClientService.copyBrief(dailyBrief);
			toastService.success('Brief copied to clipboard');
		} catch (err) {
			console.error('Error copying brief:', err);
			toastService.error('Failed to copy brief');
		}
	}

	// Format date time
	function formatDateTime(dateString: string, format: 'time' | 'full' = 'time'): string {
		const date = new Date(dateString);
		const options: Intl.DateTimeFormatOptions =
			format === 'time'
				? { hour: '2-digit', minute: '2-digit' }
				: {
						weekday: 'short',
						month: 'short',
						day: 'numeric',
						hour: '2-digit',
						minute: '2-digit'
					};
		return date.toLocaleString('en-US', options);
	}

	// Enable email notifications
	async function enableEmailNotifications() {
		emailOptInLoading = true;
		try {
			const updatedPreferences = {
				...briefPreferences,
				email_daily_brief: true
			};
			await briefPreferencesStore.save(updatedPreferences);
			toastService.success(
				"Email notifications enabled! You'll receive your daily briefs in your inbox."
			);
		} catch (error) {
			toastService.error('Failed to enable email notifications');
		} finally {
			emailOptInLoading = false;
		}
	}

	// Calculate overall progress
	$: overallProgress = currentStreamingStatus
		? Math.round(
				(currentStreamingStatus.progress.projects.completed /
					Math.max(1, currentStreamingStatus.progress.projects.total)) *
					100
			)
		: 0;

	// Show generated brief from streaming data while actively generating
	$: displayDailyBrief =
		currentStreamingData?.mainBrief && currentStreamingStatus?.isGenerating
			? {
					...dailyBrief,
					id: currentStreamingData.mainBrief.id,
					summary_content: currentStreamingData.mainBrief.content,
					priority_actions: currentStreamingData.mainBrief.priority_actions,
					generation_completed_at: new Date().toISOString()
				}
			: dailyBrief;

	onMount(() => {
		if (browser) {
			userTimezone = getUserTimezone();
			currentDate = getTodayInTimezone(userTimezone);
			fetchTodaysBrief();

			// Load brief preferences for email opt-in
			if (!briefPreferences) {
				briefPreferencesStore.load();
			}
		}
	});

	onDestroy(() => {
		unsubscribeStatus();
		unsubscribeData();
		unsubscribeCompletion();
	});
</script>

<div class="mb-6">
	<!-- Consistent height container to prevent layout shift -->
	<div class="daily-brief-container">
		{#if isLoading}
			<!-- Loading state -->
			<div class="daily-brief-card loading-state">
				<div class="card-header">
					<div class="card-title">
						<span class="icon-pill">
							<Loader2 class="w-4 h-4 text-blue-600 animate-spin" />
						</span>
						<div>
							<h3 class="card-heading">Fetching your daily brief</h3>
							<p class="card-subheading">
								We are gathering the latest project updates.
							</p>
						</div>
					</div>
				</div>
				<div class="loading-placeholder">
					<span class="loading-line"></span>
					<span class="loading-line"></span>
					<span class="loading-line short"></span>
				</div>
			</div>
		{:else if currentStreamingStatus?.isGenerating}
			<!-- Generation progress -->
			<div class="daily-brief-card generation-state">
				<div class="card-header">
					<div class="card-title">
						<span class="icon-pill">
							<Loader2 class="w-4 h-4 text-blue-600 animate-spin" />
						</span>
						<div class="min-w-0">
							<h3 class="card-heading">Generating Daily Brief</h3>
							<p class="card-subheading">
								{currentStreamingStatus.message}
							</p>
						</div>
					</div>
					<div class="card-actions">
						<Button
							type="button"
							on:click={cancelGeneration}
							variant="ghost"
							size="sm"
							class="card-action"
							title="Cancel"
						>
							Cancel
						</Button>
					</div>
				</div>

				{#if currentStreamingStatus?.progress?.projects?.total}
					<div class="generation-progress">
						<div class="progress-meta">
							<span>
								Step {currentStreamingStatus.progress.projects.completed} of
								{currentStreamingStatus.progress.projects.total}
							</span>
							<span>{overallProgress}%</span>
						</div>
						<div class="progress-bar">
							<div class="progress-bar__fill" style="width: {overallProgress}%"></div>
						</div>
					</div>
				{/if}

				{#if currentStreamingData?.mainBrief?.content}
					<div class="generation-preview">
						<p class="preview-label">Live preview</p>
						<p class="preview-content">
							{currentStreamingData.mainBrief.content
								.replace(/[#*]/g, '')
								.substring(0, 220)}...
						</p>
					</div>
				{/if}
			</div>
		{:else if displayDailyBrief}
			<!-- Daily brief display (collapsed/expanded) -->
			<div class="daily-brief-card display-state">
				<!-- Header (always visible) -->
				<div class="card-header">
					<div class="card-title">
						<span class="icon-pill">
							<Sparkles class="w-4 h-4 text-blue-600 dark:text-blue-400" />
						</span>
						<div class="min-w-0">
							<h3 class="card-heading">Today's Daily Brief</h3>
							{#if displayDailyBrief.generation_completed_at}
								<div class="card-meta">
									<Clock class="w-3 h-3 mr-1" />
									{formatDateTime(
										displayDailyBrief.generation_completed_at,
										'time'
									)}
								</div>
							{/if}
						</div>
					</div>
					<div class="card-actions">
						{#if isExpanded}
							<!-- Email opt-in button if not opted in -->
							{#if !hasEmailOptIn && !$briefPreferencesStore.isLoading}
								<Button
									type="button"
									on:click={enableEmailNotifications}
									variant="primary"
									size="sm"
									loading={emailOptInLoading}
									class="email-button"
									title="Get daily briefs in your inbox"
								>
									<Mail class="w-4 h-4 mr-1.5" />
									Get Emails
								</Button>
							{/if}

							<Button
								type="button"
								on:click={exportBrief}
								variant="ghost"
								size="sm"
								class="card-action"
								title="Export"
								icon={Download}
							></Button>
							<Button
								type="button"
								on:click={copyBrief}
								variant="ghost"
								size="sm"
								class="card-action"
								title="Copy"
								icon={Copy}
							></Button>
							<Button
								type="button"
								on:click={() => generateDailyBrief(true)}
								disabled={currentStreamingStatus?.isGenerating}
								variant="ghost"
								size="sm"
								class="card-action"
								title="Regenerate"
								icon={RefreshCw}
							></Button>
						{/if}
						<Button
							type="button"
							on:click={() => (isExpanded = !isExpanded)}
							variant="ghost"
							size="sm"
							class="toggle-button"
							title={isExpanded ? 'Collapse' : 'Expand'}
							icon={isExpanded ? ChevronUp : ChevronDown}
						></Button>
					</div>
				</div>

				{#if !isExpanded && displayDailyBrief.summary_content}
					<!-- Collapsed preview - SINGLE LINE ONLY -->
					<div class="collapsed-preview">
						<p class="preview-text">
							{displayDailyBrief.summary_content
								.replace(/[#*]/g, '')
								.substring(0, 200)}...
						</p>
						{#if displayDailyBrief.priority_actions?.length}
							<span class="preview-pill">
								<ArrowRight class="w-3 h-3" />
								{displayDailyBrief.priority_actions.length} priority action{displayDailyBrief
									.priority_actions.length !== 1
									? 's'
									: ''}
							</span>
						{/if}
					</div>
				{/if}

				{#if isExpanded}
					<!-- Expanded content -->
					<div class="expanded-body">
						<div
							class="brief-markdown prose prose-gray dark:prose-invert max-w-none prose-sm
						prose-headings:text-gray-900 prose-p:text-gray-700 prose-li:text-gray-700
						prose-strong:text-gray-900 prose-a:text-blue-600
						dark:prose-headings:text-white dark:prose-p:text-gray-300 dark:prose-li:text-gray-300
						dark:prose-strong:text-white dark:prose-a:text-blue-400"
						>
							{@html renderMarkdown(displayDailyBrief.summary_content)}
						</div>

						{#if displayDailyBrief.priority_actions?.length}
							<div class="priority-card">
								<h4 class="priority-heading">
									<ArrowRight class="w-4 h-4" />
									Priority Actions
								</h4>
								<ul class="priority-list">
									{#each displayDailyBrief.priority_actions as action}
										<li class="priority-item">
											<ArrowRight class="w-3 h-3" />
											<span>{action}</span>
										</li>
									{/each}
								</ul>
							</div>
						{/if}
					</div>
				{/if}
			</div>
		{:else}
			<!-- No brief - show generate button -->
			<div class="daily-brief-card no-brief-state">
				<div class="card-header">
					<div class="card-title">
						<span class="icon-pill">
							<Sparkles class="w-4 h-4 text-blue-600 dark:text-blue-400" />
						</span>
						<div>
							<h3 class="card-heading">Get your daily brief</h3>
							<p class="card-subheading">
								See priorities and project updates in one view.
							</p>
						</div>
					</div>
					<Button
						type="button"
						on:click={() => generateDailyBrief()}
						disabled={currentStreamingStatus?.isGenerating || !user}
						loading={currentStreamingStatus?.isGenerating}
						variant="primary"
						size="md"
						class="generate-button"
						icon={Plus}
					>
						{#if currentStreamingStatus?.isGenerating}
							Generating...
						{:else}
							Generate Brief
						{/if}
					</Button>
				</div>
			</div>
		{/if}
	</div>
</div>

<style>
	/* Height reservation container to prevent layout shift */
	.daily-brief-container {
		min-height: 120px; /* Reserve space for basic states */
		transition: min-height 0.2s ease-out;
	}

	/* Base card styling for all states */
	.daily-brief-card {
		border-radius: 0.75rem;
		box-shadow: 0 10px 25px -12px rgb(30 41 59 / 0.25);
		border: 1px solid #e5e7eb;
		background: white;
		padding: 1.25rem;
		transition: all 0.2s ease-out;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	/* Dark mode for cards */
	:global(.dark) .daily-brief-card {
		background: #1f2937; /* bg-gray-800 */
		border-color: #374151; /* border-gray-700 */
	}

	/* State-specific styling */
	.loading-state {
		min-height: 140px;
	}

	.generation-state {
		border-color: #bfdbfe;
		background: linear-gradient(135deg, #eff6ff 0%, #ffffff 55%);
		gap: 1.25rem;
	}

	:global(.dark) .generation-state {
		border-color: #1e3a8a;
		background: linear-gradient(135deg, rgba(30, 64, 175, 0.2), rgba(30, 58, 138, 0.05));
	}

	.display-state {
		min-height: 120px;
		gap: 0.75rem;
	}

	.no-brief-state {
		background: linear-gradient(120deg, #eff6ff, #e0e7ff);
		border-color: #bfdbfe;
		min-height: 120px;
	}

	:global(.dark) .no-brief-state {
		background: linear-gradient(to right, #1f2937, #1f2937);
		border-color: #1e3a8a;
	}

	/* Compact single line clamp for text content */
	.line-clamp-1 {
		display: -webkit-box;
		-webkit-line-clamp: 1;
		line-clamp: 1;
		-webkit-box-orient: vertical;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.card-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
	}

	.card-title {
		display: flex;
		gap: 0.75rem;
		align-items: flex-start;
	}

	.icon-pill {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: 9999px;
		padding: 0.45rem;
		background: rgba(59, 130, 246, 0.12);
	}

	:global(.dark) .icon-pill {
		background: rgba(96, 165, 250, 0.15);
	}

	.card-heading {
		font-size: 1rem;
		font-weight: 600;
		color: #111827;
		margin: 0;
	}

	:global(.dark) .card-heading {
		color: white;
	}

	.card-subheading {
		margin: 0.15rem 0 0 0;
		font-size: 0.9rem;
		color: #475569;
	}

	:global(.dark) .card-subheading {
		color: #94a3b8;
	}

	.card-meta {
		display: flex;
		align-items: center;
		font-size: 0.75rem;
		color: #6b7280;
		margin-top: 0.25rem;
	}

	:global(.dark) .card-meta {
		color: #9ca3af;
	}

	.card-actions {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		flex-wrap: wrap;
		justify-content: flex-end;
	}

	.card-action {
		padding: 0.35rem;
		color: #64748b;
	}

	.card-action:hover {
		color: #2563eb;
	}

	.toggle-button {
		padding: 0.35rem;
		color: #475569;
	}

	.toggle-button:hover {
		color: #1f2937;
	}

	:global(.dark) .toggle-button {
		color: #9ca3af;
	}

	:global(.dark) .toggle-button:hover {
		color: white;
	}

	.email-button {
		padding: 0.35rem 0.75rem;
	}

	.generate-button {
		box-shadow: 0 10px 20px -15px rgb(30 64 175 / 0.55);
	}

	.loading-placeholder {
		display: grid;
		gap: 0.5rem;
	}

	.loading-line {
		display: block;
		height: 0.6rem;
		border-radius: 9999px;
		background: linear-gradient(90deg, #e2e8f0, #f1f5f9, #e2e8f0);
		background-size: 200% 100%;
		animation: shimmer 1.4s ease-in-out infinite;
	}

	.loading-line.short {
		width: 60%;
	}

	:global(.dark) .loading-line {
		background: linear-gradient(90deg, #334155, #475569, #334155);
	}

	@keyframes shimmer {
		0% {
			background-position: 200% 0;
		}
		100% {
			background-position: -200% 0;
		}
	}

	.generation-progress {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}

	.progress-meta {
		display: flex;
		justify-content: space-between;
		font-size: 0.75rem;
		color: #1d4ed8;
	}

	:global(.dark) .progress-meta {
		color: #60a5fa;
	}

	.progress-bar {
		width: 100%;
		height: 0.5rem;
		border-radius: 9999px;
		background: rgba(59, 130, 246, 0.2);
		overflow: hidden;
	}

	:global(.dark) .progress-bar {
		background: rgba(59, 130, 246, 0.25);
	}

	.progress-bar__fill {
		height: 100%;
		border-radius: 9999px;
		background: linear-gradient(90deg, #2563eb, #3b82f6);
		transition: width 0.4s ease;
	}

	.generation-preview {
		border-radius: 0.75rem;
		background: rgba(59, 130, 246, 0.08);
		padding: 0.75rem 0.9rem;
	}

	:global(.dark) .generation-preview {
		background: rgba(37, 99, 235, 0.18);
	}

	.preview-label {
		font-size: 0.7rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: #2563eb;
		margin: 0 0 0.35rem 0;
	}

	:global(.dark) .preview-label {
		color: #bfdbfe;
	}

	.preview-content {
		margin: 0;
		font-size: 0.85rem;
		color: #1e3a8a;
	}

	:global(.dark) .preview-content {
		color: #e0e7ff;
	}

	.collapsed-preview {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.65rem 0.85rem;
		border-radius: 0.65rem;
		background: #f8fafc;
		border: 1px solid #e2e8f0;
	}

	:global(.dark) .collapsed-preview {
		background: rgba(148, 163, 184, 0.08);
		border-color: rgba(148, 163, 184, 0.3);
	}

	.preview-text {
		flex: 1;
		margin: 0;
		font-size: 0.85rem;
		color: #475569;
	}

	:global(.dark) .preview-text {
		color: #cbd5f5;
	}

	.preview-pill {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.3rem 0.6rem;
		border-radius: 9999px;
		background: rgba(96, 165, 250, 0.2);
		font-size: 0.75rem;
		color: #1e3a8a;
	}

	:global(.dark) .preview-pill {
		background: rgba(96, 165, 250, 0.25);
		color: #bfdbfe;
	}

	.expanded-body {
		border-top: 1px solid #e5e7eb;
		padding-top: 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	:global(.dark) .expanded-body {
		border-color: #374151;
	}

	.brief-markdown {
		line-height: 1.6;
	}

	.priority-card {
		border-radius: 0.75rem;
		padding: 1rem;
		background: rgba(37, 99, 235, 0.08);
		border: 1px solid rgba(37, 99, 235, 0.18);
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
	}

	:global(.dark) .priority-card {
		background: rgba(37, 99, 235, 0.18);
		border-color: rgba(59, 130, 246, 0.28);
	}

	.priority-heading {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		font-weight: 600;
		margin: 0;
		font-size: 0.9rem;
		color: #1e3a8a;
	}

	:global(.dark) .priority-heading {
		color: #bfdbfe;
	}

	.priority-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.75rem;
	}

	.priority-item {
		display: inline-flex;
		align-items: flex-start;
		gap: 0.5rem;
		font-size: 0.9rem;
		color: #1e40af;
	}

	:global(.dark) .priority-item {
		color: #dbeafe;
	}

	/* Fade-in animation for state changes */
	.daily-brief-card {
		animation: fade-in 0.3s ease-out;
	}

	@keyframes fade-in {
		from {
			opacity: 0;
			transform: translateY(-4px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>
