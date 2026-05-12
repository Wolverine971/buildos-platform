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
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { Sparkles, MessageCircle, Zap, AlignLeft } from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import TabHeader from './_shared/TabHeader.svelte';
	import SettingsCard from './_shared/SettingsCard.svelte';
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

{#snippet OptionCard(
	option: { id: string; title: string; description: string },
	isSelected: boolean,
	onSelect: () => void
)}
	<button
		type="button"
		onclick={onSelect}
		disabled={isDisabled}
		class="text-left p-3 rounded-lg border transition-all duration-200 pressable {isSelected
			? 'border-accent bg-accent/5 shadow-ink'
			: 'border-border bg-card hover:border-accent/50 hover:shadow-ink'} {isDisabled
			? 'opacity-60 cursor-not-allowed'
			: ''}"
		aria-pressed={isSelected}
	>
		<h4 class="text-sm font-semibold text-foreground mb-1">{option.title}</h4>
		<p class="text-xs text-muted-foreground leading-relaxed">
			{option.description}
		</p>
	</button>
{/snippet}

<div class="space-y-4 sm:space-y-5">
	<TabHeader
		icon={Sparkles}
		title="AI Preferences"
		description="Control how BuildOS communicates and plans with you."
	/>

	{#if isLoading}
		<div class="bg-card border border-border rounded-lg shadow-ink p-6 text-center">
			<p class="text-sm text-muted-foreground">Loading preferences...</p>
		</div>
	{:else}
		<SettingsCard
			title="Communication style"
			description="Set the tone for chat responses, brief summaries, and planning guidance."
			icon={MessageCircle}
			labelledById="comm-style-heading"
			bodyClass="grid grid-cols-1 md:grid-cols-3 gap-3"
		>
			{#each communicationOptions as option}
				{@render OptionCard(
					option,
					communicationStyle === option.id,
					() => (communicationStyle = option.id)
				)}
			{/each}
		</SettingsCard>

		<SettingsCard
			title="Proactivity"
			description="Decide how much BuildOS should push beyond what you ask."
			icon={Zap}
			labelledById="proactivity-heading"
			bodyClass="grid grid-cols-1 md:grid-cols-3 gap-3"
		>
			{#each proactivityOptions as option}
				{@render OptionCard(
					option,
					proactivityLevel === option.id,
					() => (proactivityLevel = option.id)
				)}
			{/each}
		</SettingsCard>

		<SettingsCard
			title="Response length"
			description="Choose how detailed responses should be by default."
			icon={AlignLeft}
			labelledById="response-length-heading"
			bodyClass="grid grid-cols-1 md:grid-cols-3 gap-3"
		>
			{#each responseLengthOptions as option}
				{@render OptionCard(
					option,
					responseLength === option.id,
					() => (responseLength = option.id)
				)}
			{/each}
		</SettingsCard>

		<SettingsCard
			title="Working context"
			description="Optional details that help BuildOS tailor examples and recommendations."
			labelledById="working-context-heading"
			bodyClass="grid grid-cols-1 md:grid-cols-2 gap-4"
		>
			<FormField label="Your role" labelFor="primary-role">
				<TextInput
					id="primary-role"
					bind:value={primaryRole}
					placeholder="e.g., Product manager, Founder, Student"
					disabled={isDisabled}
				/>
			</FormField>
			<FormField label="Your domain" labelFor="domain-context">
				<TextInput
					id="domain-context"
					bind:value={domainContext}
					placeholder="e.g., B2B SaaS, Healthcare, Creative agency"
					disabled={isDisabled}
				/>
			</FormField>
		</SettingsCard>

		<div class="flex justify-end">
			<Button
				variant="primary"
				size="md"
				onclick={savePreferences}
				loading={isSaving}
				disabled={isDisabled}
				class="shadow-ink pressable"
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
