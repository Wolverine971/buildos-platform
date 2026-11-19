<!-- apps/web/src/lib/components/knowledge/KnowledgeLensSection.svelte -->
<!--
	"From Alice's People" (tasker 168): what other members of a shared project hold about a name
	on this task or doc. Shows what came from the public web or from this project's own text,
	contact details the owner chose to share (labelled), and a count of what stays private
	("Alice has 2 contact details · Ask"). Asking sends the owner one request; they decide on
	their card or in Profile → People & agents. Nothing here is copied into the viewer's graph.
-->
<script lang="ts">
	import { KNOWLEDGE_PREDICATE_MAP } from '@buildos/shared-agent-ops/knowledge';
	import { Check, Clock, Copy, Lock, Mail, MapPin, Link, Phone } from '$lib/icons/lucide';
	import { toastService } from '$lib/stores/toast.store';
	import { contactAction, contactHref, displayPhone, displayUrl } from './knowledge-client';
	import type { AskResult, LensEntry, LensFact } from './sharing-types';

	interface Props {
		entries: LensEntry[];
		projectId: string;
		/** "Also in this project" when the viewer has their own entry for the name. */
		heading?: 'from' | 'also';
	}

	let { entries, projectId, heading = 'from' }: Props = $props();

	// Asks made or withdrawn here, until the next load brings the server's view.
	let localAsk = $state<Record<string, LensEntry['ask'] | undefined>>({});
	let busy = $state<string | null>(null);

	const CONTACT = new Set(['email', 'phone', 'address']);
	const LINKS = new Set(['homepage', 'url', 'profile_url']);

	function contactsOf(entry: LensEntry) {
		return entry.facts.filter((f) => CONTACT.has(f.predicate) && f.value);
	}
	function linksOf(entry: LensEntry) {
		return entry.facts.filter((f) => LINKS.has(f.predicate) && f.value);
	}
	function detailsOf(entry: LensEntry) {
		return entry.facts.filter(
			(f) => !CONTACT.has(f.predicate) && !LINKS.has(f.predicate) && f.predicate !== 'alias'
		);
	}

	function detailText(fact: LensFact): string {
		if (fact.predicate === 'headline' || fact.predicate === 'description')
			return fact.value ?? '';
		const label = KNOWLEDGE_PREDICATE_MAP.get(fact.predicate)?.label ?? fact.predicate;
		const title =
			typeof fact.qualifiers?.title === 'string' ? ` (${fact.qualifiers.title})` : '';
		return `${label}: ${fact.object_name ?? fact.value ?? ''}${title}`;
	}

	function contactText(fact: LensFact): string {
		return fact.predicate === 'phone' ? displayPhone(fact.value ?? '') : (fact.value ?? '');
	}

	const iconFor = (predicate: string) =>
		predicate === 'phone' ? Phone : predicate === 'email' ? Mail : MapPin;

	function hiddenText(entry: LensEntry): string | null {
		const { contact, other } = entry.hidden;
		const parts: string[] = [];
		if (contact) parts.push(`${contact} contact detail${contact === 1 ? '' : 's'}`);
		if (other) parts.push(`${other} other detail${other === 1 ? '' : 's'}`);
		return parts.length ? `${entry.owner.name} has ${parts.join(' and ')}` : null;
	}

	function since(iso: string): string {
		const minutes = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
		if (minutes < 60) return `${minutes} min ago`;
		const hours = Math.round(minutes / 60);
		if (hours < 48) return `${hours} h ago`;
		return `${Math.round(hours / 24)} days ago`;
	}

	function durationText(entry: LensEntry): string {
		const grant = entry.grant;
		if (!grant) return '';
		if (grant.duration === 'membership') return "while you're both in this project";
		if (grant.duration === 'until' && grant.expires_at)
			return `until ${new Date(grant.expires_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
		return '';
	}

	const askOf = (entry: LensEntry) =>
		entry.entity.id in localAsk ? localAsk[entry.entity.id] : entry.ask;

	async function ask(entry: LensEntry) {
		const what = entry.hidden.contact ? 'contact' : 'all';
		busy = entry.entity.id;
		try {
			const response = await fetch('/api/knowledge/shares', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'ask',
					entity_id: entry.entity.id,
					project_id: projectId,
					what
				})
			});
			const body = await response.json().catch(() => null);
			const result = body?.data as AskResult | undefined;
			if (!response.ok || !result) throw new Error(body?.error ?? 'Could not ask');
			if (result.status === 'requested' && result.id) {
				localAsk[entry.entity.id] = {
					id: result.id,
					status: 'requested',
					created_at: new Date().toISOString()
				};
				toastService.success(`Asked ${entry.owner.name}`);
			} else if (result.status === 'declined') {
				localAsk[entry.entity.id] = {
					id: '',
					status: 'declined',
					created_at: new Date().toISOString()
				};
			} else if (result.status === 'already_shared') {
				toastService.info('Already shared with you. Reopen the card to see it.');
			} else if (result.status === 'nothing_to_ask') {
				toastService.info('Nothing here is held back from you.');
			} else if (result.status === 'rate_limited') {
				toastService.info('You have asked a lot today. Try again tomorrow.');
			} else {
				toastService.info('That entry is no longer in this project.');
			}
		} catch (error) {
			toastService.error(error instanceof Error ? error.message : 'Could not ask');
		} finally {
			busy = null;
		}
	}

	async function cancel(entry: LensEntry) {
		const open = askOf(entry);
		if (!open?.id) return;
		busy = entry.entity.id;
		try {
			const response = await fetch(`/api/knowledge/shares/${open.id}?as=asker`, {
				method: 'DELETE'
			});
			if (!response.ok) throw new Error('Could not cancel');
			localAsk[entry.entity.id] = null;
		} catch {
			toastService.error('Could not cancel. Try again.');
		} finally {
			busy = null;
		}
	}

	async function copy(text: string) {
		try {
			await navigator.clipboard.writeText(text);
			toastService.success('Copied');
		} catch {
			toastService.error('Could not copy');
		}
	}
</script>

{#if entries.length}
	<section
		class="flex min-w-0 flex-col gap-3 border-t border-border px-4 py-3"
		aria-label={heading === 'also'
			? 'Also in this project'
			: 'What others in this project know'}
	>
		{#if heading === 'also'}
			<p class="micro-label text-muted-foreground">Also in this project</p>
		{/if}
		{#each entries as entry (entry.entity.id)}
			{@const contacts = contactsOf(entry)}
			{@const links = linksOf(entry)}
			{@const details = detailsOf(entry)}
			{@const hidden = hiddenText(entry)}
			{@const asked = askOf(entry)}
			<div class="flex min-w-0 flex-col gap-1.5">
				<p class="micro-label text-muted-foreground">From {entry.owner.name}'s People</p>
				{#if entry.entity.summary}
					<p class="text-sm text-foreground">{entry.entity.summary}</p>
				{/if}
				{#each details as fact (fact.id)}
					<p class="min-w-0 text-sm text-foreground">
						{detailText(fact)}
						{#if fact.source_url}
							<a
								href={fact.source_url}
								target="_blank"
								rel="noopener noreferrer"
								class="ml-1 text-xs text-muted-foreground underline decoration-border underline-offset-2 hover:text-foreground"
								>{displayUrl(fact.source_url).split('/')[0]}</a
							>
						{/if}
					</p>
				{/each}
				{#if links.length}
					<ul class="-mx-2 flex min-w-0 flex-col gap-0.5">
						{#each links as fact (fact.id)}
							<li>
								<a
									href={fact.value}
									target="_blank"
									rel="noopener noreferrer"
									class="flex min-h-8 min-w-0 items-center gap-2 rounded-md px-2 text-sm text-foreground pressable hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								>
									<Link
										class="h-3.5 w-3.5 shrink-0 text-muted-foreground"
										aria-hidden="true"
									/>
									<span class="min-w-0 flex-1 truncate"
										>{displayUrl(fact.value ?? '')}</span
									>
									<span class="shrink-0 text-xs font-medium text-accent"
										>Open</span
									>
								</a>
							</li>
						{/each}
					</ul>
				{/if}
				{#if contacts.length}
					<ul class="-mx-2 flex min-w-0 flex-col gap-0.5" aria-label="Contact">
						{#each contacts as fact (fact.id)}
							{@const Icon = iconFor(fact.predicate)}
							{@const href = contactHref(fact.predicate, fact.value ?? '')}
							<li class="flex min-w-0 items-center gap-1">
								<a
									{href}
									target={fact.predicate === 'address' ? '_blank' : undefined}
									rel={fact.predicate === 'address'
										? 'noopener noreferrer'
										: undefined}
									class="flex min-h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-sm text-foreground pressable hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
									aria-label="{contactAction(fact.predicate)} {contactText(fact)}"
								>
									<Icon
										class="h-3.5 w-3.5 shrink-0 text-muted-foreground"
										aria-hidden="true"
									/>
									<span class="min-w-0 flex-1 truncate">{contactText(fact)}</span>
									<span class="shrink-0 text-xs text-muted-foreground"
										>{fact.via === 'grant' ? 'shared' : 'in this project'}</span
									>
								</a>
								<button
									type="button"
									class="inline-grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted-foreground pressable hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
									aria-label="Copy {contactText(fact)}"
									title="Copy"
									onclick={() => void copy(contactText(fact))}
								>
									<Copy class="h-3.5 w-3.5" />
								</button>
							</li>
						{/each}
					</ul>
				{/if}
				{#if entry.grant}
					<p class="flex items-center gap-1.5 text-xs text-muted-foreground">
						<Check class="h-3 w-3 shrink-0" aria-hidden="true" />
						Shared by {entry.owner.name}
						{durationText(entry)}
					</p>
				{/if}
				{#if hidden}
					<div
						class="flex min-w-0 items-center gap-2 rounded-md bg-muted/50 px-2.5 py-1.5 text-xs"
					>
						<Lock
							class="h-3.5 w-3.5 shrink-0 text-muted-foreground"
							aria-hidden="true"
						/>
						{#if asked?.status === 'requested'}
							<span class="min-w-0 flex-1 text-muted-foreground"
								><Clock class="mr-0.5 inline h-3 w-3" aria-hidden="true" /> Asked {entry
									.owner.name}
								{since(asked.created_at)}</span
							>
							<button
								type="button"
								class="shrink-0 rounded px-1.5 py-0.5 font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
								disabled={busy === entry.entity.id}
								onclick={() => void cancel(entry)}>Cancel</button
							>
						{:else if asked?.status === 'declined'}
							<span class="min-w-0 flex-1 text-muted-foreground"
								>{entry.owner.name} kept these private.</span
							>
						{:else}
							<span class="min-w-0 flex-1 text-muted-foreground">{hidden}</span>
							<button
								type="button"
								class="shrink-0 rounded px-1.5 py-0.5 font-medium text-accent hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
								disabled={busy === entry.entity.id}
								title="Ask {entry.owner.name} to share these with you"
								onclick={() => void ask(entry)}
								>{busy === entry.entity.id ? 'Asking…' : 'Ask'}</button
							>
						{/if}
					</div>
				{/if}
			</div>
		{/each}
	</section>
{/if}
