// apps/web/src/lib/components/knowledge/research-queue.svelte.ts
//
// The browser side of the research tray (tasker 164): one shared, reactive view of the user's
// "Find more" runs for the /knowledge page. The tray renders it, the Enrich dialog reads the
// allowance from it, and each card reads its own entry's progress from it, so the page makes
// one request every few seconds no matter how many entries are researching. Polling runs only
// while something is queued or running, pauses while the tab is hidden, and stops when idle.

import { knowledgeApi } from './knowledge-client';
import {
	isActiveTarget,
	isLiveRun,
	type ResearchAllowance,
	type ResearchRun,
	type ResearchTarget
} from './research-tray';

export const RESEARCH_POLL_MS = 3000;
/** After failed polls (offline, signed out) wait longer each time, up to a minute. */
export const RESEARCH_POLL_MAX_BACKOFF_MS = 60_000;
const DISMISSED_KEY = 'buildos:knowledge-research-cleared-at';

function readDismissed(): number {
	try {
		return Number(localStorage.getItem(DISMISSED_KEY) ?? 0) || 0;
	} catch {
		return 0;
	}
}

export interface ResearchQueueOptions {
	/** Entries whose research just finished (done, failed, skipped or stopped). */
	onSettled?: (targets: ResearchTarget[]) => void;
	/** Injected for tests. */
	load?: () => Promise<{ runs: ResearchRun[]; allowance: ResearchAllowance }>;
	isHidden?: () => boolean;
}

export class KnowledgeResearchQueue {
	runs = $state.raw<ResearchRun[]>([]);
	allowance = $state.raw<ResearchAllowance | null>(null);
	loaded = $state(false);
	/** Whether the tray is open (it opens again whenever new research starts). */
	expanded = $state(true);
	/** Finished runs that ended before this (epoch ms) are cleared from the tray. */
	clearedAt = $state(0);

	/** Something is queued or running (and not stalled): keep polling. */
	readonly live = $derived(this.runs.some(isLiveRun));
	/** What the tray shows: everything live, plus finished runs not cleared yet. */
	readonly visibleRuns = $derived(
		this.runs.filter(
			(run) =>
				isLiveRun(run) || Date.parse(run.finished_at ?? run.created_at) > this.clearedAt
		)
	);
	/** The newest research target for each entry, across all loaded runs. */
	readonly byEntity = $derived.by(() => {
		const latest = new Map<string, ResearchTarget>();
		for (const run of this.runs) {
			for (const target of run.targets) {
				if (!latest.has(target.entity_id)) latest.set(target.entity_id, target);
			}
		}
		return latest;
	});

	#timer: ReturnType<typeof setTimeout> | null = null;
	#seq = 0;
	#failures = 0;
	#stopped = true;
	#options: ResearchQueueOptions;

	constructor(options: ResearchQueueOptions = {}) {
		this.#options = options;
	}

	/** Begin: load once, then poll while anything is running. Returns a stop function. */
	start(): () => void {
		this.#stopped = false;
		this.clearedAt = readDismissed();
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
			const next = await (this.#options.load ?? knowledgeApi.research)();
			if (seq !== this.#seq) return;
			const before = new Map<string, ResearchTarget>();
			for (const run of this.runs)
				for (const target of run.targets) before.set(target.id, target);
			const settled: ResearchTarget[] = [];
			for (const run of next.runs) {
				for (const target of run.targets) {
					const was = before.get(target.id);
					if (was && isActiveTarget(was) && !isActiveTarget(target)) settled.push(target);
				}
			}
			this.runs = next.runs;
			this.allowance = next.allowance;
			this.loaded = true;
			this.#failures = 0;
			if (settled.length) this.#options.onSettled?.(settled);
		} catch {
			// A failed poll keeps the last state; the next tick tries again, backing off.
			if (seq === this.#seq) this.#failures += 1;
		} finally {
			if (seq === this.#seq) this.#schedule();
		}
	}

	/** New research was just queued: show the tray and start watching it. */
	async started(): Promise<void> {
		this.expanded = true;
		await this.refresh();
	}

	async cancelTarget(target: Pick<ResearchTarget, 'id'>): Promise<void> {
		await knowledgeApi.cancelResearch({ target_id: target.id });
		await this.refresh();
	}

	async cancelRun(run: Pick<ResearchRun, 'id'>): Promise<void> {
		await knowledgeApi.cancelResearch({ run_id: run.id });
		await this.refresh();
	}

	/** Forget everything (sign-out): stop polling and drop the last user's runs. */
	reset(): void {
		this.stop();
		this.#seq += 1; // a poll still in flight lands nowhere
		this.#failures = 0;
		this.runs = [];
		this.allowance = null;
		this.loaded = false;
		this.expanded = true;
	}

	/** Clear finished runs from the tray (they stay on each entry's card). */
	clearFinished(now = Date.now()): void {
		this.clearedAt = now;
		try {
			localStorage.setItem(DISMISSED_KEY, String(now));
		} catch {
			// private mode: cleared for this visit only
		}
	}

	#schedule(): void {
		this.#clearTimer();
		if (this.#stopped || !this.live) return;
		const delay = this.#failures
			? Math.min(RESEARCH_POLL_MS * 2 ** this.#failures, RESEARCH_POLL_MAX_BACKOFF_MS)
			: RESEARCH_POLL_MS;
		this.#timer = setTimeout(() => this.#tick(), delay);
	}

	#tick(): void {
		const hidden =
			this.#options.isHidden?.() ??
			(typeof document !== 'undefined' && document.visibilityState === 'hidden');
		if (hidden) {
			// No request while the tab is in the background; look again shortly.
			this.#timer = setTimeout(() => this.#tick(), RESEARCH_POLL_MS);
			return;
		}
		void this.refresh();
	}

	#clearTimer(): void {
		if (this.#timer) clearTimeout(this.#timer);
		this.#timer = null;
	}
}
