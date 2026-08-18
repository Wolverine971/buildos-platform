<!-- apps/web/src/lib/components/profile/MultiCalendarConnections.svelte -->
<script lang="ts">
	import { CalendarDays, CircleAlert, CircleCheck, Plus, RefreshCw, Unlink } from 'lucide-svelte';
	import type {
		GoogleCalendarConnectionsPayload,
		GoogleCalendarSourceSummary
	} from '$lib/types/google-calendar-integration';
	import Button from '$lib/components/ui/Button.svelte';

	interface Props {
		payload: GoogleCalendarConnectionsPayload;
		onchanged: () => void | Promise<void>;
		onerror?: (event: { message: string }) => void;
	}

	let { payload, onchanged, onerror }: Props = $props();
	let pendingAction = $state<string | null>(null);

	const writableRoles = new Set(['writerWithoutPrivateAccess', 'writer', 'owner']);

	function isWritable(source: GoogleCalendarSourceSummary) {
		return writableRoles.has(source.accessRole);
	}

	function isActiveConnection(
		connection: GoogleCalendarConnectionsPayload['connections'][number]
	) {
		return connection.status === 'active';
	}

	async function requestJson(path: string, init?: RequestInit) {
		const response = await fetch(path, init);
		const body = await response.json().catch(() => null);
		if (!response.ok) {
			throw new Error(body?.message || body?.error || 'Calendar request failed');
		}
		return body?.data ?? body;
	}

	async function run(actionKey: string, action: () => Promise<void>) {
		if (pendingAction) return;
		pendingAction = actionKey;
		try {
			await action();
		} catch (error) {
			onerror?.({
				message: error instanceof Error ? error.message : 'Calendar request failed'
			});
		} finally {
			pendingAction = null;
		}
	}

	async function beginConnection(connectionId?: string) {
		await run(connectionId ? `reconnect:${connectionId}` : 'connect', async () => {
			const result = await requestJson('/api/integrations/google-calendar/connections', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					connectionId: connectionId ?? null,
					redirectPath: `${window.location.pathname}${window.location.search}`
				})
			});
			if (!result?.authorizationUrl)
				throw new Error('Google authorization URL was not returned');
			window.location.href = result.authorizationUrl;
		});
	}

	async function refreshSources(connectionId: string) {
		await run(`refresh:${connectionId}`, async () => {
			await requestJson(
				`/api/integrations/google-calendar/connections/${connectionId}/refresh-sources`,
				{ method: 'POST' }
			);
			await onchanged();
		});
	}

	async function disconnect(connectionId: string, label: string) {
		if (
			!window.confirm(`Disconnect ${label}? Existing events will keep their source mapping.`)
		) {
			return;
		}
		await run(`disconnect:${connectionId}`, async () => {
			await requestJson(`/api/integrations/google-calendar/connections/${connectionId}`, {
				method: 'DELETE'
			});
			await onchanged();
		});
	}

	async function renameConnection(connectionId: string, currentLabel: string, event: FocusEvent) {
		const input = event.currentTarget as HTMLInputElement;
		const accountLabel = input.value.trim();
		if (!accountLabel || accountLabel === currentLabel) return;
		await run(`rename:${connectionId}`, async () => {
			await requestJson(`/api/integrations/google-calendar/connections/${connectionId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ accountLabel })
			});
			await onchanged();
		});
	}

	async function setDefaultSource(event: Event) {
		const calendarSourceId = (event.currentTarget as HTMLSelectElement).value;
		if (!calendarSourceId || calendarSourceId === payload.defaultWriteCalendarSourceId) return;
		await run('default', async () => {
			await requestJson(
				'/api/integrations/google-calendar/preferences/default-write-source',
				{
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ calendarSourceId })
				}
			);
			await onchanged();
		});
	}

	async function setSourcePreference(
		calendarSourceId: string,
		preference: 'readEnabled' | 'availabilityEnabled' | 'analysisEnabled' | 'syncEnabled',
		event: Event
	) {
		const enabled = (event.currentTarget as HTMLInputElement).checked;
		await run(`source:${calendarSourceId}:${preference}`, async () => {
			await requestJson(`/api/integrations/google-calendar/sources/${calendarSourceId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ [preference]: enabled })
			});
			await onchanged();
		});
	}
</script>

<section
	class="rounded-xl border border-border bg-card shadow-sm"
	aria-labelledby="connected-calendars-heading"
>
	<div
		class="flex flex-col gap-3 border-b border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"
	>
		<div>
			<div class="flex items-center gap-2">
				<CalendarDays class="h-4 w-4 text-accent" />
				<h3 id="connected-calendars-heading" class="text-sm font-semibold text-foreground">
					Connected Google accounts
				</h3>
			</div>
			<p class="mt-1 text-xs text-muted-foreground">
				Choose which calendars inform BuildOS and where new events are created.
			</p>
		</div>
		<Button
			onclick={() => beginConnection()}
			disabled={!payload.available ||
				payload.connections.length >= payload.maxConnections ||
				Boolean(pendingAction)}
			loading={pendingAction === 'connect'}
			icon={Plus}
			variant="primary"
			size="sm"
		>
			Connect another
		</Button>
	</div>

	{#if payload.connections.length === 0}
		<div class="px-5 py-8 text-center">
			<p class="text-sm font-medium text-foreground">No Google Calendar accounts connected</p>
			<p class="mt-1 text-xs text-muted-foreground">
				Connect an account to choose calendars.
			</p>
		</div>
	{:else}
		<div class="space-y-3 p-3 sm:p-4">
			{#each payload.connections as connection (connection.id)}
				<article class="overflow-hidden rounded-lg border border-border bg-background">
					<div
						class="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4"
					>
						<div class="min-w-0 flex-1">
							<div class="flex items-center gap-2">
								{#if connection.status === 'active'}
									<CircleCheck class="h-4 w-4 shrink-0 text-success" />
								{:else}
									<CircleAlert class="h-4 w-4 shrink-0 text-warning" />
								{/if}
								<input
									class="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-sm font-semibold text-foreground hover:border-border focus:border-accent focus:outline-none"
									value={connection.accountLabel}
									aria-label={`Label for ${connection.emailAddress}`}
									onblur={(event) =>
										renameConnection(
											connection.id,
											connection.accountLabel,
											event
										)}
								/>
							</div>
							<p class="truncate pl-6 text-xs text-muted-foreground">
								{connection.emailAddress}
							</p>
						</div>
						<div class="flex items-center gap-1.5 pl-6 sm:pl-0">
							{#if connection.status !== 'active'}
								<Button
									onclick={() => beginConnection(connection.id)}
									loading={pendingAction === `reconnect:${connection.id}`}
									disabled={Boolean(pendingAction)}
									variant="secondary"
									size="sm"
								>
									Reconnect
								</Button>
							{/if}
							<Button
								onclick={() => refreshSources(connection.id)}
								loading={pendingAction === `refresh:${connection.id}`}
								disabled={connection.status !== 'active' || Boolean(pendingAction)}
								icon={RefreshCw}
								variant="ghost"
								size="sm"
								aria-label={`Refresh calendars for ${connection.accountLabel}`}
							></Button>
							<Button
								onclick={() => disconnect(connection.id, connection.accountLabel)}
								loading={pendingAction === `disconnect:${connection.id}`}
								disabled={Boolean(pendingAction)}
								icon={Unlink}
								variant="ghost"
								size="sm"
								aria-label={`Disconnect ${connection.accountLabel}`}
							></Button>
						</div>
					</div>

					<div class="border-t border-border bg-muted/30 px-3 py-3 sm:px-4">
						{#if connection.sources.length === 0}
							<p class="text-xs text-muted-foreground">
								No calendars discovered yet.
							</p>
						{:else}
							<div class="space-y-2">
								{#each connection.sources as source (source.id)}
									<div
										class="rounded-md border border-border/70 bg-card px-3 py-2.5"
									>
										<div class="flex items-start justify-between gap-3">
											<div class="min-w-0">
												<p
													class="truncate text-xs font-semibold text-foreground"
												>
													{source.summaryOverride || source.summary}
													{#if source.isPrimary}
														<span
															class="ml-1 font-normal text-muted-foreground"
															>Primary</span
														>
													{/if}
												</p>
												<p class="text-xs text-muted-foreground">
													{source.accessRole}
												</p>
											</div>
											{#if source.isDefaultWriteSource}
												<span
													class="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent"
												>
													Default write
												</span>
											{/if}
										</div>
										<div
											class="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground"
										>
											<label class="flex items-center gap-1.5">
												<input
													type="checkbox"
													checked={source.readEnabled}
													aria-label={`Events for ${source.summaryOverride || source.summary} in ${connection.accountLabel}`}
													disabled={!isActiveConnection(connection) ||
														source.accessRole === 'freeBusyReader' ||
														Boolean(pendingAction)}
													onchange={(event) =>
														setSourcePreference(
															source.id,
															'readEnabled',
															event
														)}
												/>
												Events
											</label>
											<label class="flex items-center gap-1.5">
												<input
													type="checkbox"
													checked={source.availabilityEnabled}
													aria-label={`Availability for ${source.summaryOverride || source.summary} in ${connection.accountLabel}`}
													disabled={!isActiveConnection(connection) ||
														Boolean(pendingAction)}
													onchange={(event) =>
														setSourcePreference(
															source.id,
															'availabilityEnabled',
															event
														)}
												/>
												Availability
											</label>
											<label class="flex items-center gap-1.5">
												<input
													type="checkbox"
													checked={source.analysisEnabled}
													aria-label={`Analysis for ${source.summaryOverride || source.summary} in ${connection.accountLabel}`}
													disabled={!isActiveConnection(connection) ||
														source.accessRole === 'freeBusyReader' ||
														Boolean(pendingAction)}
													onchange={(event) =>
														setSourcePreference(
															source.id,
															'analysisEnabled',
															event
														)}
												/>
												Analysis
											</label>
											<label class="flex items-center gap-1.5">
												<input
													type="checkbox"
													checked={source.syncEnabled}
													aria-label={`Two-way sync for ${source.summaryOverride || source.summary} in ${connection.accountLabel}`}
													disabled={!isActiveConnection(connection) ||
														!isWritable(source) ||
														Boolean(pendingAction)}
													onchange={(event) =>
														setSourcePreference(
															source.id,
															'syncEnabled',
															event
														)}
												/>
												Two-way sync
											</label>
										</div>
									</div>
								{/each}
							</div>
						{/if}
					</div>
				</article>
			{/each}
		</div>
	{/if}

	<div class="border-t border-border px-4 py-4 sm:px-5">
		<label for="default-calendar-source" class="block text-xs font-semibold text-foreground">
			Default calendar for new events
		</label>
		<select
			id="default-calendar-source"
			class="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none sm:max-w-md"
			value={payload.defaultWriteCalendarSourceId ?? ''}
			disabled={Boolean(pendingAction)}
			onchange={setDefaultSource}
		>
			<option value="" disabled>Choose a writable calendar</option>
			{#each payload.connections.filter(isActiveConnection) as connection (connection.id)}
				{#each connection.sources.filter(isWritable) as source (source.id)}
					<option value={source.id}>
						{connection.accountLabel} — {source.summaryOverride || source.summary}
					</option>
				{/each}
			{/each}
		</select>
		<p class="mt-1.5 text-xs text-muted-foreground">
			Changing this only affects future events. Existing events stay with their original
			account.
		</p>
	</div>
</section>
