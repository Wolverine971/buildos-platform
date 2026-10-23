<!-- apps/web/src/lib/components/project/ProjectInviteLinkPanel.svelte -->
<!--
	The owner's quick invite link for one project: make it, copy it, show its QR code
	(large, for scanning off your screen, or as a PNG), change who it lets in and for how
	long, reset it, or turn it off. Owner only; the share window renders it for owners.
	Backed by /api/onto/projects/[id]/invite-link.
-->
<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import InviteLinkQr from '$lib/components/people/InviteLinkQr.svelte';
	import { toastService } from '$lib/stores/toast.store';
	import { logOntologyClientError } from '$lib/utils/ontology-client-logger';
	import { copyTextToClipboard } from '$lib/utils/public-page-url';
	import { qrFileName, qrPngDataUrl } from '$lib/components/people/qr-code';
	import {
		AlertTriangle,
		Check,
		Copy,
		Download,
		Link2,
		QrCode,
		RefreshCw
	} from '$lib/icons/lucide';
	import {
		agentAccessDescription,
		DEFAULT_AGENT_ACCESS,
		DEFAULT_INVITE_LINK_DAYS,
		fitAgentAccessToRole,
		INVITE_LINK_DAY_CHOICES,
		inviteLinkDaysLabel,
		inviteLinkSummary,
		isAgentAccess,
		shortDate,
		type AgentAccess,
		type PersonRole
	} from '$lib/components/people/people-copy';

	type InviteLink = {
		id: string;
		role_key: PersonRole;
		agent_access: AgentAccess;
		expires_at: string;
		expired: boolean;
		join_count: number;
		last_joined_at: string | null;
		url: string;
	};

	let { projectId, projectName }: { projectId: string; projectName: string } = $props();

	let link = $state<InviteLink | null>(null);
	let loading = $state(true);
	let loadError = $state<string | null>(null);
	let busy = $state<'create' | 'update' | 'reset' | 'off' | null>(null);
	let actionError = $state<string | null>(null);
	let confirming = $state<'reset' | 'off' | null>(null);
	let copied = $state(false);
	let showQr = $state(false);
	let downloading = $state(false);
	/** Bumped when a change fails, so the selects drop back to the saved settings. */
	let failures = $state(0);
	let copiedTimer: ReturnType<typeof setTimeout> | null = null;

	// Settings for a link that doesn't exist yet.
	let draftRole = $state<PersonRole>('viewer');
	let draftAgents = $state<AgentAccess>(DEFAULT_AGENT_ACCESS);
	let draftDays = $state<string>(String(DEFAULT_INVITE_LINK_DAYS));

	const label = $derived(projectName?.trim() || 'this project');
	const endpoint = $derived(`/api/onto/projects/${projectId}/invite-link`);
	const draftSummary = $derived(
		inviteLinkSummary({
			role_key: draftRole,
			agent_access: draftAgents,
			expires_at: new Date(Date.now() + Number(draftDays) * 86_400_000).toISOString()
		})
	);
	const joinedLine = $derived.by(() => {
		if (!link || link.join_count === 0) return 'No one has joined with it yet.';
		return link.join_count === 1
			? '1 person joined with this link.'
			: `${link.join_count} people joined with this link.`;
	});

	$effect(() => {
		const url = endpoint;
		const controller = new AbortController();
		void load(url, controller.signal);
		return () => {
			controller.abort();
			if (copiedTimer) clearTimeout(copiedTimer);
		};
	});

	async function load(url: string, signal: AbortSignal) {
		loading = true;
		loadError = null;
		try {
			const response = await fetch(url, { credentials: 'same-origin', signal });
			const payload = await response.json().catch(() => null);
			if (signal.aborted) return;
			if (!response.ok) throw new Error(payload?.error || 'Could not load the invite link');
			link = readLink(payload?.data?.link);
		} catch (err) {
			if (signal.aborted) return;
			loadError = err instanceof Error ? err.message : 'Could not load the invite link';
		} finally {
			if (!signal.aborted) loading = false;
		}
	}

	function readLink(value: unknown): InviteLink | null {
		const row = value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
		if (!row || typeof row.id !== 'string' || typeof row.url !== 'string') return null;
		return {
			id: row.id,
			role_key: row.role_key === 'editor' ? 'editor' : 'viewer',
			agent_access: isAgentAccess(row.agent_access) ? row.agent_access : 'read',
			expires_at: String(row.expires_at ?? ''),
			expired: row.expired === true,
			join_count: Number(row.join_count) || 0,
			last_joined_at: typeof row.last_joined_at === 'string' ? row.last_joined_at : null,
			url: row.url
		};
	}

	async function send(
		action: 'create' | 'update' | 'reset' | 'off',
		method: 'POST' | 'PATCH' | 'DELETE',
		body?: Record<string, unknown>
	): Promise<boolean> {
		if (busy) return false;
		busy = action;
		actionError = null;
		const requestedEndpoint = endpoint;
		try {
			const response = await fetch(requestedEndpoint, {
				method,
				credentials: 'same-origin',
				headers: body ? { 'Content-Type': 'application/json' } : undefined,
				body: body ? JSON.stringify(body) : undefined
			});
			const payload = await response.json().catch(() => null);
			if (requestedEndpoint !== endpoint) return false;
			if (!response.ok) throw new Error(payload?.error || 'That didn’t work. Try again.');
			link = readLink(payload?.data?.link);
			return true;
		} catch (err) {
			actionError = err instanceof Error ? err.message : 'That didn’t work. Try again.';
			failures += 1;
			void logOntologyClientError(err, {
				endpoint: requestedEndpoint,
				method,
				projectId,
				entityType: 'project_invite_link',
				operation: `project_invite_link_${action}`,
				metadata: { source: 'project_invite_link_panel' }
			});
			return false;
		} finally {
			busy = null;
		}
	}

	async function createLink() {
		const ok = await send('create', 'POST', {
			role_key: draftRole,
			agent_access: fitAgentAccessToRole(draftRole, draftAgents),
			expires_in_days: Number(draftDays)
		});
		if (ok) toastService.success('Invite link ready. Copy it or show the QR code.');
	}

	async function resetLink() {
		if (!link) return;
		const ok = await send('reset', 'POST', {
			role_key: link.role_key,
			agent_access: link.agent_access,
			expires_in_days: DEFAULT_INVITE_LINK_DAYS
		});
		confirming = null;
		if (ok) toastService.success('New link ready. The old one stopped working.');
	}

	async function turnOff() {
		const ok = await send('off', 'DELETE');
		confirming = null;
		if (ok) {
			showQr = false;
			toastService.success('Invite link turned off. Everyone who joined stays in.');
		}
	}

	async function changeRole(value: string | number) {
		if (!link) return;
		const role: PersonRole = value === 'editor' ? 'editor' : 'viewer';
		if (role === link.role_key) return;
		await send('update', 'PATCH', {
			role_key: role,
			agent_access: fitAgentAccessToRole(role, link.agent_access)
		});
	}

	async function changeAgents(value: string | number) {
		if (!link || !isAgentAccess(value) || value === link.agent_access) return;
		await send('update', 'PATCH', { role_key: link.role_key, agent_access: value });
	}

	async function changeDays(value: string | number) {
		if (!link || !value) return;
		const ok = await send('update', 'PATCH', {
			role_key: link.role_key,
			agent_access: link.agent_access,
			expires_in_days: Number(value)
		});
		if (ok && link)
			toastService.success(`The link now works until ${shortDate(link.expires_at)}.`);
	}

	async function copyLink() {
		if (!link) return;
		const ok = await copyTextToClipboard(link.url);
		if (!ok) {
			toastService.error('Couldn’t copy. Select the link and copy it yourself.');
			return;
		}
		copied = true;
		if (copiedTimer) clearTimeout(copiedTimer);
		copiedTimer = setTimeout(() => (copied = false), 2000);
	}

	async function downloadPng() {
		if (!link || downloading) return;
		downloading = true;
		try {
			const dataUrl = await qrPngDataUrl(link.url);
			const anchor = document.createElement('a');
			anchor.href = dataUrl;
			anchor.download = qrFileName(projectName);
			document.body.appendChild(anchor);
			anchor.click();
			anchor.remove();
		} catch {
			toastService.error('Couldn’t make the image. Try again.');
		} finally {
			downloading = false;
		}
	}

	function selectAll(event: FocusEvent) {
		(event.currentTarget as HTMLInputElement).select();
	}
</script>

<section aria-labelledby="invite-link-heading" class="space-y-2.5">
	<div>
		<h3 id="invite-link-heading" class="text-sm font-semibold text-foreground">Invite link</h3>
		<p class="mt-0.5 text-xs text-muted-foreground">
			Paste it anywhere, or show the QR code in person. Anyone who opens it and signs in joins
			{label}.
		</p>
	</div>

	{#if loading}
		<p class="text-xs text-muted-foreground">Loading the invite link…</p>
	{:else if loadError}
		<p class="text-xs text-destructive" role="alert">{loadError}</p>
	{:else if !link}
		<div class="rounded-lg border border-border bg-background p-3 shadow-ink-inner space-y-3">
			<div class="grid gap-2.5 sm:grid-cols-3">
				<div class="space-y-1">
					<label
						for="invite-link-new-role"
						class="text-xs font-medium text-muted-foreground">They join as</label
					>
					<Select
						id="invite-link-new-role"
						bind:value={draftRole}
						size="sm"
						placeholder=""
						disabled={busy !== null}
						onchange={(value) =>
							(draftAgents = fitAgentAccessToRole(String(value), draftAgents))}
					>
						<option value="viewer">Viewer</option>
						<option value="editor">Editor</option>
					</Select>
				</div>
				<div class="space-y-1">
					<label
						for="invite-link-new-agents"
						class="text-xs font-medium text-muted-foreground">Their agents</label
					>
					<Select
						id="invite-link-new-agents"
						bind:value={draftAgents}
						size="sm"
						placeholder=""
						disabled={busy !== null}
					>
						<option value="off">Off</option>
						<option value="read">Read</option>
						<option value="write" disabled={draftRole !== 'editor'}
							>Write{draftRole !== 'editor' ? ' (Editors only)' : ''}</option
						>
					</Select>
				</div>
				<div class="space-y-1">
					<label
						for="invite-link-new-days"
						class="text-xs font-medium text-muted-foreground">Link works for</label
					>
					<Select
						id="invite-link-new-days"
						bind:value={draftDays}
						size="sm"
						placeholder=""
						disabled={busy !== null}
					>
						{#each INVITE_LINK_DAY_CHOICES as days (days)}
							<option value={String(days)}>{inviteLinkDaysLabel(days)}</option>
						{/each}
					</Select>
				</div>
			</div>
			<p class="text-xs text-muted-foreground">{draftSummary}</p>
			{#if draftRole === 'editor'}
				<p class="flex items-start gap-1.5 text-xs text-foreground">
					<AlertTriangle
						class="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning"
						aria-hidden="true"
					/>
					Anyone with an Editor link can change the project. Share it only where you trust
					everyone.
				</p>
			{/if}
			{#if actionError}
				<p class="text-xs text-destructive" role="alert">{actionError}</p>
			{/if}
			<Button
				variant="primary"
				size="sm"
				icon={Link2}
				loading={busy === 'create'}
				disabled={busy !== null}
				onclick={createLink}
			>
				Create invite link
			</Button>
		</div>
	{:else}
		<div class="rounded-lg border border-border bg-background p-3 shadow-ink-inner space-y-3">
			<div class="flex flex-col gap-2 sm:flex-row sm:items-center">
				<label for="invite-link-url" class="sr-only">Invite link for {label}</label>
				<input
					id="invite-link-url"
					type="text"
					readonly
					value={link.url}
					onfocus={selectAll}
					class="min-h-[44px] w-full min-w-0 flex-1 truncate rounded-lg border border-border-strong bg-card px-3 py-2 font-mono text-base text-foreground shadow-ink-inner focus:outline-none focus:ring-2 focus:ring-ring sm:text-sm {link.expired
						? 'text-muted-foreground line-through'
						: ''}"
				/>
				<div class="flex gap-2">
					<Button
						variant="primary"
						size="sm"
						icon={copied ? Check : Copy}
						class="flex-1 sm:flex-none"
						disabled={link.expired}
						onclick={copyLink}
					>
						{copied ? 'Copied' : 'Copy link'}
					</Button>
					<Button
						variant="outline"
						size="sm"
						icon={QrCode}
						class="flex-1 sm:flex-none"
						disabled={link.expired}
						onclick={() => (showQr = true)}
					>
						QR code
					</Button>
				</div>
				<span class="sr-only" aria-live="polite">{copied ? 'Link copied' : ''}</span>
			</div>

			<div class="flex items-start gap-3">
				{#if !link.expired}
					<button
						type="button"
						class="w-20 shrink-0 rounded-md border border-border p-0.5 pressable focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						aria-label="Show the QR code large"
						onclick={() => (showQr = true)}
					>
						<InviteLinkQr url={link.url} label="QR code to join {label}" />
					</button>
				{/if}
				<div class="min-w-0 space-y-1">
					<p class="text-sm text-foreground">{inviteLinkSummary(link)}</p>
					<p class="text-xs text-muted-foreground">{joinedLine}</p>
				</div>
			</div>

			{#if link.role_key === 'editor' && !link.expired}
				<p class="flex items-start gap-1.5 text-xs text-foreground">
					<AlertTriangle
						class="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning"
						aria-hidden="true"
					/>
					Anyone with this link can change the project. Share it only where you trust everyone.
				</p>
			{/if}

			<div class="grid gap-2.5 border-t border-border pt-3 sm:grid-cols-3">
				<div class="space-y-1">
					<label for="invite-link-role" class="text-xs font-medium text-muted-foreground"
						>They join as</label
					>
					{#key failures}
						<Select
							id="invite-link-role"
							value={link.role_key}
							size="sm"
							placeholder=""
							disabled={busy !== null}
							onchange={changeRole}
						>
							<option value="viewer">Viewer</option>
							<option value="editor">Editor</option>
						</Select>
					{/key}
				</div>
				<div class="space-y-1">
					<label
						for="invite-link-agents"
						class="text-xs font-medium text-muted-foreground">Their agents</label
					>
					{#key failures}
						<Select
							id="invite-link-agents"
							value={link.agent_access}
							size="sm"
							placeholder=""
							aria-describedby="invite-link-agents-hint"
							disabled={busy !== null}
							onchange={changeAgents}
						>
							<option value="off">Off</option>
							<option value="read">Read</option>
							<option value="write" disabled={link.role_key !== 'editor'}
								>Write{link.role_key !== 'editor' ? ' (Editors only)' : ''}</option
							>
						</Select>
					{/key}
				</div>
				<div class="space-y-1">
					<label for="invite-link-days" class="text-xs font-medium text-muted-foreground"
						>Link works</label
					>
					<!-- Shows the current end date; picking a length moves it and snaps back here. -->
					{#key `${link.expires_at}|${failures}`}
						<Select
							id="invite-link-days"
							value=""
							size="sm"
							placeholder=""
							disabled={busy !== null}
							onchange={changeDays}
						>
							<option value="" disabled
								>{link.expired ? 'Stopped' : 'Until'}
								{shortDate(link.expires_at)}</option
							>
							{#each INVITE_LINK_DAY_CHOICES as days (days)}
								<option value={String(days)}
									>{inviteLinkDaysLabel(days)} from now</option
								>
							{/each}
						</Select>
					{/key}
				</div>
			</div>
			<p id="invite-link-agents-hint" class="text-xs text-muted-foreground">
				{agentAccessDescription(link.agent_access)} Changes apply to this same link.
			</p>

			{#if actionError}
				<p class="text-xs text-destructive" role="alert">{actionError}</p>
			{/if}

			{#if confirming}
				<div
					class="rounded-md border border-border bg-card p-3 space-y-2"
					role="group"
					aria-labelledby="invite-link-confirm"
				>
					<p id="invite-link-confirm" class="text-sm text-foreground">
						{confirming === 'reset'
							? 'Make a new link? The current one stops working right away.'
							: 'Turn off the invite link? It stops working right away.'}
					</p>
					<p class="text-xs text-muted-foreground">
						People who already joined stay in {label}.
					</p>
					<div class="flex flex-wrap gap-2">
						<Button
							variant="ghost"
							size="sm"
							disabled={busy !== null}
							onclick={() => (confirming = null)}
						>
							Cancel
						</Button>
						<Button
							variant={confirming === 'reset' ? 'primary' : 'danger'}
							size="sm"
							loading={busy === 'reset' || busy === 'off'}
							disabled={busy !== null}
							onclick={confirming === 'reset' ? resetLink : turnOff}
						>
							{confirming === 'reset' ? 'Make a new link' : 'Turn off link'}
						</Button>
					</div>
				</div>
			{:else}
				<div class="flex flex-wrap gap-2">
					<Button
						variant="ghost"
						size="sm"
						icon={RefreshCw}
						disabled={busy !== null}
						onclick={() => (confirming = 'reset')}
					>
						Reset link
					</Button>
					<Button
						variant="ghost"
						size="sm"
						class="text-destructive hover:bg-destructive/10"
						disabled={busy !== null}
						onclick={() => (confirming = 'off')}
					>
						Turn off
					</Button>
				</div>
			{/if}
		</div>
	{/if}
</section>

{#if link && !link.expired}
	<Modal isOpen={showQr} onClose={() => (showQr = false)} title="Scan to join {label}" size="md">
		<div class="p-4 sm:p-6 space-y-4">
			<div class="mx-auto w-full max-w-sm rounded-lg border border-border p-2 shadow-ink">
				<InviteLinkQr url={link.url} label="QR code to join {label}" />
			</div>
			<div class="text-center space-y-1">
				<p class="text-base font-semibold text-foreground">{label}</p>
				<p class="text-sm text-muted-foreground">
					Point a phone camera at the code. {inviteLinkSummary(link)}
				</p>
			</div>
			<div class="flex flex-col gap-2 sm:flex-row sm:justify-center">
				<Button
					variant="outline"
					size="sm"
					icon={Download}
					loading={downloading}
					onclick={downloadPng}
				>
					Download PNG
				</Button>
				<Button variant="outline" size="sm" icon={copied ? Check : Copy} onclick={copyLink}>
					{copied ? 'Copied' : 'Copy link'}
				</Button>
				<Button variant="primary" size="sm" onclick={() => (showQr = false)}>Done</Button>
			</div>
		</div>
	</Modal>
{/if}
