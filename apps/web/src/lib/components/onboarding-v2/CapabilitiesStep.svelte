<!-- apps/web/src/lib/components/onboarding-v2/CapabilitiesStep.svelte -->
<script lang="ts">
	import {
		Sparkles,
		ListChecks,
		Target,
		Lightbulb,
		MessageSquare,
		Calendar,
		Bell
	} from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';

	interface Props {
		onNext: () => void;
	}

	let { onNext }: Props = $props();
</script>

<div class="max-w-4xl mx-auto px-4">
	<!-- Header -->
	<div class="mb-10 text-center">
		<div class="flex justify-center mb-6">
			<div
				class="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center shadow-ink tx tx-bloom tx-weak"
			>
				<Sparkles class="w-8 h-8 text-accent" />
			</div>
		</div>

		<h2 class="text-3xl sm:text-4xl font-bold mb-3 text-foreground">
			Step 1: How BuildOS Works With You
		</h2>
		<p class="text-lg text-muted-foreground leading-relaxed max-w-2xl mx-auto">
			BuildOS meets you wherever you are and turns fuzzy ideas into clear, actionable plans.
		</p>
	</div>

	<!-- Start Anywhere -->
	<div class="mb-10">
		<h3 class="text-2xl font-bold mb-4 text-foreground text-center">Start Anywhere</h3>
		<p class="text-center text-muted-foreground mb-6">
			Whether you have tasks, a goal, or just an idea, BuildOS adapts to your starting point.
		</p>

		<div class="grid grid-cols-1 md:grid-cols-3 gap-5">
			<div class="bg-card rounded-xl border border-border p-5 shadow-ink tx tx-frame tx-weak">
				<div class="flex items-center gap-3 mb-3">
					<div class="w-10 h-10 bg-accent/10 rounded-lg flex items-center justify-center">
						<ListChecks class="w-5 h-5 text-accent" />
					</div>
					<h4 class="font-semibold text-foreground">Have tasks?</h4>
				</div>
				<p class="text-sm text-muted-foreground leading-relaxed">
					We organize them into a project with a goal, a plan, and connected tasks.
				</p>
			</div>

			<div class="bg-card rounded-xl border border-border p-5 shadow-ink tx tx-frame tx-weak">
				<div class="flex items-center gap-3 mb-3">
					<div class="w-10 h-10 bg-accent/10 rounded-lg flex items-center justify-center">
						<Target class="w-5 h-5 text-accent" />
					</div>
					<h4 class="font-semibold text-foreground">Only a goal?</h4>
				</div>
				<p class="text-sm text-muted-foreground leading-relaxed">
					We reverse-engineer milestones and build a step-by-step plan to reach it.
				</p>
			</div>

			<div class="bg-card rounded-xl border border-border p-5 shadow-ink tx tx-frame tx-weak">
				<div class="flex items-center gap-3 mb-3">
					<div class="w-10 h-10 bg-accent/10 rounded-lg flex items-center justify-center">
						<Lightbulb class="w-5 h-5 text-accent" />
					</div>
					<h4 class="font-semibold text-foreground">Just an idea?</h4>
				</div>
				<p class="text-sm text-muted-foreground leading-relaxed">
					Talk it out with BuildOS and let clarity emerge before you commit to action.
				</p>
			</div>
		</div>
	</div>

	<!-- Thought Partner -->
	<div class="mb-10 bg-card rounded-xl border border-border p-6 shadow-ink tx tx-frame tx-weak">
		<div class="flex items-start gap-4">
			<div class="w-12 h-12 bg-muted rounded-lg flex items-center justify-center shadow-ink">
				<MessageSquare class="w-6 h-6 text-accent" />
			</div>
			<div class="flex-1">
				<h3 class="text-xl font-semibold text-foreground mb-2">Your AI Thought Partner</h3>
				<p class="text-sm text-muted-foreground mb-4">
					BuildOS is more than a task manager — it helps you think, organize, and stay
					moving.
				</p>
				<div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-muted-foreground">
					<div class="flex items-start gap-2">
						<span class="text-accent">•</span>
						<span>Chat about updates, pivots, and new ideas</span>
					</div>
					<div class="flex items-start gap-2">
						<span class="text-accent">•</span>
						<span>Surface tasks and next steps automatically</span>
					</div>
					<div class="flex items-start gap-2">
						<span class="text-accent">•</span>
						<span>Stay organized without extra overhead</span>
					</div>
					<div class="flex items-start gap-2">
						<span class="text-accent">•</span>
						<span>Get help prioritizing when you're overwhelmed</span>
					</div>
				</div>
			</div>
		</div>
	</div>

	<!-- Stay on Track -->
	<div class="mb-12">
		<h3 class="text-2xl font-bold mb-4 text-foreground text-center">Stay on Track</h3>
		<p class="text-center text-muted-foreground mb-6">
			Optional add-ons help you stay focused when life gets busy.
		</p>

		<div class="grid grid-cols-1 md:grid-cols-3 gap-5">
			<div class="bg-card rounded-xl border border-border p-5 shadow-ink tx tx-frame tx-weak">
				<div class="flex items-center gap-3 mb-3">
					<div class="w-10 h-10 bg-accent/10 rounded-lg flex items-center justify-center">
						<Sparkles class="w-5 h-5 text-accent" />
					</div>
					<h4 class="font-semibold text-foreground">Daily briefs</h4>
				</div>
				<p class="text-sm text-muted-foreground leading-relaxed">
					A personalized morning summary of what matters today.
				</p>
			</div>

			<div class="bg-card rounded-xl border border-border p-5 shadow-ink tx tx-frame tx-weak">
				<div class="flex items-center gap-3 mb-3">
					<div class="w-10 h-10 bg-accent/10 rounded-lg flex items-center justify-center">
						<Bell class="w-5 h-5 text-accent" />
					</div>
					<h4 class="font-semibold text-foreground">SMS nudges</h4>
				</div>
				<p class="text-sm text-muted-foreground leading-relaxed">
					Gentle reminders when deadlines or priorities need attention.
				</p>
			</div>

			<div class="bg-card rounded-xl border border-border p-5 shadow-ink tx tx-frame tx-weak">
				<div class="flex items-center gap-3 mb-3">
					<div class="w-10 h-10 bg-accent/10 rounded-lg flex items-center justify-center">
						<Calendar class="w-5 h-5 text-accent" />
					</div>
					<h4 class="font-semibold text-foreground">Calendar sync</h4>
				</div>
				<p class="text-sm text-muted-foreground leading-relaxed">
					Auto-detect projects from meetings and plan around real schedules.
				</p>
			</div>
		</div>
	</div>

	<div class="flex justify-center">
		<Button
			variant="primary"
			size="lg"
			onclick={onNext}
			class="px-8 py-3 text-lg shadow-ink pressable"
		>
			Continue
			<Sparkles class="w-5 h-5 ml-2" />
		</Button>
	</div>
</div>
