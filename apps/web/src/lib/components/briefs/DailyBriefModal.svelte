<!-- apps/web/src/lib/components/briefs/DailyBriefModal.svelte -->
<script lang="ts">
	import {
		Calendar,
		Clock,
		Copy,
		Download,
		ExternalLink,
		CheckCircle,
		Mail
	} from 'lucide-svelte';
	import { onMount } from 'svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import type { DailyBrief } from '$lib/types/daily-brief';
	import { renderMarkdown } from '$lib/utils/markdown';
	import { formatFullDate, formatTimeOnly } from '$lib/utils/date-utils';
	import { toastService } from '$lib/stores/toast.store';
	import { notificationPreferencesStore } from '$lib/stores/notificationPreferences';

	export let isOpen = false;
	export let brief: DailyBrief | null = null;
	export let onClose: () => void;

	let copiedToClipboard = false;
	let emailOptInLoading = false;

	// Subscribe to notification preferences store
	$: notificationPreferences = $notificationPreferencesStore.preferences;
	$: hasEmailOptIn = notificationPreferences?.should_email_daily_brief || false;

	console.log('hasEmailOptIn', hasEmailOptIn);

	// Load preferences when modal opens
	onMount(() => {
		if (!notificationPreferences) {
			notificationPreferencesStore.load();
		}
	});

	async function copyToClipboard() {
		if (!brief) return;

		try {
			await navigator.clipboard.writeText(brief.summary_content);
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
		if (!brief) return;

		const blob = new Blob([brief.summary_content], { type: 'text/markdown' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `daily-brief-${brief.brief_date}.md`;
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
			toastService.error('Failed to enable email notifications');
		} finally {
			emailOptInLoading = false;
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

	$: priorityCount = brief ? getPriorityCount(brief.summary_content) : 0;
	$: taskCount = brief ? getTaskCount(brief.summary_content) : 0;
</script>

<Modal {isOpen} {onClose} title="Daily Brief" size="lg" closeOnBackdrop={true} closeOnEscape={true}>
	{#if brief}
		<!-- Header Info -->
		<div class="px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-gray-700">
			<div class="flex items-center justify-between">
				<div class="flex items-center space-x-4">
					<div class="flex items-center text-sm text-gray-600 dark:text-gray-400">
						<Calendar class="mr-1.5 h-4 w-4" />
						{formatFullDate(brief.brief_date)}
					</div>
					<div class="flex items-center text-sm text-gray-600 dark:text-gray-400">
						<Clock class="mr-1.5 h-4 w-4" />
						{formatTimeOnly(brief.created_at)}
					</div>
				</div>

				<!-- Quick Stats -->
				<div class="flex items-center gap-3">
					{#if priorityCount > 0}
						<span
							class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
						>
							{priorityCount} priorities
						</span>
					{/if}
					{#if taskCount > 0}
						<span
							class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
						>
							{taskCount} tasks
						</span>
					{/if}
				</div>
			</div>
		</div>

		<!-- Brief Content -->
		<div class="px-4 sm:px-6 py-6 max-h-[60vh] overflow-y-auto">
			<div
				class="prose prose-sm dark:prose-invert max-w-none
				prose-headings:font-semibold prose-headings:text-gray-900 dark:prose-headings:text-white
				prose-p:text-gray-600 dark:prose-p:text-gray-400
				prose-li:text-gray-600 dark:prose-li:text-gray-400
				prose-strong:text-gray-700 dark:prose-strong:text-gray-300
				prose-blockquote:text-gray-600 dark:prose-blockquote:text-gray-400
				prose-blockquote:border-gray-300 dark:prose-blockquote:border-gray-600
				prose-code:bg-gray-100 dark:prose-code:bg-gray-800
				prose-code:text-gray-800 dark:prose-code:text-gray-200
				prose-pre:bg-gray-100 dark:prose-pre:bg-gray-800"
			>
				{@html renderMarkdown(brief.summary_content)}
			</div>
		</div>
	{/if}

	<!-- Footer Actions -->
	<div
		slot="footer"
		class="px-4 sm:px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50"
	>
		<!-- Email opt-in banner if not opted in -->
		{#if !hasEmailOptIn && !$notificationPreferencesStore.isLoading}
			<div
				class="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg"
			>
				<div class="flex items-center justify-between">
					<div class="flex items-center space-x-2">
						<Mail class="h-5 w-5 text-blue-600 dark:text-blue-400" />
						<p class="text-sm text-blue-700 dark:text-blue-300">
							Get your daily briefs delivered to your inbox
						</p>
					</div>
					<Button
						on:click={enableEmailNotifications}
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

		<div class="flex flex-col sm:flex-row gap-3 sm:justify-between">
			<div class="flex flex-col sm:flex-row gap-2">
				<Button
					on:click={copyToClipboard}
					variant="outline"
					size="sm"
					icon={copiedToClipboard ? CheckCircle : Copy}
					class="w-full sm:w-auto"
				>
					{copiedToClipboard ? 'Copied!' : 'Copy to Clipboard'}
				</Button>
				<Button
					on:click={downloadBrief}
					variant="outline"
					size="sm"
					icon={Download}
					class="w-full sm:w-auto"
				>
					Download
				</Button>
			</div>
		</div>
	</div>
</Modal>
