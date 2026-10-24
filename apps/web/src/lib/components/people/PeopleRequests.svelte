<!-- apps/web/src/lib/components/people/PeopleRequests.svelte -->
<!--
	Requests, inside Profile > People & agents (moved from the old /people page):
	answer the people asking you (you pick the projects, their role, and what their
	agents may do), find someone by their exact @handle and ask for access, and see
	what you asked for.
-->
<script lang="ts">
	import { tick } from 'svelte';
	import {
		AlertCircle,
		AtSign,
		Bot,
		FolderOpen,
		Inbox,
		Search,
		Send,
		Users
	} from '$lib/icons/lucide';
	import Button from '$lib/components/ui/Button.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Textarea from '$lib/components/ui/Textarea.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import { toastService } from '$lib/stores/toast.store';
	import { formatRelativeTime } from '$lib/utils/date-utils';
	import {
		agentAccessDescription,
		agentAccessLabel,
		DEFAULT_AGENT_ACCESS,
		fitAgentAccessToRole,
		inviteeAgentSentence,
		inviteeRoleSentence,
		matchProjectHint,
		outgoingStatusLabel,
		requestOutcomeMessage,
		roleLabel,
		roleWithArticle,
		type AgentAccess,
		type PersonRole,
		type RequestOutcome
	} from '$lib/components/people/people-copy';
	import { projectArrivalHref } from '$lib/components/people/project-arrival';
	import {
		personName,
		readFoundPerson,
		readPeopleRequests,
		type FoundPerson,
		type IncomingPeopleRequest,
		type UpgradeRequestItem
	} from '$lib/components/people/people-types';
	import type {
		OwnedProjectOption,
		PeopleRequests as PeopleRequestsData
	} from '$lib/components/people/people-types';

	let {
		requests,
		ownedProjects,
		onchanged
	}: {
		requests: PeopleRequestsData;
		ownedProjects: OwnedProjectOption[];
		/** Called after a decision changes who has access, so the hub can reload people. */
		onchanged?: () => void;
	} = $props();

	// Seeded by the hub; edited in place after each action, replaced on the next load.
	let incoming = $derived(requests.incoming);
	let outgoing = $derived(requests.outgoing);

	// ---- Find someone ------------------------------------------------------
	let handleQuery = $state('');
	let finding = $state(false);
	let findError = $state<string | null>(null);
	let person = $state<FoundPerson | null>(null);
	let notFoundHandle = $state<string | null>(null);

	let askHint = $state('');
	let askNote = $state('');
	let askRole = $state<PersonRole>('viewer');
	let asking = $state(false);
	let askOutcome = $state<RequestOutcome | null>(null);

	const NOTE_MAX = 500;
	const HINT_MAX = 120;

	function resetAskForm() {
		askHint = '';
		askNote = '';
		askRole = 'viewer';
		askOutcome = null;
	}

	async function findPerson(event: Event) {
		event.preventDefault();
		const query = handleQuery.trim();
		if (!query || finding) return;

		finding = true;
		findError = null;
		person = null;
		notFoundHandle = null;
		resetAskForm();
		try {
			const res = await fetch(`/api/people/find?handle=${encodeURIComponent(query)}`, {
				credentials: 'same-origin'
			});
			const payload = await res.json().catch(() => null);
			if (!res.ok) {
				findError = payload?.error || 'Could not look up that handle. Try again.';
				return;
			}
			const found = readFoundPerson(payload?.data);
			if (found) {
				person = found;
			} else {
				notFoundHandle =
					typeof payload?.data?.handle === 'string'
						? payload.data.handle
						: query.replace(/^@+/, '');
			}
		} catch {
			findError = 'Could not look up that handle. Try again.';
		} finally {
			finding = false;
		}
	}

	async function refreshRequests() {
		try {
			const res = await fetch('/api/people/requests', { credentials: 'same-origin' });
			if (!res.ok) return;
			const payload = await res.json().catch(() => null);
			const next = readPeopleRequests(payload?.data);
			incoming = next.incoming;
			outgoing = next.outgoing;
		} catch {
			// The page still shows the last state; a refresh catches up.
		}
	}

	async function askForAccess(event: Event) {
		event.preventDefault();
		const target = person;
		if (!target || target.is_self || asking) return;

		asking = true;
		askOutcome = null;
		const name = personName(target);
		try {
			const res = await fetch('/api/people/requests', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'same-origin',
				body: JSON.stringify({
					handle: target.handle,
					role: askRole,
					project_hint: askHint.trim() || null,
					note: askNote.trim() || null
				})
			});
			const payload = await res.json().catch(() => null);
			if (!res.ok) {
				askOutcome = {
					tone: 'error',
					message: payload?.error || 'Your request didn’t go through. Try again.'
				};
				return;
			}
			askOutcome = requestOutcomeMessage(payload?.data, name);
			if (payload?.data?.status === 'pending') {
				person = {
					...target,
					relationship: { ...target.relationship, pending_request: true }
				};
				void refreshRequests();
			}
		} catch {
			askOutcome = { tone: 'error', message: 'Your request didn’t go through. Try again.' };
		} finally {
			asking = false;
		}
	}

	const OUTCOME_STYLES: Record<RequestOutcome['tone'], string> = {
		success: 'border-success/30 bg-success/10',
		info: 'border-info/30 bg-info/10',
		warning: 'border-warning/30 bg-warning/10',
		error: 'border-destructive/30 bg-destructive/10'
	};

	// ---- Asking you ---------------------------------------------------------
	type Selection = { checked: boolean; role: PersonRole; agent_access: AgentAccess };

	let openSheetId = $state<string | null>(null);
	let selections = $state<Record<string, Selection>>({});
	let hintMatches = $state<Set<string>>(new Set());
	let confirming = $state<{ requestId: string; decision: 'decline' | 'block' } | null>(null);
	let decidingId = $state<string | null>(null);
	let decideError = $state<{ requestId: string; message: string } | null>(null);

	const checkedGrants = $derived(
		Object.entries(selections)
			.filter(([, selection]) => selection.checked)
			.map(([projectId, selection]) => ({
				project_id: projectId,
				role: selection.role,
				agent_access: fitAgentAccessToRole(selection.role, selection.agent_access)
			}))
	);

	async function openSheet(request: IncomingPeopleRequest) {
		const matches = new Set(matchProjectHint(ownedProjects, request.project_hint));
		hintMatches = matches;
		selections = Object.fromEntries(
			ownedProjects.map((project) => [
				project.id,
				{
					checked: matches.has(project.id),
					role: request.role_requested,
					agent_access: DEFAULT_AGENT_ACCESS
				}
			])
		);
		confirming = null;
		decideError = null;
		openSheetId = request.id;
		await tick();
		document.getElementById(`share-heading-${request.id}`)?.focus();
	}

	function closeSheet(requestId: string) {
		openSheetId = null;
		selections = {};
		decideError = null;
		void tick().then(() => document.getElementById(`share-open-${requestId}`)?.focus());
	}

	function setChecked(projectId: string, checked: boolean) {
		const current = selections[projectId];
		if (current) selections[projectId] = { ...current, checked };
	}

	function setRole(projectId: string, role: PersonRole) {
		const current = selections[projectId];
		if (!current) return;
		selections[projectId] = {
			...current,
			role,
			agent_access: fitAgentAccessToRole(role, current.agent_access)
		};
	}

	function setAgentAccess(projectId: string, agentAccess: AgentAccess) {
		const current = selections[projectId];
		if (!current) return;
		selections[projectId] = {
			...current,
			agent_access: fitAgentAccessToRole(current.role, agentAccess)
		};
	}

	/** A rejoin goes back to the one project, with the role and agents the link gave. */
	function rejoinGrants(request: IncomingPeopleRequest) {
		if (!request.project) return [];
		return [
			{
				project_id: request.project.id,
				role: request.role_requested,
				agent_access: fitAgentAccessToRole(
					request.role_requested,
					request.agent_access_requested ?? DEFAULT_AGENT_ACCESS
				)
			}
		];
	}

	async function decide(
		request: IncomingPeopleRequest,
		decision: 'approve' | 'decline' | 'block'
	) {
		if (decidingId) return;
		const grants =
			decision !== 'approve'
				? []
				: request.kind === 'rejoin'
					? rejoinGrants(request)
					: checkedGrants;
		if (decision === 'approve' && grants.length === 0) return;

		decidingId = request.id;
		decideError = null;
		const name = personName(request.from);
		try {
			const res = await fetch(`/api/people/requests/${request.id}/decide`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'same-origin',
				body: JSON.stringify({ decision, grants })
			});
			const payload = await res.json().catch(() => null);
			if (!res.ok) {
				decideError = {
					requestId: request.id,
					message: payload?.error || 'Could not save your decision. Try again.'
				};
				return;
			}

			incoming = incoming.filter((row) => row.id !== request.id);
			openSheetId = null;
			confirming = null;
			selections = {};
			if (decision === 'approve') onchanged?.();

			if (decision === 'approve' && request.kind === 'rejoin') {
				toastService.success(
					`${name} is back in ${request.project?.name ?? 'the project'}`
				);
			} else if (decision === 'decline' && request.kind === 'rejoin') {
				toastService.success(`Denied. ${name} can’t ask to rejoin again.`);
			} else if (decision === 'approve') {
				const sharedNames = grants
					.map((grant) => ownedProjects.find((p) => p.id === grant.project_id)?.name)
					.filter(Boolean);
				const what =
					sharedNames.length === 1 ? sharedNames[0] : `${grants.length} projects`;
				toastService.success(`Shared ${what} with ${name}`);
				if (payload?.data?.agent_grant === 'failed') {
					toastService.warning(
						`${name}’s agent couldn’t be connected to ${sharedNames.length === 1 ? 'it' : 'them'} yet. ${name} can add ${sharedNames.length === 1 ? 'it' : 'them'} from their agent settings.`
					);
				}
			} else if (decision === 'decline') {
				toastService.success(`Declined ${name}’s request`);
			} else {
				toastService.success(`Blocked ${name}. They won’t be told.`);
			}
		} catch {
			decideError = {
				requestId: request.id,
				message: 'Could not save your decision. Try again.'
			};
		} finally {
			decidingId = null;
		}
	}

	// ---- Upgrades: a member (or their agent) wants more in projects they're in ----
	// Every project asked about starts checked; the owner unchecks what they won't allow.
	let upgradeUnchecked = $state<Record<string, string[]>>({});
	/** The owner ticked "let every editor's agents make changes" on this card. */
	let upgradeStanding = $state<Record<string, boolean>>({});
	let upgradeDecision = $state<'approve' | 'decline' | null>(null);

	function upgradeChecked(request: IncomingPeopleRequest): UpgradeRequestItem[] {
		const unchecked = upgradeUnchecked[request.id] ?? [];
		return request.items.filter((item) => !unchecked.includes(item.project_id));
	}

	function setUpgradeChecked(requestId: string, projectId: string, checked: boolean) {
		const others = (upgradeUnchecked[requestId] ?? []).filter((id) => id !== projectId);
		upgradeUnchecked[requestId] = checked ? others : [...others, projectId];
	}

	/** Projects the standing approval could cover: change asks where it isn't on yet. */
	function standingCandidates(request: IncomingPeopleRequest): UpgradeRequestItem[] {
		return request.items.filter(
			(item) => item.need !== 'agents_read' && !item.editor_agents_write
		);
	}

	/** "Now: Viewer · agents Off", from what the member has in the project today. */
	function upgradeNow(item: UpgradeRequestItem): string | null {
		const parts = [
			item.role ? roleLabel(item.role) : null,
			item.agent_access ? `agents ${agentAccessLabel(item.agent_access)}` : null
		].filter(Boolean);
		return parts.length > 0 ? `Now: ${parts.join(' · ')}` : null;
	}

	function upgradeAllowedMessage(name: string, items: UpgradeRequestItem[]): string {
		const where =
			items.length === 1
				? (items[0]?.project_name ?? 'the project')
				: `${items.length} projects`;
		const needs = new Set(items.map((item) => item.need));
		if (needs.size > 1) return `Allowed. ${name} has what they asked for in ${where}`;
		if (needs.has('agents_read')) return `${name}’s agents can now see ${where}`;
		if (needs.has('agents_write')) return `${name}’s agents can now make changes in ${where}`;
		return `${name} and their agents can now edit ${where}`;
	}

	/**
	 * Allow sends the checked projects (the RPC grants exactly what was asked there) and
	 * the standing approval for the checked ones the owner ticked it for. "Not now" isn't
	 * final: the same projects can be asked about again after 7 days, so no confirm step.
	 */
	async function decideUpgrade(request: IncomingPeopleRequest, decision: 'approve' | 'decline') {
		if (decidingId) return;
		const allowed = decision === 'approve' ? upgradeChecked(request) : [];
		if (decision === 'approve' && allowed.length === 0) return;
		const allowedIds = new Set(allowed.map((item) => item.project_id));
		const standingIds = upgradeStanding[request.id]
			? standingCandidates(request)
					.map((item) => item.project_id)
					.filter((projectId) => allowedIds.has(projectId))
			: [];
		// Send every item as shown, so a request that changed meanwhile isn't approved blind.
		const body =
			decision === 'approve'
				? {
						decision,
						items: request.items.map((item) => ({
							project_id: item.project_id,
							need: item.need,
							allow: allowedIds.has(item.project_id)
						})),
						...(standingIds.length > 0
							? { editor_agents_write_project_ids: standingIds }
							: {})
					}
				: { decision };

		decidingId = request.id;
		upgradeDecision = decision;
		decideError = null;
		const name = personName(request.from);
		try {
			const res = await fetch(`/api/people/requests/${request.id}/decide`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'same-origin',
				body: JSON.stringify(body)
			});
			const payload = await res.json().catch(() => null);
			if (res.status === 409) {
				// They asked for more since this loaded. Show the new ask; nothing changed.
				await refreshRequests();
				delete upgradeUnchecked[request.id];
				delete upgradeStanding[request.id];
				decideError = {
					requestId: request.id,
					message: `${name} changed this request. Look again before you allow it.`
				};
				return;
			}
			if (!res.ok) {
				decideError = {
					requestId: request.id,
					message: payload?.error || 'Could not save your decision. Try again.'
				};
				return;
			}

			incoming = incoming.filter((row) => row.id !== request.id);
			delete upgradeUnchecked[request.id];
			delete upgradeStanding[request.id];

			if (decision === 'decline') {
				toastService.success(`Not now. ${name} can ask again in a week.`);
				return;
			}

			// Name what was actually applied when the response says; else what was sent.
			const appliedIds = new Set<string>();
			for (const project of Array.isArray(payload?.data?.projects)
				? payload.data.projects
				: []) {
				if (typeof project?.project_id === 'string') appliedIds.add(project.project_id);
			}
			const applied = allowed.filter((item) => appliedIds.has(item.project_id));
			const done = applied.length > 0 ? applied : allowed;
			toastService.success(upgradeAllowedMessage(name, done));
			onchanged?.();
			if (payload?.data?.agent_grant === 'failed') {
				const them = done.length === 1 ? 'it' : 'them';
				toastService.warning(
					`${name}’s agent couldn’t be connected to ${them} yet. ${name} can add ${them} from their agent settings.`
				);
			}
			if (payload?.data?.standing_approval === 'failed') {
				toastService.warning(
					'Allowed, but the editors setting didn’t save. Try it in the project’s Share window.'
				);
			}
		} catch {
			decideError = {
				requestId: request.id,
				message: 'Could not save your decision. Try again.'
			};
		} finally {
			decidingId = null;
			upgradeDecision = null;
		}
	}

	function expiresLabel(expiresAt: string | null): string | null {
		if (!expiresAt) return null;
		const ms = Date.parse(expiresAt) - Date.now();
		if (!Number.isFinite(ms)) return null;
		const days = Math.ceil(ms / 86_400_000);
		if (days <= 1) return 'Expires within a day';
		return `Expires in ${days} days`;
	}

	const linkClass =
		'rounded-sm font-medium text-accent underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
	const cardClass = 'rounded-xl border border-border bg-card p-4 shadow-ink sm:p-5';
</script>

{#snippet upgradeAsk(item: UpgradeRequestItem)}
	{#if item.need === 'agents_read'}
		Wants their agents to see <span class="font-medium">{item.project_name}</span>
	{:else if item.need === 'agents_write'}
		Wants their agents to make changes in <span class="font-medium">{item.project_name}</span>
	{:else}
		Wants to edit <span class="font-medium">{item.project_name}</span> with their agents
	{/if}
{/snippet}

{#snippet findSection()}
	<section class={cardClass} aria-labelledby="find-heading">
		<div class="flex items-center gap-2">
			<Search class="h-4 w-4 text-muted-foreground" aria-hidden="true" />
			<h2 id="find-heading" class="text-base font-semibold text-foreground">Find someone</h2>
		</div>
		<p class="mt-1 text-sm text-muted-foreground">
			Type their exact handle. You’ll see their name, handle, and bio, never their email.
		</p>

		<form class="mt-3 flex flex-col gap-2 sm:flex-row" onsubmit={findPerson} role="search">
			<label for="find-handle" class="sr-only">Handle</label>
			<div class="min-w-0 flex-1">
				<TextInput
					id="find-handle"
					bind:value={handleQuery}
					type="text"
					inputmode="text"
					enterkeyhint="search"
					autocomplete="off"
					autocapitalize="none"
					spellcheck={false}
					placeholder="@handle"
					icon={AtSign}
					disabled={finding}
				/>
			</div>
			<Button
				type="submit"
				variant="secondary"
				size="md"
				loading={finding}
				disabled={finding || !handleQuery.trim()}
			>
				Find
			</Button>
		</form>

		<div aria-live="polite">
			{#if findError}
				<p class="mt-3 flex items-start gap-2 text-sm text-destructive" role="alert">
					<AlertCircle class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
					{findError}
				</p>
			{:else if notFoundHandle}
				<p
					class="mt-3 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm text-foreground"
				>
					No one can be found as @{notFoundHandle}. Check the spelling. People show up
					here only after they turn on finding by handle.
				</p>
			{/if}
		</div>

		{#if person}
			{@const name = personName(person)}
			<div
				class="mt-4 rounded-lg border border-border bg-background p-3 shadow-ink-inner sm:p-4"
			>
				<div class="flex items-start gap-3">
					<div
						class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/10 text-sm font-semibold text-accent"
						aria-hidden="true"
					>
						{name.replace(/^@/, '').charAt(0).toUpperCase()}
					</div>
					<div class="min-w-0 flex-1">
						<p class="truncate text-sm font-semibold text-foreground">
							{person.name ?? `@${person.handle}`}
						</p>
						<p class="stamp text-xs text-muted-foreground">@{person.handle}</p>
						{#if person.bio}
							<p
								class="mt-2 whitespace-pre-line break-words text-sm text-foreground [overflow-wrap:anywhere]"
							>
								{person.bio}
							</p>
						{/if}
						{#if person.relationship.projects_shared_with_you > 0}
							<p class="mt-2 text-xs text-muted-foreground">
								{person.relationship.projects_shared_with_you === 1
									? 'They already share 1 project with you.'
									: `They already share ${person.relationship.projects_shared_with_you} projects with you.`}
							</p>
						{/if}
					</div>
				</div>

				{#if person.is_self}
					<p class="mt-3 text-sm text-muted-foreground">
						That’s you. This is what people see when they find you.
					</p>
				{:else if person.relationship.pending_request && !askOutcome}
					<p class="mt-3 text-sm text-muted-foreground">
						You already asked {name}. Your request is waiting for an answer.
					</p>
				{:else if !askOutcome || askOutcome.tone === 'error'}
					<form
						class="mt-4 space-y-3 border-t border-border pt-4"
						onsubmit={askForAccess}
					>
						<div class="space-y-1">
							<label for="ask-hint" class="text-xs font-medium text-muted-foreground">
								What do you want to see? <span class="font-normal">(optional)</span>
							</label>
							<TextInput
								id="ask-hint"
								bind:value={askHint}
								type="text"
								maxlength={HINT_MAX}
								placeholder="A project name, like 9takes"
								disabled={asking}
							/>
						</div>
						<div class="space-y-1">
							<label for="ask-note" class="text-xs font-medium text-muted-foreground">
								Note <span class="font-normal">(optional)</span>
							</label>
							<Textarea
								id="ask-note"
								bind:value={askNote}
								rows={2}
								autoResize
								maxRows={6}
								maxlength={NOTE_MAX}
								placeholder="Say who you are and why you’re asking"
								disabled={asking}
							/>
						</div>
						<fieldset class="m-0 min-w-0 border-0 p-0">
							<legend class="mb-1 p-0 text-xs font-medium text-muted-foreground">
								Ask to
							</legend>
							<div class="flex flex-wrap gap-x-5 gap-y-1">
								<label
									class="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-foreground sm:min-h-0"
								>
									<input
										type="radio"
										name="ask-role"
										value="viewer"
										bind:group={askRole}
										disabled={asking}
										class="h-4 w-4 border-border-strong text-accent focus:ring-accent"
									/>
									View (Viewer)
								</label>
								<label
									class="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-foreground sm:min-h-0"
								>
									<input
										type="radio"
										name="ask-role"
										value="editor"
										bind:group={askRole}
										disabled={asking}
										class="h-4 w-4 border-border-strong text-accent focus:ring-accent"
									/>
									Edit (Editor)
								</label>
							</div>
						</fieldset>
						<p class="text-xs text-muted-foreground">
							{name} picks which projects to share and decides what your agents can do
							in them.
						</p>
						<div class="flex justify-end">
							<Button
								type="submit"
								variant="primary"
								size="sm"
								icon={Send}
								loading={asking}
								disabled={asking}
							>
								Ask for access
							</Button>
						</div>
					</form>
				{/if}

				{#if askOutcome}
					<p
						class="mt-3 rounded-lg border px-3 py-2.5 text-sm text-foreground {OUTCOME_STYLES[
							askOutcome.tone
						]}"
						role={askOutcome.tone === 'error' ? 'alert' : 'status'}
					>
						{askOutcome.message}
					</p>
				{/if}
			</div>
		{/if}
	</section>
{/snippet}

{#snippet incomingSection()}
	<section class={cardClass} aria-labelledby="incoming-heading">
		<div class="flex items-center gap-2">
			<Inbox class="h-4 w-4 text-muted-foreground" aria-hidden="true" />
			<h2 id="incoming-heading" class="text-base font-semibold text-foreground">
				Asking you
			</h2>
			{#if incoming.length > 0}
				<span
					class="stamp rounded-full bg-accent/10 px-2 py-0.5 text-2xs font-medium text-accent"
				>
					{incoming.length}
				</span>
			{/if}
		</div>

		{#if incoming.length === 0}
			<p class="mt-2 text-sm text-muted-foreground">
				No one is asking right now. When someone asks for access to your projects, it shows
				up here and you choose what to share.
			</p>
		{:else}
			<ul class="mt-3 space-y-3">
				{#each incoming as request (request.id)}
					{@const name = personName(request.from)}
					{@const sheetOpen = openSheetId === request.id}
					{@const pendingConfirm =
						confirming?.requestId === request.id ? confirming : null}
					{@const busy = decidingId === request.id}
					{@const expires = expiresLabel(request.expires_at)}
					<li class="rounded-lg border border-border bg-background p-3 sm:p-4">
						<div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
							<div class="min-w-0">
								<p class="truncate text-sm font-semibold text-foreground">{name}</p>
								<p class="stamp truncate text-xs text-muted-foreground">
									{request.from.handle
										? `@${request.from.handle}`
										: (request.from.email ?? '')}
								</p>
							</div>
							<p class="stamp shrink-0 text-xs text-muted-foreground">
								<time datetime={request.created_at}
									>{formatRelativeTime(request.created_at)}</time
								>{#if expires}<span> · {expires}</span>{/if}
							</p>
						</div>

						{#if request.kind === 'rejoin'}
							<p class="mt-2 text-sm text-foreground">
								Wants to rejoin
								<span class="font-medium">{request.project?.name}</span>
								as {roleWithArticle(request.role_requested)}
							</p>
							<p class="mt-1 text-xs text-muted-foreground">
								They left or were removed, then opened your invite link.
							</p>
						{:else if request.kind === 'upgrade'}
							{#if request.items.length === 1 && request.items[0]}
								{@const item = request.items[0]}
								{@const now = upgradeNow(item)}
								<p class="mt-2 text-sm text-foreground [overflow-wrap:anywhere]">
									{@render upgradeAsk(item)}
								</p>
								{#if now}
									<p class="mt-0.5 text-xs text-muted-foreground">{now}</p>
								{/if}
							{:else}
								{@const checkedIds = upgradeChecked(request).map(
									(item) => item.project_id
								)}
								<fieldset class="m-0 mt-2 min-w-0 border-0 p-0">
									<legend
										class="mb-1.5 p-0 text-xs font-medium text-muted-foreground"
									>
										Wants more in {request.items.length} of your projects. Uncheck
										any you won’t allow.
									</legend>
									<ul
										class="divide-y divide-border rounded-md border border-border"
									>
										{#each request.items as item (item.project_id)}
											{@const now = upgradeNow(item)}
											<li class="px-2.5 py-1.5 sm:py-2">
												<label
													class="flex min-h-11 cursor-pointer items-center gap-2.5 sm:min-h-0"
												>
													<input
														type="checkbox"
														checked={checkedIds.includes(
															item.project_id
														)}
														disabled={decidingId !== null}
														aria-describedby={now
															? `upgrade-now-${request.id}-${item.project_id}`
															: undefined}
														onchange={(event) =>
															setUpgradeChecked(
																request.id,
																item.project_id,
																event.currentTarget.checked
															)}
														class="h-4 w-4 shrink-0 rounded border-border-strong text-accent focus:ring-accent"
													/>
													<span
														class="min-w-0 flex-1 text-sm text-foreground [overflow-wrap:anywhere]"
													>
														{@render upgradeAsk(item)}
													</span>
												</label>
												{#if now}
													<p
														id="upgrade-now-{request.id}-{item.project_id}"
														class="pl-7 text-xs text-muted-foreground"
													>
														{now}
													</p>
												{/if}
											</li>
										{/each}
									</ul>
								</fieldset>
							{/if}
							{#if request.items.some((item) => item.need !== 'agents_read')}
								<p class="mt-2 text-xs text-muted-foreground">
									Their agents only add tasks and documents, and change what {name}
									created or is assigned to.
								</p>
							{/if}
						{:else}
							<p class="mt-2 text-sm text-foreground">
								Wants to {request.role_requested === 'editor' ? 'edit' : 'view'}
								{#if request.project_hint}
									<span class="font-medium">“{request.project_hint}”</span>
								{:else}
									your projects
								{/if}
							</p>
						{/if}

						{#if request.note}
							<blockquote
								class="mt-2 whitespace-pre-line break-words border-l-2 border-border-strong pl-3 text-sm text-muted-foreground [overflow-wrap:anywhere]"
							>
								“{request.note}”
							</blockquote>
						{/if}

						{#if request.via === 'agent'}
							<p class="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
								<Bot class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
								Sent by {request.via_agent_label ?? 'their agent'} for {name}
							</p>
						{/if}

						{#if decideError?.requestId === request.id}
							<p class="mt-2 text-xs text-destructive" role="alert">
								{decideError.message}
							</p>
						{/if}

						{#if sheetOpen}
							<form
								class="mt-3 space-y-3 rounded-lg border border-border bg-card p-3 shadow-ink-inner"
								aria-labelledby="share-heading-{request.id}"
								onsubmit={(event) => {
									event.preventDefault();
									void decide(request, 'approve');
								}}
							>
								<div>
									<h3
										id="share-heading-{request.id}"
										tabindex="-1"
										class="text-sm font-semibold text-foreground focus:outline-none"
									>
										Choose what to share with {name}
									</h3>
									<p class="mt-0.5 text-xs text-muted-foreground">
										They join each project you check. You can change or remove
										their access later in the project’s sharing settings.
									</p>
								</div>

								{#if ownedProjects.length === 0}
									<p class="text-sm text-muted-foreground">
										You don’t own any projects yet, so there’s nothing to share.
										You can still decline.
									</p>
								{:else}
									<ul
										class="max-h-96 divide-y divide-border overflow-y-auto rounded-md border border-border bg-background"
									>
										{#each ownedProjects as project (project.id)}
											{@const selection = selections[project.id]}
											<li class="space-y-2 p-2.5">
												<label
													class="flex min-h-11 cursor-pointer items-center gap-2.5 sm:min-h-0"
												>
													<input
														type="checkbox"
														checked={selection?.checked ?? false}
														disabled={busy}
														onchange={(event) =>
															setChecked(
																project.id,
																event.currentTarget.checked
															)}
														class="h-4 w-4 shrink-0 rounded border-border-strong text-accent focus:ring-accent"
													/>
													<span
														class="min-w-0 flex-1 truncate text-sm font-medium text-foreground"
														>{project.name}</span
													>
													{#if hintMatches.has(project.id)}
														<span
															class="micro-label shrink-0 text-accent"
															>Asked for</span
														>
													{/if}
												</label>
												{#if selection?.checked}
													<div class="grid grid-cols-2 gap-2 pl-7">
														<div class="min-w-0 space-y-1">
															<label
																for="role-{request.id}-{project.id}"
																class="text-xs font-medium text-muted-foreground"
																>Role</label
															>
															<Select
																id="role-{request.id}-{project.id}"
																size="sm"
																placeholder=""
																value={selection.role}
																disabled={busy}
																onchange={(value) =>
																	setRole(
																		project.id,
																		value === 'editor'
																			? 'editor'
																			: 'viewer'
																	)}
															>
																<option value="viewer"
																	>Viewer</option
																>
																<option value="editor"
																	>Editor</option
																>
															</Select>
														</div>
														<div class="min-w-0 space-y-1">
															<label
																for="agents-{request.id}-{project.id}"
																class="text-xs font-medium text-muted-foreground"
																>Their agents</label
															>
															<Select
																id="agents-{request.id}-{project.id}"
																size="sm"
																placeholder=""
																value={selection.agent_access}
																disabled={busy}
																aria-describedby="agents-hint-{request.id}-{project.id}"
																onchange={(value) =>
																	setAgentAccess(
																		project.id,
																		value as AgentAccess
																	)}
															>
																<option value="off">Off</option>
																<option value="read">Read</option>
																<option
																	value="write"
																	disabled={selection.role !==
																		'editor'}
																	>Write{selection.role !==
																	'editor'
																		? ' (Editors only)'
																		: ''}</option
																>
															</Select>
														</div>
													</div>
													<p
														id="agents-hint-{request.id}-{project.id}"
														class="pl-7 text-xs text-muted-foreground"
													>
														{agentAccessDescription(
															selection.agent_access
														)}
													</p>
												{/if}
											</li>
										{/each}
									</ul>
								{/if}

								{#if request.via === 'agent' && checkedGrants.some((grant) => grant.agent_access !== 'off')}
									<p
										class="flex items-start gap-1.5 text-xs text-muted-foreground"
									>
										<Bot
											class="mt-0.5 h-3.5 w-3.5 shrink-0"
											aria-hidden="true"
										/>
										{request.via_agent_label ?? 'Their agent'} asked for {name}.
										It can open the projects where their agents aren’t off on
										its next request.
									</p>
								{/if}

								<div class="flex flex-wrap items-center justify-end gap-2">
									<Button
										type="button"
										variant="ghost"
										size="sm"
										disabled={busy}
										onclick={() => closeSheet(request.id)}
									>
										Cancel
									</Button>
									<Button
										type="submit"
										variant="primary"
										size="sm"
										loading={busy}
										disabled={busy || checkedGrants.length === 0}
									>
										{checkedGrants.length === 0
											? 'Share'
											: checkedGrants.length === 1
												? 'Share 1 project'
												: `Share ${checkedGrants.length} projects`}
									</Button>
								</div>
							</form>
						{:else if pendingConfirm}
							<div
								class="mt-3 space-y-2 rounded-lg border border-border bg-card p-3 shadow-ink-inner"
								role="group"
								aria-labelledby="confirm-heading-{request.id}"
							>
								<p
									id="confirm-heading-{request.id}"
									class="text-sm font-medium text-foreground"
								>
									{pendingConfirm.decision === 'block'
										? `Block ${name}?`
										: request.kind === 'rejoin'
											? `Deny ${name}’s rejoin?`
											: `Decline ${name}’s request?`}
								</p>
								<p class="text-xs text-muted-foreground">
									{pendingConfirm.decision === 'block'
										? 'Their requests stop reaching you. They won’t be told.'
										: request.kind === 'rejoin'
											? `They can’t ask to rejoin ${request.project?.name ?? 'this project'} again. You can still invite them yourself later.`
											: 'They’ll see it was declined, and can ask again after 30 days.'}
								</p>
								<div class="flex flex-wrap items-center gap-2">
									<Button
										type="button"
										variant="ghost"
										size="sm"
										disabled={busy}
										onclick={() => (confirming = null)}
									>
										Cancel
									</Button>
									<Button
										type="button"
										variant="danger"
										size="sm"
										loading={busy}
										disabled={busy}
										onclick={() => decide(request, pendingConfirm.decision)}
									>
										{pendingConfirm.decision === 'block'
											? 'Block'
											: request.kind === 'rejoin'
												? 'Deny'
												: 'Decline'}
									</Button>
								</div>
							</div>
						{:else if request.kind === 'rejoin'}
							<div class="mt-3 flex flex-wrap items-center gap-2">
								<Button
									type="button"
									variant="primary"
									size="sm"
									loading={busy}
									disabled={decidingId !== null}
									onclick={() => decide(request, 'approve')}
								>
									Let back in
								</Button>
								<Button
									type="button"
									variant="outline"
									size="sm"
									disabled={decidingId !== null}
									onclick={() =>
										(confirming = {
											requestId: request.id,
											decision: 'decline'
										})}
								>
									Deny
								</Button>
							</div>
						{:else if request.kind === 'upgrade'}
							{@const allowed = upgradeChecked(request)}
							{@const candidates = standingCandidates(request)}
							{@const standingReach = candidates.filter((item) =>
								allowed.some((checked) => checked.project_id === item.project_id)
							)}
							<div class="mt-3 space-y-3">
								{#if candidates.length > 0}
									<div>
										<label
											class="flex min-h-11 cursor-pointer items-center gap-2.5 sm:min-h-0"
										>
											<input
												type="checkbox"
												checked={upgradeStanding[request.id] ?? false}
												disabled={decidingId !== null ||
													standingReach.length === 0}
												aria-describedby="standing-hint-{request.id}"
												onchange={(event) =>
													(upgradeStanding[request.id] =
														event.currentTarget.checked)}
												class="h-4 w-4 shrink-0 rounded border-border-strong text-accent focus:ring-accent"
											/>
											<span
												class="min-w-0 flex-1 text-sm text-foreground [overflow-wrap:anywhere]"
											>
												Let every editor’s agents make changes in {candidates.length ===
												1
													? (candidates[0]?.project_name ??
														'this project')
													: 'these projects'}
											</span>
										</label>
										<p
											id="standing-hint-{request.id}"
											class="pl-7 text-xs text-muted-foreground"
										>
											Editors won’t need to ask. You can turn this off in
											Share.
										</p>
									</div>
								{/if}
								<div class="flex flex-wrap items-center gap-2">
									<Button
										type="button"
										variant="primary"
										size="sm"
										loading={busy && upgradeDecision === 'approve'}
										disabled={decidingId !== null || allowed.length === 0}
										onclick={() => decideUpgrade(request, 'approve')}
									>
										Allow
									</Button>
									<Button
										type="button"
										variant="outline"
										size="sm"
										loading={busy && upgradeDecision === 'decline'}
										disabled={decidingId !== null}
										onclick={() => decideUpgrade(request, 'decline')}
									>
										Not now
									</Button>
								</div>
							</div>
						{:else}
							<div class="mt-3 flex flex-wrap items-center gap-2">
								<Button
									id="share-open-{request.id}"
									type="button"
									variant="primary"
									size="sm"
									disabled={decidingId !== null}
									onclick={() => openSheet(request)}
								>
									Choose what to share
								</Button>
								<Button
									type="button"
									variant="outline"
									size="sm"
									disabled={decidingId !== null}
									onclick={() =>
										(confirming = {
											requestId: request.id,
											decision: 'decline'
										})}
								>
									Decline
								</Button>
								<Button
									type="button"
									variant="ghost"
									size="sm"
									class="text-destructive hover:bg-destructive/10"
									disabled={decidingId !== null}
									onclick={() =>
										(confirming = { requestId: request.id, decision: 'block' })}
								>
									Block
								</Button>
							</div>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</section>
{/snippet}

<div class="space-y-4 sm:space-y-5">
	{#if incoming.length > 0}
		{@render incomingSection()}
	{/if}
	{@render findSection()}
	{#if outgoing.length > 0}
		<section class={cardClass} aria-labelledby="outgoing-heading">
			<div class="flex items-center gap-2">
				<Send class="h-4 w-4 text-muted-foreground" aria-hidden="true" />
				<h2 id="outgoing-heading" class="text-base font-semibold text-foreground">
					You asked
				</h2>
			</div>
			{#if outgoing.length === 0}
				<p class="mt-2 text-sm text-muted-foreground">
					Requests you send show up here with their answer.
				</p>
			{:else}
				<ul class="mt-3 divide-y divide-border">
					{#each outgoing as request (request.id)}
						<li
							class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2.5"
						>
							<div class="min-w-0">
								<p class="truncate text-sm font-medium text-foreground">
									{personName(request.to)}
									{#if request.to.handle && request.to.name}
										<span class="stamp font-normal text-muted-foreground"
											>@{request.to.handle}</span
										>
									{/if}
								</p>
								<p class="text-xs text-muted-foreground">
									To {request.role_requested === 'editor'
										? 'edit'
										: 'view'}{request.project_hint
										? ` “${request.project_hint}”`
										: ''} ·
									<time datetime={request.created_at}
										>{formatRelativeTime(request.created_at)}</time
									>
								</p>
							</div>
							<span
								class="shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium {request.status ===
								'approved'
									? 'border-success/30 bg-success/10 text-success'
									: request.status === 'pending'
										? 'border-border-strong bg-muted text-muted-foreground'
										: 'border-border bg-muted/50 text-muted-foreground'}"
							>
								{outgoingStatusLabel(request.status, request.settled_elsewhere)}
							</span>
							{#if (request.status === 'approved' || request.settled_elsewhere) && request.projects.length > 0}
								<ul
									class="mt-2 w-full space-y-3 rounded-lg border border-border bg-background p-3"
								>
									{#each request.projects as project (project.project_id)}
										<li class="space-y-1">
											<a
												href={projectArrivalHref(
													project.project_id,
													request.kind === 'upgrade' ||
														request.status === 'canceled'
														? 'already_member'
														: project.status
												)}
												class="inline-flex min-h-[44px] items-center gap-2 text-sm font-semibold text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
											>
												<FolderOpen
													class="h-4 w-4"
													aria-hidden="true"
												/>Open {project.project_name}
											</a>
											<p class="text-sm text-foreground">
												{roleLabel(project.role)} · {inviteeRoleSentence(
													project.role
												)}
											</p>
											<p class="text-xs text-muted-foreground">
												{inviteeAgentSentence(project.agent_access)}
											</p>
										</li>
									{/each}
								</ul>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/if}
</div>
