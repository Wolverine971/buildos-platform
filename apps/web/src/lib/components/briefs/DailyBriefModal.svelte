<!-- apps/web/src/lib/components/briefs/DailyBriefModal.svelte -->
<script lang="ts">
	import {
		Calendar,
		Clock,
		Copy,
		Download,
		ExternalLink,
		CircleCheck,
		Mail,
		LoaderCircle,
		AlertCircle,
		RefreshCw,
		MessageCircle
	} from 'lucide-svelte';
	import { onMount, onDestroy } from 'svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import type { DailyBrief } from '$lib/types/daily-brief';
	import { renderMarkdown } from '$lib/utils/markdown';
	import { toastService, TOAST_DURATION } from '$lib/stores/toast.store';
	import { notificationPreferencesStore } from '$lib/stores/notificationPreferences';
	import { browser } from '$app/environment';
	import {
		BriefClientService,
		streamingStatus,
		briefGenerationCompleted
	} from '$lib/services/briefClient.service';
	import { page } from '$app/stores';

	// Props using Svelte 5 runes syntax
	let {
		isOpen = false,
		brief = null,
		briefDate = null,
		onClose,
		onchat
	}: {
		isOpen?: boolean;
		brief?: DailyBrief | null;
		briefDate?: string | null;
		onClose: () => void;
		onchat?: (brief: DailyBrief) => void;
	} = $props();

	// Internal state for fetched brief
	let fetchedBrief = $state<DailyBrief | null>(null);
	let loading = $state(false);
	let error = $state<string | null>(null);

	// Use provided brief or fetched brief
	let displayBrief = $derived(brief || fetchedBrief);

	let copiedToClipboard = $state(false);
	let emailOptInLoading = $state(false);

	// Regenerate state
	let isRegenerating = $state(false);
	let regenerateProgress = $state<{ message: string; percentage: number }>({
		message: '',
		percentage: 0
	});

	// Subscribe to notification preferences store
	let notificationPreferences = $derived($notificationPreferencesStore.preferences);
	let hasEmailOptIn = $derived(notificationPreferences?.should_email_daily_brief || false);

	// Subscribe to streaming status for regeneration
	let generationStatus = $derived($streamingStatus);
	let completionEvent = $derived($briefGenerationCompleted);

	// Fetch brief when briefDate changes
	$effect(() => {
		if (!browser) return;
		if (isOpen && briefDate && !brief) {
			loadBriefByDate(briefDate);
		}
	});

	async function loadBriefByDate(date: string) {
		if (!browser) return;

		loading = true;
		error = null;
		fetchedBrief = null;

		try {
			const response = await fetch(`/api/daily-briefs?date=${date}`);
			if (!response.ok) {
				throw new Error('Failed to load brief');
			}

			const result = await response.json();
			const data = result.data;
			// API returns { brief: DailyBrief } when found, { brief: null, message: string } when not found
			if (data.brief) {
				fetchedBrief = data.brief;
				error = null;
			} else if (data.message) {
				error = data.message;
				fetchedBrief = null;
			} else if (data.error) {
				throw new Error(data.error);
			} else {
				error = 'No brief found for this date';
				fetchedBrief = null;
			}
		} catch (err: any) {
			console.error('Error loading brief:', err);
			error = err.message || 'Failed to load brief';
			fetchedBrief = null;
		} finally {
			loading = false;
		}
	}

	// Load preferences when modal opens
	onMount(() => {
		if (!notificationPreferences) {
			notificationPreferencesStore.load();
		}
	});

	// Watch for regeneration progress updates
	$effect(() => {
		if (isRegenerating && generationStatus.isGenerating) {
			regenerateProgress = {
				message: generationStatus.message || 'Regenerating brief...',
				percentage:
					generationStatus.progress?.projects?.total > 0
						? Math.round(
								(generationStatus.progress.projects.completed /
									generationStatus.progress.projects.total) *
									100
							)
						: 0
			};
		}
	});

	// Watch for regeneration completion
	$effect(() => {
		if (
			isRegenerating &&
			completionEvent &&
			briefDate &&
			completionEvent.briefDate === briefDate
		) {
			// Regeneration completed successfully
			isRegenerating = false;
			toastService.success('Brief regenerated successfully!');

			// Reload the brief
			if (briefDate) {
				loadBriefByDate(briefDate);
			}
		}
	});

	// Watch for regeneration errors
	$effect(() => {
		if (isRegenerating && !generationStatus.isGenerating && generationStatus.error) {
			isRegenerating = false;
			toastService.error('Failed to regenerate brief. Please try again.', {
				duration: TOAST_DURATION.LONG,
				action: {
					label: 'Retry',
					onClick: () => regenerateBrief()
				}
			});
		}
	});

	// Cleanup on component destroy
	onDestroy(() => {
		// Reset regeneration state if modal is closed during regeneration
		if (isRegenerating) {
			isRegenerating = false;
		}
	});

	async function copyToClipboard() {
		if (!displayBrief) return;

		try {
			await navigator.clipboard.writeText(displayBrief.summary_content);
			copiedToClipboard = true;
			toastService.success('Brief copied to clipboard');
			setTimeout(() => {
				copiedToClipboard = false;
			}, 2000);
		} catch (error) {
			toastService.error('Failed to copy to clipboard');
		}
	}

	async function downloadBrief() {
		if (!displayBrief) return;

		const blob = new Blob([displayBrief.summary_content], { type: 'text/markdown' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `daily-brief-${displayBrief.brief_date}.md`;
		a.click();
		URL.revokeObjectURL(url);
		toastService.success('Brief downloaded');
	}

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

	async function regenerateBrief() {
		if (!briefDate || !browser) {
			console.warn('Cannot regenerate: briefDate is', briefDate);
			return;
		}

		// Get user from page data
		const userData = $page.data?.user;
		if (!userData) {
			toastService.error('User not found. Please refresh the page.');
			return;
		}

		// Get supabase client from page data (may be undefined, service will handle it)
		const supabaseClient = $page.data?.supabase;

		try {
			isRegenerating = true;
			regenerateProgress = { message: 'Starting regeneration...', percentage: 0 };

			// Start streaming generation with force regenerate and ontology flag
			await BriefClientService.startStreamingGeneration({
				briefDate,
				forceRegenerate: true,
				user: {
					id: userData.id,
					email: userData.email || '',
					is_admin: userData.is_admin || false
				},
				timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
				supabaseClient,
				useOntology: true // Use ontology-based brief generation
			});
		} catch (err) {
			console.error('Failed to start regeneration:', err);
			isRegenerating = false;
			toastService.error(err instanceof Error ? err.message : 'Failed to start regeneration');
		}
	}

	function getPriorityCount(content: string): number {
		const priorityMatch = content.match(/### 🎯 Top Priorities Today\s*\n((?:- .+\n?)+)/);
		if (priorityMatch && priorityMatch[1]) {
			return priorityMatch[1].split('\n').filter((line) => line.trim().startsWith('-'))
				.length;
		}
		return 0;
	}

	function getTaskCount(content: string): number {
		const taskMatch = content.match(/(\d+)\s+task/i);
		return taskMatch && taskMatch[1] ? parseInt(taskMatch[1]) : 0;
	}

	let priorityCount = $derived(displayBrief ? getPriorityCount(displayBrief.summary_content) : 0);
	let taskCount = $derived(displayBrief ? getTaskCount(displayBrief.summary_content) : 0);
</script>

<Modal {isOpen} {onClose} title="Daily Brief" size="lg" closeOnBackdrop={true} closeOnEscape={true}>
	{#snippet children()}
		{#if isRegenerating}
			<!-- Regenerating state -->
			<div class="flex flex-col items-center justify-center py-8 sm:py-12 px-4 sm:px-6">
				<RefreshCw class="h-12 w-12 text-accent animate-spin mb-4" />
				<p class="text-foreground font-medium mb-2">Regenerating Brief</p>
				<p class="text-muted-foreground text-sm mb-4">
					{regenerateProgress.message}
				</p>
				{#if regenerateProgress.percentage > 0}
					<div class="w-full max-w-md">
						<div class="w-full bg-muted rounded-full h-2">
							<div
								class="bg-accent h-2 rounded-full transition-all duration-300"
								style="width: {regenerateProgress.percentage}%"
							></div>
						</div>
						<p class="text-center text-sm text-muted-foreground mt-2">
							{regenerateProgress.percentage}%
						</p>
					</div>
				{/if}
			</div>
		{:else if loading}
			<!-- Loading state -->
			<div class="flex flex-col items-center justify-center py-8 sm:py-12 px-4 sm:px-6">
				<LoaderCircle class="h-12 w-12 text-accent animate-spin mb-4" />
				<p class="text-muted-foreground">Loading brief...</p>
			</div>
		{:else if error}
			<!-- Error state -->
			<div class="flex flex-col items-center justify-center py-8 sm:py-12 px-4 sm:px-6">
				<AlertCircle class="h-12 w-12 text-destructive mb-4" />
				<p class="text-foreground font-medium mb-2">Failed to load brief</p>
				<p class="text-muted-foreground text-sm mb-4">{error}</p>
				<Button
					onclick={() => briefDate && loadBriefByDate(briefDate)}
					variant="primary"
					size="sm"
				>
					Retry
				</Button>
			</div>
		{:else if displayBrief}
			<!-- Header Info -->

			<!-- Brief Content -->
			<div class="px-3 sm:px-4 py-4 sm:py-6">
				<div
					class="prose prose-sm max-w-none overflow-x-auto
						prose-headings:text-foreground prose-p:text-foreground prose-li:text-foreground
						prose-strong:text-foreground prose-a:text-accent prose-blockquote:text-muted-foreground
						prose-blockquote:border-border prose-code:bg-muted prose-code:text-foreground
						prose-pre:bg-muted prose-pre:text-foreground prose-hr:border-border"
				>
					{@html renderMarkdown(displayBrief.summary_content)}
				</div>
			</div>
		{:else}
			<!-- No brief available -->
			<div class="flex flex-col items-center justify-center py-8 sm:py-12 px-4 sm:px-6">
				<p class="text-muted-foreground">No brief available</p>
			</div>
		{/if}
	{/snippet}

	{#snippet footer()}
		<!-- Footer Actions -->
		<div class="px-3 sm:px-4 py-3 border-t border-border bg-muted/50">
			<!-- Email opt-in banner if not opted in -->
			{#if !hasEmailOptIn && !$notificationPreferencesStore.isLoading}
				<div class="mb-4 p-3 bg-accent/5 border border-accent/20 rounded-lg">
					<div class="flex items-center justify-between">
						<div class="flex items-center space-x-2">
							<Mail class="h-5 w-5 text-accent" />
							<p class="text-sm text-foreground">
								Get your daily briefs delivered to your inbox
							</p>
						</div>
						<Button
							onclick={enableEmailNotifications}
							variant="primary"
							size="sm"
							loading={emailOptInLoading}
							class="ml-4"
						>
							Enable Email
						</Button>
					</div>
				</div>
			{/if}

			{#if displayBrief}
				<div class="flex flex-col sm:flex-row gap-3 sm:justify-between">
					<div class="flex flex-col sm:flex-row gap-2 w-full">
						{#if onchat}
							<Button
								onclick={() => onchat(displayBrief)}
								variant="primary"
								size="sm"
								icon={MessageCircle}
								disabled={isRegenerating}
								class="w-full sm:w-auto"
							>
								Chat about Brief
							</Button>
						{/if}
						<Button
							onclick={copyToClipboard}
							variant="outline"
							size="sm"
							icon={copiedToClipboard ? CircleCheck : Copy}
							disabled={isRegenerating}
							class="w-full sm:w-auto"
						>
							{copiedToClipboard ? 'Copied!' : 'Copy to Clipboard'}
						</Button>
						<Button
							onclick={downloadBrief}
							variant="outline"
							size="sm"
							icon={Download}
							disabled={isRegenerating}
							class="w-full sm:w-auto"
						>
							Download
						</Button>
						<Button
							onclick={regenerateBrief}
							variant={onchat ? 'outline' : 'primary'}
							size="sm"
							icon={RefreshCw}
							class="w-full sm:w-auto ml-auto"
						>
							{isRegenerating ? 'Regenerating...' : 'Regenerate Brief'}
						</Button>
					</div>
				</div>
			{/if}
		</div>
	{/snippet}
</Modal>
