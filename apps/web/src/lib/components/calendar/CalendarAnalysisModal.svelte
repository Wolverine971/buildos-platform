<!-- apps/web/src/lib/components/calendar/CalendarAnalysisModal.svelte -->
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
	onconfirm={handleAnalyze}
	oncancel={handleSkip}
>
	{#snippet content()}
		<div class="space-y-3">
			<p class="text-sm text-muted-foreground leading-relaxed">
				BuildOS can analyze your calendar to identify projects from your meetings and
				events.
			</p>

			<div class="bg-accent/10 rounded-lg p-3 border border-accent/20 shadow-ink">
				<h4 class="text-sm font-semibold text-foreground mb-2">What we'll look for:</h4>
				<ul class="space-y-1.5 text-sm text-muted-foreground">
					<li class="flex items-start gap-2">
						<span class="text-accent font-bold mt-0.5 flex-shrink-0">✓</span>
						<span>Recurring meetings that might be ongoing projects</span>
					</li>
					<li class="flex items-start gap-2">
						<span class="text-accent font-bold mt-0.5 flex-shrink-0">✓</span>
						<span>Related events like sprints, reviews, and milestones</span>
					</li>
					<li class="flex items-start gap-2">
						<span class="text-accent font-bold mt-0.5 flex-shrink-0">✓</span>
						<span>Meeting patterns that suggest project work</span>
					</li>
					<li class="flex items-start gap-2">
						<span class="text-accent font-bold mt-0.5 flex-shrink-0">✓</span>
						<span>Events with multiple attendees collaborating</span>
					</li>
				</ul>
			</div>

			<p class="text-xs text-muted-foreground">
				<strong class="font-semibold text-foreground">Privacy First:</strong> Your calendar data
				is analyzed privately using AI. We only store minimal information needed to create projects.
				You'll review and approve any suggestions before projects are created — this typically
				takes 10-30 seconds.
			</p>
		</div>
	{/snippet}
</ConfirmationModal>
