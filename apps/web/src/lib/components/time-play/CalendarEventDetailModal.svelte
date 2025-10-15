<!-- apps/web/src/lib/components/time-play/CalendarEventDetailModal.svelte -->
<script lang="ts">
	import Modal from '$lib/components/ui/Modal.svelte';
	import type { CalendarEvent } from '$lib/services/calendar-service';

	let { event, onClose }: { event: CalendarEvent; onClose: () => void } = $props();

	function formatDateTime(dateTime: string | undefined, date: string | undefined): string {
		if (dateTime) {
			return new Date(dateTime).toLocaleString('en-US', {
				weekday: 'long',
				month: 'long',
				day: 'numeric',
				year: 'numeric',
				hour: 'numeric',
				minute: '2-digit'
			});
		} else if (date) {
			return new Date(date).toLocaleDateString('en-US', {
				weekday: 'long',
				month: 'long',
				day: 'numeric',
				year: 'numeric'
			});
		}
		return 'Unknown';
	}

	function formatTime(dateTime: string | undefined): string {
		if (dateTime) {
			return new Date(dateTime).toLocaleTimeString('en-US', {
				hour: 'numeric',
				minute: '2-digit'
			});
		}
		return '';
	}

	function isAllDayEvent(): boolean {
		return Boolean(event.start.date && !event.start.dateTime);
	}
</script>

<Modal isOpen={true} {onClose} size="md" title={event.summary || '(No title)'}>
	<div class="space-y-6 px-3 sm:px-4 lg:px-6 py-3 sm:py-4">
		<!-- Event Status -->
		<div class="space-y-3">
			{#if event.status === 'cancelled'}
				<div
					class="inline-flex items-center gap-2 rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-300"
				>
					<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M6 18L18 6M6 6l12 12"
						/>
					</svg>
					Cancelled
				</div>
			{/if}
		</div>

		<!-- Event Details -->
		<div class="space-y-4">
			<!-- Time -->
			<div class="flex items-start gap-3">
				<svg
					class="mt-0.5 h-5 w-5 flex-shrink-0 text-slate-400 dark:text-slate-500"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
				<div class="flex-1">
					<div class="text-sm font-medium text-slate-900 dark:text-slate-50">
						{formatDateTime(event.start.dateTime, event.start.date)}
					</div>
					{#if !isAllDayEvent() && event.end.dateTime}
						<div class="mt-1 text-xs text-slate-600 dark:text-slate-400">
							Until {formatTime(event.end.dateTime)}
						</div>
					{:else if isAllDayEvent()}
						<div class="mt-1 text-xs text-slate-600 dark:text-slate-400">
							All day event
						</div>
					{/if}
				</div>
			</div>

			<!-- Description -->
			{#if event.description}
				<div class="flex items-start gap-3">
					<svg
						class="mt-0.5 h-5 w-5 flex-shrink-0 text-slate-400 dark:text-slate-500"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M4 6h16M4 12h16M4 18h7"
						/>
					</svg>
					<div class="flex-1">
						<div class="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">
							{event.description}
						</div>
					</div>
				</div>
			{/if}

			<!-- Location -->
			{#if event.location}
				<div class="flex items-start gap-3">
					<svg
						class="mt-0.5 h-5 w-5 flex-shrink-0 text-slate-400 dark:text-slate-500"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
						/>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
						/>
					</svg>
					<div class="flex-1">
						<div class="text-sm text-slate-700 dark:text-slate-300">
							{event.location}
						</div>
					</div>
				</div>
			{/if}

			<!-- Attendees -->
			{#if event.attendees && event.attendees.length > 0}
				<div class="flex items-start gap-3">
					<svg
						class="mt-0.5 h-5 w-5 flex-shrink-0 text-slate-400 dark:text-slate-500"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
						/>
					</svg>
					<div class="flex-1">
						<div class="text-sm font-medium text-slate-900 dark:text-slate-50">
							{event.attendees.length}
							{event.attendees.length === 1 ? 'attendee' : 'attendees'}
						</div>
						<div class="mt-2 space-y-1">
							{#each event.attendees as attendee}
								<div class="flex items-center gap-2 text-xs">
									<span
										class={`h-2 w-2 rounded-full ${
											attendee.responseStatus === 'accepted'
												? 'bg-green-500'
												: attendee.responseStatus === 'declined'
													? 'bg-red-500'
													: attendee.responseStatus === 'tentative'
														? 'bg-yellow-500'
														: 'bg-slate-300'
										}`}
									></span>
									<span class="text-slate-700 dark:text-slate-300">
										{attendee.displayName || attendee.email}
										{#if attendee.organizer}
											<span class="text-slate-500 dark:text-slate-400"
												>(Organizer)</span
											>
										{/if}
									</span>
								</div>
							{/each}
						</div>
					</div>
				</div>
			{/if}

			<!-- Google Meet Link -->
			{#if event.hangoutLink}
				<div class="flex items-start gap-3">
					<svg
						class="mt-0.5 h-5 w-5 flex-shrink-0 text-slate-400 dark:text-slate-500"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
						/>
					</svg>
					<div class="flex-1">
						<a
							href={event.hangoutLink}
							target="_blank"
							rel="noopener noreferrer"
							class="text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
						>
							Join with Google Meet
						</a>
					</div>
				</div>
			{/if}

			<!-- Recurring Event Indicator -->
			{#if event.recurringEventId}
				<div class="flex items-start gap-3">
					<svg
						class="mt-0.5 h-5 w-5 flex-shrink-0 text-slate-400 dark:text-slate-500"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
						/>
					</svg>
					<div class="flex-1">
						<div class="text-sm text-slate-700 dark:text-slate-300">
							Recurring event
						</div>
					</div>
				</div>
			{/if}
		</div>
	</div>

	<!-- Actions in Footer -->
	<div
		class="flex flex-col sm:flex-row gap-3 sm:justify-between px-3 sm:px-4 lg:px-6 py-3 sm:py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30"
		slot="footer"
	>
		<a
			href={event.htmlLink}
			target="_blank"
			rel="noopener noreferrer"
			class="order-2 sm:order-1 w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg bg-blue-500 px-4 py-3 sm:py-2 text-sm font-medium text-white transition hover:bg-blue-600 touch-manipulation"
		>
			<svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
				<path
					d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z"
				/>
			</svg>
			View in Google Calendar
		</a>
		<button
			onclick={onClose}
			class="order-1 sm:order-2 w-full sm:w-auto rounded-lg px-4 py-3 sm:py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 touch-manipulation"
		>
			Close
		</button>
	</div>
</Modal>
