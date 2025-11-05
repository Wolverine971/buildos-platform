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
			<Button variant="ghost" onclick={handleSkip} size="sm" class="text-gray-500">
				Skip Tour →
			</Button>
		</div>

		<div class="flex justify-center mb-6">
			<div
				class="w-16 h-16 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 rounded-2xl flex items-center justify-center shadow-lg"
			>
				<Info class="w-8 h-8 text-gray-600 dark:text-gray-400" />
			</div>
		</div>

		<h2 class="text-3xl sm:text-4xl font-bold mb-3 text-gray-900 dark:text-white">
			Explore More (Optional)
		</h2>
		<p class="text-lg text-gray-600 dark:text-gray-400 leading-relaxed max-w-2xl mx-auto">
			Feel free to skip this—you can explore these features anytime. Here's a quick tour of
			what else BuildOS offers.
		</p>
	</div>

	<!-- Feature Sections -->
	<div class="space-y-6 mb-8">
		<!-- 1. Profile Page -->
		<div
			class="bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-700 p-6 shadow-sm hover:shadow-md transition-shadow duration-200"
		>
			<div class="flex items-start gap-4 mb-4">
				<div
					class="flex-shrink-0 w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center"
				>
					<User class="w-6 h-6 text-blue-600 dark:text-blue-400" />
				</div>
				<div class="flex-1">
					<h3 class="text-xl font-bold mb-2 text-gray-900 dark:text-white">
						Your Profile & Settings
					</h3>
					<p class="text-sm text-gray-700 dark:text-gray-300 mb-4 leading-relaxed">
						Access all your settings and preferences in one place. Your profile contains
						everything BuildOS knows about how you work.
					</p>

					<!-- Tab Overview -->
					<div class="grid grid-cols-2 md:grid-cols-3 gap-2 mb-4">
						<div
							class="text-xs bg-gray-50 dark:bg-gray-900/50 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700"
						>
							<div class="font-medium text-gray-900 dark:text-white">
								Brief Settings
							</div>
							<div class="text-gray-600 dark:text-gray-400">Daily brief timing</div>
						</div>
						<div
							class="text-xs bg-gray-50 dark:bg-gray-900/50 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700"
						>
							<div class="font-medium text-gray-900 dark:text-white">Calendar</div>
							<div class="text-gray-600 dark:text-gray-400">
								Google Calendar setup
							</div>
						</div>
						<div
							class="text-xs bg-gray-50 dark:bg-gray-900/50 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700"
						>
							<div class="font-medium text-gray-900 dark:text-white">
								Notifications
							</div>
							<div class="text-gray-600 dark:text-gray-400">
								Email & SMS preferences
							</div>
						</div>
						<div
							class="text-xs bg-gray-50 dark:bg-gray-900/50 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700"
						>
							<div class="font-medium text-gray-900 dark:text-white">Account</div>
							<div class="text-gray-600 dark:text-gray-400">Account management</div>
						</div>
						<div
							class="text-xs bg-gray-50 dark:bg-gray-900/50 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700"
						>
							<div class="font-medium text-gray-900 dark:text-white">Billing</div>
							<div class="text-gray-600 dark:text-gray-400">Subscription details</div>
						</div>
					</div>
				</div>
			</div>

			<!-- Screenshot/Placeholder -->
			{#if ONBOARDING_V2_CONFIG.features.showPlaceholderAssets}
				<div
					class="bg-gray-100 dark:bg-gray-800 rounded-lg p-8 text-center border-2 border-dashed border-gray-300 dark:border-gray-600"
				>
					<User class="w-12 h-12 text-gray-400 mx-auto mb-4" />
					<p class="text-gray-500 text-sm">[Screenshot: Profile page with all tabs]</p>
				</div>
			{:else}
				<img
					src={ONBOARDING_V2_CONFIG.assets.screenshots.profilePageOverview}
					alt="Profile page overview"
					class="rounded-lg shadow-lg"
				/>
			{/if}

			<!-- CTA -->
			<div class="mt-4 flex justify-end">
				<a
					href="/profile"
					class="inline-flex items-center gap-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
				>
					Explore Profile
					<ExternalLink class="w-4 h-4" />
				</a>
			</div>
		</div>

		<!-- 2. History Page -->
		<div
			class="bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-700 p-6 shadow-sm hover:shadow-md transition-shadow duration-200"
		>
			<div class="flex items-start gap-4 mb-4">
				<div
					class="flex-shrink-0 w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center"
				>
					<History class="w-6 h-6 text-purple-600 dark:text-purple-400" />
				</div>
				<div class="flex-1">
					<h3 class="text-xl font-bold mb-2 text-gray-900 dark:text-white">
						Track Your Journey
					</h3>
					<p class="text-sm text-gray-700 dark:text-gray-300 mb-4 leading-relaxed">
						See all your past braindumps, track your activity patterns, and search
						through your history with a GitHub-style contribution chart.
					</p>

					<!-- Features list -->
					<div class="space-y-2 mb-4">
						<div
							class="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"
						>
							<div class="w-2 h-2 rounded-full bg-purple-500"></div>
							<span>GitHub-style contribution chart showing braindump activity</span>
						</div>
						<div
							class="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"
						>
							<div class="w-2 h-2 rounded-full bg-purple-500"></div>
							<span>View all past braindumps with search and filter</span>
						</div>
						<div
							class="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"
						>
							<div class="w-2 h-2 rounded-full bg-purple-500"></div>
							<span>Click any date to see that day's braindumps</span>
						</div>
					</div>
				</div>
			</div>

			<!-- Screenshot/Placeholder -->
			{#if ONBOARDING_V2_CONFIG.features.showPlaceholderAssets}
				<div
					class="bg-gray-100 dark:bg-gray-800 rounded-lg p-8 text-center border-2 border-dashed border-gray-300 dark:border-gray-600"
				>
					<History class="w-12 h-12 text-gray-400 mx-auto mb-4" />
					<p class="text-gray-500 text-sm">
						[Screenshot: History page with contribution chart]
					</p>
				</div>
			{:else}
				<img
					src={ONBOARDING_V2_CONFIG.assets.screenshots.historyPageContributionChart}
					alt="History page with contribution chart"
					class="rounded-lg shadow-lg"
				/>
			{/if}

			<!-- CTA -->
			<div class="mt-4 flex justify-end">
				<a
					href="/history"
					class="inline-flex items-center gap-2 text-sm font-medium text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 transition-colors"
				>
					View History
					<ExternalLink class="w-4 h-4" />
				</a>
			</div>
		</div>

		<!-- 3. Project History -->
		<div
			class="bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-700 p-6 shadow-sm hover:shadow-md transition-shadow duration-200"
		>
			<div class="flex items-start gap-4 mb-4">
				<div
					class="flex-shrink-0 w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center"
				>
					<GitBranch class="w-6 h-6 text-green-600 dark:text-green-400" />
				</div>
				<div class="flex-1">
					<h3 class="text-xl font-bold mb-2 text-gray-900 dark:text-white">
						See How Projects Evolve
					</h3>
					<p class="text-sm text-gray-700 dark:text-gray-300 mb-4 leading-relaxed">
						Every project change is tracked. See version-by-version comparisons, review
						past decisions, and understand what braindumps triggered each update.
					</p>

					<!-- Features list -->
					<div class="space-y-2 mb-4">
						<div
							class="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"
						>
							<div class="w-2 h-2 rounded-full bg-green-500"></div>
							<span>Version-by-version project tracking</span>
						</div>
						<div
							class="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"
						>
							<div class="w-2 h-2 rounded-full bg-green-500"></div>
							<span>See which braindumps triggered changes</span>
						</div>
						<div
							class="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"
						>
							<div class="w-2 h-2 rounded-full bg-green-500"></div>
							<span>Review decision history and past project states</span>
						</div>
					</div>
				</div>
			</div>

			<!-- Screenshot/Placeholder -->
			{#if ONBOARDING_V2_CONFIG.features.showPlaceholderAssets}
				<div
					class="bg-gray-100 dark:bg-gray-800 rounded-lg p-8 text-center border-2 border-dashed border-gray-300 dark:border-gray-600"
				>
					<GitBranch class="w-12 h-12 text-gray-400 mx-auto mb-4" />
					<p class="text-gray-500 text-sm">
						[Screenshot: Project history modal showing version comparison]
					</p>
				</div>
			{:else}
				<img
					src={ONBOARDING_V2_CONFIG.assets.screenshots.projectHistoryModal}
					alt="Project history modal"
					class="rounded-lg shadow-lg"
				/>
			{/if}

			<!-- Info Note -->
			<div
				class="mt-4 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800"
			>
				<p class="text-sm text-green-700 dark:text-green-300">
					<strong>Tip:</strong> Click the "History" button on any project to see all its changes
					over time.
				</p>
			</div>
		</div>
	</div>

	<!-- Navigation -->
	<div class="flex justify-between items-center mt-8">
		<Button variant="ghost" onclick={handleSkip}>Skip Tour</Button>
		<Button variant="primary" size="lg" onclick={onNext} class="min-w-[200px]">
			Continue to Summary
			<ArrowRight class="w-5 h-5 ml-2" />
		</Button>
	</div>
</div>
