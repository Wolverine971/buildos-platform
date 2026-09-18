// apps/web/src/lib/components/project/freshness/freshness-context.svelte.ts
/**
 * Project-page freshness radar state (Tasker 88, plan §3 FreshnessBadgeReadV1).
 *
 * ProjectWorkspace creates one instance per page and provides it by context: one GET for every
 * badge and gauge on the page, refreshed (debounced) after project mutations. Render sites ask
 * `flagFor` / `gaugeFor` and render nothing when the context is absent, so components shared
 * with other pages stay unchanged there.
 */
import { getContext, setContext } from 'svelte';
import type {
	FreshnessBadgeReadV1,
	FreshnessEntityKind,
	FreshnessUndoResultV1
} from '@buildos/shared-types';
import { notifyDataMutation } from '$lib/stores/projectDataMutations';

export type FreshnessBadgeFlag = FreshnessBadgeReadV1['flags'][number];
export type FreshnessBadgeGauge = FreshnessBadgeReadV1['gauges'][number];

export const PROJECT_FRESHNESS_CONTEXT_KEY = Symbol('project-freshness-radar');
const REFRESH_DEBOUNCE_MS = 1500;

function entityKey(kind: string, id: string): string {
	return `${kind}:${id}`;
}

type ApiBody<T> = { success?: boolean; data?: T; error?: string } | null;

async function readApiData<T>(response: Response): Promise<T> {
	const body = (await response.json().catch(() => null)) as ApiBody<T>;
	if (!response.ok || !body?.success) {
		throw new Error(body?.error || 'Request failed');
	}
	return body.data as T;
}

export class ProjectFreshnessState {
	readonly projectId: string;
	#fetchFn: typeof fetch | null;
	#refreshTimer: ReturnType<typeof setTimeout> | null = null;
	#inflight: AbortController | null = null;

	read = $state.raw<FreshnessBadgeReadV1 | null>(null);
	/** Flags acted on this page view; hidden immediately, before the next read lands. */
	resolved = $state.raw<ReadonlySet<string>>(new Set());

	/** One flag per entity: an automatic update outranks a possible one, then probability. */
	flagsByEntity = $derived.by(() => {
		const map = new Map<string, FreshnessBadgeFlag>();
		for (const flag of this.read?.flags ?? []) {
			if (this.resolved.has(flag.flagId)) continue;
			const key = entityKey(flag.entity.kind, flag.entity.id);
			const current = map.get(key);
			if (
				!current ||
				(flag.label === 'updated_automatically' &&
					current.label !== 'updated_automatically') ||
				(flag.label === current.label && flag.probability > current.probability)
			) {
				map.set(key, flag);
			}
		}
		return map;
	});

	gaugesByEntity = $derived.by(() => {
		const map = new Map<string, FreshnessBadgeGauge>();
		for (const gauge of this.read?.gauges ?? []) {
			map.set(entityKey(gauge.entity.kind, gauge.entity.id), gauge);
		}
		return map;
	});

	constructor(projectId: string, fetchFn?: typeof fetch) {
		this.projectId = projectId;
		this.#fetchFn = fetchFn ?? null;
	}

	#fetch(input: string, init?: RequestInit): Promise<Response> {
		return (this.#fetchFn ?? globalThis.fetch)(input, init);
	}

	get #base(): string {
		return `/api/onto/projects/${encodeURIComponent(this.projectId)}/freshness`;
	}

	flagFor(kind: FreshnessEntityKind, id: string): FreshnessBadgeFlag | null {
		return this.flagsByEntity.get(entityKey(kind, id)) ?? null;
	}

	gaugeFor(kind: 'goal' | 'milestone', id: string): FreshnessBadgeGauge | null {
		return this.gaugesByEntity.get(entityKey(kind, id)) ?? null;
	}

	flaggedIds(kind: FreshnessEntityKind): string[] {
		const ids: string[] = [];
		for (const flag of this.flagsByEntity.values()) {
			if (flag.entity.kind === kind) ids.push(flag.entity.id);
		}
		return ids;
	}

	/** Load badges and gauges. Failures are silent: badges are an ambient signal. */
	async refresh(): Promise<void> {
		this.#inflight?.abort();
		const controller = new AbortController();
		this.#inflight = controller;
		try {
			const response = await this.#fetch(this.#base, {
				cache: 'no-store',
				signal: controller.signal
			});
			const next = await readApiData<FreshnessBadgeReadV1>(response);
			if (controller.signal.aborted) return;
			this.read = next;
			this.resolved = new Set();
		} catch {
			// Keep the last good read.
		} finally {
			if (this.#inflight === controller) this.#inflight = null;
		}
	}

	scheduleRefresh(delayMs = REFRESH_DEBOUNCE_MS): void {
		if (this.#refreshTimer) clearTimeout(this.#refreshTimer);
		this.#refreshTimer = setTimeout(() => {
			this.#refreshTimer = null;
			void this.refresh();
		}, delayMs);
	}

	destroy(): void {
		if (this.#refreshTimer) clearTimeout(this.#refreshTimer);
		this.#refreshTimer = null;
		this.#inflight?.abort();
	}

	#resolve(flagId: string): void {
		this.resolved = new Set([...this.resolved, flagId]);
	}

	/** Undo one automatic update. Returns the undo result so the badge can explain a skip. */
	async undo(flag: FreshnessBadgeFlag): Promise<FreshnessUndoResultV1> {
		const response = await this.#fetch(
			`${this.#base}/scans/${encodeURIComponent(flag.scanId)}/undo`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ flag_ids: [flag.flagId] })
			}
		);
		const result = await readApiData<FreshnessUndoResultV1>(response);
		if (result.undone.includes(flag.flagId)) {
			this.#resolve(flag.flagId);
			notifyDataMutation({
				hasChanges: true,
				totalMutations: 1,
				affectedProjectIds: [this.projectId],
				hasMessagesSent: false,
				mutations: [
					{
						entityKind: flag.entity.kind,
						entityId: flag.entity.id,
						operation: 'update',
						projectIds: [this.projectId]
					}
				]
			});
		}
		return result;
	}

	/** "Not out of date": records the outcome and drops the flag from the bundle. */
	async markNotStale(flag: FreshnessBadgeFlag): Promise<void> {
		const response = await this.#fetch(
			`${this.#base}/flags/${encodeURIComponent(flag.flagId)}`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'not_stale' })
			}
		);
		await readApiData<unknown>(response);
		this.#resolve(flag.flagId);
	}
}

export function setProjectFreshnessContext(state: ProjectFreshnessState): ProjectFreshnessState {
	return setContext(PROJECT_FRESHNESS_CONTEXT_KEY, state);
}

export function getProjectFreshnessContext(): ProjectFreshnessState | null {
	return getContext<ProjectFreshnessState | undefined>(PROJECT_FRESHNESS_CONTEXT_KEY) ?? null;
}
