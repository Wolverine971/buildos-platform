<!-- apps/web/src/lib/components/knowledge/KnowledgeCompanyQuestions.svelte -->
<!--
	The "Which one?" review stack (tasker 170): the open questions from the company lookup, one
	at a time. An answer saves and moves to the next; "Skip for now" moves on and leaves the
	question open for another day. Closing keeps whatever is left.
-->
<script lang="ts">
	import Modal from '$lib/components/ui/Modal.svelte';
	import ErrorBoundary from '$lib/components/ui/ErrorBoundary.svelte';
	import { toastService } from '$lib/stores/toast.store';
	import KnowledgeCompanyQuestion from './KnowledgeCompanyQuestion.svelte';
	import type { CompanyLocateWatch } from './company-locate.svelte';
	import type {
		CompanyQuestionChoice,
		KnowledgeCompanyQuestion as Question
	} from './company-locate-client';

	interface Props {
		isOpen: boolean;
		onClose: () => void;
		watch: CompanyLocateWatch;
		/** Open the organization's card (closes the stack). */
		onOpenEntity: (id: string) => void;
		/** An answer saved details on this organization: its card and row are stale. */
		onAnswered?: (entityId: string) => void;
	}

	let { isOpen, onClose, watch, onOpenEntity, onAnswered }: Props = $props();

	/** Questions passed over in this sitting; they stay open and come back next time. */
	let skipped = $state<string[]>([]);
	/** How many this sitting has dealt with, for "3 of 60". */
	let handled = $state(0);

	const remaining = $derived(watch.questions.filter((q) => !skipped.includes(q.id)));
	const current = $derived<Question | undefined>(remaining[0]);
	const total = $derived(handled + remaining.length);

	function close() {
		skipped = [];
		handled = 0;
		onClose();
	}

	async function answer(question: Question, choice: CompanyQuestionChoice) {
		try {
			await watch.answer(question, choice);
			handled += 1;
			if (choice.choice === 'option') {
				const picked = question.options.find((option) => option.key === choice.key);
				toastService.success(
					picked?.place
						? `${question.name} is in ${picked.place.name}`
						: `Saved for ${question.name}`
				);
				onAnswered?.(question.entity_id);
			}
		} catch (error) {
			toastService.error(
				error instanceof Error ? error.message : 'Could not save that answer'
			);
		}
	}

	function skip(question: Question) {
		skipped = [...skipped, question.id];
		handled += 1;
	}
</script>

<Modal {isOpen} onClose={close} title="Which company?" size="md">
	<div class="flex flex-col gap-3 p-4 sm:p-5">
		{#if current}
			<div class="flex items-center gap-2">
				<p class="stamp text-xs text-muted-foreground">{handled + 1} of {total}</p>
				<button
					type="button"
					class="ml-auto text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
					onclick={() => {
						const id = current.entity_id;
						close();
						onOpenEntity(id);
					}}
				>
					Open its card
				</button>
			</div>
			<ErrorBoundary area="company question">
				<KnowledgeCompanyQuestion
					question={current}
					onAnswer={(choice) => answer(current, choice)}
					onSkip={() => skip(current)}
				/>
			</ErrorBoundary>
			<p class="text-xs text-muted-foreground">
				Several companies share this name, so nothing was saved. Picking one saves where it
				is and its website.
			</p>
		{:else}
			<p class="text-sm text-foreground">
				{skipped.length
					? `That's all for now. ${skipped.length} skipped ${skipped.length === 1 ? 'one is' : 'ones are'} waiting for next time.`
					: 'All sorted.'}
			</p>
			<div>
				<button
					type="button"
					class="inline-flex min-h-9 items-center rounded-md border border-border px-3 text-sm text-foreground pressable hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					onclick={close}
				>
					Done
				</button>
			</div>
		{/if}
	</div>
</Modal>
