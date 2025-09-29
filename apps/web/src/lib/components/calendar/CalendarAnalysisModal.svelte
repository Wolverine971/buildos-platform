<script lang="ts">
	import ConfirmationModal from '$lib/components/ui/ConfirmationModal.svelte';
	import { modalStore } from '$lib/stores/modal.store';
	import { goto } from '$app/navigation';

	interface Props {
		isOpen: boolean;
		onFirstConnection?: boolean;
		onClose?: () => void;
	}

	let { isOpen = $bindable(false), onFirstConnection = false, onClose }: Props = $props();

	async function handleAnalyze() {
		// Store flag that analysis was requested
		if (typeof window !== 'undefined') {
			localStorage.setItem('calendar_analysis_requested', 'true');
		}

		// Navigate to analysis view or open the results modal
		if (onFirstConnection) {
			// If this is after first connection, navigate to the profile page with analyze param
			await goto('/profile?tab=calendar&analyze=true');
		} else {
			// Open the analysis results modal directly
			modalStore.open('calendarAnalysisResults', {
				autoStart: true
			});
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
		<p class="text-gray-600">
			BuildOS can analyze your calendar to identify projects from your meetings and events.
		</p>

		<div
			class="bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg p-4 border border-purple-100"
		>
			<h4 class="font-medium text-gray-900 mb-2">What we'll look for:</h4>
			<ul class="space-y-2 text-sm text-gray-600">
				<li class="flex items-start gap-2">
					<span class="text-purple-500 mt-0.5">•</span>
					<span>Recurring meetings that might be ongoing projects</span>
				</li>
				<li class="flex items-start gap-2">
					<span class="text-purple-500 mt-0.5">•</span>
					<span>Related events like sprints, reviews, and milestones</span>
				</li>
				<li class="flex items-start gap-2">
					<span class="text-purple-500 mt-0.5">•</span>
					<span>Meeting patterns that suggest project work</span>
				</li>
				<li class="flex items-start gap-2">
					<span class="text-purple-500 mt-0.5">•</span>
					<span>Events with multiple attendees collaborating</span>
				</li>
			</ul>
		</div>

		<div class="bg-blue-50 rounded-lg p-3 border border-blue-100">
			<p class="text-sm text-blue-800">
				<strong>Privacy First:</strong> Your calendar data is analyzed privately using AI. We
				only store minimal information needed to create projects.
			</p>
		</div>

		<p class="text-sm text-gray-500">
			You'll be able to review and approve any suggestions before creating projects. This
			typically takes 10-30 seconds.
		</p>
	</div>
</ConfirmationModal>
