<!-- apps/web/src/lib/components/knowledge/KnowledgeSimilarPeople.svelte -->
<!--
	"Might also be" on a person's card: people in the graph who may be this one under another
	spelling ("Matt Solo" in the phone, "Matt Solowynsky" on LinkedIn and in tasks). Each row says
	why it came up and what tells it apart (job, LinkedIn, tasks and docs it's on). "Same person"
	opens the merge dialog with both; "Not them" answers "Different" so the pair never comes back
	here or in the duplicates review. Free: names and employers only, no model. Renders nothing
	when there's no look-alike. The parent keys it by entity id.
-->
<script lang="ts">
	import { ChevronRight, GitMerge, Loader2, User, X } from '$lib/icons/lucide';
	import { toastService } from '$lib/stores/toast.store';
	import {
		knowledgeAddedLine,
		knowledgeApi,
		type KnowledgeSimilarPerson
	} from './knowledge-client';

	interface Props {
		entityId: string;
		entityName: string;
		onOpen: (id: string) => void;
		/** "Same person": open the merge dialog with this entry and `otherId`. */
		onMerge?: (otherId: string) => void;
	}

	let { entityId, entityName, onOpen, onMerge }: Props = $props();

	let people = $state.raw<KnowledgeSimilarPerson[]>([]);
	let answering = $state<string | null>(null);

	$effect(() => {
		const id = entityId;
		let live = true;
		knowledgeApi
			.similarPeople(id)
			.then((result) => {
				if (live) people = result.people;
			})
			// A nicety: the card works without it.
			.catch(() => {});
		return () => {
			live = false;
		};
	});

	/** One short line that tells this one apart. */
	function aboutLine(person: KnowledgeSimilarPerson): string {
		const about = person.about;
		const parts: string[] = [];
		const lead = person.summary ?? about?.details[0];
		if (lead) parts.push(lead);
		if (about?.links) parts.push(`${about.links} task${about.links === 1 ? '' : 's'} & docs`);
		else if (about) parts.push(knowledgeAddedLine(about.created_at, about.created_via));
		return parts.join(' · ');
	}

	async function notThem(person: KnowledgeSimilarPerson) {
		answering = person.id;
		try {
			await knowledgeApi.markDifferent([entityId, person.id]);
			people = people.filter((p) => p.id !== person.id);
		} catch (error) {
			toastService.error(error instanceof Error ? error.message : 'Could not save that');
		} finally {
			answering = null;
		}
	}
</script>

{#if people.length}
	<section
		class="flex min-w-0 flex-col gap-1 rounded-md border border-border bg-muted/30 p-2"
		aria-label="Might also be"
	>
		<p class="micro-label px-1 text-muted-foreground">
			Might also be {entityName}
		</p>
		<ul class="flex min-w-0 flex-col gap-1">
			{#each people as person (person.id)}
				{@const about = aboutLine(person)}
				<li class="flex min-w-0 flex-col gap-1 rounded-md bg-card px-2 py-1.5">
					<button
						type="button"
						class="flex min-w-0 items-center gap-2 rounded text-left text-sm font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						onclick={() => onOpen(person.id)}
					>
						<User
							class="h-3.5 w-3.5 shrink-0 text-muted-foreground"
							aria-hidden="true"
						/>
						<span class="min-w-0 flex-1 truncate">{person.name}</span>
						<ChevronRight
							class="h-3.5 w-3.5 shrink-0 text-muted-foreground"
							aria-hidden="true"
						/>
					</button>
					<p class="pl-[1.375rem] text-xs text-accent">{person.reason}</p>
					{#if about}
						<p class="truncate pl-[1.375rem] text-xs text-muted-foreground">{about}</p>
					{/if}
					<div class="flex flex-wrap gap-1 pl-[0.875rem]">
						{#if onMerge}
							<button
								type="button"
								class="inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-foreground pressable hover:bg-muted disabled:opacity-60"
								disabled={answering === person.id}
								onclick={() => onMerge?.(person.id)}
							>
								<GitMerge class="h-3.5 w-3.5" aria-hidden="true" /> Same person
							</button>
						{/if}
						<button
							type="button"
							class="inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground pressable hover:bg-muted hover:text-foreground disabled:opacity-60"
							disabled={answering === person.id}
							onclick={() => void notThem(person)}
						>
							{#if answering === person.id}
								<Loader2
									class="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
									aria-hidden="true"
								/>
							{:else}
								<X class="h-3.5 w-3.5" aria-hidden="true" />
							{/if}
							Not them
						</button>
					</div>
				</li>
			{/each}
		</ul>
	</section>
{/if}
