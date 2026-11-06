<!-- apps/web/src/lib/components/profile/BriefsTab.svelte -->
<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { slide } from 'svelte/transition';
	import { slideMotion } from '$lib/components/project/v2/board-a11y';
	import { briefPreferencesStore } from '$lib/stores/briefPreferences';
	import { notificationPreferencesStore } from '$lib/stores/notificationPreferences';
	import type { BriefPreferences } from '$lib/stores/briefPreferences';
	import {
		Bell,
		Calendar,
		Coffee,
		Clock,
		Edit3,
		Save,
		X,
		RotateCcw,
		XCircle,
		RefreshCw,
		CircleAlert,
		Mail,
		Volume2,
		Check
	} from '$lib/icons/lucide';
	import Button from '$lib/components/ui/Button.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import ConfirmationModal from '$lib/components/ui/ConfirmationModal.svelte';
	import TabHeader from './_shared/TabHeader.svelte';
	import SettingsCard from './_shared/SettingsCard.svelte';
	import CheckboxField from './_shared/CheckboxField.svelte';

	interface Props {
		isAdmin?: boolean;
		initialVoiceNarrationEnabled?: boolean;
		onsuccess?: (event: { message: string }) => void;
		onerror?: (event: { message: string }) => void;
	}

	let {
		isAdmin = false,
		initialVoiceNarrationEnabled = false,
		onsuccess,
		onerror
	}: Props = $props();

	// State
	let editingBriefPreferences = $state(false);
	let briefPreferences = $state<BriefPreferences | null>(null);
	let briefPreferencesForm = $state<BriefPreferences>({
		frequency: 'daily',
		day_of_week: 1,
		time_of_day: '09:00:00',
		is_active: true
	});
	let refreshingJobs = $state(false);
	let voiceNarrationEnabled = $state(untrack(() => initialVoiceNarrationEnabled));
	let voiceNarrationSaving = $state(false);

	// Confirmation modal state
	let showResetConfirmation = $state(false);
	let cancelJobTarget = $state<any | null>(null);

	// Day of week options
	const DAY_OPTIONS = [
		{ value: 0, label: 'Sunday' },
		{ value: 1, label: 'Monday' },
		{ value: 2, label: 'Tuesday' },
		{ value: 3, label: 'Wednesday' },
		{ value: 4, label: 'Thursday' },
		{ value: 5, label: 'Friday' },
		{ value: 6, label: 'Saturday' }
	];

	// Helper functions for time format conversion
	function convertTimeToHHMMSS(timeHHMM: string): string {
		if (!timeHHMM) return '09:00:00';
		if (timeHHMM.includes(':') && timeHHMM.split(':').length === 2) {
			return `${timeHHMM}:00`;
		}
		return timeHHMM;
	}

	function convertTimeToHHMM(timeHHMMSS: string): string {
		if (!timeHHMMSS) return '09:00';
		const parts = timeHHMMSS.split(':');
		if (parts.length >= 2) {
			return `${parts[0]}:${parts[1]}`;
		}
		return timeHHMMSS;
	}

	// Store subscriptions
	let briefPreferencesState = $derived($briefPreferencesStore);
	let notificationPreferencesState = $derived($notificationPreferencesStore);

	// Update briefPreferences when store changes
	$effect(() => {
		if (briefPreferencesState.preferences) {
			briefPreferences = briefPreferencesState.preferences;
		}
	});

	let hasEmailOptIn = $derived(
		notificationPreferencesState.preferences?.should_email_daily_brief || false
	);

	// Handle store errors. Reads error then clears it; clearError mutates store
	// but the early return guards against re-entrant loops once cleared.
	$effect(() => {
		const err = briefPreferencesState.error;
		if (err) {
			onerror?.({ message: err });
			briefPreferencesStore.clearError();
		}
	});

	// One-way derived for the time input display. The input writes back via
	// handleTimeInput rather than bind:value to avoid the previous $effect
	// ping-pong between time_of_day (HH:MM:SS) and timeInputValue (HH:MM).
	let timeInputValue = $derived(convertTimeToHHMM(briefPreferencesForm.time_of_day));

	function handleTimeInput(value: string) {
		briefPreferencesForm.time_of_day = convertTimeToHHMMSS(value);
	}

	// Derived job lists (recomputed only when jobs change, not on every render)
	let upcomingJobs = $derived.by(() => {
		const now = new Date();
		return briefPreferencesState.jobs.filter((job) => new Date(job.scheduled_for) > now);
	});

	let recentJobs = $derived.by(() => {
		const now = new Date();
		return briefPreferencesState.jobs
			.filter((job) => new Date(job.scheduled_for) <= now)
			.slice(0, 2);
	});

	// Load brief preferences on mount
	async function loadBriefPreferences() {
		if (!briefPreferencesState?.preferences) {
			try {
				await briefPreferencesStore.load();
			} catch {
				onerror?.({ message: 'Failed to load brief preferences' });
			}
		}
	}

	// Refresh brief jobs
	async function refreshBriefJobs() {
		if (refreshingJobs) return;

		refreshingJobs = true;
		try {
			await briefPreferencesStore.loadJobs();
		} catch {
			onerror?.({ message: 'Failed to refresh brief jobs' });
		} finally {
			refreshingJobs = false;
		}
	}

	// Initialize on component load
	onMount(() => {
		loadBriefPreferences();
		// Also load notification preferences to show email opt-in status
		if (!notificationPreferencesState?.preferences) {
			notificationPreferencesStore.load();
		}
	});

	// Brief preferences functions
	function startEditingBriefPreferences() {
		editingBriefPreferences = true;
		briefPreferencesForm = briefPreferences
			? { ...briefPreferences }
			: briefPreferencesStore.getDefaults();
	}

	function cancelEditingBriefPreferences() {
		editingBriefPreferences = false;
		briefPreferencesForm = briefPreferences
			? { ...briefPreferences }
			: briefPreferencesStore.getDefaults();
	}

	async function saveBriefPreferences() {
		try {
			// Ensure time is in HH:MM:SS format before saving
			const formToSave = {
				...briefPreferencesForm,
				time_of_day: convertTimeToHHMMSS(timeInputValue)
			};

			await briefPreferencesStore.save(formToSave);
			editingBriefPreferences = false;
			onsuccess?.({ message: 'Brief preferences saved successfully' });
		} catch (error) {
			onerror?.({
				message: `Failed to save brief preferences: ${error instanceof Error ? error.message : 'Unknown error'}`
			});
		}
	}

	async function confirmResetBriefPreferences() {
		showResetConfirmation = false;
		try {
			await briefPreferencesStore.resetToDefaults();
			editingBriefPreferences = false;
			onsuccess?.({ message: 'Brief preferences reset to defaults' });
		} catch (error) {
			onerror?.({
				message: `Failed to reset preferences: ${error instanceof Error ? error.message : 'Unknown error'}`
			});
		}
	}

	async function confirmCancelBriefJob() {
		const job = cancelJobTarget;
		cancelJobTarget = null;
		if (!job) return;
		try {
			const briefDate = job.scheduled_for.split('T')[0];
			await briefPreferencesStore.cancelJob(briefDate);
			onsuccess?.({ message: 'Brief job cancelled successfully' });
		} catch (error) {
			onerror?.({
				message: `Failed to cancel brief job: ${error instanceof Error ? error.message : 'Unknown error'}`
			});
		}
	}

	type StatusInfo = {
		text: string;
		variant: 'success' | 'warning' | 'error' | 'info' | 'default';
	};

	const STATUS_DOT: Record<StatusInfo['variant'], string> = {
		success: 'bg-success',
		warning: 'bg-warning',
		error: 'bg-destructive',
		info: 'bg-muted-foreground',
		default: 'bg-muted-foreground'
	};

	// Job types are machine keys (e.g. generate_daily_brief); show plain words.
	const JOB_TYPE_LABELS: Record<string, string> = {
		generate_daily_brief: 'Daily brief',
		generate_weekly_brief: 'Weekly brief',
		daily_brief: 'Daily brief',
		weekly_brief: 'Weekly brief'
	};

	function formatJobType(jobType: string | null | undefined): string {
		if (!jobType) return 'Daily brief';
		const known = JOB_TYPE_LABELS[jobType];
		if (known) return known;
		const words = jobType.replace(/_/g, ' ').trim();
		return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Daily brief';
	}

	function formatJobStatus(status: string): StatusInfo {
		const statusMap: Record<string, StatusInfo> = {
			pending: { text: 'Pending', variant: 'warning' },
			generating: { text: 'Generating', variant: 'info' },
			completed: { text: 'Completed', variant: 'success' },
			failed: { text: 'Failed', variant: 'error' },
			cancelled: { text: 'Cancelled', variant: 'default' }
		};
		return statusMap[status] || { text: formatJobType(status), variant: 'default' };
	}

	function formatDateTime(dateString: string) {
		const date = new Date(dateString);
		return date.toLocaleString(undefined, {
			weekday: 'short',
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	async function saveVoiceNarration(enabled: boolean) {
		if (!isAdmin || voiceNarrationSaving) return;

		const previousValue = voiceNarrationEnabled;
		voiceNarrationEnabled = enabled;
		voiceNarrationSaving = true;

		try {
			const response = await fetch('/api/users/voice-narration', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ enabled })
			});

			const result = await response.json().catch(() => null);
			if (!response.ok || !result?.success) {
				throw new Error(result?.message || 'Failed to update voice narration');
			}

			voiceNarrationEnabled = Boolean(result.data?.voice_narration_enabled);
			onsuccess?.({
				message: voiceNarrationEnabled
					? 'Voice narration enabled for future briefs'
					: 'Voice narration disabled'
			});
		} catch (error) {
			voiceNarrationEnabled = previousValue;
			onerror?.({
				message: error instanceof Error ? error.message : 'Failed to update voice narration'
			});
		} finally {
			voiceNarrationSaving = false;
		}
	}
</script>

<div class="space-y-4 sm:space-y-5">
	<TabHeader
		icon={Coffee}
		title="Brief settings"
		description="When and how you get your daily brief"
	/>

	<!-- Brief Preferences -->
	<SettingsCard
		title="Brief preferences"
		description="When your brief arrives"
		icon={Bell}
		labelledById="brief-preferences-heading"
	>
		{#snippet actions()}
			{#if !editingBriefPreferences}
				<Button
					onclick={() => startEditingBriefPreferences()}
					variant="outline"
					size="sm"
					icon={Edit3}
				>
					Edit
				</Button>
			{:else}
				<Button
					onclick={() => (showResetConfirmation = true)}
					variant="ghost"
					size="sm"
					icon={RotateCcw}
				>
					Reset
				</Button>
				<Button
					onclick={() => cancelEditingBriefPreferences()}
					variant="ghost"
					size="sm"
					icon={X}
				>
					Cancel
				</Button>
				<Button
					onclick={() => saveBriefPreferences()}
					disabled={briefPreferencesState.isSaving}
					variant="primary"
					size="sm"
					loading={briefPreferencesState.isSaving}
					icon={Save}
				>
					Save
				</Button>
			{/if}
		{/snippet}

		{#if briefPreferencesState.isLoading}
			<div class="text-center py-8">
				<div
					class="animate-spin motion-reduce:animate-none rounded-full h-8 w-8 border-b-2 border-muted-foreground mx-auto"
				></div>
				<p class="text-sm text-muted-foreground mt-4">Loading preferences</p>
			</div>
		{:else if briefPreferencesState.error}
			<div class="text-center py-8">
				<CircleAlert class="w-10 h-10 text-destructive mx-auto mb-3" />
				<p class="text-sm text-muted-foreground mb-4">Failed to load brief preferences</p>
				<Button
					onclick={loadBriefPreferences}
					variant="primary"
					size="sm"
					icon={RefreshCw}
					class="pressable"
				>
					Retry
				</Button>
			</div>
		{:else if !editingBriefPreferences && briefPreferences}
			<!-- Display Mode -->
			<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
				<div>
					<p class="block text-sm font-medium text-foreground mb-2">Frequency</p>
					<div class="px-3 py-2 bg-muted text-foreground rounded-lg border border-border">
						{briefPreferences.frequency === 'daily' ? 'Daily' : 'Weekly'}
					</div>
				</div>

				{#if briefPreferences.frequency === 'weekly'}
					<div>
						<p class="block text-sm font-medium text-foreground mb-2">Day of week</p>
						<div
							class="px-3 py-2 bg-muted text-foreground rounded-lg border border-border"
						>
							{DAY_OPTIONS.find((d) => d.value === briefPreferences?.day_of_week)
								?.label || 'Monday'}
						</div>
					</div>
				{/if}

				<div>
					<p class="block text-sm font-medium text-foreground mb-2">Time</p>
					<div class="px-3 py-2 bg-muted text-foreground rounded-lg border border-border">
						{convertTimeToHHMM(briefPreferences?.time_of_day)}
					</div>
				</div>

				<div class="sm:col-span-2">
					<p class="block text-sm font-medium text-foreground mb-2">Status</p>
					<div class="space-y-2">
						<div class="flex flex-col sm:flex-row sm:items-center gap-2">
							<span class="inline-flex items-center gap-2 text-sm text-foreground">
								<span
									class="h-1.5 w-1.5 rounded-full {briefPreferences.is_active
										? 'bg-success'
										: 'bg-muted-foreground'}"
									aria-hidden="true"
								></span>
								{briefPreferences.is_active ? 'Active' : 'Paused'}
							</span>
							{#if briefPreferencesState.nextScheduledBrief}
								<span class="text-xs sm:text-sm text-muted-foreground">
									Next: {formatDateTime(
										briefPreferencesState.nextScheduledBrief.toISOString()
									)}
								</span>
							{/if}
						</div>
						{#if briefPreferences.is_active}
							<!--
								The toggle for this lives on the Notifications tab, so state it
								either way and link there — otherwise "off" looks like nothing
								at all and there is no route to the control.
							-->
							<div class="flex flex-wrap items-center gap-x-2 gap-y-1">
								<Mail class="w-4 h-4 text-muted-foreground" />
								<span class="text-sm text-muted-foreground">
									Email delivery {hasEmailOptIn ? 'enabled' : 'off'}
								</span>
								<a
									href="/profile?tab=notifications"
									class="rounded text-sm font-medium text-foreground underline underline-offset-2 decoration-border hover:decoration-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								>
									Change
								</a>
							</div>
						{/if}
					</div>
				</div>
			</div>
		{:else if editingBriefPreferences}
			<!-- Edit Mode -->
			<div class="space-y-4">
				<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
					<FormField
						label="Frequency"
						labelFor="brief-frequency"
						uppercase={false}
						showOptional={false}
					>
						<Select
							id="brief-frequency"
							bind:value={briefPreferencesForm.frequency}
							size="md"
						>
							<option value="daily">Daily</option>
							<option value="weekly">Weekly</option>
						</Select>
					</FormField>

					{#if briefPreferencesForm.frequency === 'weekly'}
						<FormField
							label="Day of week"
							labelFor="brief-day-of-week"
							uppercase={false}
							showOptional={false}
						>
							<Select
								id="brief-day-of-week"
								bind:value={briefPreferencesForm.day_of_week}
								size="md"
							>
								{#each DAY_OPTIONS as day (day.value)}
									<option value={day.value}>{day.label}</option>
								{/each}
							</Select>
						</FormField>
					{/if}

					<FormField
						label="Time"
						labelFor="briefTime"
						size="md"
						uppercase={false}
						showOptional={false}
					>
						<TextInput
							id="briefTime"
							type="time"
							value={timeInputValue}
							oninput={(e) =>
								handleTimeInput((e.currentTarget as HTMLInputElement).value)}
							size="md"
						/>
					</FormField>

					<div class="sm:col-span-2 space-y-3">
						<CheckboxField
							bind:checked={briefPreferencesForm.is_active}
							label="Enable daily brief generation"
							description="Briefs will be scheduled and generated at the selected time."
						/>

						{#if briefPreferencesForm.is_active}
							<div class="p-3 bg-muted/50 border border-border rounded-lg">
								<p class="text-xs text-muted-foreground">
									To get briefs by email or SMS, open the
									<a
										href="/profile?tab=notifications"
										class="text-foreground underline underline-offset-2 decoration-border hover:decoration-foreground"
										>Notifications</a
									> tab.
								</p>
							</div>
						{/if}
					</div>
				</div>

				{#if briefPreferencesForm.is_active}
					<div class="bg-muted/50 border border-border rounded-lg p-4">
						<div class="flex items-center gap-2">
							<Clock class="w-4 h-4 text-muted-foreground flex-shrink-0" />
							<p class="text-sm text-muted-foreground min-w-0">
								Scheduled {briefPreferencesForm.frequency === 'daily'
									? 'daily'
									: DAY_OPTIONS.find(
											(d) => d.value === briefPreferencesForm.day_of_week
										)?.label} at {convertTimeToHHMM(
									briefPreferencesForm.time_of_day
								)} in your timezone
							</p>
						</div>
					</div>
				{/if}
			</div>
		{/if}
	</SettingsCard>

	<!-- Voice Narration -->
	<SettingsCard
		title="Voice narration"
		description="Playable audio for future daily briefs"
		icon={Volume2}
		labelledById="voice-narration-heading"
	>
		{#snippet actions()}
			<span class="inline-flex items-center gap-2 text-xs text-muted-foreground">
				<span
					class="h-1.5 w-1.5 rounded-full {voiceNarrationEnabled
						? 'bg-success'
						: 'bg-muted-foreground'}"
					aria-hidden="true"
				></span>
				{voiceNarrationEnabled ? 'On' : 'Off'}
			</span>
		{/snippet}

		{#if !isAdmin}
			<div class="p-3 bg-muted border border-border rounded-lg">
				<p class="text-sm text-muted-foreground">Voice narration is in admin-only alpha.</p>
			</div>
		{:else}
			<div class="space-y-3">
				<label
					class="flex items-start gap-3 p-3 rounded-lg border border-border bg-card hover:bg-muted/50 cursor-pointer transition-colors duration-200 motion-reduce:transition-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-inset {voiceNarrationSaving
						? 'opacity-70 cursor-wait'
						: ''}"
				>
					<span class="relative inline-flex flex-shrink-0 mt-0.5">
						<input
							type="checkbox"
							checked={voiceNarrationEnabled}
							disabled={voiceNarrationSaving}
							onchange={(event) =>
								saveVoiceNarration(
									(event.currentTarget as HTMLInputElement).checked
								)}
							class="peer appearance-none w-4 h-4 rounded-md border border-border bg-background checked:bg-accent checked:border-accent focus:outline-none transition-colors duration-200 motion-reduce:transition-none disabled:opacity-50"
						/>
						<Check
							class="w-3 h-3 text-accent-foreground absolute top-0.5 left-0.5 pointer-events-none opacity-0 peer-checked:opacity-100 transition-opacity duration-150 motion-reduce:transition-none"
						/>
					</span>
					<span class="flex-1 min-w-0">
						<span class="block text-sm font-medium text-foreground leading-snug">
							Create audio narration for new briefs
						</span>
						<span class="block text-xs text-muted-foreground mt-0.5 leading-relaxed">
							Audio is generated after the brief completes and appears in the brief
							modal when ready.
						</span>
					</span>
				</label>

				{#if voiceNarrationSaving}
					<p class="text-xs text-muted-foreground">Saving</p>
				{/if}
			</div>
		{/if}
	</SettingsCard>

	<!-- Scheduled Briefs -->
	<SettingsCard
		title="Scheduled briefs"
		description="Upcoming and recent jobs"
		icon={Calendar}
		labelledById="scheduled-briefs-heading"
	>
		{#snippet actions()}
			<Button
				onclick={refreshBriefJobs}
				disabled={refreshingJobs}
				variant="ghost"
				size="sm"
				title="Refresh brief jobs"
				class="pressable"
			>
				<RefreshCw
					class={`w-4 h-4 ${refreshingJobs ? 'animate-spin motion-reduce:animate-none' : ''}`}
				/>
			</Button>
			<a
				href="/briefs?view=list"
				class="inline-flex items-center px-3 py-2 text-xs sm:text-sm text-muted-foreground hover:text-foreground font-medium rounded-lg hover:bg-muted/50 transition-colors motion-reduce:transition-none pressable focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset min-h-[44px]"
			>
				View all
			</a>
		{/snippet}

		{#if briefPreferencesState.isLoading}
			<div class="text-center py-8">
				<div
					class="animate-spin motion-reduce:animate-none rounded-full h-8 w-8 border-b-2 border-muted-foreground mx-auto"
				></div>
				<p class="text-sm text-muted-foreground mt-4">Loading scheduled briefs</p>
			</div>
		{:else if briefPreferencesState.jobs.length === 0}
			<div class="text-center py-8">
				<Calendar class="w-8 h-8 text-muted-foreground mx-auto mb-3" />
				<p class="text-sm text-muted-foreground mb-1">No scheduled briefs</p>
				<p class="text-xs text-muted-foreground">
					Turn on briefs above to start scheduling
				</p>
			</div>
		{:else}
			<div class="space-y-2">
				<!-- Upcoming Briefs -->
				{#each upcomingJobs as job (job.id)}
					{@const statusInfo = formatJobStatus(job.status)}
					<div
						class="flex items-center justify-between gap-3 p-3 bg-card border border-border rounded-lg"
						transition:slide={slideMotion()}
					>
						<div class="flex items-center gap-3 min-w-0">
							<Clock class="w-4 h-4 text-muted-foreground flex-shrink-0" />
							<div class="min-w-0">
								<p class="text-xs sm:text-sm font-medium text-foreground truncate">
									{formatDateTime(job.scheduled_for)}
								</p>
								<p class="text-xs text-muted-foreground">
									{formatJobType(job.job_type)}
								</p>
							</div>
						</div>
						<div class="flex items-center gap-2 flex-shrink-0">
							<span
								class="inline-flex items-center gap-2 text-xs text-muted-foreground"
							>
								<span
									class="h-1.5 w-1.5 rounded-full {STATUS_DOT[
										statusInfo.variant
									]}"
									aria-hidden="true"
								></span>
								{statusInfo.text}
							</span>
							{#if job.status === 'pending'}
								<Button
									onclick={() => (cancelJobTarget = job)}
									variant="ghost"
									size="sm"
									class="p-2 text-destructive hover:text-destructive/80 rounded-md pressable"
									title="Cancel job"
								>
									<XCircle class="w-4 h-4" />
								</Button>
							{/if}
						</div>
					</div>
				{/each}

				<!-- Recent Briefs -->
				{#each recentJobs as job (job.id)}
					{@const statusInfo = formatJobStatus(job.status)}
					<div
						class="flex items-center justify-between gap-3 p-3 bg-muted/50 border border-border rounded-lg"
						transition:slide={slideMotion()}
					>
						<div class="flex items-center gap-3 min-w-0">
							<Calendar class="w-4 h-4 text-muted-foreground flex-shrink-0" />
							<div class="min-w-0">
								<p class="text-xs sm:text-sm font-medium text-foreground truncate">
									{formatDateTime(job.scheduled_for)}
								</p>
								<p class="text-xs text-muted-foreground">
									{formatJobType(job.job_type)}
								</p>
							</div>
						</div>
						<div class="flex items-center gap-2 flex-shrink-0">
							<span
								class="inline-flex items-center gap-2 text-xs text-muted-foreground"
							>
								<span
									class="h-1.5 w-1.5 rounded-full {STATUS_DOT[
										statusInfo.variant
									]}"
									aria-hidden="true"
								></span>
								{statusInfo.text}
							</span>
							{#if job.error_message}
								<span
									class="text-xs text-destructive truncate max-w-[8rem]"
									title={job.error_message}
								>
									Error
								</span>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</SettingsCard>
</div>

<!-- Reset Preferences Confirmation -->
<ConfirmationModal
	isOpen={showResetConfirmation}
	title="Reset brief preferences"
	confirmText="Reset to defaults"
	cancelText="Cancel"
	confirmVariant="danger"
	icon="warning"
	onconfirm={confirmResetBriefPreferences}
	oncancel={() => (showResetConfirmation = false)}
>
	Are you sure you want to reset to default preferences? This will overwrite your current
	settings.
</ConfirmationModal>

<!-- Cancel Job Confirmation -->
<ConfirmationModal
	isOpen={cancelJobTarget !== null}
	title="Cancel scheduled brief"
	confirmText="Cancel brief"
	cancelText="Keep it"
	confirmVariant="danger"
	icon="warning"
	onconfirm={confirmCancelBriefJob}
	oncancel={() => (cancelJobTarget = null)}
>
	Are you sure you want to cancel this scheduled brief? This action cannot be undone.
</ConfirmationModal>
