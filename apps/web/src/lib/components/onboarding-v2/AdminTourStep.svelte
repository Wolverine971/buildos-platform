<!-- apps/web/src/lib/components/onboarding-v2/AdminTourStep.svelte -->
<script lang="ts">
	import {
		User,
		History,
		GitBranch,
		Info,
		ExternalLink,
		Sparkles,
		ArrowRight
	} from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { ONBOARDING_V2_CONFIG } from '$lib/config/onboarding.config';

	interface Props {
		onNext: () => void;
		onSkip?: () => void;
	}

	let { onNext, onSkip }: Props = $props();

	function handleSkip() {
		if (onSkip) {
			onSkip();
		} else {
			onNext();
		}
	}
</script>

<div class="max-w-4xl mx-auto px-4">
	<!-- Header with prominent skip -->
	<div class="mb-8 text-center">
		<div class="flex justify-between items-start mb-4">
			<div class="flex-1"></div>
			<Button variant="ghost" onclick={handleSkip} size="sm" class="text-muted-foreground">
				Skip Tour →
			</Button>
		</div>

		<div class="flex justify-center mb-6">
			<div
				class="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center shadow-ink tx tx-frame tx-weak"
			>
				<Info class="w-8 h-8 text-muted-foreground" />
			</div>
		</div>

		<h2 class="text-3xl sm:text-4xl font-bold mb-3 text-foreground">Explore More (Optional)</h2>
		<p class="text-lg text-muted-foreground leading-relaxed max-w-2xl mx-auto">
			Feel free to skip this—you can explore these features anytime. Here's a quick tour of
			what else BuildOS offers.
		</p>
	</div>

	<!-- Feature Sections -->
	<div class="space-y-6 mb-8">
		<!-- 1. Profile Page -->
		<div
			class="bg-card rounded-xl border border-border p-6 shadow-ink hover:shadow-ink-strong transition-shadow duration-200 tx tx-frame tx-weak"
		>
			<div class="flex items-start gap-4 mb-4">
				<div
					class="flex-shrink-0 w-12 h-12 bg-muted rounded-lg flex items-center justify-center shadow-ink"
				>
					<User class="w-6 h-6 text-accent" />
				</div>
				<div class="flex-1">
					<h3 class="text-xl font-bold mb-2 text-foreground">Your Profile & Settings</h3>
					<p class="text-sm text-muted-foreground mb-4 leading-relaxed">
						Access all your settings and preferences in one place. Your profile contains
						everything BuildOS knows about how you work.
					</p>

					<!-- Tab Overview -->
					<div class="grid grid-cols-2 md:grid-cols-3 gap-2 mb-4">
						<div class="text-xs bg-muted px-3 py-2 rounded-lg border border-border">
							<div class="font-medium text-foreground">Brief Settings</div>
							<div class="text-muted-foreground">Daily brief timing</div>
						</div>
						<div class="text-xs bg-muted px-3 py-2 rounded-lg border border-border">
							<div class="font-medium text-foreground">Calendar</div>
							<div class="text-muted-foreground">Google Calendar setup</div>
						</div>
						<div class="text-xs bg-muted px-3 py-2 rounded-lg border border-border">
							<div class="font-medium text-foreground">Notifications</div>
							<div class="text-muted-foreground">Email & SMS preferences</div>
						</div>
						<div class="text-xs bg-muted px-3 py-2 rounded-lg border border-border">
							<div class="font-medium text-foreground">Account</div>
							<div class="text-muted-foreground">Account management</div>
						</div>
						<div class="text-xs bg-muted px-3 py-2 rounded-lg border border-border">
							<div class="font-medium text-foreground">Billing</div>
							<div class="text-muted-foreground">Subscription details</div>
						</div>
					</div>
				</div>
			</div>

			<!-- Screenshot/Placeholder -->
			{#if ONBOARDING_V2_CONFIG.features.showPlaceholderAssets}
				<div class="bg-muted rounded-lg p-8 text-center border border-border">
					<User class="w-12 h-12 text-muted-foreground mx-auto mb-4" />
					<p class="text-muted-foreground text-sm">
						[Screenshot: Profile page with all tabs]
					</p>
				</div>
			{:else}
				<img
					src={ONBOARDING_V2_CONFIG.assets.screenshots.profilePageOverview}
					alt="Profile page overview"
					class="rounded-lg shadow-ink"
				/>
			{/if}

			<!-- CTA -->
			<div class="mt-4 flex justify-end">
				<a
					href="/profile"
					class="inline-flex items-center gap-2 text-sm font-medium text-accent hover:text-accent/80 transition-colors"
				>
					Explore Profile
					<ExternalLink class="w-4 h-4" />
				</a>
			</div>
		</div>

		<!-- 2. History Page -->
		<div
			class="bg-card rounded-xl border border-border p-6 shadow-ink hover:shadow-ink-strong transition-shadow duration-200 tx tx-frame tx-weak"
		>
			<div class="flex items-start gap-4 mb-4">
				<div
					class="flex-shrink-0 w-12 h-12 bg-muted rounded-lg flex items-center justify-center shadow-ink"
				>
					<History class="w-6 h-6 text-accent" />
				</div>
				<div class="flex-1">
					<h3 class="text-xl font-bold mb-2 text-foreground">Track Your Journey</h3>
					<p class="text-sm text-muted-foreground mb-4 leading-relaxed">
						See all your past braindumps, track your activity patterns, and search
						through your history with a GitHub-style contribution chart.
					</p>

					<!-- Features list -->
					<div class="space-y-2 mb-4">
						<div class="flex items-center gap-2 text-sm text-muted-foreground">
							<div class="w-2 h-2 rounded-full bg-accent"></div>
							<span>GitHub-style contribution chart showing braindump activity</span>
						</div>
						<div class="flex items-center gap-2 text-sm text-muted-foreground">
							<div class="w-2 h-2 rounded-full bg-accent"></div>
							<span>View all past braindumps with search and filter</span>
						</div>
						<div class="flex items-center gap-2 text-sm text-muted-foreground">
							<div class="w-2 h-2 rounded-full bg-accent"></div>
							<span>Click any date to see that day's braindumps</span>
						</div>
					</div>
				</div>
			</div>

			<!-- Screenshot/Placeholder -->
			{#if ONBOARDING_V2_CONFIG.features.showPlaceholderAssets}
				<div class="bg-muted rounded-lg p-8 text-center border border-border">
					<History class="w-12 h-12 text-muted-foreground mx-auto mb-4" />
					<p class="text-muted-foreground text-sm">
						[Screenshot: History page with contribution chart]
					</p>
				</div>
			{:else}
				<img
					src={ONBOARDING_V2_CONFIG.assets.screenshots.historyPageContributionChart}
					alt="History page with contribution chart"
					class="rounded-lg shadow-ink"
				/>
			{/if}

			<!-- CTA -->
			<div class="mt-4 flex justify-end">
				<a
					href="/history"
					class="inline-flex items-center gap-2 text-sm font-medium text-accent hover:text-accent/80 transition-colors"
				>
					View History
					<ExternalLink class="w-4 h-4" />
				</a>
			</div>
		</div>

		<!-- 3. Project History -->
		<div
			class="bg-card rounded-xl border border-border p-6 shadow-ink hover:shadow-ink-strong transition-shadow duration-200 tx tx-frame tx-weak"
		>
			<div class="flex items-start gap-4 mb-4">
				<div
					class="flex-shrink-0 w-12 h-12 bg-muted rounded-lg flex items-center justify-center shadow-ink"
				>
					<GitBranch class="w-6 h-6 text-emerald-600" />
				</div>
				<div class="flex-1">
					<h3 class="text-xl font-bold mb-2 text-foreground">See How Projects Evolve</h3>
					<p class="text-sm text-muted-foreground mb-4 leading-relaxed">
						Every project change is tracked. See version-by-version comparisons, review
						past updates, and understand what braindumps triggered each change.
					</p>

					<!-- Features list -->
					<div class="space-y-2 mb-4">
						<div class="flex items-center gap-2 text-sm text-muted-foreground">
							<div class="w-2 h-2 rounded-full bg-emerald-600"></div>
							<span>Version-by-version project tracking</span>
						</div>
						<div class="flex items-center gap-2 text-sm text-muted-foreground">
							<div class="w-2 h-2 rounded-full bg-emerald-600"></div>
							<span>See which braindumps triggered changes</span>
						</div>
						<div class="flex items-center gap-2 text-sm text-muted-foreground">
							<div class="w-2 h-2 rounded-full bg-emerald-600"></div>
							<span>Review project history and past states</span>
						</div>
					</div>
				</div>
			</div>

			<!-- Screenshot/Placeholder -->
			{#if ONBOARDING_V2_CONFIG.features.showPlaceholderAssets}
				<div class="bg-muted rounded-lg p-8 text-center border border-border">
					<GitBranch class="w-12 h-12 text-muted-foreground mx-auto mb-4" />
					<p class="text-muted-foreground text-sm">
						[Screenshot: Project history modal showing version comparison]
					</p>
				</div>
			{:else}
				<img
					src={ONBOARDING_V2_CONFIG.assets.screenshots.projectHistoryModal}
					alt="Project history modal"
					class="rounded-lg shadow-ink"
				/>
			{/if}

			<!-- Info Note -->
			<div
				class="mt-4 p-3 bg-emerald-500/10 rounded-lg border border-emerald-500/30 tx tx-grain tx-weak"
			>
				<p class="text-sm text-emerald-600 dark:text-emerald-400">
					<strong>Tip:</strong> Click the "History" button on any project to see all its changes
					over time.
				</p>
			</div>
		</div>
	</div>

	<!-- Navigation -->
	<div class="flex justify-between items-center mt-8">
		<Button variant="ghost" onclick={handleSkip}>Skip Tour</Button>
		<Button
			variant="primary"
			size="lg"
			onclick={onNext}
			class="min-w-[200px] shadow-ink pressable"
		>
			Continue to Summary
			<ArrowRight class="w-5 h-5 ml-2" />
		</Button>
	</div>
</div>
