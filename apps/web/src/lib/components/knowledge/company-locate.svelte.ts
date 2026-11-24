// apps/web/src/lib/components/knowledge/company-locate.svelte.ts
//
// The browser's view of "find where my companies are" (tasker 170): the latest lookup run for
// the banner on /knowledge, and the open "Which one?" questions for the review stack and the
// organization cards. One instance for the tab. It polls only while a lookup is running,
// pauses while the tab is hidden, and stops when the run finishes.

import {
	companyLocateApi,
	type CompanyQuestionChoice,
	type KnowledgeCompanyQuestion,
	type KnowledgeLocateTray,
	type LocateSearchStarted,
	type LocateStarted
} from './company-locate-client';

export const LOCATE_POLL_MS = 3000;
const LOCATE_POLL_MAX_BACKOFF_MS = 60_000;

export interface CompanyLocateOptions {
	/** Injected for tests. */
	api?: typeof companyLocateApi;
	isHidden?: () => boolean;
}

type ProgressListener = (tray: KnowledgeLocateTray) => void;

export class CompanyLocateWatch {
	tray = $state.raw<KnowledgeLocateTray | null>(null);
	questions = $state.raw<KnowledgeCompanyQuestion[]>([]);
	loaded = $state(false);

	/** A lookup is queued or running: keep polling. */
	readonly live = $derived(this.tray?.status === 'queued' || this.tray?.status === 'running');
	readonly byEntity = $derived(new Map(this.questions.map((q) => [q.entity_id, q])));

	#timer: ReturnType<typeof setTimeout> | null = null;
	#seq = 0;
	#failures = 0;
	#stopped = true;
	#api: typeof companyLocateApi;
	#options: CompanyLocateOptions;
	#listeners = new Set<ProgressListener>();

	constructor(options: CompanyLocateOptions = {}) {
		this.#options = options;
		this.#api = options.api ?? companyLocateApi;
	}

	/** Load once, then poll while a lookup runs. Returns a stop function. */
	start(): () => void {
		this.#stopped = false;
		void this.refresh();
		return () => this.stop();
	}

	stop(): void {
		this.#stopped = true;
		this.#clearTimer();
	}

	async refresh(): Promise<void> {
		const seq = ++this.#seq;
		this.#clearTimer();
		try {
			const { locate } = await this.#api.tray();
			if (seq !== this.#seq) return;
			const before = this.tray;
			this.tray = locate;
			this.loaded = true;
			this.#failures = 0;
			const open = locate?.open_questions ?? 0;
			if (open !== this.questions.length) {
				const { questions } = open ? await this.#api.questions() : { questions: [] };
				if (seq !== this.#seq) return;
				this.questions = questions;
			}
			if (locate && before && movedOn(before, locate)) {
				for (const listener of this.#listeners) listener(locate);
			}
		} catch {
			// A failed poll keeps the last state; the next tick tries again, backing off.
			if (seq === this.#seq) this.#failures += 1;
		} finally {
			if (seq === this.#seq) this.#schedule();
		}
	}

	/**
	 * Called when a running lookup has placed more companies, or has stopped running: lists
	 * and place filters on screen may be stale. Returns the function that stops listening.
	 */
	onProgress(listener: ProgressListener): () => void {
		this.#listeners.add(listener);
		return () => this.#listeners.delete(listener);
	}

	/** Queue a lookup and start watching it. */
	async begin(body: {
		entity_ids?: string[];
		origin: 'import' | 'manual';
	}): Promise<LocateStarted> {
		const started = await this.#api.start(body);
		this.#stopped = false;
		await this.refresh();
		return started;
	}

	async stopRun(): Promise<void> {
		if (!this.tray) return;
		await this.#api.stop(this.tray.run_id);
		await this.refresh();
	}

	/** Answer a question. It leaves the stack at once; a failed save puts it back. */
	async answer(question: KnowledgeCompanyQuestion, choice: CompanyQuestionChoice): Promise<void> {
		const before = this.questions;
		this.questions = before.filter((q) => q.id !== question.id);
		try {
			await this.#api.answer(question.id, choice);
		} catch (error) {
			this.questions = before;
			throw error;
		}
		if (this.tray) {
			this.tray = {
				...this.tray,
				open_questions: Math.max(0, this.tray.open_questions - 1),
				leftover: this.tray.leftover + (choice.choice === 'none_of_these' ? 1 : 0)
			};
		}
	}

	async searchRest(): Promise<LocateSearchStarted> {
		const started = await this.#api.searchRest();
		await this.refresh();
		return started;
	}

	/** Signed out: stop polling and drop the last user's state. */
	reset(): void {
		this.stop();
		this.#seq += 1;
		this.#failures = 0;
		this.tray = null;
		this.questions = [];
		this.loaded = false;
	}

	#schedule(): void {
		this.#clearTimer();
		if (this.#stopped || !this.live) return;
		const delay = this.#failures
			? Math.min(LOCATE_POLL_MS * 2 ** this.#failures, LOCATE_POLL_MAX_BACKOFF_MS)
			: LOCATE_POLL_MS;
		this.#timer = setTimeout(() => this.#tick(), delay);
	}

	#tick(): void {
		const hidden =
			this.#options.isHidden?.() ??
			(typeof document !== 'undefined' && document.visibilityState === 'hidden');
		if (hidden) {
			this.#timer = setTimeout(() => this.#tick(), LOCATE_POLL_MS);
			return;
		}
		void this.refresh();
	}

	#clearTimer(): void {
		if (this.#timer) clearTimeout(this.#timer);
		this.#timer = null;
	}
}

/** More companies were placed since the last poll, or the run stopped running. */
function movedOn(before: KnowledgeLocateTray, now: KnowledgeLocateTray): boolean {
	const found = (tray: KnowledgeLocateTray) => tray.stats.placed + tray.stats.unconfirmed;
	const live = (tray: KnowledgeLocateTray) =>
		tray.status === 'queued' || tray.status === 'running';
	return (
		before.run_id !== now.run_id || found(before) !== found(now) || live(before) !== live(now)
	);
}

/** The tab's one watcher, shared by the banner, the review stack and the cards. */
export const companyLocate = new CompanyLocateWatch();
