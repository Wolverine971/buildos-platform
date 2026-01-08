<!-- apps/web/src/lib/components/onboarding-v2/PreferencesStep.svelte -->
<!--
	Preferences Step - Onboarding V2

	Captures user's AI interaction preferences during onboarding:
	- Communication style (direct, supportive, socratic)
	- Proactivity level (minimal, moderate, high)
	- Working context (role, domain) - optional

	@see /apps/web/docs/features/preferences/README.md - Full preferences system documentation
	@see /apps/web/docs/features/onboarding/README.md - Onboarding flow overview
	@see /apps/web/docs/features/onboarding/ONBOARDING_V2_UPDATE_ASSESSMENT.md - Implementation details
-->
<script lang="ts">
	import { MessageCircle, Zap, Sparkles } from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import { onboardingV2Service } from '$lib/services/onboarding-v2.service';
	import { toastService } from '$lib/stores/toast.store';

	interface Props {
		userId: string;
		onNext: () => void;
	}

	let { userId, onNext }: Props = $props();

	type CommunicationStyle = 'direct' | 'supportive' | 'socratic';
	type ProactivityLevel = 'minimal' | 'moderate' | 'high';

	const communicationOptions: Array<{
		id: CommunicationStyle;
		title: string;
		description: string;
	}> = [
		{
			id: 'direct',
			title: 'Direct',
			description: 'Get to the point quickly. Skip the fluff.'
		},
		{
			id: 'supportive',
			title: 'Supportive',
			description: 'Encouraging and patient. Help me think through things.'
		},
		{
			id: 'socratic',
			title: 'Socratic',
			description: 'Ask questions that help me find my own answers.'
		}
	];

	const proactivityOptions: Array<{
		id: ProactivityLevel;
		title: string;
		description: string;
	}> = [
		{
			id: 'minimal',
			title: 'Just Answer',
			description: 'Only respond to what I ask. No unsolicited insights.'
		},
		{
			id: 'moderate',
			title: 'Helpful Nudges',
			description: "Surface important things I might miss, but don't overdo it."
		},
		{
			id: 'high',
			title: 'Think Ahead',
			description: 'Proactively flag risks, suggest next steps, spot opportunities.'
		}
	];

	let communicationStyle = $state<CommunicationStyle | null>(null);
	let proactivityLevel = $state<ProactivityLevel | null>(null);
	let primaryRole = $state('');
	let domainContext = $state('');
	let isSaving = $state(false);

	const canContinue = $derived(communicationStyle !== null && proactivityLevel !== null);

	async function saveAndContinue() {
		if (!communicationStyle || !proactivityLevel) {
			toastService.error('Please choose your communication and proactivity preferences.');
			return;
		}

		isSaving = true;

		try {
			await onboardingV2Service.savePreferences(userId, {
				communication_style: communicationStyle,
				proactivity_level: proactivityLevel,
				primary_role: primaryRole.trim() || undefined,
				domain_context: domainContext.trim() || undefined
			});

			toastService.success('Preferences saved!');
			onNext();
		} catch (error) {
			console.error('Failed to save preferences:', error);
			toastService.error('Failed to save preferences. Please try again.');
		} finally {
			isSaving = false;
		}
	}
</script>

<div class="max-w-4xl mx-auto px-4">
	<!-- Header -->
	<div class="mb-10 text-center">
		<div class="flex justify-center mb-6">
			<div
				class="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center shadow-ink tx tx-bloom tx-weak"
			>
				<Zap class="w-8 h-8 text-accent" />
			</div>
		</div>

		<h2 class="text-3xl sm:text-4xl font-bold mb-3 text-foreground">
			Step 5: Your Communication Preferences
		</h2>
		<p class="text-lg text-muted-foreground leading-relaxed max-w-2xl mx-auto">
			These settings shape how BuildOS responds in chat, planning, and daily briefs.
		</p>
	</div>

	<!-- Communication Style -->
	<div class="mb-10">
		<h3 class="text-2xl font-bold mb-4 text-foreground text-center">
			How do you like AI to communicate?
		</h3>

		<div class="grid grid-cols-1 md:grid-cols-3 gap-5">
			{#each communicationOptions as option}
				{@const isSelected = communicationStyle === option.id}
				<button
					onclick={() => (communicationStyle = option.id)}
					class="text-left p-5 rounded-xl border transition-all duration-200 pressable {isSelected
						? 'border-accent bg-accent/5 shadow-ink'
						: 'border-border bg-card hover:border-accent/50 hover:shadow-ink'}"
					aria-pressed={isSelected}
				>
					<div class="flex items-center gap-3 mb-2">
						<div
							class="w-10 h-10 rounded-lg flex items-center justify-center {isSelected
								? 'bg-accent text-accent-foreground'
								: 'bg-muted text-muted-foreground'}"
						>
							<MessageCircle class="w-5 h-5" />
						</div>
						<h4 class="font-semibold text-foreground">{option.title}</h4>
					</div>
					<p class="text-sm text-muted-foreground leading-relaxed">
						{option.description}
					</p>
				</button>
			{/each}
		</div>
	</div>

	<!-- Proactivity -->
	<div class="mb-12">
		<h3 class="text-2xl font-bold mb-4 text-foreground text-center">
			How proactive should BuildOS be?
		</h3>

		<div class="grid grid-cols-1 md:grid-cols-3 gap-5">
			{#each proactivityOptions as option}
				{@const isSelected = proactivityLevel === option.id}
				<button
					onclick={() => (proactivityLevel = option.id)}
					class="text-left p-5 rounded-xl border transition-all duration-200 pressable {isSelected
						? 'border-emerald-500/60 bg-emerald-500/5 shadow-ink'
						: 'border-border bg-card hover:border-emerald-500/50 hover:shadow-ink'}"
					aria-pressed={isSelected}
				>
					<div class="flex items-center gap-3 mb-2">
						<div
							class="w-10 h-10 rounded-lg flex items-center justify-center {isSelected
								? 'bg-emerald-600 text-white'
								: 'bg-muted text-muted-foreground'}"
						>
							<Sparkles class="w-5 h-5" />
						</div>
						<h4 class="font-semibold text-foreground">{option.title}</h4>
					</div>
					<p class="text-sm text-muted-foreground leading-relaxed">
						{option.description}
					</p>
				</button>
			{/each}
		</div>
	</div>

	<!-- Working Context -->
	<div class="mb-10 bg-card rounded-xl border border-border p-6 shadow-ink tx tx-frame tx-weak">
		<h3 class="text-xl font-semibold text-foreground mb-2 text-center">
			Optional: Your working context
		</h3>
		<p class="text-sm text-muted-foreground text-center mb-6">
			This helps BuildOS tailor examples, suggestions, and planning language.
		</p>

		<div class="grid grid-cols-1 md:grid-cols-2 gap-5">
			<div>
				<label
					for="primary-role"
					class="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2"
				>
					Your role
				</label>
				<TextInput
					id="primary-role"
					bind:value={primaryRole}
					placeholder="e.g., Product manager, Founder, Student"
				/>
			</div>
			<div>
				<label
					for="domain-context"
					class="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2"
				>
					Your domain
				</label>
				<TextInput
					id="domain-context"
					bind:value={domainContext}
					placeholder="e.g., B2B SaaS, Healthcare, Creative agency"
				/>
			</div>
		</div>
	</div>

	<div class="flex flex-col items-center gap-4">
		<Button
			variant="primary"
			size="lg"
			onclick={saveAndContinue}
			disabled={!canContinue || isSaving}
			loading={isSaving}
			class="min-w-[220px] shadow-ink pressable"
		>
			{#if isSaving}
				Saving...
			{:else}
				Continue
				<Sparkles class="w-5 h-5 ml-2" />
			{/if}
		</Button>
		<p class="text-sm text-muted-foreground">You can change these later in settings.</p>
	</div>
</div>
