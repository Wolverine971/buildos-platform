<!-- apps/web/src/lib/components/calendar/CalendarAnalysisModal.svelte -->
<script lang="ts">
	import ConfirmationModal from '$lib/components/ui/ConfirmationModal.svelte';
	import { goto } from '$app/navigation';
	import { RETENTION_WINDOWS } from '$lib/privacy/retention-policy';

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

	const eventsWindow = RETENTION_WINDOWS.calendarAnalysisEvents.label;

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
	title={onFirstConnection ? 'Your calendar is connected' : 'Analyze your calendar?'}
	confirmText="Analyze calendar"
	cancelText="Skip for now"
	icon="info"
	onconfirm={handleAnalyze}
	oncancel={handleSkip}
>
	{#snippet content()}
		<div class="space-y-3">
			<p class="text-sm text-muted-foreground leading-relaxed">
				BuildOS can analyze your calendar to identify projects from your meetings and
				events.
			</p>

			<div class="bg-muted/30 rounded-xl p-3 border border-border">
				<h4 class="text-sm font-medium text-foreground mb-2">What we look for</h4>
				<ul class="space-y-2 text-sm text-muted-foreground">
					<li class="flex items-start gap-2">
						<span class="text-muted-foreground flex-shrink-0" aria-hidden="true">✓</span
						>
						<span>Recurring meetings that might be ongoing projects</span>
					</li>
					<li class="flex items-start gap-2">
						<span class="text-muted-foreground flex-shrink-0" aria-hidden="true">✓</span
						>
						<span>Related events like sprints, reviews, and milestones</span>
					</li>
					<li class="flex items-start gap-2">
						<span class="text-muted-foreground flex-shrink-0" aria-hidden="true">✓</span
						>
						<span>Meeting patterns that suggest project work</span>
					</li>
					<li class="flex items-start gap-2">
						<span class="text-muted-foreground flex-shrink-0" aria-hidden="true">✓</span
						>
						<span>Events with multiple attendees collaborating</span>
					</li>
				</ul>
			</div>

			<p class="text-xs text-muted-foreground">
				<strong class="font-medium text-foreground">Privacy:</strong> Your events are sent
				to an AI model under zero data retention. We keep only the title and time of the
				events behind each suggestion, and delete them within {eventsWindow}. You'll review
				and approve any suggestions before projects are created. This usually takes 10 to 30
				seconds.
			</p>
		</div>
	{/snippet}
</ConfirmationModal>
