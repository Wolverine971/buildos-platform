<!-- apps/web/src/lib/components/people/hub/PeopleSection.svelte -->
<!--
	Profile > People & agents > People: everyone in your projects, one row per
	person (open it to change their role and their agents per project), or the
	grid view (person × project, with bulk changes). Then invites nobody answered,
	and projects people share with you.
-->
<script lang="ts">
	import {
		ChevronDown,
		FolderOpen,
		LayoutGrid,
		List,
		MailX,
		Plus,
		Users
	} from '$lib/icons/lucide';
	import Button from '$lib/components/ui/Button.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import { toastService } from '$lib/stores/toast.store';
	import { formatRelativeTime } from '$lib/utils/date-utils';
	import {
		agentAccessLabel,
		agentAccessAllowed,
		fitAgentAccessToRole,
		roleLabel,
		type AgentAccess,
		type PersonRole
	} from '$lib/components/people/people-copy';
	import type { HubInvite, HubPerson, HubProject, HubSharedProject } from './hub-types';
	import PeopleGrid from './PeopleGrid.svelte';
	import {
		clearExpiredInvites,
		removeMember,
		resendInvite,
		revokeInvite,
		runAll,
		setMemberAgents,
		setMemberRole
	} from './hub-actions';

	let {
		people,
		invites,
		ownedProjects,
		sharedWithYou,
		onreload,
		onshare
	}: {
		people: HubPerson[];
		invites: HubInvite[];
		ownedProjects: HubProject[];
		sharedWithYou: HubSharedProject[];
		/** Refetch the hub after a change. */
		onreload: () => Promise<void> | void;
		/** Start sharing a project (opens the project picker). */
		onshare?: () => void;
	} = $props();

	let view = $state<'list' | 'grid'>('list');
	let openActorId = $state<string | null>(null);
	let busyKey = $state<string | null>(null);
	let confirmRemove = $state<{ actorId: string; memberId: string | 'all' } | null>(null);
	let showInvites = $state(false);

	const projectCount = $derived(
		new Set(people.flatMap((person) => person.memberships.map((m) => m.project_id))).size
	);
	const expiredInvites = $derived(invites.filter((i) => i.effective_status === 'expired'));
	const projectsById = $derived(new Map(ownedProjects.map((p) => [p.id, p])));

	function initials(name: string): string {
		return (
			name
				.split(/\s+/)
				.filter(Boolean)
				.slice(0, 2)
				.map((part) => part[0]?.toUpperCase() ?? '')
				.join('') || '?'
		);
	}

	function projectShort(name: string): string {
		return name.length > 22 ? `${name.slice(0, 20).trimEnd()}…` : name;
	}

	/** "Editors' agents can make changes" lifts an editor's Read to Write in that project. */
	function liftedToWrite(projectId: string, role: PersonRole, access: AgentAccess): boolean {
		return (
			role === 'editor' &&
			access === 'read' &&
			Boolean(projectsById.get(projectId)?.editor_agents_write)
		);
	}

	async function act(key: string, task: () => Promise<string | null>, success: string) {
		if (busyKey) return;
		busyKey = key;
		const error = await task();
		busyKey = null;
		if (error) {
			toastService.error(error);
			return;
		}
		toastService.success(success);
		await onreload();
	}

	function changeRole(person: HubPerson, m: HubPerson['memberships'][number], value: string) {
		const role: PersonRole = value === 'editor' ? 'editor' : 'viewer';
		if (role === m.role) return;
		void act(
			`${m.member_id}:role`,
			() => setMemberRole(m.project_id, m.member_id, role),
			`${person.name} is now ${role === 'editor' ? 'an Editor' : 'a Viewer'} on ${m.project_name}`
		);
	}

	function changeAgents(person: HubPerson, m: HubPerson['memberships'][number], value: string) {
		const access = value as AgentAccess;
		if (access === m.agent_access) return;
		void act(
			`${m.member_id}:agents`,
			() => setMemberAgents(m.project_id, m.member_id, access),
			`${person.name}'s agents: ${agentAccessLabel(access)} on ${m.project_name}`
		);
	}

	function changeAgentsEverywhere(person: HubPerson, value: string) {
		const access = value as AgentAccess;
		const tasks = person.memberships
			.filter((m) => fitAgentAccessToRole(m.role, access) !== m.agent_access)
			.map(
				(m) => () =>
					setMemberAgents(m.project_id, m.member_id, fitAgentAccessToRole(m.role, access))
			);
		if (tasks.length === 0) return;
		void act(
			`${person.actor_id}:all`,
			async () => (await runAll(tasks)).message,
			`${person.name}'s agents: ${agentAccessLabel(access)} in all their projects`
		);
	}

	function remove(person: HubPerson, memberId: string | 'all') {
		const targets =
			memberId === 'all'
				? person.memberships
				: person.memberships.filter((m) => m.member_id === memberId);
		confirmRemove = null;
		void act(
			`${person.actor_id}:remove`,
			async () =>
				(await runAll(targets.map((m) => () => removeMember(m.project_id, m.member_id))))
					.message,
			targets.length === 1
				? `Removed ${person.name} from ${targets[0]?.project_name ?? 'the project'}`
				: `Removed ${person.name} from ${targets.length} projects`
		);
	}

	function clearExpired() {
		const projectIds = Array.from(new Set(expiredInvites.map((i) => i.project_id)));
		void act(
			'invites:clear',
			async () =>
				(await runAll(projectIds.map((id) => () => clearExpiredInvites(id)))).message,
			`Cleared ${expiredInvites.length} expired ${expiredInvites.length === 1 ? 'invite' : 'invites'}`
		);
	}

	function inviteLabel(invite: HubInvite): string {
		if (invite.invitee_handle) return `@${invite.invitee_handle}`;
		return invite.invitee_email ?? 'Someone';
	}

	function shortDate(iso: string): string {
		const date = new Date(iso);
		return Number.isNaN(date.getTime())
			? ''
			: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}

	const linkClass =
		'rounded-sm font-medium text-accent underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
</script>

<section
	id="people"
	class="scroll-mt-4 overflow-hidden rounded-lg border border-border bg-card shadow-ink tx tx-frame tx-weak"
	aria-labelledby="hub-people-heading"
>
	<div class="flex flex-wrap items-start gap-3 border-b border-border px-4 py-3 sm:px-5">
		<div class="min-w-0 flex-1">
			<h3
				id="hub-people-heading"
				class="flex items-center gap-2 text-sm font-semibold text-foreground sm:text-base"
			>
				<Users class="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
				People
			</h3>
			<p class="mt-0.5 text-xs text-muted-foreground">
				{#if people.length === 0}
					Nobody else is in your projects yet.
				{:else}
					{people.length}
					{people.length === 1 ? 'person' : 'people'} in {projectCount} of your projects. Open
					someone to change their role or their agents.
				{/if}
			</p>
		</div>
		<div class="flex flex-wrap items-center gap-2">
			{#if people.length > 0}
				<div
					class="inline-flex overflow-hidden rounded-md border border-border-strong"
					role="group"
					aria-label="View"
				>
					<button
						type="button"
						class="inline-flex min-h-[36px] items-center gap-1.5 px-2.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring {view ===
						'list'
							? 'bg-accent text-accent-foreground'
							: 'bg-background text-muted-foreground hover:text-foreground'}"
						aria-pressed={view === 'list'}
						onclick={() => (view = 'list')}
					>
						<List class="h-3.5 w-3.5" aria-hidden="true" /> List
					</button>
					<button
						type="button"
						class="inline-flex min-h-[36px] items-center gap-1.5 border-l border-border-strong px-2.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring {view ===
						'grid'
							? 'bg-accent text-accent-foreground'
							: 'bg-background text-muted-foreground hover:text-foreground'}"
						aria-pressed={view === 'grid'}
						onclick={() => (view = 'grid')}
					>
						<LayoutGrid class="h-3.5 w-3.5" aria-hidden="true" /> Grid
					</button>
				</div>
			{/if}
			{#if onshare}
				<Button variant="outline" size="sm" icon={Plus} onclick={onshare}
					>Share a project</Button
				>
			{/if}
		</div>
	</div>

	{#if view === 'grid' && people.length > 0}
		<div class="p-4 sm:p-5">
			<PeopleGrid {people} {ownedProjects} {invites} {onreload} />
		</div>
	{:else}
		<ul class="divide-y divide-border">
			{#each people as person (person.actor_id)}
				{@const open = openActorId === person.actor_id}
				<li>
					<div class="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
						<button
							type="button"
							class="flex min-w-0 flex-1 basis-56 items-center gap-3 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							aria-expanded={open}
							aria-controls="hub-person-{person.actor_id}"
							onclick={() => (openActorId = open ? null : person.actor_id)}
						>
							<span
								class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground"
								aria-hidden="true">{initials(person.name)}</span
							>
							<span class="min-w-0">
								<span class="block truncate text-sm font-semibold text-foreground"
									>{person.name}</span
								>
								<span class="block truncate text-xs text-muted-foreground">
									{person.handle
										? `@${person.handle}`
										: (person.email ?? 'No handle yet')} · {person.memberships
										.length}
									{person.memberships.length === 1 ? 'project' : 'projects'}
								</span>
							</span>
						</button>
						<div class="flex min-w-0 flex-wrap justify-end gap-1.5">
							{#each person.memberships as m (m.member_id)}
								<span
									class="inline-flex items-center rounded-full border border-border bg-background px-2.5 py-0.5 text-xs text-foreground"
									title={m.project_name}
								>
									{projectShort(m.project_name)} · {roleLabel(m.role)} · agents {liftedToWrite(
										m.project_id,
										m.role,
										m.agent_access
									)
										? 'Write'
										: agentAccessLabel(m.agent_access)}
								</span>
							{/each}
						</div>
						<ChevronDown
							class="h-4 w-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none {open
								? 'rotate-180'
								: ''}"
							aria-hidden="true"
						/>
					</div>

					{#if open}
						<div
							id="hub-person-{person.actor_id}"
							class="mx-4 mb-4 overflow-hidden rounded-lg border border-border bg-background sm:ml-16 sm:mr-5"
						>
							<ul class="divide-y divide-border">
								{#each person.memberships as m (m.member_id)}
									<li class="flex flex-wrap items-center gap-3 px-3.5 py-3">
										<div class="min-w-0 flex-1 basis-48">
											<a
												href="/projects/{m.project_id}"
												class="block truncate text-sm font-medium text-foreground hover:text-accent"
												>{m.project_name}</a
											>
											<p class="text-xs text-muted-foreground">
												{#if m.joined_at}Joined {shortDate(
														m.joined_at
													)}{/if}{m.joined_via_link
													? ' with the invite link'
													: ''}
												{#if liftedToWrite(m.project_id, m.role, m.agent_access)}
													· Agents can write: project setting
												{/if}
											</p>
										</div>
										<label
											class="flex items-center gap-2 text-xs text-muted-foreground"
										>
											Role
											<Select
												id="hub-role-{m.member_id}"
												size="sm"
												placeholder=""
												value={m.role}
												disabled={busyKey !== null}
												onchange={(value) =>
													changeRole(person, m, String(value))}
											>
												<option value="editor">Editor</option>
												<option value="viewer">Viewer</option>
											</Select>
										</label>
										<label
											class="flex items-center gap-2 text-xs text-muted-foreground"
										>
											Their agents
											<Select
												id="hub-agents-{m.member_id}"
												size="sm"
												placeholder=""
												value={m.agent_access}
												disabled={busyKey !== null}
												onchange={(value) =>
													changeAgents(person, m, String(value))}
											>
												<option value="off">Off</option>
												<option value="read">Read</option>
												<option
													value="write"
													disabled={!agentAccessAllowed(m.role, 'write')}
													>Write</option
												>
											</Select>
										</label>
										{#if confirmRemove?.actorId === person.actor_id && confirmRemove.memberId === m.member_id}
											<span class="flex items-center gap-1.5">
												<Button
													variant="danger"
													size="sm"
													disabled={busyKey !== null}
													onclick={() => remove(person, m.member_id)}
													>Remove</Button
												>
												<Button
													variant="ghost"
													size="sm"
													onclick={() => (confirmRemove = null)}
													>Cancel</Button
												>
											</span>
										{:else}
											<Button
												variant="ghost"
												size="sm"
												disabled={busyKey !== null}
												onclick={() =>
													(confirmRemove = {
														actorId: person.actor_id,
														memberId: m.member_id
													})}>Remove</Button
											>
										{/if}
									</li>
								{/each}
							</ul>
							<div
								class="flex flex-wrap items-center gap-3 border-t border-border bg-muted/30 px-3.5 py-3"
							>
								{#if person.memberships.length > 1}
									<label
										class="flex items-center gap-2 text-xs text-muted-foreground"
									>
										Their agents everywhere
										<Select
											id="hub-agents-all-{person.actor_id}"
											size="sm"
											placeholder="Change all…"
											value={null}
											disabled={busyKey !== null}
											onchange={(value) =>
												changeAgentsEverywhere(person, String(value))}
										>
											<option value="off">Off</option>
											<option value="read">Read</option>
											<option value="write">Write (editors only)</option>
										</Select>
									</label>
								{/if}
								<span class="flex-1 text-xs text-muted-foreground">
									Their agents never get more than they have.
								</span>
								{#if person.memberships.length > 1}
									{#if confirmRemove?.actorId === person.actor_id && confirmRemove.memberId === 'all'}
										<span class="flex items-center gap-1.5">
											<Button
												variant="danger"
												size="sm"
												disabled={busyKey !== null}
												onclick={() => remove(person, 'all')}
												>Remove from all {person.memberships.length}</Button
											>
											<Button
												variant="ghost"
												size="sm"
												onclick={() => (confirmRemove = null)}
												>Cancel</Button
											>
										</span>
									{:else}
										<Button
											variant="ghost"
											size="sm"
											disabled={busyKey !== null}
											onclick={() =>
												(confirmRemove = {
													actorId: person.actor_id,
													memberId: 'all'
												})}>Remove from everything</Button
										>
									{/if}
								{/if}
							</div>
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}

	{#if invites.length > 0}
		<div class="border-t border-border bg-muted/20">
			<div class="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
				<button
					type="button"
					class="flex min-w-0 flex-1 basis-56 items-center gap-2.5 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					aria-expanded={showInvites}
					aria-controls="hub-invites"
					onclick={() => (showInvites = !showInvites)}
				>
					<MailX class="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
					<span class="min-w-0">
						<span class="block text-sm font-semibold text-foreground">
							{#if expiredInvites.length > 0}
								{expiredInvites.length}
								{expiredInvites.length === 1 ? 'invite' : 'invites'} nobody answered
							{:else}
								{invites.length}
								{invites.length === 1 ? 'invite' : 'invites'} waiting
							{/if}
						</span>
						<span class="block text-xs text-muted-foreground">
							{#if expiredInvites.length > 0 && expiredInvites.length < invites.length}
								Plus {invites.length - expiredInvites.length} still waiting.
							{:else if expiredInvites.length > 0}
								All expired. Resend one, or clear them.
							{:else}
								Waiting for an answer.
							{/if}
						</span>
					</span>
					<ChevronDown
						class="ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none {showInvites
							? 'rotate-180'
							: ''}"
						aria-hidden="true"
					/>
				</button>
				{#if expiredInvites.length > 0}
					<Button
						variant="outline"
						size="sm"
						disabled={busyKey !== null}
						loading={busyKey === 'invites:clear'}
						onclick={clearExpired}>Clear expired</Button
					>
				{/if}
			</div>
			{#if showInvites}
				<ul
					id="hub-invites"
					class="divide-y divide-border border-t border-border px-4 sm:px-5"
				>
					{#each invites as invite (invite.id)}
						<li class="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
							<span class="min-w-0 flex-1 basis-48 truncate text-sm text-foreground"
								>{inviteLabel(invite)}</span
							>
							<span class="min-w-0 basis-40 truncate text-xs text-muted-foreground"
								>{invite.project_name} · {roleLabel(invite.role)}</span
							>
							<span
								class="text-xs {invite.effective_status === 'expired'
									? 'text-warning'
									: 'text-muted-foreground'}"
							>
								{invite.effective_status === 'expired'
									? `Expired ${shortDate(invite.expires_at)}`
									: `Sent ${formatRelativeTime(invite.created_at)}`}
							</span>
							<span class="flex items-center gap-1">
								<Button
									variant="ghost"
									size="sm"
									disabled={busyKey !== null}
									onclick={() =>
										act(
											`${invite.id}:resend`,
											() => resendInvite(invite.project_id, invite.id),
											`Sent a new invite to ${inviteLabel(invite)}`
										)}>Resend</Button
								>
								<Button
									variant="ghost"
									size="sm"
									disabled={busyKey !== null}
									onclick={() =>
										act(
											`${invite.id}:revoke`,
											() => revokeInvite(invite.project_id, invite.id),
											`Removed the invite to ${inviteLabel(invite)}`
										)}>Remove</Button
								>
							</span>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}

	<div class="border-t border-border px-4 py-3.5 sm:px-5">
		<p class="micro-label flex items-center gap-1.5">
			<FolderOpen class="h-3.5 w-3.5" aria-hidden="true" /> Shared with you
		</p>
		{#if sharedWithYou.length === 0}
			<p class="mt-1.5 text-sm text-muted-foreground">
				Nobody has shared a project with you yet. When they do, it shows here with what you
				and your agents can do in it.
			</p>
		{:else}
			<ul class="mt-2 divide-y divide-border">
				{#each sharedWithYou as project (project.id)}
					<li class="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
						<a
							href="/projects/{project.id}"
							class="min-w-0 flex-1 basis-48 truncate text-sm font-medium text-foreground hover:text-accent"
							>{project.name}</a
						>
						<span class="text-xs text-muted-foreground">
							{project.owner_name ? `${project.owner_name}'s` : 'Shared'} · you're {project.role ===
							'editor'
								? 'an Editor'
								: 'a Viewer'} · your agents: {agentAccessLabel(
								project.agent_access
							)}
						</span>
					</li>
				{/each}
			</ul>
			<p class="mt-2 text-xs text-muted-foreground">
				The owner sets what your agents can do. To let one of your agent connections in,
				turn on "Projects shared with me" for it under <a href="#agents" class={linkClass}
					>Agents</a
				>.
			</p>
		{/if}
	</div>
</section>
