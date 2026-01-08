<!-- apps/web/src/lib/components/profile/PreferencesTab.svelte -->
<!--
	Preferences Tab - User Profile Settings

	Settings page for editing global AI preferences:
	- Communication style
	- Proactivity level
	- Response length
	- Working context (role, domain)

	These preferences are injected into all AI conversations.

	@see /apps/web/docs/features/preferences/README.md - Full preferences system documentation
	@see /apps/web/src/lib/services/agent-context-service.ts - Prompt injection implementation (lines 567-684)
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { Sparkles, MessageCircle, Zap, AlignLeft } from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import { toastService } from '$lib/stores/toast.store';
	import { requireApiData } from '$lib/utils/api-client-helpers';
	import type {
		UserPreferences,
		CommunicationStyle,
		ProactivityLevel,
		ResponseLength
	} from '$lib/types/user-preferences';

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

	const responseLengthOptions: Array<{
		id: ResponseLength;
		title: string;
		description: string;
	}> = [
		{
			id: 'concise',
			title: 'Concise',
			description: 'Short, focused answers with just the essentials.'
		},
		{
			id: 'detailed',
			title: 'Detailed',
			description: 'Provide context, examples, and deeper explanations.'
		},
		{
			id: 'adaptive',
			title: 'Adaptive',
			description: 'Match the depth of the question and situation.'
		}
	];

	const allowedCommunicationStyles = new Set(communicationOptions.map((option) => option.id));
	const allowedProactivityLevels = new Set(proactivityOptions.map((option) => option.id));
	const allowedResponseLengths = new Set(responseLengthOptions.map((option) => option.id));

	let communicationStyle = $state<CommunicationStyle | null>(null);
	let proactivityLevel = $state<ProactivityLevel | null>(null);
	let responseLength = $state<ResponseLength | null>(null);
	let primaryRole = $state('');
	let domainContext = $state('');
	let isLoading = $state(true);
	let isSaving = $state(false);

	const isDisabled = $derived(isLoading || isSaving);

	onMount(() => {
		void loadPreferences();
	});

	function applyPreferences(preferences: UserPreferences) {
		if (
			preferences.communication_style &&
			allowedCommunicationStyles.has(preferences.communication_style)
		) {
			communicationStyle = preferences.communication_style;
		} else {
			communicationStyle = null;
		}

		if (
			preferences.proactivity_level &&
			allowedProactivityLevels.has(preferences.proactivity_level)
		) {
			proactivityLevel = preferences.proactivity_level;
		} else {
			proactivityLevel = null;
		}

		if (
			preferences.response_length &&
			allowedResponseLengths.has(preferences.response_length)
		) {
			responseLength = preferences.response_length;
		} else {
			responseLength = null;
		}

		primaryRole = preferences.primary_role ?? '';
		domainContext = preferences.domain_context ?? '';
	}

	async function loadPreferences() {
		try {
			isLoading = true;
			const response = await fetch('/api/users/preferences');
			const data = await requireApiData<{ preferences: UserPreferences }>(
				response,
				'Failed to load preferences'
			);
			applyPreferences(data.preferences ?? {});
		} catch (error) {
			console.error('Failed to load preferences:', error);
			toastService.error('Failed to load preferences');
		} finally {
			isLoading = false;
		}
	}

	async function savePreferences() {
		if (isSaving) return;
		isSaving = true;

		try {
			const payload: Record<string, unknown> = {
				communication_style: communicationStyle ?? null,
				proactivity_level: proactivityLevel ?? null,
				response_length: responseLength ?? null,
				primary_role: primaryRole.trim() || null,
				domain_context: domainContext.trim() || null
			};

			const response = await fetch('/api/users/preferences', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});

			const data = await requireApiData<{ preferences: UserPreferences }>(
				response,
				'Failed to save preferences'
			);

			applyPreferences(data.preferences ?? {});
			toastService.success('Preferences saved!');
		} catch (error) {
			console.error('Failed to save preferences:', error);
			toastService.error('Failed to save preferences');
		} finally {
			isSaving = false;
		}
	}
</script>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex items-start gap-3 sm:gap-4">
		<div
			class="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-accent shadow-ink flex-shrink-0"
		>
			<Sparkles class="w-5 h-5 sm:w-6 sm:h-6 text-accent-foreground" />
		</div>
		<div class="flex-1 min-w-0">
			<h2 class="text-lg sm:text-2xl font-bold text-foreground">AI Preferences</h2>
			<p class="text-xs sm:text-base text-muted-foreground mt-1">
				Control how BuildOS communicates and plans with you.
			</p>
		</div>
	</div>

	{#if isLoading}
		<div class="bg-card border border-border rounded-lg shadow-ink p-6 text-center">
			<p class="text-sm text-muted-foreground">Loading preferences...</p>
		</div>
	{:else}
		<!-- Communication Style -->
		<div class="bg-card border border-border rounded-xl p-5 shadow-ink tx tx-frame tx-weak">
			<div class="flex items-center gap-2 mb-3">
				<MessageCircle class="w-4 h-4 text-accent" />
				<h3 class="text-base sm:text-lg font-semibold text-foreground">
					Communication style
				</h3>
			</div>
			<p class="text-sm text-muted-foreground mb-4">
				Set the tone for chat responses, brief summaries, and planning guidance.
			</p>
			<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
				{#each communicationOptions as option}
					{@const isSelected = communicationStyle === option.id}
					<button
						type="button"
						onclick={() => (communicationStyle = option.id)}
						disabled={isDisabled}
						class="text-left p-4 rounded-xl border transition-all duration-200 pressable {isSelected
							? 'border-accent bg-accent/5 shadow-ink'
							: 'border-border bg-card hover:border-accent/50 hover:shadow-ink'} {isDisabled
							? 'opacity-60 cursor-not-allowed'
							: ''}"
						aria-pressed={isSelected}
					>
						<h4 class="font-semibold text-foreground mb-1">{option.title}</h4>
						<p class="text-sm text-muted-foreground leading-relaxed">
							{option.description}
						</p>
					</button>
				{/each}
			</div>
		</div>

		<!-- Proactivity -->
		<div class="bg-card border border-border rounded-xl p-5 shadow-ink tx tx-frame tx-weak">
			<div class="flex items-center gap-2 mb-3">
				<Zap class="w-4 h-4 text-accent" />
				<h3 class="text-base sm:text-lg font-semibold text-foreground">Proactivity</h3>
			</div>
			<p class="text-sm text-muted-foreground mb-4">
				Decide how much BuildOS should push beyond what you ask.
			</p>
			<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
				{#each proactivityOptions as option}
					{@const isSelected = proactivityLevel === option.id}
					<button
						type="button"
						onclick={() => (proactivityLevel = option.id)}
						disabled={isDisabled}
						class="text-left p-4 rounded-xl border transition-all duration-200 pressable {isSelected
							? 'border-accent bg-accent/5 shadow-ink'
							: 'border-border bg-card hover:border-accent/50 hover:shadow-ink'} {isDisabled
							? 'opacity-60 cursor-not-allowed'
							: ''}"
						aria-pressed={isSelected}
					>
						<h4 class="font-semibold text-foreground mb-1">{option.title}</h4>
						<p class="text-sm text-muted-foreground leading-relaxed">
							{option.description}
						</p>
					</button>
				{/each}
			</div>
		</div>

		<!-- Response Length -->
		<div class="bg-card border border-border rounded-xl p-5 shadow-ink tx tx-frame tx-weak">
			<div class="flex items-center gap-2 mb-3">
				<AlignLeft class="w-4 h-4 text-accent" />
				<h3 class="text-base sm:text-lg font-semibold text-foreground">Response length</h3>
			</div>
			<p class="text-sm text-muted-foreground mb-4">
				Choose how detailed responses should be by default.
			</p>
			<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
				{#each responseLengthOptions as option}
					{@const isSelected = responseLength === option.id}
					<button
						type="button"
						onclick={() => (responseLength = option.id)}
						disabled={isDisabled}
						class="text-left p-4 rounded-xl border transition-all duration-200 pressable {isSelected
							? 'border-accent bg-accent/5 shadow-ink'
							: 'border-border bg-card hover:border-accent/50 hover:shadow-ink'} {isDisabled
							? 'opacity-60 cursor-not-allowed'
							: ''}"
						aria-pressed={isSelected}
					>
						<h4 class="font-semibold text-foreground mb-1">{option.title}</h4>
						<p class="text-sm text-muted-foreground leading-relaxed">
							{option.description}
						</p>
					</button>
				{/each}
			</div>
		</div>

		<!-- Working Context -->
		<div class="bg-card border border-border rounded-xl p-5 shadow-ink tx tx-frame tx-weak">
			<h3 class="text-base sm:text-lg font-semibold text-foreground mb-2">Working context</h3>
			<p class="text-sm text-muted-foreground mb-4">
				Optional details that help BuildOS tailor examples and recommendations.
			</p>
			<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
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
						disabled={isDisabled}
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
						disabled={isDisabled}
					/>
				</div>
			</div>
		</div>

		<div class="flex justify-end">
			<Button
				variant="primary"
				size="lg"
				onclick={savePreferences}
				loading={isSaving}
				disabled={isDisabled}
				class="shadow-ink pressable min-w-[200px]"
			>
				{#if isSaving}
					Saving...
				{:else}
					Save preferences
				{/if}
			</Button>
		</div>
	{/if}
</div>
