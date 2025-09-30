<!-- src/lib/components/calendar/CalendarAnalysisModal.svelte -->
<script lang="ts">
	import ConfirmationModal from '$lib/components/ui/ConfirmationModal.svelte';
	import { goto } from '$app/navigation';

	interface Props {
		isOpen: boolean;
		onFirstConnection?: boolean;
		onAnalyze?: () => void;
		onClose?: () => void;
	}

	let {
		isOpen = $bindable(false),
		onFirstConnection = false,
		onAnalyze,
		onClose
	}: Props = $props();

	async function handleAnalyze() {
		// Store flag that analysis was requested
		if (typeof window !== 'undefined') {
			localStorage.setItem('calendar_analysis_requested', 'true');
		}

		// Navigate to analysis view or trigger analysis
		if (onFirstConnection) {
			// If this is after first connection, navigate to the profile page with analyze param
			await goto('/profile?tab=calendar&analyze=true');
		} else {
			// Trigger the analysis through the parent component
			onAnalyze?.();
		}

		handleClose();
	}

	function handleSkip() {
		if (typeof window !== 'undefined') {
			localStorage.setItem('calendar_analysis_skipped', 'true');
			localStorage.setItem('calendar_analysis_skipped_at', new Date().toISOString());
		}
		handleClose();
	}

	function handleClose() {
		isOpen = false;
		onClose?.();
	}
</script>

<ConfirmationModal
	{isOpen}
	title={onFirstConnection ? 'Welcome to Calendar Intelligence!' : 'Analyze Your Calendar?'}
	confirmText="Analyze Calendar"
	cancelText="Skip for Now"
	icon="info"
	on:confirm={handleAnalyze}
	on:cancel={handleSkip}
>
	<div slot="content" class="space-y-4">
		<p class="text-base text-gray-600 dark:text-gray-400 leading-relaxed">
			BuildOS can analyze your calendar to identify projects from your meetings and events.
		</p>

		<div
			class="bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-950/30 dark:to-purple-950/30 rounded-xl p-6 border-2 border-blue-200 dark:border-blue-800/50 shadow-sm"
		>
			<h4 class="text-lg font-semibold text-gray-900 dark:text-white mb-3">
				What we'll look for:
			</h4>
			<ul class="space-y-3 text-sm text-gray-600 dark:text-gray-400">
				<li class="flex items-start gap-3">
					<span
						class="inline-flex w-5 h-5 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 text-xs font-bold mt-0.5 flex-shrink-0"
						>✓</span
					>
					<span>Recurring meetings that might be ongoing projects</span>
				</li>
				<li class="flex items-start gap-3">
					<span
						class="inline-flex w-5 h-5 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 text-xs font-bold mt-0.5 flex-shrink-0"
						>✓</span
					>
					<span>Related events like sprints, reviews, and milestones</span>
				</li>
				<li class="flex items-start gap-3">
					<span
						class="inline-flex w-5 h-5 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 text-xs font-bold mt-0.5 flex-shrink-0"
						>✓</span
					>
					<span>Meeting patterns that suggest project work</span>
				</li>
				<li class="flex items-start gap-3">
					<span
						class="inline-flex w-5 h-5 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 text-xs font-bold mt-0.5 flex-shrink-0"
						>✓</span
					>
					<span>Events with multiple attendees collaborating</span>
				</li>
			</ul>
		</div>

		<div
			class="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-700"
		>
			<p class="text-sm text-blue-700 dark:text-blue-300">
				<strong class="font-semibold">Privacy First:</strong> Your calendar data is analyzed
				privately using AI. We only store minimal information needed to create projects.
			</p>
		</div>

		<p class="text-sm text-gray-500 dark:text-gray-400 italic">
			You'll be able to review and approve any suggestions before creating projects. This
			typically takes 10-30 seconds.
		</p>
	</div>
</ConfirmationModal>
