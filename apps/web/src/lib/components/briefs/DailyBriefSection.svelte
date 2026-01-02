<!-- apps/web/src/lib/components/briefs/DailyBriefSection.svelte -->
<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { Plus, Loader2, Clock, Sparkles, ArrowRight, Mail, ChevronRight } from 'lucide-svelte';
	import {
		BriefClientService,
		streamingStatus,
		streamingBriefData,
		briefGenerationCompleted
	} from '$lib/services/briefClient.service';
	import { RealtimeBriefService } from '$lib/services/realtimeBrief.service';
	import type { DailyBrief, StreamingBriefData, StreamingStatus } from '$lib/types/daily-brief';
	import { getMarkdownPreview } from '$lib/utils/markdown';
	import { toastService, TOAST_DURATION } from '$lib/stores/toast.store';
	import Button from '$lib/components/ui/Button.svelte';
	import { getContext } from 'svelte';
	import { notificationPreferencesStore } from '$lib/stores/notificationPreferences';

	// Props using Svelte 5 runes syntax
	let {
		user = null,
		onViewBrief
	}: {
		user?: { id: string; email: string; is_admin: boolean } | null;
		onViewBrief?: (data: { briefId: string; briefDate: string }) => void;
	} = $props();

	// Get supabase client from context
	let supabaseClient: any = null;
	try {
		supabaseClient = getContext('supabase');
	} catch (e) {
		console.warn('Supabase context not available');
	}

	// Component state (Svelte 5 $state for reactivity)
	let dailyBrief = $state<DailyBrief | null>(null);
	let isLoading = $state(true);
	let currentDate = $state('');
	let userTimezone = $state('');
	let emailOptInLoading = $state(false);

	// Email opt-in state (using Svelte 5 $derived)
	let notificationPreferences = $derived($notificationPreferencesStore.preferences);
	let hasEmailOptIn = $derived(notificationPreferences?.should_email_daily_brief || false);

	// Reactive streaming data (Svelte 5 $state for reactivity)
	let currentStreamingStatus = $state<StreamingStatus | null>(null);
	let currentStreamingData = $state<StreamingBriefData | null>(null);

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

	// Handle click on brief card - call callback to open modal
	function handleViewBrief() {
		if (displayDailyBrief?.id && displayDailyBrief?.brief_date && onViewBrief) {
			onViewBrief({
				briefId: displayDailyBrief.id,
				briefDate: displayDailyBrief.brief_date
			});
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
			await notificationPreferencesStore.save({
				should_email_daily_brief: true
			});
			toastService.success(
				"Email notifications enabled! You'll receive your daily briefs in your inbox."
			);
		} catch (error) {
			toastService.error('Failed to enable email notifications', {
				action: {
					label: 'Retry',
					onClick: () => enableEmailNotifications()
				}
			});
		} finally {
			emailOptInLoading = false;
		}
	}

	// Calculate overall progress (using Svelte 5 $derived)
	let overallProgress = $derived(
		currentStreamingStatus
			? Math.round(
					(currentStreamingStatus.progress.projects.completed /
						Math.max(1, currentStreamingStatus.progress.projects.total)) *
						100
				)
			: 0
	);

	// Show generated brief from streaming data while actively generating (using Svelte 5 $derived)
	let displayDailyBrief = $derived(
		currentStreamingData?.mainBrief && currentStreamingStatus?.isGenerating
			? {
					...dailyBrief,
					id: currentStreamingData.mainBrief.id,
					summary_content: currentStreamingData.mainBrief.content,
					priority_actions: currentStreamingData.mainBrief.priority_actions,
					generation_completed_at: new Date().toISOString()
				}
			: dailyBrief
	);

	onMount(() => {
		if (browser) {
			userTimezone = getUserTimezone();
			currentDate = getTodayInTimezone(userTimezone);
			fetchTodaysBrief();

			// Load notification preferences for email opt-in
			if (!notificationPreferences) {
				notificationPreferencesStore.load();
			}
		}
	});

	onDestroy(() => {
		unsubscribeStatus();
		unsubscribeData();
		unsubscribeCompletion();
	});
</script>

<div class="mb-3 sm:mb-6">
	<!-- Consistent height container to prevent layout shift -->
	<div class="daily-brief-container">
		{#if isLoading}
			<!-- Loading state -->
			<div class="daily-brief-card loading-state">
				<div class="card-header">
					<div class="card-title">
						<span class="icon-pill">
							<Loader2 class="w-3 h-3 sm:w-4 sm:h-4 text-accent animate-spin" />
						</span>
						<div>
							<h3 class="card-heading">Fetching your daily brief</h3>
							<p class="card-subheading hidden sm:block">
								We are gathering the latest project updates.
							</p>
						</div>
					</div>
				</div>
				<div class="loading-placeholder hidden sm:grid">
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
							<Loader2 class="w-3 h-3 sm:w-4 sm:h-4 text-accent animate-spin" />
						</span>
						<div class="min-w-0">
							<h3 class="card-heading">Generating Brief</h3>
							<p class="card-subheading line-clamp-1">
								{currentStreamingStatus.message}
							</p>
						</div>
					</div>
					<div class="card-actions">
						<Button
							type="button"
							onclick={cancelGeneration}
							variant="ghost"
							size="sm"
							class="card-action text-xs sm:text-sm"
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
							{getMarkdownPreview(currentStreamingData.mainBrief.content, 220)}
						</p>
					</div>
				{/if}
			</div>
		{:else if displayDailyBrief}
			<!-- Daily brief display - clickable card -->
			<button
				type="button"
				class="daily-brief-card display-state clickable-card"
				onclick={handleViewBrief}
				aria-label="View full daily brief"
			>
				<!-- Header -->
				<div class="card-header">
					<div class="card-title">
						<span class="icon-pill">
							<Sparkles class="w-3 h-3 sm:w-4 sm:h-4 text-accent dark:text-accent" />
						</span>
						<div class="min-w-0 flex-1">
							<h3 class="card-heading">Today's Brief</h3>
							{#if displayDailyBrief.generation_completed_at}
								<div class="card-meta">
									<Clock class="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-0.5 sm:mr-1" />
									{formatDateTime(
										displayDailyBrief.generation_completed_at,
										'time'
									)}
								</div>
							{/if}
						</div>
					</div>
					<div class="card-view-indicator">
						<ChevronRight class="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground" />
					</div>
				</div>

				<!-- Preview content -->
				{#if displayDailyBrief.summary_content}
					<div class="collapsed-preview">
						<p class="preview-text">
							{getMarkdownPreview(displayDailyBrief.summary_content, 120)}
						</p>
						{#if displayDailyBrief.priority_actions?.length}
							<span class="preview-pill">
								<ArrowRight class="w-2.5 h-2.5 sm:w-3 sm:h-3" />
								<span class="hidden sm:inline">{displayDailyBrief.priority_actions.length} priority action{displayDailyBrief.priority_actions.length !== 1 ? 's' : ''}</span>
								<span class="sm:hidden">{displayDailyBrief.priority_actions.length}</span>
							</span>
						{/if}
					</div>
				{/if}
			</button>

			<!-- Email opt-in banner (outside clickable card) - hidden on very small screens -->
			{#if !hasEmailOptIn && !$notificationPreferencesStore.isLoading}
				<div class="email-cta-banner mt-2 sm:mt-3">
					<div class="flex items-center gap-1.5 sm:gap-2 flex-1 min-w-0">
						<Mail class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-accent dark:text-accent flex-shrink-0" />
						<p class="text-xs sm:text-sm text-muted-foreground truncate">
							<span class="hidden sm:inline">Want this delivered to your inbox each morning?</span>
							<span class="sm:hidden">Get this via email?</span>
						</p>
					</div>
					<Button
						type="button"
						onclick={(e) => {
							e.stopPropagation();
							enableEmailNotifications();
						}}
						variant="primary"
						size="sm"
						loading={emailOptInLoading}
						class="flex-shrink-0 text-xs sm:text-sm"
					>
						<span class="hidden sm:inline">Enable Emails</span>
						<span class="sm:hidden">Enable</span>
					</Button>
				</div>
			{/if}
		{:else}
			<!-- No brief - show generate button -->
			<div class="daily-brief-card no-brief-state">
				<div class="card-header">
					<div class="card-title">
						<span class="icon-pill">
							<Sparkles class="w-3 h-3 sm:w-4 sm:h-4 text-accent dark:text-accent" />
						</span>
						<div>
							<h3 class="card-heading">Get your daily brief</h3>
							<p class="card-subheading hidden sm:block">
								See priorities and project updates in one view.
							</p>
						</div>
					</div>
					<Button
						type="button"
						onclick={() => generateDailyBrief()}
						disabled={currentStreamingStatus?.isGenerating || !user}
						loading={currentStreamingStatus?.isGenerating}
						variant="primary"
						size="sm"
						class="generate-button text-xs sm:text-sm"
						icon={Plus}
					>
						{#if currentStreamingStatus?.isGenerating}
							<span class="hidden sm:inline">Generating...</span>
							<span class="sm:hidden">...</span>
						{:else}
							<span class="hidden sm:inline">Generate Brief</span>
							<span class="sm:hidden">Generate</span>
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
		min-height: 80px; /* Reserve space for basic states - compact on mobile */
		transition: min-height 0.2s ease-out;
	}

	@media (min-width: 640px) {
		.daily-brief-container {
			min-height: 120px;
		}
	}

	/* Base card styling for all states - Inkprint Design System */
	/* Mobile-first: compact padding and gaps */
	.daily-brief-card {
		border-radius: 0.5rem;
		box-shadow: 0 1px 3px rgba(26, 26, 29, 0.08); /* shadow-ink */
		border: 1px solid hsl(40 10% 85%); /* border */
		background: hsl(40 15% 96%); /* card */
		padding: 0.75rem;
		transition: all 0.2s ease-out;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	@media (min-width: 640px) {
		.daily-brief-card {
			border-radius: 0.75rem;
			padding: 1.25rem;
			gap: 1rem;
		}
	}

	/* Dark mode for cards - Inkprint */
	:global(.dark) .daily-brief-card {
		background: hsl(240 10% 10%); /* card dark */
		border-color: hsl(240 10% 18%); /* border dark */
	}

	/* State-specific styling */
	.loading-state {
		min-height: 80px;
	}

	@media (min-width: 640px) {
		.loading-state {
			min-height: 140px;
		}
	}

	/* Generation state - Inkprint accent (warm orange-amber) */
	.generation-state {
		position: relative;
		border-color: hsl(24 80% 80%); /* accent light border */
		background: hsl(24 60% 97%); /* accent very light bg */
		gap: 1.25rem;
	}

	.generation-state::before {
		content: '';
		position: absolute;
		inset: 0;
		background-image: url("data:image/svg+xml,%3Csvg width='4' height='4' xmlns='http://www.w3.org/2000/svg'%3E%3Crect width='4' height='4' fill='rgba(0,0,0,0)'/%3E%3Ccircle cx='0' cy='0' r='0.5' fill='rgb(0,0,0)'/%3E%3Ccircle cx='2' cy='1' r='0.5' fill='rgb(0,0,0)'/%3E%3Ccircle cx='1' cy='2' r='0.5' fill='rgb(0,0,0)'/%3E%3Ccircle cx='3' cy='3' r='0.5' fill='rgb(0,0,0)'/%3E%3C/svg%3E");
		background-size: 4px 4px;
		mix-blend-mode: overlay;
		opacity: 0.12;
		pointer-events: none;
		border-radius: 0.75rem;
	}

	:global(.dark) .generation-state {
		border-color: hsl(24 60% 30%);
		background: hsl(24 40% 12%);
	}

	:global(.dark) .generation-state::before {
		background-image: url("data:image/svg+xml,%3Csvg width='4' height='4' xmlns='http://www.w3.org/2000/svg'%3E%3Crect width='4' height='4' fill='rgba(0,0,0,0)'/%3E%3Ccircle cx='0' cy='0' r='0.5' fill='rgb(255,255,255)'/%3E%3Ccircle cx='2' cy='1' r='0.5' fill='rgb(255,255,255)'/%3E%3Ccircle cx='1' cy='2' r='0.5' fill='rgb(255,255,255)'/%3E%3Ccircle cx='3' cy='3' r='0.5' fill='rgb(255,255,255)'/%3E%3C/svg%3E");
		mix-blend-mode: soft-light;
		opacity: 0.18;
	}

	.display-state {
		min-height: 70px;
		gap: 0.5rem;
	}

	@media (min-width: 640px) {
		.display-state {
			min-height: 120px;
			gap: 0.75rem;
		}
	}

	/* No brief state - Inkprint accent (warm orange-amber) */
	.no-brief-state {
		position: relative;
		background: hsl(24 60% 97%); /* accent very light bg */
		border-color: hsl(24 80% 80%); /* accent light border */
		min-height: 70px;
	}

	@media (min-width: 640px) {
		.no-brief-state {
			min-height: 120px;
		}
	}

	.no-brief-state::before {
		content: '';
		position: absolute;
		inset: 0;
		background-image: url("data:image/svg+xml,%3Csvg width='4' height='4' xmlns='http://www.w3.org/2000/svg'%3E%3Crect width='4' height='4' fill='rgba(0,0,0,0)'/%3E%3Ccircle cx='0' cy='0' r='0.5' fill='rgb(0,0,0)'/%3E%3Ccircle cx='2' cy='1' r='0.5' fill='rgb(0,0,0)'/%3E%3Ccircle cx='1' cy='2' r='0.5' fill='rgb(0,0,0)'/%3E%3Ccircle cx='3' cy='3' r='0.5' fill='rgb(0,0,0)'/%3E%3C/svg%3E");
		background-size: 4px 4px;
		mix-blend-mode: overlay;
		opacity: 0.12;
		pointer-events: none;
		border-radius: 0.75rem;
	}

	:global(.dark) .no-brief-state {
		background: hsl(24 40% 12%);
		border-color: hsl(24 60% 30%);
	}

	:global(.dark) .no-brief-state::before {
		background-image: url("data:image/svg+xml,%3Csvg width='4' height='4' xmlns='http://www.w3.org/2000/svg'%3E%3Crect width='4' height='4' fill='rgba(0,0,0,0)'/%3E%3Ccircle cx='0' cy='0' r='0.5' fill='rgb(255,255,255)'/%3E%3Ccircle cx='2' cy='1' r='0.5' fill='rgb(255,255,255)'/%3E%3Ccircle cx='1' cy='2' r='0.5' fill='rgb(255,255,255)'/%3E%3Ccircle cx='3' cy='3' r='0.5' fill='rgb(255,255,255)'/%3E%3C/svg%3E");
		mix-blend-mode: soft-light;
		opacity: 0.18;
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
		gap: 0.5rem;
	}

	@media (min-width: 640px) {
		.card-header {
			gap: 1rem;
		}
	}

	.card-title {
		display: flex;
		gap: 0.5rem;
		align-items: flex-start;
	}

	@media (min-width: 640px) {
		.card-title {
			gap: 0.75rem;
		}
	}

	/* Icon pill - Inkprint accent */
	.icon-pill {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: 9999px;
		padding: 0.35rem;
		background: hsl(24 80% 55% / 0.12); /* accent with opacity */
	}

	@media (min-width: 640px) {
		.icon-pill {
			padding: 0.45rem;
		}
	}

	:global(.dark) .icon-pill {
		background: hsl(24 80% 55% / 0.18);
	}

	/* Card text - Inkprint semantic colors */
	.card-heading {
		font-size: 0.875rem;
		font-weight: 600;
		color: hsl(240 10% 10%); /* foreground */
		margin: 0;
	}

	@media (min-width: 640px) {
		.card-heading {
			font-size: 1rem;
		}
	}

	:global(.dark) .card-heading {
		color: hsl(40 10% 92%); /* foreground dark */
	}

	.card-subheading {
		margin: 0.1rem 0 0 0;
		font-size: 0.8rem;
		color: hsl(240 5% 45%); /* muted-foreground */
	}

	@media (min-width: 640px) {
		.card-subheading {
			margin: 0.15rem 0 0 0;
			font-size: 0.9rem;
		}
	}

	:global(.dark) .card-subheading {
		color: hsl(40 5% 55%); /* muted-foreground dark */
	}

	.card-meta {
		display: flex;
		align-items: center;
		font-size: 0.75rem;
		color: hsl(240 5% 45%); /* muted-foreground */
		margin-top: 0.25rem;
	}

	:global(.dark) .card-meta {
		color: hsl(40 5% 55%); /* muted-foreground dark */
	}

	.card-actions {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		flex-wrap: wrap;
		justify-content: flex-end;
	}

	/* Card actions - Inkprint accent */
	.card-action {
		padding: 0.35rem;
		color: hsl(240 5% 45%); /* muted-foreground */
	}

	.card-action:hover {
		color: hsl(24 80% 48%); /* accent */
	}

	.toggle-button {
		padding: 0.35rem;
		color: hsl(240 5% 45%); /* muted-foreground */
	}

	.toggle-button:hover {
		color: hsl(240 10% 10%); /* foreground */
	}

	:global(.dark) .toggle-button {
		color: hsl(40 5% 55%); /* muted-foreground dark */
	}

	:global(.dark) .toggle-button:hover {
		color: hsl(40 10% 92%); /* foreground dark */
	}

	.email-button {
		padding: 0.35rem 0.75rem;
	}

	/* Email CTA banner - Inkprint accent */
	.email-cta-banner {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		border-radius: 0.65rem;
		background: hsl(24 60% 97%); /* accent very light */
		border: 1px solid hsl(24 80% 80%); /* accent light border */
		margin-top: 0.5rem;
		overflow: hidden;
	}

	.email-cta-banner::before {
		content: '';
		position: absolute;
		inset: 0;
		background-image: url("data:image/svg+xml,%3Csvg width='4' height='4' xmlns='http://www.w3.org/2000/svg'%3E%3Crect width='4' height='4' fill='rgba(0,0,0,0)'/%3E%3Ccircle cx='0' cy='0' r='0.5' fill='rgb(0,0,0)'/%3E%3Ccircle cx='2' cy='1' r='0.5' fill='rgb(0,0,0)'/%3E%3Ccircle cx='1' cy='2' r='0.5' fill='rgb(0,0,0)'/%3E%3Ccircle cx='3' cy='3' r='0.5' fill='rgb(0,0,0)'/%3E%3C/svg%3E");
		background-size: 4px 4px;
		mix-blend-mode: overlay;
		opacity: 0.12;
		pointer-events: none;
		border-radius: 0.65rem;
	}

	:global(.dark) .email-cta-banner {
		background: hsl(24 40% 12%);
		border-color: hsl(24 60% 30%);
	}

	:global(.dark) .email-cta-banner::before {
		background-image: url("data:image/svg+xml,%3Csvg width='4' height='4' xmlns='http://www.w3.org/2000/svg'%3E%3Crect width='4' height='4' fill='rgba(0,0,0,0)'/%3E%3Ccircle cx='0' cy='0' r='0.5' fill='rgb(255,255,255)'/%3E%3Ccircle cx='2' cy='1' r='0.5' fill='rgb(255,255,255)'/%3E%3Ccircle cx='1' cy='2' r='0.5' fill='rgb(255,255,255)'/%3E%3Ccircle cx='3' cy='3' r='0.5' fill='rgb(255,255,255)'/%3E%3C/svg%3E");
		mix-blend-mode: soft-light;
		opacity: 0.18;
	}

	.email-cta-banner-expanded {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1.25rem;
		border-radius: 0.75rem;
		background: hsl(24 60% 97%); /* accent very light */
		border: 1px solid hsl(24 80% 80%); /* accent light border */
		box-shadow: 0 4px 12px -4px hsl(24 80% 55% / 0.2); /* accent shadow */
		overflow: hidden;
	}

	.email-cta-banner-expanded::before {
		content: '';
		position: absolute;
		inset: 0;
		background-image: url("data:image/svg+xml,%3Csvg width='4' height='4' xmlns='http://www.w3.org/2000/svg'%3E%3Crect width='4' height='4' fill='rgba(0,0,0,0)'/%3E%3Ccircle cx='0' cy='0' r='0.5' fill='rgb(0,0,0)'/%3E%3Ccircle cx='2' cy='1' r='0.5' fill='rgb(0,0,0)'/%3E%3Ccircle cx='1' cy='2' r='0.5' fill='rgb(0,0,0)'/%3E%3Ccircle cx='3' cy='3' r='0.5' fill='rgb(0,0,0)'/%3E%3C/svg%3E");
		background-size: 4px 4px;
		mix-blend-mode: overlay;
		opacity: 0.12;
		pointer-events: none;
		border-radius: 0.75rem;
	}

	:global(.dark) .email-cta-banner-expanded {
		background: hsl(24 40% 15%);
		border-color: hsl(24 60% 35%);
		box-shadow: 0 4px 12px -4px hsl(24 80% 55% / 0.3);
	}

	:global(.dark) .email-cta-banner-expanded::before {
		background-image: url("data:image/svg+xml,%3Csvg width='4' height='4' xmlns='http://www.w3.org/2000/svg'%3E%3Crect width='4' height='4' fill='rgba(0,0,0,0)'/%3E%3Ccircle cx='0' cy='0' r='0.5' fill='rgb(255,255,255)'/%3E%3Ccircle cx='2' cy='1' r='0.5' fill='rgb(255,255,255)'/%3E%3Ccircle cx='1' cy='2' r='0.5' fill='rgb(255,255,255)'/%3E%3Ccircle cx='3' cy='3' r='0.5' fill='rgb(255,255,255)'/%3E%3C/svg%3E");
		mix-blend-mode: soft-light;
		opacity: 0.18;
	}

	.email-cta-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2.5rem;
		height: 2.5rem;
		border-radius: 0.5rem;
		background: hsl(24 80% 55% / 0.15); /* accent with opacity */
		flex-shrink: 0;
	}

	:global(.dark) .email-cta-icon {
		background: hsl(24 80% 55% / 0.25);
	}

	@media (min-width: 640px) {
		.email-cta-banner-expanded {
			flex-direction: row;
			align-items: center;
			justify-content: space-between;
		}
	}

	/* Generate button - Inkprint accent shadow */
	.generate-button {
		box-shadow: 0 10px 20px -15px hsl(24 80% 40% / 0.55);
	}

	.loading-placeholder {
		display: grid;
		gap: 0.5rem;
	}

	/* Loading skeleton - Inkprint muted colors */
	.loading-line {
		position: relative;
		display: block;
		height: 0.6rem;
		border-radius: 9999px;
		background: hsl(40 10% 88%); /* muted */
		background-size: 200% 100%;
		animation: shimmer 1.4s ease-in-out infinite;
		overflow: hidden;
	}

	.loading-line::before {
		content: '';
		position: absolute;
		inset: 0;
		background-image: url("data:image/svg+xml,%3Csvg width='4' height='4' xmlns='http://www.w3.org/2000/svg'%3E%3Crect width='4' height='4' fill='rgba(0,0,0,0)'/%3E%3Ccircle cx='0' cy='0' r='0.5' fill='rgb(0,0,0)'/%3E%3Ccircle cx='2' cy='1' r='0.5' fill='rgb(0,0,0)'/%3E%3Ccircle cx='1' cy='2' r='0.5' fill='rgb(0,0,0)'/%3E%3Ccircle cx='3' cy='3' r='0.5' fill='rgb(0,0,0)'/%3E%3C/svg%3E");
		background-size: 4px 4px;
		mix-blend-mode: overlay;
		opacity: 0.08;
		pointer-events: none;
		border-radius: 9999px;
	}

	.loading-line.short {
		width: 60%;
	}

	:global(.dark) .loading-line {
		background: hsl(240 10% 22%); /* muted dark */
	}

	:global(.dark) .loading-line::before {
		background-image: url("data:image/svg+xml,%3Csvg width='4' height='4' xmlns='http://www.w3.org/2000/svg'%3E%3Crect width='4' height='4' fill='rgba(0,0,0,0)'/%3E%3Ccircle cx='0' cy='0' r='0.5' fill='rgb(255,255,255)'/%3E%3Ccircle cx='2' cy='1' r='0.5' fill='rgb(255,255,255)'/%3E%3Ccircle cx='1' cy='2' r='0.5' fill='rgb(255,255,255)'/%3E%3Ccircle cx='3' cy='3' r='0.5' fill='rgb(255,255,255)'/%3E%3C/svg%3E");
		mix-blend-mode: soft-light;
		opacity: 0.12;
	}

	@keyframes shimmer {
		0% {
			background-position: 200% 0;
		}
		100% {
			background-position: -200% 0;
		}
	}

	/* Progress bar - Inkprint accent */
	.generation-progress {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}

	.progress-meta {
		display: flex;
		justify-content: space-between;
		font-size: 0.75rem;
		color: hsl(24 80% 40%); /* accent darker */
	}

	:global(.dark) .progress-meta {
		color: hsl(24 80% 65%); /* accent lighter */
	}

	.progress-bar {
		width: 100%;
		height: 0.5rem;
		border-radius: 9999px;
		background: hsl(24 80% 55% / 0.2); /* accent with opacity */
		overflow: hidden;
	}

	:global(.dark) .progress-bar {
		background: hsl(24 80% 55% / 0.25);
	}

	.progress-bar__fill {
		position: relative;
		height: 100%;
		border-radius: 9999px;
		background: hsl(24 80% 55%); /* accent solid */
		transition: width 0.4s ease;
		overflow: hidden;
	}

	.progress-bar__fill::before {
		content: '';
		position: absolute;
		inset: 0;
		background-image: url("data:image/svg+xml,%3Csvg width='4' height='4' xmlns='http://www.w3.org/2000/svg'%3E%3Crect width='4' height='4' fill='rgba(0,0,0,0)'/%3E%3Ccircle cx='0' cy='0' r='0.5' fill='rgb(255,255,255)'/%3E%3Ccircle cx='2' cy='1' r='0.5' fill='rgb(255,255,255)'/%3E%3Ccircle cx='1' cy='2' r='0.5' fill='rgb(255,255,255)'/%3E%3Ccircle cx='3' cy='3' r='0.5' fill='rgb(255,255,255)'/%3E%3C/svg%3E");
		background-size: 4px 4px;
		mix-blend-mode: soft-light;
		opacity: 0.15;
		pointer-events: none;
		border-radius: 9999px;
	}

	/* Generation preview - Inkprint accent */
	.generation-preview {
		border-radius: 0.75rem;
		background: hsl(24 80% 55% / 0.08);
		padding: 0.75rem 0.9rem;
	}

	:global(.dark) .generation-preview {
		background: hsl(24 80% 55% / 0.18);
	}

	.preview-label {
		font-size: 0.7rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: hsl(24 80% 48%); /* accent */
		margin: 0 0 0.35rem 0;
	}

	:global(.dark) .preview-label {
		color: hsl(24 80% 75%); /* accent light */
	}

	.preview-content {
		margin: 0;
		font-size: 0.85rem;
		color: hsl(24 60% 25%); /* accent very dark */
	}

	:global(.dark) .preview-content {
		color: hsl(24 40% 85%); /* accent very light */
	}

	/* Collapsed preview - Inkprint muted */
	.collapsed-preview {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.65rem;
		border-radius: 0.5rem;
		background: hsl(40 20% 98%); /* background */
		border: 1px solid hsl(40 10% 85%); /* border */
	}

	@media (min-width: 640px) {
		.collapsed-preview {
			gap: 0.75rem;
			padding: 0.65rem 0.85rem;
			border-radius: 0.65rem;
		}
	}

	:global(.dark) .collapsed-preview {
		background: hsl(240 10% 12%);
		border-color: hsl(240 10% 22%);
	}

	.preview-text {
		flex: 1;
		margin: 0;
		font-size: 0.75rem;
		color: hsl(240 5% 45%); /* muted-foreground */
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	@media (min-width: 640px) {
		.preview-text {
			font-size: 0.85rem;
			-webkit-line-clamp: 3;
			line-clamp: 3;
		}
	}

	:global(.dark) .preview-text {
		color: hsl(40 5% 65%);
	}

	.preview-pill {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.25rem 0.5rem;
		border-radius: 9999px;
		background: hsl(24 80% 55% / 0.15); /* accent with opacity */
		font-size: 0.65rem;
		color: hsl(24 60% 30%); /* accent dark */
		flex-shrink: 0;
	}

	@media (min-width: 640px) {
		.preview-pill {
			gap: 0.4rem;
			padding: 0.3rem 0.6rem;
			font-size: 0.75rem;
		}
	}

	:global(.dark) .preview-pill {
		background: hsl(24 80% 55% / 0.25);
		color: hsl(24 80% 75%);
	}

	.expanded-body {
		border-top: 1px solid hsl(40 10% 85%); /* border */
		padding-top: 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	:global(.dark) .expanded-body {
		border-color: hsl(240 10% 18%);
	}

	.brief-markdown {
		line-height: 1.6;
	}

	/* Priority card - Inkprint accent */
	.priority-card {
		border-radius: 0.75rem;
		padding: 1rem;
		background: hsl(24 80% 55% / 0.08);
		border: 1px solid hsl(24 80% 55% / 0.18);
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
	}

	:global(.dark) .priority-card {
		background: hsl(24 80% 55% / 0.18);
		border-color: hsl(24 80% 55% / 0.28);
	}

	.priority-heading {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		font-weight: 600;
		margin: 0;
		font-size: 0.9rem;
		color: hsl(24 60% 30%); /* accent dark */
	}

	:global(.dark) .priority-heading {
		color: hsl(24 80% 75%);
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
		color: hsl(24 70% 35%); /* accent medium */
	}

	:global(.dark) .priority-item {
		color: hsl(24 60% 80%);
	}

	/* Clickable card styles - Inkprint */
	.clickable-card {
		cursor: pointer;
		transition: all 0.2s ease;
		text-align: left;
		width: 100%;
	}

	.clickable-card:hover {
		transform: translateY(-2px);
		box-shadow: 0 4px 12px -4px rgba(26, 26, 29, 0.15); /* shadow-ink-strong */
		border-color: hsl(24 80% 70%); /* accent light */
	}

	:global(.dark) .clickable-card:hover {
		border-color: hsl(24 60% 40%);
		box-shadow: 0 4px 12px -4px hsl(24 80% 55% / 0.3);
	}

	.clickable-card:focus-visible {
		outline: 2px solid hsl(24 80% 55%); /* accent */
		outline-offset: 2px;
	}

	.card-view-indicator {
		display: flex;
		align-items: center;
		transition: transform 0.2s ease;
	}

	.clickable-card:hover .card-view-indicator {
		transform: translateX(4px);
	}

	.clickable-card:hover .card-view-indicator :global(svg) {
		color: hsl(24 80% 55%); /* accent */
	}

	:global(.dark) .clickable-card:hover .card-view-indicator :global(svg) {
		color: hsl(24 80% 65%);
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
