<!-- apps/web/src/lib/components/profile/MultiCalendarConnections.svelte -->
<script lang="ts">
	import { CalendarDays, Plus, RefreshCw, Unlink } from '$lib/icons/lucide';
	import type {
		GoogleCalendarConnectionsPayload,
		GoogleCalendarSourceSummary
	} from '$lib/types/google-calendar-integration';
	import Button from '$lib/components/ui/Button.svelte';
	import ErrorBoundary from '$lib/components/ui/ErrorBoundary.svelte';
	import GoogleAgentAccess from './GoogleAgentAccess.svelte';

	interface Props {
		payload: GoogleCalendarConnectionsPayload;
		onchanged: () => void | Promise<void>;
		onerror?: (event: { message: string }) => void;
	}

	let { payload, onchanged, onerror }: Props = $props();
	let pendingAction = $state<string | null>(null);

	const writableRoles = new Set(['writerWithoutPrivateAccess', 'writer', 'owner']);

	// Google access roles are API keys; show what they mean.
	const ACCESS_ROLE_LABELS: Record<string, string> = {
		owner: 'Owner',
		writer: 'Can edit',
		writerWithoutPrivateAccess: 'Can edit',
		reader: 'View only',
		freeBusyReader: 'Free/busy only'
	};

	function accessRoleLabel(role: string | null | undefined) {
		if (!role) return '';
		const known = ACCESS_ROLE_LABELS[role];
		if (known) return known;
		const words = role
			.replace(/_/g, ' ')
			.replace(/([a-z])([A-Z])/g, '$1 $2')
			.toLowerCase()
			.trim();
		return words.charAt(0).toUpperCase() + words.slice(1);
	}

	function isWritable(source: GoogleCalendarSourceSummary) {
		return writableRoles.has(source.accessRole);
	}

	function isActiveConnection(
		connection: GoogleCalendarConnectionsPayload['connections'][number]
	) {
		return connection.status === 'active';
	}

	function sourceBaseLabel(source: GoogleCalendarSourceSummary) {
		return (source.summaryOverride || source.summary || 'Untitled calendar').trim();
	}

	function sourceDisplayLabel(
		connection: GoogleCalendarConnectionsPayload['connections'][number],
		source: GoogleCalendarSourceSummary
	) {
		const baseLabel = sourceBaseLabel(source);
		const duplicateCount = connection.sources.filter(
			(candidate) =>
				sourceBaseLabel(candidate).toLocaleLowerCase() === baseLabel.toLocaleLowerCase()
		).length;
		if (duplicateCount < 2) return baseLabel;
		const providerId = source.providerCalendarId.trim();
		const suffix = providerId.length > 16 ? `…${providerId.slice(-12)}` : providerId;
		return suffix ? `${baseLabel} · ${suffix}` : `${baseLabel} · ${source.id.slice(0, 8)}`;
	}

	async function requestJson(path: string, init?: RequestInit) {
		const response = await fetch(path, init);
		const body = await response.json().catch(() => null);
		if (!response.ok) {
			throw new Error(body?.message || body?.error || 'Calendar request failed');
		}
		return body?.data ?? body;
	}

	/** Returns false when the action was skipped (another is pending) or failed. */
	async function run(actionKey: string, action: () => Promise<void>): Promise<boolean> {
		if (pendingAction) return false;
		pendingAction = actionKey;
		try {
			await action();
			return true;
		} catch (error) {
			onerror?.({
				message: error instanceof Error ? error.message : 'Calendar request failed'
			});
			return false;
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
		if (!window.confirm(`Disconnect ${label}?`)) return;
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
		const saved = await run(`rename:${connectionId}`, async () => {
			await requestJson(`/api/integrations/google-calendar/connections/${connectionId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ accountLabel })
			});
			await onchanged();
		});
		// Unchanged props do not re-render, so put the saved value back by hand.
		if (!saved) input.value = currentLabel;
	}

	async function setDefaultSource(event: Event) {
		const select = event.currentTarget as HTMLSelectElement;
		const previousSourceId = payload.defaultWriteCalendarSourceId ?? '';
		const calendarSourceId = select.value;
		if (!calendarSourceId || calendarSourceId === payload.defaultWriteCalendarSourceId) return;
		const saved = await run('default', async () => {
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
		if (!saved) select.value = previousSourceId;
	}

	async function setSourcePreference(
		calendarSourceId: string,
		preference: 'readEnabled' | 'availabilityEnabled' | 'analysisEnabled' | 'syncEnabled',
		event: Event
	) {
		const input = event.currentTarget as HTMLInputElement;
		const enabled = input.checked;
		const saved = await run(`source:${calendarSourceId}:${preference}`, async () => {
			await requestJson(`/api/integrations/google-calendar/sources/${calendarSourceId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ [preference]: enabled })
			});
			await onchanged();
		});
		// On failure the prop is unchanged, so the toggle would stay flipped.
		if (!saved) input.checked = !enabled;
	}
</script>

<section
	class="rounded-xl border border-border bg-card"
	aria-labelledby="connected-calendars-heading"
>
	<div
		class="flex flex-col gap-3 border-b border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"
	>
		<div>
			<div class="flex items-center gap-2">
				<CalendarDays class="h-4 w-4 text-muted-foreground" />
				<h3 id="connected-calendars-heading" class="text-sm font-medium text-foreground">
					Connected Google accounts
				</h3>
			</div>
			<p class="mt-1 text-xs text-muted-foreground">
				Choose which calendars BuildOS reads and where new events go
			</p>
		</div>
		<Button
			onclick={() => beginConnection()}
			disabled={!payload.available ||
				payload.connections.length >= payload.maxConnections ||
				Boolean(pendingAction)}
			loading={pendingAction === 'connect'}
			icon={Plus}
			variant={payload.connections.length === 0 ? 'primary' : 'outline'}
			size="sm"
		>
			Connect another
		</Button>
	</div>

	{#if payload.connections.length === 0}
		<div class="px-5 py-8 text-center">
			<p class="text-sm font-medium text-foreground">No Google Calendar accounts connected</p>
			<p class="mt-1 text-xs text-muted-foreground">Connect an account to choose calendars</p>
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
								<span class="flex h-4 w-4 shrink-0 items-center justify-center">
									<span
										class="h-1.5 w-1.5 rounded-full {connection.status ===
										'active'
											? 'bg-success'
											: 'bg-warning'}"
										aria-hidden="true"
									></span>
									<span class="sr-only"
										>{connection.status === 'active'
											? 'Connected'
											: 'Needs reconnect'}</span
									>
								</span>
								<input
									class="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 py-0.5 text-sm font-medium text-foreground hover:border-border focus:border-ring focus:outline-none"
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
						<div class="flex items-center gap-2 pl-6 sm:pl-0">
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

					<div class="border-t border-border px-3 py-3 sm:px-4">
						<ErrorBoundary
							area="calendar-agent-access"
							context={{ connectionId: connection.id }}
						>
							<GoogleAgentAccess kind="calendar" connectionId={connection.id} />
						</ErrorBoundary>
					</div>

					<div class="border-t border-border bg-muted/30 px-3 py-3 sm:px-4">
						{#if connection.sources.length === 0}
							<p class="text-xs text-muted-foreground">No calendars found yet</p>
						{:else}
							<div class="space-y-2">
								{#each connection.sources as source (source.id)}
									<div class="rounded-lg border border-border bg-card px-3 py-3">
										<div class="flex items-start justify-between gap-3">
											<div class="min-w-0">
												<p
													class="truncate text-xs font-medium text-foreground"
												>
													{sourceDisplayLabel(connection, source)}
													{#if source.isPrimary}
														<span
															class="ml-1 font-normal text-muted-foreground"
															>Primary</span
														>
													{/if}
												</p>
												<p class="text-xs text-muted-foreground">
													{accessRoleLabel(source.accessRole)}
												</p>
											</div>
											{#if source.isDefaultWriteSource}
												<span
													class="shrink-0 text-xs text-muted-foreground"
												>
													Default for new events
												</span>
											{/if}
										</div>
										<div
											class="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground"
										>
											<label class="flex items-center gap-2">
												<input
													type="checkbox"
													checked={source.readEnabled}
													aria-label={`Events for ${sourceDisplayLabel(connection, source)} in ${connection.accountLabel}`}
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
											<label class="flex items-center gap-2">
												<input
													type="checkbox"
													checked={source.availabilityEnabled}
													aria-label={`Availability for ${sourceDisplayLabel(connection, source)} in ${connection.accountLabel}`}
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
											<label class="flex items-center gap-2">
												<input
													type="checkbox"
													checked={source.analysisEnabled}
													aria-label={`Analysis for ${sourceDisplayLabel(connection, source)} in ${connection.accountLabel}`}
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
											<label class="flex items-center gap-2">
												<input
													type="checkbox"
													checked={source.syncEnabled}
													aria-label={`Two-way sync for ${sourceDisplayLabel(connection, source)} in ${connection.accountLabel}`}
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
		<label for="default-calendar-source" class="block text-sm font-medium text-foreground">
			Default calendar for new events
		</label>
		<select
			id="default-calendar-source"
			class="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none sm:max-w-md"
			value={payload.defaultWriteCalendarSourceId ?? ''}
			disabled={Boolean(pendingAction)}
			onchange={setDefaultSource}
		>
			<option value="" disabled>Choose a writable calendar</option>
			{#each payload.connections.filter(isActiveConnection) as connection (connection.id)}
				{#each connection.sources.filter(isWritable) as source (source.id)}
					<option value={source.id}>
						{connection.accountLabel} — {sourceDisplayLabel(connection, source)}
					</option>
				{/each}
			{/each}
		</select>
		<p class="mt-2 text-xs text-muted-foreground">
			Changing this only affects future events. Existing events stay with their original
			account.
		</p>
	</div>
</section>
