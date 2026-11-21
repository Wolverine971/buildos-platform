<!-- apps/web/src/lib/components/knowledge/KnowledgeSharePanel.svelte -->
<!--
	Sharing on your own knowledge card (tasker 168).
	part="asks": "Bob asked for contact details" with Share / Not now, near the top.
	part="who":  "Who can see this": the shared projects whose members see the public-web details
	             by default, each person or project you shared more with (Stop sharing), and
	             "Share with…" to share without being asked.
	The Share sheet picks what (contact details · everything except notes · pick details) and for
	how long (while you're both in the project · always · 30 days). Notes, birthdays and who you
	know are never offered.
-->
<script lang="ts">
	import { KNOWLEDGE_PREDICATE_MAP } from '@buildos/shared-agent-ops/knowledge';
	import { Check, Lock, Share2, Users, X } from '$lib/icons/lucide';
	import { toastService } from '$lib/stores/toast.store';
	import type { EntityShares, ShareTerms } from './sharing-types';

	type Share = EntityShares['shares'][number];

	interface Props {
		part: 'asks' | 'who';
		entityId: string;
		entityName: string;
		sharing: EntityShares;
		/** Predicates this entry has facts for (the "pick details" list). */
		predicates: string[];
		onChanged: () => void;
	}

	let { part, entityId, entityName, sharing, predicates, onChanged }: Props = $props();

	const NEVER = new Set(['note', 'knows', 'birthday', 'connected_on']);
	const pickable = $derived(
		[...new Set(predicates)].filter((p) => !NEVER.has(p) && KNOWLEDGE_PREDICATE_MAP.has(p))
	);

	const asks = $derived(sharing.shares.filter((s) => s.status === 'requested'));
	const grants = $derived(sharing.shares.filter((s) => s.status === 'granted' && s.live));

	// One open sheet: answering an ask, or sharing with someone new.
	type Sheet =
		| { mode: 'answer'; share: Share }
		| { mode: 'new'; projectId: string; granteeId: string | null };
	let sheet = $state<Sheet | null>(null);
	let what = $state<ShareTerms['what']>('contact');
	let picked = $state<string[]>([]);
	let duration = $state<'membership' | 'always' | '30'>('membership');
	let busy = $state(false);
	let whoOpen = $state(false);

	function openAnswer(share: Share) {
		sheet = { mode: 'answer', share };
		what = share.what === 'all' ? 'all' : 'contact';
		picked = [];
		duration = 'membership';
	}

	function openNew() {
		const first = sharing.projects[0];
		if (!first) return;
		sheet = { mode: 'new', projectId: first.project_id, granteeId: null };
		what = 'contact';
		picked = [];
		duration = 'membership';
	}

	const sheetProject = $derived.by(() => {
		const current = sheet;
		if (!current) return null;
		const id = current.mode === 'new' ? current.projectId : current.share.project_id;
		return sharing.projects.find((p) => p.project_id === id) ?? null;
	});
	const sheetProjectName = $derived(
		sheet?.mode === 'answer'
			? (sheet.share.project_name ?? 'the project')
			: (sheetProject?.project_name ?? 'the project')
	);

	function terms(): Record<string, unknown> {
		const until =
			duration === '30' ? new Date(Date.now() + 30 * 86_400_000).toISOString() : null;
		return {
			what,
			predicates: what === 'picked' ? picked : [],
			duration: duration === '30' ? 'until' : duration,
			expires_at: until
		};
	}

	async function send(url: string, init: RequestInit, done: string) {
		busy = true;
		try {
			const response = await fetch(url, {
				...init,
				headers: { 'Content-Type': 'application/json' }
			});
			const body = await response.json().catch(() => null);
			if (!response.ok) throw new Error(body?.error ?? 'Could not do that');
			toastService.success(done);
			sheet = null;
			onChanged();
		} catch (error) {
			toastService.error(error instanceof Error ? error.message : 'Could not do that');
		} finally {
			busy = false;
		}
	}

	function submit() {
		if (!sheet) return;
		if (what === 'picked' && !picked.length) {
			toastService.info('Pick at least one detail.');
			return;
		}
		if (sheet.mode === 'answer') {
			const who = sheet.share.requested_by?.name ?? 'them';
			void send(
				`/api/knowledge/shares/${sheet.share.id}`,
				{ method: 'PATCH', body: JSON.stringify({ decision: 'grant', ...terms() }) },
				`Shared with ${who}`
			);
		} else {
			const granteeId = sheet.granteeId;
			const person = sheetProject?.members.find((m) => m.user_id === granteeId);
			void send(
				'/api/knowledge/shares',
				{
					method: 'POST',
					body: JSON.stringify({
						action: 'share',
						entity_id: entityId,
						project_id: sheet.projectId,
						grantee_id: sheet.granteeId,
						...terms()
					})
				},
				person
					? `Shared with ${person.name}`
					: `Shared with everyone in ${sheetProjectName}`
			);
		}
	}

	function decline(share: Share) {
		void send(
			`/api/knowledge/shares/${share.id}`,
			{ method: 'PATCH', body: JSON.stringify({ decision: 'decline' }) },
			'Kept private'
		);
	}

	function stop(share: Share) {
		void send(`/api/knowledge/shares/${share.id}`, { method: 'DELETE' }, 'Stopped sharing');
	}

	function whatText(share: Pick<Share, 'what' | 'predicates'>): string {
		if (share.what === 'all') return 'all shareable details';
		if (share.what === 'contact') return 'contact details';
		return share.predicates
			.map((p) => KNOWLEDGE_PREDICATE_MAP.get(p)?.label.toLowerCase() ?? p)
			.join(', ');
	}

	function howLongText(share: Share): string {
		if (share.duration === 'membership')
			return `while you're both in ${share.project_name ?? 'the project'}`;
		if (share.duration === 'until' && share.expires_at)
			return `until ${new Date(share.expires_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
		return 'always';
	}

	const memberNames = (members: Array<{ name: string }>) =>
		members.length <= 3
			? members.map((m) => m.name).join(', ')
			: `${members
					.slice(0, 2)
					.map((m) => m.name)
					.join(', ')} and ${members.length - 2} more`;

	const choice =
		'flex min-h-8 items-center gap-2 rounded-md px-2 text-sm text-foreground hover:bg-muted';
	const smallButton =
		'inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium pressable focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60';
</script>

{#snippet shareSheet()}
	{#if sheet}
		<form
			class="flex min-w-0 flex-col gap-2.5 rounded-md border border-border bg-card p-2.5"
			onsubmit={(event) => {
				event.preventDefault();
				submit();
			}}
		>
			{#if sheet.mode === 'new' && sheetProject}
				<label class="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
					Share with
					<select
						class="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
						value={`${sheet.projectId}|${sheet.granteeId ?? ''}`}
						onchange={(event) => {
							const [projectId, granteeId] = event.currentTarget.value.split('|');
							sheet = {
								mode: 'new',
								projectId: projectId ?? '',
								granteeId: granteeId || null
							};
						}}
					>
						{#each sharing.projects as project (project.project_id)}
							<option value={`${project.project_id}|`}
								>Everyone in {project.project_name}</option
							>
							{#each project.members as member (member.user_id)}
								<option value={`${project.project_id}|${member.user_id}`}
									>{member.name} ({project.project_name})</option
								>
							{/each}
						{/each}
					</select>
				</label>
			{/if}
			<fieldset class="flex min-w-0 flex-col gap-0.5">
				<legend class="mb-1 text-xs text-muted-foreground">What</legend>
				<label class={choice}
					><input type="radio" bind:group={what} value="contact" /> Contact details</label
				>
				<label class={choice}
					><input type="radio" bind:group={what} value="all" /> All shareable details</label
				>
				{#if pickable.length}
					<label class={choice}
						><input type="radio" bind:group={what} value="picked" /> Pick details</label
					>
					{#if what === 'picked'}
						<div class="ml-6 flex flex-wrap gap-x-3 gap-y-1">
							{#each pickable as predicate (predicate)}
								<label class="flex items-center gap-1.5 text-sm text-foreground">
									<input type="checkbox" bind:group={picked} value={predicate} />
									{KNOWLEDGE_PREDICATE_MAP.get(predicate)?.label ?? predicate}
								</label>
							{/each}
						</div>
					{/if}
				{/if}
			</fieldset>
			<fieldset class="flex min-w-0 flex-col gap-0.5">
				<legend class="mb-1 text-xs text-muted-foreground">How long</legend>
				<label class={choice}
					><input type="radio" bind:group={duration} value="membership" /> While you're
					both in
					{sheetProjectName}</label
				>
				<label class={choice}
					><input type="radio" bind:group={duration} value="30" /> 30 days</label
				>
				<label class={choice}
					><input type="radio" bind:group={duration} value="always" /> Always</label
				>
			</fieldset>
			<p class="text-xs text-muted-foreground">
				Your notes, birthdays, connections and LinkedIn connection dates stay private. You
				can stop sharing any time.
			</p>
			<div class="flex justify-end gap-2">
				<button
					type="button"
					class="{smallButton} text-muted-foreground hover:bg-muted hover:text-foreground"
					onclick={() => (sheet = null)}>Cancel</button
				>
				<button
					type="submit"
					class="{smallButton} bg-accent text-accent-foreground hover:opacity-90"
					disabled={busy}>{busy ? 'Sharing…' : 'Share'}</button
				>
			</div>
		</form>
	{/if}
{/snippet}

{#if part === 'asks' && asks.length}
	<section class="flex min-w-0 flex-col gap-2" aria-label="Asks about {entityName}">
		{#each asks as share (share.id)}
			<div
				class="flex min-w-0 flex-col gap-2 rounded-md border border-accent/40 bg-accent/5 px-2.5 py-2"
			>
				<p class="text-sm text-foreground">
					<span class="font-medium">{share.requested_by?.name ?? 'Someone'}</span>
					asked for {whatText(share)}
					{#if share.project_name}<span class="text-muted-foreground">
							· {share.project_name}</span
						>{/if}
				</p>
				{#if sheet?.mode === 'answer' && sheet.share.id === share.id}
					{@render shareSheet()}
				{:else}
					<div class="flex gap-2">
						<button
							type="button"
							class="{smallButton} bg-accent text-accent-foreground hover:opacity-90"
							disabled={busy}
							onclick={() => openAnswer(share)}
						>
							<Share2 class="h-3.5 w-3.5" aria-hidden="true" /> Share…
						</button>
						<button
							type="button"
							class="{smallButton} text-muted-foreground hover:bg-muted hover:text-foreground"
							disabled={busy}
							onclick={() => decline(share)}>Not now</button
						>
					</div>
				{/if}
			</div>
		{/each}
	</section>
{/if}

{#if part === 'who' && (sharing.projects.length || grants.length)}
	<section class="flex min-w-0 flex-col gap-1">
		<button
			type="button"
			class="-mx-1 flex min-h-8 items-center gap-2 rounded-md px-1 text-left micro-label text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			aria-expanded={whoOpen}
			onclick={() => (whoOpen = !whoOpen)}
		>
			<Users class="h-3.5 w-3.5" aria-hidden="true" />
			<span class="flex-1">Who can see this</span>
			<span class="normal-case tracking-normal"
				>{grants.length
					? `${grants.length} shared`
					: `${sharing.projects.length} shared project${sharing.projects.length === 1 ? '' : 's'}`}</span
			>
		</button>
		{#if whoOpen}
			<div class="flex min-w-0 flex-col gap-2 text-sm">
				<p class="text-xs text-muted-foreground">
					Only you see your notes and contact details. People in a shared project see what
					came from the public web or from that project's own tasks and docs.
				</p>
				{#each sharing.projects as project (project.project_id)}
					<p class="flex min-w-0 items-start gap-2 text-foreground">
						<Lock
							class="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground"
							aria-hidden="true"
						/>
						<span class="min-w-0"
							>{project.project_name}
							<span class="text-muted-foreground"
								>· {memberNames(project.members)}</span
							></span
						>
					</p>
				{/each}
				{#each grants as share (share.id)}
					<div class="flex min-w-0 items-start gap-2">
						<Check class="mt-1 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
						<p class="min-w-0 flex-1 text-foreground">
							{share.grantee?.name ??
								`Everyone in ${share.project_name ?? 'the project'}`}
							<span class="text-muted-foreground"
								>· {whatText(share)} · {howLongText(share)}</span
							>
						</p>
						<button
							type="button"
							class="{smallButton} text-muted-foreground hover:bg-muted hover:text-foreground"
							disabled={busy}
							aria-label="Stop sharing with {share.grantee?.name ?? 'the project'}"
							onclick={() => stop(share)}
						>
							<X class="h-3.5 w-3.5" aria-hidden="true" /> Stop
						</button>
					</div>
				{/each}
				{#if sheet?.mode === 'new'}
					{@render shareSheet()}
				{:else if sharing.projects.length}
					<button
						type="button"
						class="{smallButton} self-start text-accent hover:bg-muted"
						onclick={openNew}
					>
						<Share2 class="h-3.5 w-3.5" aria-hidden="true" /> Share more with…
					</button>
				{/if}
			</div>
		{/if}
	</section>
{/if}
