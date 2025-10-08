<!-- apps/web/src/lib/components/admin/NotificationTypeSelector.svelte -->
<script lang="ts">
	import type { EventType } from '@buildos/shared-types';
	import { Shield, User, Info } from 'lucide-svelte';

	interface Props {
		value?: EventType;
		userIsSubscribed?: boolean;
		onchange?: (eventType: EventType) => void;
	}

	let { value = $bindable('brief.completed' as EventType), userIsSubscribed = false, onchange }: Props = $props();

	interface EventTypeOption {
		value: EventType;
		label: string;
		description: string;
		adminOnly: boolean;
		category: 'admin' | 'user';
	}

	const eventTypes: EventTypeOption[] = [
		// Admin Events
		{
			value: 'user.signup',
			label: 'User Signup',
			description: 'Triggered when a new user signs up for BuildOS',
			adminOnly: true,
			category: 'admin'
		},
		{
			value: 'user.trial_expired',
			label: 'Trial Expired',
			description: 'Notifies when user\'s trial period has expired',
			adminOnly: true,
			category: 'admin'
		},
		{
			value: 'payment.failed',
			label: 'Payment Failed',
			description: 'Alert when a payment transaction fails',
			adminOnly: true,
			category: 'admin'
		},
		{
			value: 'error.critical',
			label: 'Critical Error',
			description: 'System-wide critical error notification',
			adminOnly: true,
			category: 'admin'
		},
		// User Events
		{
			value: 'brief.completed',
			label: 'Brief Completed',
			description: 'Daily brief generation is complete and ready to view',
			adminOnly: false,
			category: 'user'
		},
		{
			value: 'brief.failed',
			label: 'Brief Failed',
			description: 'Daily brief generation failed with an error',
			adminOnly: false,
			category: 'user'
		},
		{
			value: 'brain_dump.processed',
			label: 'Brain Dump Processed',
			description: 'Brain dump has been successfully processed and tasks created',
			adminOnly: false,
			category: 'user'
		},
		{
			value: 'task.due_soon',
			label: 'Task Due Soon',
			description: 'Reminder that a task is approaching its due date',
			adminOnly: false,
			category: 'user'
		},
		{
			value: 'project.phase_scheduled',
			label: 'Phase Scheduled',
			description: 'Project phase has been scheduled to calendar',
			adminOnly: false,
			category: 'user'
		},
		{
			value: 'calendar.sync_failed',
			label: 'Calendar Sync Failed',
			description: 'Calendar synchronization encountered an error',
			adminOnly: false,
			category: 'user'
		}
	];

	let selectedEvent = $derived(eventTypes.find(e => e.value === value));
	let adminEvents = $derived(eventTypes.filter(e => e.category === 'admin'));
	let userEvents = $derived(eventTypes.filter(e => e.category === 'user'));

	function handleChange(event: Event) {
		const target = event.target as HTMLSelectElement;
		value = target.value as EventType;
		if (onchange) {
			onchange(value);
		}
	}
</script>

<div class="space-y-3">
	<div>
		<label for="event-type" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
			Notification Event Type
		</label>
		<select
			id="event-type"
			bind:value
			onchange={handleChange}
			class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
				   bg-white dark:bg-gray-800 text-gray-900 dark:text-white
				   focus:ring-2 focus:ring-blue-500 focus:border-transparent"
		>
			<optgroup label="Admin Events" class="text-red-600 dark:text-red-400">
				{#each adminEvents as event}
					<option value={event.value}>
						🔒 {event.label}
					</option>
				{/each}
			</optgroup>
			<optgroup label="User Events" class="text-blue-600 dark:text-blue-400">
				{#each userEvents as event}
					<option value={event.value}>
						👤 {event.label}
					</option>
				{/each}
			</optgroup>
		</select>
	</div>

	{#if selectedEvent}
		<div class="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
			<!-- Event Info -->
			<div class="flex items-start justify-between mb-3">
				<div class="flex-1">
					<div class="flex items-center space-x-2 mb-1">
						<h4 class="text-sm font-semibold text-gray-900 dark:text-white">
							{selectedEvent.label}
						</h4>
						{#if selectedEvent.adminOnly}
							<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
								<Shield class="w-3 h-3 mr-1" />
								Admin Only
							</span>
						{:else}
							<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
								<User class="w-3 h-3 mr-1" />
								User Event
							</span>
						{/if}
					</div>
					<p class="text-sm text-gray-600 dark:text-gray-400">
						{selectedEvent.description}
					</p>
				</div>
			</div>

			<!-- Event Type Details -->
			<div class="space-y-2 text-xs">
				<div class="flex items-center space-x-2">
					<span class="text-gray-600 dark:text-gray-400">Event Type:</span>
					<code class="px-2 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-gray-900 dark:text-white">
						{selectedEvent.value}
					</code>
				</div>

				<!-- User subscription status (if applicable for user events) -->
				{#if !selectedEvent.adminOnly}
					<div class="flex items-center space-x-2">
						<Info class="w-4 h-4 text-gray-500" />
						<span class="text-gray-600 dark:text-gray-400">
							Selected user is
							{#if userIsSubscribed}
								<span class="text-green-600 dark:text-green-400 font-medium">subscribed</span>
							{:else}
								<span class="text-orange-600 dark:text-orange-400 font-medium">not subscribed</span>
							{/if}
							to this event type
						</span>
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>
