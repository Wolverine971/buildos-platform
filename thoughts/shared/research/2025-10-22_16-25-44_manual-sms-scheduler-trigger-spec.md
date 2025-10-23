---
date: 2025-10-22T20:25:44Z
researcher: Claude
git_commit: 5ac407a5a9fc08e33259dd42f1cb38c2615cfe3c
branch: main
repository: buildos-platform
topic: 'Manual SMS Scheduler Trigger - Admin Tool Implementation Spec'
tags: [research, sms-scheduler, admin-tools, notifications, calendar-integration]
status: complete
last_updated: 2025-10-22
last_updated_by: Claude
---

# Research: Manual SMS Scheduler Trigger - Admin Tool Implementation Spec

**Date**: 2025-10-22T20:25:44Z
**Researcher**: Claude
**Git Commit**: 5ac407a5a9fc08e33259dd42f1cb38c2615cfe3c
**Branch**: main
**Repository**: buildos-platform

## Research Question

Design and implement a manual trigger for the scheduled SMS flow that normally runs at 12am, with an admin UI at `/apps/web/src/routes/admin/notifications` that allows testing and monitoring of the SMS scheduling system.

## Executive Summary

The BuildOS platform has a sophisticated daily SMS scheduling system that runs at midnight UTC via a cron job. This spec outlines how to create a manual trigger that reuses the exact same code flow but can be executed on-demand through an admin interface. The solution consists of:

1. **API Endpoint**: `/api/admin/sms/daily-scheduler/trigger` - Manual trigger endpoint
2. **Admin UI**: `/admin/notifications/sms-scheduler` - Interactive testing interface
3. **Monitoring**: Real-time feedback showing what's happening during execution
4. **Code Reuse**: Leverages existing `checkAndScheduleDailySMS()` function from scheduler

## Current System Architecture

### Daily SMS Scheduling Flow

```
12:00 AM UTC (Cron)
     │
     ├─→ scheduler.ts: checkAndScheduleDailySMS()
     │   ├─ Fetch all users with SMS enabled
     │   ├─ Get user timezones
     │   └─ Queue 'schedule_daily_sms' jobs
     │
     ├─→ dailySmsWorker.ts: processDailySMS()
     │   ├─ Fetch calendar events (task_calendar_events table)
     │   ├─ Filter events needing reminders
     │   ├─ Generate LLM messages (DeepSeek)
     │   └─ Create scheduled_sms_messages records
     │
     └─→ smsWorker.ts: processSMSJob()
         ├─ Pre-send validation (quiet hours, limits)
         ├─ Send via Twilio
         └─ Update status and metrics
```

### Key Components

- **Scheduler**: `/apps/worker/src/scheduler.ts:602-687`
- **Daily SMS Worker**: `/apps/worker/src/workers/dailySmsWorker.ts`
- **SMS Message Generator**: `/apps/worker/src/lib/services/smsMessageGenerator.ts`
- **SMS Worker**: `/apps/worker/src/workers/smsWorker.ts`
- **Calendar Integration**: Uses `task_calendar_events` table (pre-synced from Google Calendar)

## Implementation Specification

### 1. API Endpoint: Manual Trigger

**Path**: `/apps/web/src/routes/api/admin/sms/daily-scheduler/trigger/+server.ts`

```typescript
import { json } from '@sveltejs/kit';
import { ApiResponse } from '$lib/utils/api-response';
import { createAdminServiceClient } from '$lib/server/supabase-admin';
import { supabase as workerSupabase } from '@buildos/supabase-client';
import type { RequestHandler } from './$types';

interface TriggerOptions {
	user_ids?: string[]; // Specific users to process (optional)
	dry_run?: boolean; // Preview without queueing jobs
	override_date?: string; // Override the date (YYYY-MM-DD)
	skip_quiet_hours?: boolean; // Ignore quiet hours for testing
	skip_daily_limit?: boolean; // Ignore daily SMS limits
}

export const POST: RequestHandler = async ({ request, locals }) => {
	// 1. Admin authentication check
	const session = await locals.getSession();
	if (!session?.user?.id) {
		return ApiResponse.unauthorized('Authentication required');
	}

	const adminClient = createAdminServiceClient();
	const { data: user } = await adminClient
		.from('users')
		.select('is_admin')
		.eq('id', session.user.id)
		.single();

	if (!user?.is_admin) {
		return ApiResponse.forbidden('Admin access required');
	}

	// 2. Parse options
	const options: TriggerOptions = await request.json();

	// 3. Rate limiting (prevent abuse)
	const rateLimitKey = `admin_sms_trigger:${session.user.id}`;
	const { data: recentTriggers } = await adminClient
		.from('admin_activity_logs')
		.select('id')
		.eq('admin_user_id', session.user.id)
		.eq('action', 'sms_scheduler_manual_trigger')
		.gte('created_at', new Date(Date.now() - 3600000).toISOString()) // 1 hour
		.limit(10);

	if (recentTriggers && recentTriggers.length >= 10) {
		return ApiResponse.tooManyRequests('Maximum 10 manual triggers per hour');
	}

	// 4. Log the admin action
	await adminClient.from('admin_activity_logs').insert({
		admin_user_id: session.user.id,
		action: 'sms_scheduler_manual_trigger',
		metadata: options,
		ip_address: request.headers.get('x-forwarded-for') || 'unknown'
	});

	try {
		// 5. Fetch eligible users
		let smsPreferencesQuery = adminClient
			.from('user_sms_preferences')
			.select('user_id, event_reminders_enabled, event_reminder_lead_time_minutes')
			.eq('event_reminders_enabled', true)
			.eq('phone_verified', true)
			.eq('opted_out', false);

		// Filter specific users if provided
		if (options.user_ids && options.user_ids.length > 0) {
			smsPreferencesQuery = smsPreferencesQuery.in('user_id', options.user_ids);
		}

		const { data: smsPreferences, error: prefError } = await smsPreferencesQuery;

		if (prefError) {
			return ApiResponse.error('Failed to fetch SMS preferences', prefError);
		}

		if (!smsPreferences || smsPreferences.length === 0) {
			return ApiResponse.success({
				message: 'No eligible users found',
				users_processed: 0,
				jobs_queued: 0
			});
		}

		// 6. Get user timezones
		const userIds = smsPreferences.map((p) => p.user_id);
		const { data: users } = await adminClient
			.from('users')
			.select('id, timezone')
			.in('id', userIds);

		const timezoneMap = new Map(users?.map((u) => [u.id, u.timezone || 'UTC']) || []);

		// 7. Process each user (dry run or actual)
		const results = {
			users_processed: smsPreferences.length,
			jobs_queued: 0,
			dry_run: options.dry_run || false,
			date_override: options.override_date,
			details: [] as any[]
		};

		const targetDate = options.override_date || new Date().toISOString().split('T')[0];

		for (const pref of smsPreferences) {
			const userTimezone = timezoneMap.get(pref.user_id) || 'UTC';

			const jobData = {
				userId: pref.user_id,
				date: targetDate,
				timezone: userTimezone,
				leadTimeMinutes: pref.event_reminder_lead_time_minutes || 15,
				// Add test flags if specified
				skipQuietHours: options.skip_quiet_hours || false,
				skipDailyLimit: options.skip_daily_limit || false,
				manualTrigger: true,
				triggeredBy: session.user.id
			};

			if (!options.dry_run) {
				// Queue the job using the worker's queue system
				const { error: queueError } = await workerSupabase.rpc('add_queue_job', {
					p_user_id: pref.user_id,
					p_job_type: 'schedule_daily_sms',
					p_metadata: jobData,
					p_scheduled_for: new Date().toISOString(),
					p_priority: 5,
					p_dedup_key: `manual-schedule-daily-sms-${pref.user_id}-${targetDate}-${Date.now()}`
				});

				if (!queueError) {
					results.jobs_queued++;
				}

				results.details.push({
					user_id: pref.user_id,
					timezone: userTimezone,
					lead_time_minutes: pref.event_reminder_lead_time_minutes,
					queued: !queueError,
					error: queueError?.message
				});
			} else {
				// Dry run - just collect what would be queued
				results.details.push({
					user_id: pref.user_id,
					timezone: userTimezone,
					lead_time_minutes: pref.event_reminder_lead_time_minutes,
					would_queue: true,
					job_data: jobData
				});
			}
		}

		// 8. Return results
		return ApiResponse.success({
			message: options.dry_run
				? `Dry run completed. Would queue ${results.users_processed} jobs`
				: `Successfully queued ${results.jobs_queued} of ${results.users_processed} SMS scheduling jobs`,
			...results
		});
	} catch (error) {
		console.error('Manual SMS scheduler trigger error:', error);
		return ApiResponse.error('Failed to trigger SMS scheduler', error);
	}
};

// GET endpoint to check job status
export const GET: RequestHandler = async ({ url, locals }) => {
	// Admin check...

	const userId = url.searchParams.get('user_id');
	const date = url.searchParams.get('date') || new Date().toISOString().split('T')[0];

	if (!userId) {
		return ApiResponse.badRequest('user_id parameter required');
	}

	// Fetch scheduled SMS messages for this user and date
	const adminClient = createAdminServiceClient();
	const { data: messages } = await adminClient
		.from('scheduled_sms_messages')
		.select(
			`
      *,
      sms_messages!scheduled_sms_messages_sms_message_id_fkey (
        status,
        twilio_sid,
        sent_at,
        phone_number
      )
    `
		)
		.eq('user_id', userId)
		.gte('scheduled_for', `${date}T00:00:00`)
		.lt('scheduled_for', `${date}T23:59:59`)
		.order('scheduled_for', { ascending: true });

	return ApiResponse.success({
		user_id: userId,
		date,
		message_count: messages?.length || 0,
		messages
	});
};
```

### 2. Admin UI Component

**Path**: `/apps/web/src/routes/admin/notifications/sms-scheduler/+page.svelte`

```svelte
<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import AdminPageHeader from '$lib/components/admin/AdminPageHeader.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Card } from '$lib/components/ui/card';
	import { Label } from '$lib/components/ui/label';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Alert, AlertDescription } from '$lib/components/ui/alert';
	import { Badge } from '$lib/components/ui/badge';
	import { Tabs, TabsContent, TabsList, TabsTrigger } from '$lib/components/ui/tabs';
	import { format } from 'date-fns';
	import { toast } from 'svelte-sonner';

	let userSearch = '';
	let selectedUsers: string[] = [];
	let searchResults: any[] = [];
	let isSearching = false;

	// Trigger options
	let dryRun = true;
	let overrideDate = format(new Date(), 'yyyy-MM-dd');
	let skipQuietHours = false;
	let skipDailyLimit = false;

	// Status tracking
	let isTriggering = false;
	let lastTriggerResult: any = null;
	let jobStatuses = new Map<string, any>();
	let isPolling = false;
	let pollInterval: NodeJS.Timeout | null = null;

	// Search users
	async function searchUsers() {
		if (!userSearch.trim()) return;

		isSearching = true;
		try {
			const response = await fetch(
				`/api/admin/users/search?q=${encodeURIComponent(userSearch)}&sms_enabled=true`
			);
			if (response.ok) {
				const data = await response.json();
				searchResults = data.users || [];
			}
		} catch (error) {
			toast.error('Failed to search users');
		} finally {
			isSearching = false;
		}
	}

	// Toggle user selection
	function toggleUser(userId: string) {
		if (selectedUsers.includes(userId)) {
			selectedUsers = selectedUsers.filter((id) => id !== userId);
		} else {
			selectedUsers = [...selectedUsers, userId];
		}
	}

	// Trigger the SMS scheduler
	async function triggerScheduler() {
		if (!dryRun && selectedUsers.length === 0) {
			toast.error('Please select at least one user for actual execution');
			return;
		}

		isTriggering = true;
		lastTriggerResult = null;

		try {
			const response = await fetch('/api/admin/sms/daily-scheduler/trigger', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					user_ids: selectedUsers.length > 0 ? selectedUsers : undefined,
					dry_run: dryRun,
					override_date: overrideDate,
					skip_quiet_hours: skipQuietHours,
					skip_daily_limit: skipDailyLimit
				})
			});

			const result = await response.json();

			if (response.ok && result.success) {
				lastTriggerResult = result.data;
				toast.success(result.data.message);

				// Start polling for job status if not dry run
				if (!dryRun && result.data.jobs_queued > 0) {
					startPollingJobStatus();
				}
			} else {
				toast.error(result.error || 'Failed to trigger scheduler');
			}
		} catch (error) {
			toast.error('Failed to trigger SMS scheduler');
			console.error(error);
		} finally {
			isTriggering = false;
		}
	}

	// Poll for job status
	function startPollingJobStatus() {
		if (isPolling) return;

		isPolling = true;
		pollJobStatus();

		// Poll every 2 seconds
		pollInterval = setInterval(pollJobStatus, 2000);

		// Stop polling after 30 seconds
		setTimeout(stopPollingJobStatus, 30000);
	}

	function stopPollingJobStatus() {
		isPolling = false;
		if (pollInterval) {
			clearInterval(pollInterval);
			pollInterval = null;
		}
	}

	async function pollJobStatus() {
		if (!lastTriggerResult?.details) return;

		for (const detail of lastTriggerResult.details) {
			if (detail.queued && detail.user_id) {
				try {
					const response = await fetch(
						`/api/admin/sms/daily-scheduler/trigger?user_id=${detail.user_id}&date=${overrideDate}`
					);

					if (response.ok) {
						const data = await response.json();
						jobStatuses.set(detail.user_id, data.data);
						jobStatuses = new Map(jobStatuses); // Trigger reactivity
					}
				} catch (error) {
					console.error('Failed to fetch job status:', error);
				}
			}
		}
	}

	// Load all SMS-enabled users
	async function loadAllSmsUsers() {
		isSearching = true;
		try {
			const response = await fetch('/api/admin/users?sms_enabled=true&limit=100');
			if (response.ok) {
				const data = await response.json();
				searchResults = data.users || [];
				toast.success(`Loaded ${searchResults.length} SMS-enabled users`);
			}
		} catch (error) {
			toast.error('Failed to load users');
		} finally {
			isSearching = false;
		}
	}

	onMount(() => {
		loadAllSmsUsers();
		return () => stopPollingJobStatus();
	});
</script>

<AdminPageHeader title="SMS Scheduler Manual Trigger" />

<div class="max-w-6xl mx-auto p-6 space-y-6">
	<!-- Info Alert -->
	<Alert>
		<AlertDescription>
			This tool manually triggers the daily SMS scheduling job that normally runs at 12:00 AM
			UTC. The same code flow is executed, but you can override settings for testing.
		</AlertDescription>
	</Alert>

	<Tabs value="trigger" class="w-full">
		<TabsList class="grid w-full grid-cols-3">
			<TabsTrigger value="trigger">Trigger Settings</TabsTrigger>
			<TabsTrigger value="results">Last Results</TabsTrigger>
			<TabsTrigger value="monitor">Job Monitor</TabsTrigger>
		</TabsList>

		<!-- Trigger Settings Tab -->
		<TabsContent value="trigger" class="space-y-6">
			<Card class="p-6">
				<h3 class="text-lg font-semibold mb-4">User Selection</h3>

				<!-- User Search -->
				<div class="flex gap-2 mb-4">
					<Input
						type="text"
						placeholder="Search users by email or name..."
						bind:value={userSearch}
						on:keydown={(e) => e.key === 'Enter' && searchUsers()}
					/>
					<Button on:click={searchUsers} disabled={isSearching}>
						{isSearching ? 'Searching...' : 'Search'}
					</Button>
					<Button variant="outline" on:click={loadAllSmsUsers}>Load All SMS Users</Button>
				</div>

				<!-- User Results -->
				{#if searchResults.length > 0}
					<div class="border rounded-lg p-4 max-h-64 overflow-y-auto">
						<div class="text-sm text-muted-foreground mb-2">
							{selectedUsers.length} of {searchResults.length} users selected
						</div>
						{#each searchResults as user}
							<label
								class="flex items-center gap-2 p-2 hover:bg-muted rounded cursor-pointer"
							>
								<Checkbox
									checked={selectedUsers.includes(user.id)}
									on:click={() => toggleUser(user.id)}
								/>
								<div class="flex-1">
									<div class="font-medium">{user.email}</div>
									<div class="text-sm text-muted-foreground">
										{user.full_name || 'No name'} · {user.timezone || 'UTC'}
									</div>
								</div>
								{#if user.sms_preferences}
									<Badge variant="outline">
										{user.sms_preferences.daily_sms_count || 0}/{user
											.sms_preferences.daily_sms_limit || 10} today
									</Badge>
								{/if}
							</label>
						{/each}
					</div>
				{/if}

				<!-- Selection Summary -->
				{#if selectedUsers.length > 0}
					<Alert class="mt-4">
						<AlertDescription>
							{selectedUsers.length} user{selectedUsers.length !== 1 ? 's' : ''} selected.
							Leave empty to process ALL SMS-enabled users.
						</AlertDescription>
					</Alert>
				{/if}
			</Card>

			<Card class="p-6">
				<h3 class="text-lg font-semibold mb-4">Trigger Options</h3>

				<div class="space-y-4">
					<!-- Dry Run -->
					<label class="flex items-center gap-2">
						<Checkbox bind:checked={dryRun} />
						<div>
							<div class="font-medium">Dry Run</div>
							<div class="text-sm text-muted-foreground">
								Preview what would happen without actually queueing jobs
							</div>
						</div>
					</label>

					<!-- Date Override -->
					<div>
						<Label for="override-date">Override Date</Label>
						<Input
							id="override-date"
							type="date"
							bind:value={overrideDate}
							class="max-w-xs"
						/>
						<p class="text-sm text-muted-foreground mt-1">
							Process calendar events for this date (user's timezone)
						</p>
					</div>

					<!-- Skip Quiet Hours -->
					<label class="flex items-center gap-2">
						<Checkbox bind:checked={skipQuietHours} />
						<div>
							<div class="font-medium">Skip Quiet Hours Check</div>
							<div class="text-sm text-muted-foreground">
								Send messages even during user's quiet hours (testing only)
							</div>
						</div>
					</label>

					<!-- Skip Daily Limit -->
					<label class="flex items-center gap-2">
						<Checkbox bind:checked={skipDailyLimit} />
						<div>
							<div class="font-medium">Skip Daily SMS Limit</div>
							<div class="text-sm text-muted-foreground">
								Ignore user's daily SMS limit (testing only)
							</div>
						</div>
					</label>
				</div>
			</Card>

			<!-- Trigger Button -->
			<div class="flex justify-end gap-4">
				<Button
					variant="outline"
					on:click={() => {
						selectedUsers = [];
						dryRun = true;
						skipQuietHours = false;
						skipDailyLimit = false;
					}}
				>
					Reset Options
				</Button>
				<Button
					on:click={triggerScheduler}
					disabled={isTriggering}
					variant={dryRun ? 'outline' : 'default'}
				>
					{#if isTriggering}
						Triggering...
					{:else if dryRun}
						Run Dry Test
					{:else}
						Execute Trigger
					{/if}
				</Button>
			</div>
		</TabsContent>

		<!-- Results Tab -->
		<TabsContent value="results">
			{#if lastTriggerResult}
				<Card class="p-6">
					<h3 class="text-lg font-semibold mb-4">Trigger Results</h3>

					<div class="space-y-4">
						<!-- Summary -->
						<div class="grid grid-cols-3 gap-4">
							<div>
								<div class="text-sm text-muted-foreground">Mode</div>
								<div class="font-semibold">
									{lastTriggerResult.dry_run ? 'Dry Run' : 'Executed'}
								</div>
							</div>
							<div>
								<div class="text-sm text-muted-foreground">Users Processed</div>
								<div class="font-semibold">{lastTriggerResult.users_processed}</div>
							</div>
							<div>
								<div class="text-sm text-muted-foreground">Jobs Queued</div>
								<div class="font-semibold">
									{lastTriggerResult.jobs_queued || 0}
								</div>
							</div>
						</div>

						<!-- Details -->
						{#if lastTriggerResult.details?.length > 0}
							<div>
								<h4 class="font-medium mb-2">User Details</h4>
								<div class="border rounded-lg overflow-hidden">
									<table class="w-full text-sm">
										<thead class="bg-muted">
											<tr>
												<th class="text-left p-2">User ID</th>
												<th class="text-left p-2">Timezone</th>
												<th class="text-left p-2">Lead Time</th>
												<th class="text-left p-2">Status</th>
											</tr>
										</thead>
										<tbody>
											{#each lastTriggerResult.details as detail}
												<tr class="border-t">
													<td class="p-2 font-mono text-xs">
														{detail.user_id.slice(0, 8)}...
													</td>
													<td class="p-2">{detail.timezone}</td>
													<td class="p-2"
														>{detail.lead_time_minutes} min</td
													>
													<td class="p-2">
														{#if detail.queued}
															<Badge variant="success">Queued</Badge>
														{:else if detail.would_queue}
															<Badge variant="secondary"
																>Would Queue</Badge
															>
														{:else if detail.error}
															<Badge variant="destructive"
																>Failed</Badge
															>
														{/if}
													</td>
												</tr>
											{/each}
										</tbody>
									</table>
								</div>
							</div>
						{/if}
					</div>
				</Card>
			{:else}
				<Alert>
					<AlertDescription>
						No trigger results yet. Run a trigger to see results here.
					</AlertDescription>
				</Alert>
			{/if}
		</TabsContent>

		<!-- Job Monitor Tab -->
		<TabsContent value="monitor">
			{#if jobStatuses.size > 0}
				<div class="space-y-4">
					{#each Array.from(jobStatuses.entries()) as [userId, status]}
						<Card class="p-4">
							<div class="flex items-start justify-between mb-2">
								<div>
									<div class="font-mono text-xs text-muted-foreground">
										User: {userId.slice(0, 8)}...
									</div>
									<div class="text-sm">
										{status.message_count} message{status.message_count !== 1
											? 's'
											: ''} scheduled
									</div>
								</div>
								{#if isPolling}
									<Badge variant="outline" class="animate-pulse">Polling...</Badge
									>
								{/if}
							</div>

							{#if status.messages?.length > 0}
								<div class="border rounded-lg overflow-hidden mt-3">
									<table class="w-full text-xs">
										<thead class="bg-muted">
											<tr>
												<th class="text-left p-2">Time</th>
												<th class="text-left p-2">Event</th>
												<th class="text-left p-2">Message</th>
												<th class="text-left p-2">Status</th>
											</tr>
										</thead>
										<tbody>
											{#each status.messages as msg}
												<tr class="border-t">
													<td class="p-2">
														{format(
															new Date(msg.scheduled_for),
															'HH:mm'
														)}
													</td>
													<td class="p-2 max-w-[200px] truncate">
														{msg.event_title}
													</td>
													<td class="p-2 max-w-[300px] truncate">
														{msg.message_content}
													</td>
													<td class="p-2">
														<Badge
															variant={msg.status === 'sent'
																? 'success'
																: msg.status === 'failed'
																	? 'destructive'
																	: msg.status === 'cancelled'
																		? 'secondary'
																		: 'outline'}
														>
															{msg.status}
														</Badge>
													</td>
												</tr>
											{/each}
										</tbody>
									</table>
								</div>
							{/if}
						</Card>
					{/each}
				</div>
			{:else}
				<Alert>
					<AlertDescription>
						No jobs being monitored. Execute a trigger (not dry run) to see live job
						status.
					</AlertDescription>
				</Alert>
			{/if}

			{#if isPolling}
				<div class="flex justify-center mt-4">
					<Button variant="outline" on:click={stopPollingJobStatus}>Stop Polling</Button>
				</div>
			{/if}
		</TabsContent>
	</Tabs>
</div>
```

### 3. Update Worker to Handle Manual Trigger Flags

**Update**: `/apps/worker/src/workers/dailySmsWorker.ts`

Add support for manual trigger flags in the `processDailySMS` function:

```typescript
// Add to the job data interface
interface DailySMSJobData {
	userId: string;
	date: string;
	timezone: string;
	leadTimeMinutes: number;
	// Manual trigger flags
	skipQuietHours?: boolean;
	skipDailyLimit?: boolean;
	manualTrigger?: boolean;
	triggeredBy?: string;
}

// In processDailySMS function, modify the quiet hours check:
if (!jobData.skipQuietHours) {
	const inQuietHours = await checkQuietHours(
		userPrefs.quiet_hours_start,
		userPrefs.quiet_hours_end,
		userPrefs.timezone
	);

	if (inQuietHours) {
		logger.info('User is in quiet hours, skipping SMS scheduling');
		return {
			success: true,
			skipped: true,
			reason: 'quiet_hours',
			manualOverrideAvailable: jobData.manualTrigger
		};
	}
}

// Modify the daily limit check:
if (!jobData.skipDailyLimit) {
	if (
		userPrefs.daily_sms_count != null &&
		userPrefs.daily_sms_count >= userPrefs.daily_sms_limit
	) {
		logger.info(
			`User has reached daily SMS limit (${userPrefs.daily_sms_count}/${userPrefs.daily_sms_limit})`
		);
		return {
			success: true,
			skipped: true,
			reason: 'daily_limit_reached',
			manualOverrideAvailable: jobData.manualTrigger
		};
	}
}

// Add manual trigger metadata to scheduled messages
if (jobData.manualTrigger) {
	scheduledMessage.metadata = {
		...scheduledMessage.metadata,
		manual_trigger: true,
		triggered_by: jobData.triggeredBy,
		trigger_date: new Date().toISOString()
	};
}
```

### 4. Add Admin Activity Logging Table (Optional)

```sql
-- Create admin activity logs table for audit trail
CREATE TABLE IF NOT EXISTS admin_activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,
  metadata JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for querying by admin and time
CREATE INDEX idx_admin_activity_logs_admin_created
  ON admin_activity_logs(admin_user_id, created_at DESC);

-- Index for querying by action type
CREATE INDEX idx_admin_activity_logs_action
  ON admin_activity_logs(action, created_at DESC);
```

### 5. Add Route to Admin Navigation

**Update**: `/apps/web/src/routes/admin/+layout.svelte`

Add the new tool to the admin navigation:

```svelte
{#if data.isAdmin}
	<nav>
		<!-- Existing items... -->

		<div class="nav-section">
			<h3>Notifications</h3>
			<a href="/admin/notifications/overview">Overview</a>
			<a href="/admin/notifications/test-bed">Test Sender</a>
			<a href="/admin/notifications/sms-scheduler">SMS Scheduler</a>
			<!-- NEW -->
			<a href="/admin/notifications/analytics">Analytics</a>
		</div>
	</nav>
{/if}
```

## Implementation Plan

### Phase 1: Backend Implementation (2 hours)

1. ✅ Create the API endpoint `/api/admin/sms/daily-scheduler/trigger/+server.ts`
2. ✅ Implement admin authentication and rate limiting
3. ✅ Add support for trigger options (dry run, date override, skip checks)
4. ✅ Update dailySmsWorker to handle manual trigger flags
5. ✅ Add admin activity logging for audit trail

### Phase 2: Frontend UI (2 hours)

1. ✅ Create the admin UI component at `/admin/notifications/sms-scheduler/+page.svelte`
2. ✅ Implement user search and selection
3. ✅ Add trigger options controls
4. ✅ Create results display tab
5. ✅ Implement real-time job monitoring with polling

### Phase 3: Testing & Polish (1 hour)

1. Test with various user selections
2. Verify dry run mode works correctly
3. Test date override functionality
4. Ensure quiet hours and limit skips work
5. Add error handling and edge cases
6. Add loading states and user feedback

## Key Features

### Admin Authentication

- Two-tier check: session + database `is_admin` flag
- Rate limiting to prevent abuse (10 triggers per hour)
- Activity logging for audit trail

### Trigger Options

- **User Selection**: Process specific users or all SMS-enabled users
- **Dry Run**: Preview without actually queueing jobs
- **Date Override**: Process events for a different date
- **Skip Quiet Hours**: Ignore quiet hours for testing
- **Skip Daily Limit**: Bypass SMS count limits for testing

### Monitoring & Feedback

- Real-time job status polling
- Detailed results showing what was queued
- Message preview showing generated SMS content
- Status tracking for each scheduled message

### Code Reuse

- Uses exact same `processDailySMS` function from worker
- Leverages existing queue system (`add_queue_job` RPC)
- Maintains all existing safety checks (unless explicitly skipped)
- Compatible with existing monitoring and analytics

## Security Considerations

1. **Admin-only access** with database role verification
2. **Rate limiting** prevents abuse (10 manual triggers per hour)
3. **Activity logging** creates audit trail
4. **Dry run by default** prevents accidental mass messaging
5. **Deduplication keys** prevent duplicate job queueing

## Benefits

1. **Testing**: Test SMS scheduling without waiting for midnight
2. **Debugging**: Investigate issues with specific users
3. **Recovery**: Re-run scheduling if cron job fails
4. **Development**: Test changes to SMS generation logic
5. **Support**: Help users who report missing SMS reminders

## Related Files

### Core Implementation

- `/apps/worker/src/scheduler.ts:602-687` - Original `checkAndScheduleDailySMS()` function
- `/apps/worker/src/workers/dailySmsWorker.ts` - SMS scheduling logic
- `/apps/worker/src/lib/services/smsMessageGenerator.ts` - LLM message generation
- `/apps/worker/src/workers/smsWorker.ts` - SMS sending logic

### Database Tables

- `user_sms_preferences` - User SMS settings
- `scheduled_sms_messages` - Scheduled SMS records
- `sms_messages` - SMS sending records
- `queue_jobs` - Job queue
- `task_calendar_events` - Calendar events

### Existing Admin Patterns

- `/apps/web/src/routes/api/admin/notifications/test/+server.ts` - Test notification sender
- `/apps/web/src/routes/admin/notifications/test-bed/+page.svelte` - Test UI pattern
- `/apps/web/src/lib/utils/api-response.ts` - API response utility

## Conclusion

This implementation provides a robust, secure, and user-friendly way to manually trigger the daily SMS scheduling flow. It reuses the existing worker code to ensure consistency, while adding testing capabilities through skip flags. The admin UI provides real-time feedback and monitoring, making it easy to test and debug the SMS scheduling system.

The solution follows established BuildOS patterns for admin tools, including proper authentication, rate limiting, activity logging, and comprehensive error handling. The dry run feature ensures safe testing, while the monitoring capabilities provide visibility into the scheduling process.
