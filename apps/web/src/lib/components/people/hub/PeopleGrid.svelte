<!-- apps/web/src/lib/components/people/hub/PeopleGrid.svelte -->
<!--
	Person × project grid: each cell is one person in one of your projects (role
	and what their agents can do). Pick people to change their agents everywhere
	at once; "+ Add" invites someone already in another of your projects.
-->
<script lang="ts">
	import { Plus } from '$lib/icons/lucide';
	import Button from '$lib/components/ui/Button.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import { toastService } from '$lib/stores/toast.store';
	import {
		agentAccessAllowed,
		agentAccessLabel,
		DEFAULT_AGENT_ACCESS,
		fitAgentAccessToRole,
		type AgentAccess,
		type PersonRole
	} from '$lib/components/people/people-copy';
	import type { HubInvite, HubPerson, HubProject } from './hub-types';
	import { inviteExistingPerson, runAll, setMemberAgents, setMemberRole } from './hub-actions';

	let {
		people,
		ownedProjects,
		invites,
		onreload
	}: {
		people: HubPerson[];
		ownedProjects: HubProject[];
		invites: HubInvite[];
		onreload: () => Promise<void> | void;
	} = $props();

	/** Columns: your projects that have someone else in them. */
	const columns = $derived.by(() => {
		const used = new Set(people.flatMap((p) => p.memberships.map((m) => m.project_id)));
		return ownedProjects.filter((project) => used.has(project.id));
	});

	let picked = $state<Record<string, boolean>>({});
	let bulkAccess = $state<AgentAccess>('read');
	let busy = $state(false);
	let adding = $state<{ actorId: string; projectId: string; role: PersonRole } | null>(null);

	const pickedPeople = $derived(people.filter((p) => picked[p.actor_id]));
	const allPicked = $derived(people.length > 0 && pickedPeople.length === people.length);

	function cellFor(person: HubPerson, projectId: string) {
		return person.memberships.find((m) => m.project_id === projectId) ?? null;
	}

	function invitedTo(person: HubPerson, projectId: string): boolean {
		if (!person.email) return false;
		const email = person.email.toLowerCase();
		return invites.some(
			(i) =>
				i.project_id === projectId &&
				i.effective_status === 'pending' &&
				i.invitee_email?.toLowerCase() === email
		);
	}

	async function run(task: () => Promise<string | null>, success: string) {
		if (busy) return;
		busy = true;
		const error = await task();
		busy = false;
		if (error) {
			toastService.error(error);
			return;
		}
		toastService.success(success);
		await onreload();
	}

	function togglePickAll() {
		const next = !allPicked;
		picked = Object.fromEntries(people.map((p) => [p.actor_id, next]));
	}

	function applyBulk() {
		const tasks = pickedPeople.flatMap((person) =>
			person.memberships
				.filter((m) => fitAgentAccessToRole(m.role, bulkAccess) !== m.agent_access)
				.map(
					(m) => () =>
						setMemberAgents(
							m.project_id,
							m.member_id,
							fitAgentAccessToRole(m.role, bulkAccess)
						)
				)
		);
		if (tasks.length === 0) {
			toastService.info('Nothing to change: they already have that.');
			return;
		}
		const who =
			pickedPeople.length === 1
				? (pickedPeople[0]?.name ?? '1 person')
				: `${pickedPeople.length} people`;
		void run(
			async () => (await runAll(tasks)).message,
			`${who}: agents ${agentAccessLabel(bulkAccess)} in ${tasks.length} ${tasks.length === 1 ? 'project' : 'projects'}`
		);
	}

	function sendAdd() {
		const target = adding;
		if (!target) return;
		const person = people.find((p) => p.actor_id === target.actorId);
		const project = columns.find((c) => c.id === target.projectId);
		adding = null;
		void run(
			() =>
				inviteExistingPerson(
					target.projectId,
					target.actorId,
					target.role,
					fitAgentAccessToRole(target.role, DEFAULT_AGENT_ACCESS)
				),
			`Invited ${person?.name ?? 'them'} to ${project?.name ?? 'the project'}`
		);
	}
</script>

<div class="space-y-3">
	<div class="flex flex-wrap items-center gap-2">
		<span class="mr-auto text-xs text-muted-foreground">
			{pickedPeople.length === 0
				? 'Pick people to change their agents in every project at once.'
				: `${pickedPeople.length} picked`}
		</span>
		<label class="flex items-center gap-2 text-xs text-muted-foreground">
			Set their agents
			<Select
				id="hub-grid-bulk"
				size="sm"
				placeholder=""
				value={bulkAccess}
				disabled={busy || pickedPeople.length === 0}
				onchange={(value) => (bulkAccess = value as AgentAccess)}
			>
				<option value="off">Off</option>
				<option value="read">Read</option>
				<option value="write">Write (editors only)</option>
			</Select>
		</label>
		<Button
			variant="primary"
			size="sm"
			disabled={busy || pickedPeople.length === 0}
			loading={busy}
			onclick={applyBulk}>Apply</Button
		>
	</div>

	<div class="overflow-x-auto rounded-lg border border-border">
		<table class="w-full min-w-[640px] border-collapse text-left">
			<caption class="sr-only">People in your projects, by project</caption>
			<thead>
				<tr class="border-b border-border bg-muted/30">
					<th scope="col" class="w-56 px-3 py-2.5">
						<label
							class="flex items-center gap-2 text-xs font-semibold text-foreground"
						>
							<input
								type="checkbox"
								class="h-4 w-4 accent-accent"
								checked={allPicked}
								onchange={togglePickAll}
							/>
							Person
						</label>
					</th>
					{#each columns as column (column.id)}
						<th
							scope="col"
							class="px-2 py-2.5 text-xs font-semibold text-foreground"
							title={column.name}
						>
							<a href="/projects/{column.id}" class="line-clamp-2 hover:text-accent"
								>{column.name}</a
							>
							{#if column.editor_agents_write}
								<span class="block font-normal text-muted-foreground"
									>Editors' agents write</span
								>
							{/if}
						</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each people as person (person.actor_id)}
					<tr class="border-b border-border last:border-b-0">
						<th scope="row" class="px-3 py-2 align-top font-normal">
							<label class="flex items-start gap-2">
								<input
									type="checkbox"
									class="mt-0.5 h-4 w-4 accent-accent"
									checked={Boolean(picked[person.actor_id])}
									onchange={() =>
										(picked = {
											...picked,
											[person.actor_id]: !picked[person.actor_id]
										})}
								/>
								<span class="min-w-0">
									<span
										class="block truncate text-sm font-semibold text-foreground"
										>{person.name}</span
									>
									<span class="block truncate text-xs text-muted-foreground">
										{person.handle
											? `@${person.handle}`
											: (person.email ?? 'No handle yet')}
									</span>
								</span>
							</label>
						</th>
						{#each columns as column (column.id)}
							{@const m = cellFor(person, column.id)}
							<td class="px-2 py-2 align-top">
								{#if m}
									<div
										class="flex min-w-[8.5rem] flex-col gap-1.5 rounded-md border border-border bg-background p-2"
									>
										<Select
											id="grid-role-{m.member_id}"
											size="sm"
											placeholder=""
											value={m.role}
											disabled={busy}
											aria-label="{person.name}'s role on {column.name}"
											onchange={(value) => {
												const role: PersonRole =
													value === 'editor' ? 'editor' : 'viewer';
												if (role !== m.role)
													void run(
														() =>
															setMemberRole(
																m.project_id,
																m.member_id,
																role
															),
														`${person.name}: ${role === 'editor' ? 'Editor' : 'Viewer'} on ${column.name}`
													);
											}}
										>
											<option value="editor">Editor</option>
											<option value="viewer">Viewer</option>
										</Select>
										<span class="micro-label">Agents</span>
										<Select
											id="grid-agents-{m.member_id}"
											size="sm"
											placeholder=""
											value={m.agent_access}
											disabled={busy}
											aria-label="{person.name}'s agents on {column.name}"
											onchange={(value) => {
												const access = value as AgentAccess;
												if (access !== m.agent_access)
													void run(
														() =>
															setMemberAgents(
																m.project_id,
																m.member_id,
																access
															),
														`${person.name}'s agents: ${agentAccessLabel(access)} on ${column.name}`
													);
											}}
										>
											<option value="off">Off</option>
											<option value="read">Read</option>
											<option
												value="write"
												disabled={!agentAccessAllowed(m.role, 'write')}
												>Write</option
											>
										</Select>
									</div>
								{:else if invitedTo(person, column.id)}
									<p
										class="flex min-h-[4.5rem] items-center justify-center rounded-md border border-dashed border-border px-2 text-xs text-muted-foreground"
									>
										Invited
									</p>
								{:else if adding?.actorId === person.actor_id && adding.projectId === column.id}
									<div
										class="flex min-w-[8.5rem] flex-col gap-1.5 rounded-md border border-accent/40 bg-background p-2"
									>
										<Select
											id="grid-add-role-{person.actor_id}-{column.id}"
											size="sm"
											placeholder=""
											value={adding.role}
											aria-label="Invite {person.name} to {column.name} as"
											onchange={(value) => {
												if (adding)
													adding = {
														...adding,
														role:
															value === 'editor' ? 'editor' : 'viewer'
													};
											}}
										>
											<option value="viewer">As Viewer</option>
											<option value="editor">As Editor</option>
										</Select>
										<div class="flex gap-1">
											<Button
												variant="primary"
												size="sm"
												disabled={busy}
												onclick={sendAdd}>Invite</Button
											>
											<Button
												variant="ghost"
												size="sm"
												onclick={() => (adding = null)}>Cancel</Button
											>
										</div>
									</div>
								{:else}
									<button
										type="button"
										class="flex min-h-[4.5rem] w-full items-center justify-center gap-1 rounded-md border border-dashed border-border-strong/60 text-xs text-muted-foreground hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
										disabled={busy || !person.email}
										title={person.email
											? `Invite ${person.name} to ${column.name}`
											: 'Invite them from the project'}
										onclick={() =>
											(adding = {
												actorId: person.actor_id,
												projectId: column.id,
												role: 'viewer'
											})}
									>
										<Plus class="h-3.5 w-3.5" aria-hidden="true" /> Add
									</button>
								{/if}
							</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
	<p class="text-xs text-muted-foreground">
		"+ Add" sends them an invite with their agents on Read. They join when they accept.
	</p>
</div>
