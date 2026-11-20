// apps/web/src/lib/components/task-entities/task-entities.svelte.ts
//
// The entities of the task a surface shows (project reader, task modal): loaded once per task
// and looked at again after the worker has had time to re-read an edit. From the rows it derives
// what each surface needs (docs/research/task-entity-layer-2026-10-07.md):
//   - keyChips: the few details shown above the text (Join, the one number to call, …);
//   - cards: each person, organization and place, linked to its numbers and people;
//   - mention targets for the text, and the card the popover has open.
// Create it during component setup: it owns two effects.
import {
	type TaskEntityCard,
	type TaskEntityChip,
	type TaskEntityRecord,
	type TaskEntityStatus,
	buildTaskEntityCards,
	detectTaskTextEntities,
	pickKeyTaskEntityChips
} from '@buildos/shared-agent-ops/task-entities';
import { untrack } from 'svelte';
import { toastService } from '$lib/stores/toast.store';
import type { MentionLink, MentionTarget } from './entity-mentions';
import type { LensEntry } from '$lib/components/knowledge/sharing-types';
import { lensEntriesFor } from '$lib/components/knowledge/lens-match';

export type TaskEntitySource = {
	taskId: string | null;
	title: string;
	description: string | null;
};

const RECHECK_AFTER_EDIT_MS = [20_000, 45_000];

export class TaskEntities {
	#source: () => TaskEntitySource = () => ({ taskId: null, title: '', description: null });
	// Separate deriveds so a title edit never re-runs the per-task load.
	#taskId: string | null = $derived(this.#source().taskId);
	#title: string = $derived(this.#source().title ?? '');
	#text: string = $derived(`${this.#title}\n\n${this.#source().description ?? ''}`);
	#rows = $state<TaskEntityRecord[]>([]);
	#overrides = $state<Record<string, TaskEntityStatus>>({});
	/** The card the popover shows and the element it hangs from. */
	open = $state<{ cardId: string; anchor: HTMLElement } | null>(null);
	/** Task entity id → the viewer's knowledge-graph entry for that person or org (tasker 160). */
	knowledge = $state.raw<Record<string, string>>({});
	/** In a project other people are in: what their People hold about these names (tasker 168). */
	lens = $state.raw<{ projectId: string; entries: LensEntry[] } | null>(null);

	readonly entities: TaskEntityRecord[] = $derived(
		this.#rows.map((row) => {
			const status = this.#overrides[row.id];
			return status ? { ...row, status } : row;
		})
	);
	readonly keyChips: TaskEntityChip[] = $derived(
		pickKeyTaskEntityChips({
			entities: this.entities,
			detected: detectTaskTextEntities(this.#text)
		})
	);
	readonly cards: TaskEntityCard[] = $derived(buildTaskEntityCards(this.entities));
	readonly targets: MentionTarget[] = $derived(
		this.cards.map((card) => ({ id: card.id, words: card.mentions, label: card.name }))
	);
	/** Phone numbers and emails in the title, which renders as plain text. */
	readonly titleLinks: MentionLink[] = $derived(
		detectTaskTextEntities(this.#title)
			.filter((found) => found.kind === 'phone' || found.kind === 'email')
			.map((found) => ({
				text: found.quote,
				href: found.kind === 'phone' ? `tel:${found.value}` : `mailto:${found.value}`
			}))
	);
	readonly openCard: TaskEntityCard | null = $derived(
		this.open ? (this.cards.find((card) => card.id === this.open?.cardId) ?? null) : null
	);

	constructor(source: () => TaskEntitySource) {
		this.#source = source;

		$effect(() => {
			const id = this.#taskId;
			this.#rows = [];
			this.#overrides = {};
			this.knowledge = {};
			this.lens = null;
			this.open = null;
			if (!id) return;
			const controller = new AbortController();
			void this.#load(id, controller.signal);
			return () => controller.abort();
		});

		// After an edit, the worker re-reads the text in ~15–30 s: look again twice.
		let textAtLoad: string | null = null;
		let taskAtLoad: string | null = null;
		$effect(() => {
			const taskId = this.#taskId;
			const text = this.#text;
			if (!taskId) return;
			if (taskAtLoad !== taskId || textAtLoad === null) {
				taskAtLoad = taskId;
				textAtLoad = text;
				return;
			}
			if (text === textAtLoad) return;
			textAtLoad = text;
			const timers = RECHECK_AFTER_EDIT_MS.map((ms) =>
				setTimeout(() => void this.#load(taskId), ms)
			);
			return () => timers.forEach(clearTimeout);
		});
	}

	#read(taskId: string, signal?: AbortSignal) {
		return fetch(`/api/onto/task-entities?task_ids=${encodeURIComponent(taskId)}&knowledge=1`, {
			signal
		});
	}

	/** A read started ahead of its task, kept for that task's load to pick up. */
	#early: { taskId: string; response: Promise<Response | null> } | null = null;

	/**
	 * Start reading a task's entities before the task itself has loaded. The source only
	 * names a task once its record is in, so this read used to start after the task's own
	 * (one after the other), and the key details landed late and pushed the text down.
	 * Started alongside, they are usually there when the text first shows.
	 */
	prefetch(taskId: string) {
		// Untracked: the caller is an effect that loads the task, and must not run again
		// (and load it again) just because that task then became the one shown here.
		if (untrack(() => this.#taskId) === taskId || this.#early?.taskId === taskId) return;
		this.#early = { taskId, response: this.#read(taskId).catch(() => null) };
	}

	async #load(taskId: string, signal?: AbortSignal) {
		try {
			const early = this.#early?.taskId === taskId ? this.#early.response : null;
			this.#early = null;
			const response = (await early) ?? (await this.#read(taskId, signal));
			if (!response.ok || this.#taskId !== taskId || signal?.aborted) return;
			const body = await response.json();
			this.#rows = Array.isArray(body?.data?.entities) ? body.data.entities : [];
			const knowledge = body?.data?.knowledge;
			this.knowledge = knowledge && typeof knowledge === 'object' ? knowledge : {};
			const lens = body?.data?.lens;
			this.lens =
				lens && typeof lens.project_id === 'string' && Array.isArray(lens.entries)
					? { projectId: lens.project_id, entries: lens.entries }
					: null;
			this.#overrides = {};
		} catch {
			// A convenience: the text and its links still show without it.
		}
	}

	/** Other members' entries for one card's name (its display name and the words it appears as). */
	lensFor(card: TaskEntityCard | null): LensEntry[] {
		if (!card || !this.lens) return [];
		return lensEntriesFor(this.lens.entries, [card.name, ...card.mentions]);
	}

	openCardFor(cardId: string, anchor: HTMLElement) {
		this.open = { cardId, anchor };
	}

	/** Switch the open popover to another card (Casey → Dauntless Dogs), same anchor. */
	showCard(cardId: string) {
		if (this.open) this.open = { cardId, anchor: this.open.anchor };
	}

	close() {
		this.open = null;
	}

	/**
	 * "Add to People" (Organizations / Places): file this name into the viewer's own knowledge,
	 * linked to the task, then open its knowledge card in place of the task card.
	 */
	async addToKnowledge(card: TaskEntityCard): Promise<string | null> {
		try {
			const response = await fetch('/api/knowledge/from-task-entity', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ task_entity_id: card.id })
			});
			const body = await response.json().catch(() => null);
			const id = body?.data?.entity_id as string | undefined;
			if (!response.ok || !id) throw new Error(body?.error ?? 'Could not add that');
			this.knowledge = { ...this.knowledge, [card.id]: id };
			const copied = await this.#adoptLens(card, id);
			toastService.success(
				body?.data?.matched === 'created'
					? `Added ${card.name}${copied ? ` with ${copied} public detail${copied === 1 ? '' : 's'} others had` : ''}. Only you can see it.`
					: `${card.name} was already in your knowledge, now linked to this task.`
			);
			return id;
		} catch (error) {
			toastService.error(error instanceof Error ? error.message : 'Could not add that');
			return null;
		}
	}

	/** Copy the public-web details other members' entries show for this name (tasker 168). */
	async #adoptLens(card: TaskEntityCard, into: string): Promise<number> {
		const lens = this.lens;
		const taskId = this.#taskId;
		const from = this.lensFor(card).filter((e) => e.facts.some((f) => f.source_url));
		if (!lens || !taskId || !from.length) return 0;
		let copied = 0;
		for (const entry of from) {
			try {
				const response = await fetch('/api/knowledge/lens/adopt', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						project_id: lens.projectId,
						record_kind: 'task',
						record_id: taskId,
						from_entity_id: entry.entity.id,
						into_entity_id: into
					})
				});
				const body = await response.json().catch(() => null);
				copied += Number(body?.data?.copied ?? 0);
			} catch {
				// The entry exists either way; the details can be added by hand.
			}
		}
		return copied;
	}

	/** Dismiss a name without the Undo toast (it was deleted from knowledge on purpose). */
	async dismissQuietly(cardId: string): Promise<void> {
		await this.#setStatus(cardId, 'dismissed');
	}

	/** A knowledge entry was hidden or deleted: names pointing at it go back to the task card. */
	forgetKnowledge(entryId: string) {
		this.knowledge = Object.fromEntries(
			Object.entries(this.knowledge).filter(([, id]) => id !== entryId)
		);
	}

	/** Hide a wrong entity for good (its mention link goes away), with Undo. */
	async hide(card: TaskEntityCard) {
		this.close();
		const saved = await this.#setStatus(card.id, 'dismissed');
		if (!saved) return;
		const before = this.#rows.find((entry) => entry.id === card.id)?.status;
		toastService.info(`Hid ${card.name}`, {
			action: {
				label: 'Undo',
				onClick: () =>
					void this.#setStatus(
						card.id,
						before && before !== 'dismissed' ? before : 'suggested'
					)
			}
		});
	}

	async #setStatus(id: string, status: TaskEntityStatus): Promise<boolean> {
		const previous = this.#overrides[id];
		this.#overrides = { ...this.#overrides, [id]: status };
		try {
			const response = await fetch(`/api/onto/task-entities/${id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ status })
			});
			if (!response.ok) throw new Error(String(response.status));
			return true;
		} catch {
			const restored = { ...this.#overrides };
			if (previous) restored[id] = previous;
			else delete restored[id];
			this.#overrides = restored;
			toastService.error('Could not save that. Try again.');
			return false;
		}
	}
}
