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
import { toastService } from '$lib/stores/toast.store';
import type { MentionLink, MentionTarget } from './entity-mentions';

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

	async #load(taskId: string, signal?: AbortSignal) {
		try {
			const response = await fetch(
				`/api/onto/task-entities?task_ids=${encodeURIComponent(taskId)}`,
				{ signal }
			);
			if (!response.ok || this.#taskId !== taskId) return;
			const body = await response.json();
			this.#rows = Array.isArray(body?.data?.entities) ? body.data.entities : [];
			this.#overrides = {};
		} catch {
			// A convenience: the text and its links still show without it.
		}
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
