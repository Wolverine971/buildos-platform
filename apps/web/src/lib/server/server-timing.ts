// apps/web/src/lib/server/server-timing.ts
import { performance } from 'node:perf_hooks';

export type ServerTimingEntry = {
	name: string;
	dur: number;
};

const sanitizeToken = (name: string) => name.replace(/[^A-Za-z0-9_.-]/g, '_');

export class ServerTiming {
	private enabled: boolean;
	private entries: ServerTimingEntry[] = [];
	private marks = new Map<string, number>();

	constructor(enabled: boolean) {
		this.enabled = enabled;
	}

	isEnabled(): boolean {
		return this.enabled;
	}

	start(name: string): void {
		if (!this.enabled) return;
		this.marks.set(name, performance.now());
	}

	end(name: string): number | null {
		if (!this.enabled) return null;
		const start = this.marks.get(name);
		if (start === undefined) return null;
		const dur = performance.now() - start;
		this.marks.delete(name);
		this.entries.push({ name: sanitizeToken(name), dur });
		return dur;
	}

	record(name: string, dur: number): void {
		if (!this.enabled) return;
		this.entries.push({ name: sanitizeToken(name), dur });
	}

	async measure<T>(name: string, fn: () => Promise<T> | T): Promise<T> {
		if (!this.enabled) {
			return await fn();
		}

		const start = performance.now();
		try {
			return await fn();
		} finally {
			this.entries.push({ name: sanitizeToken(name), dur: performance.now() - start });
		}
	}

	getEntries(): ServerTimingEntry[] {
		return [...this.entries];
	}

	getSlowMetrics(thresholdMs: number): ServerTimingEntry[] {
		return this.entries
			.filter((entry) => entry.dur >= thresholdMs)
			.sort((a, b) => b.dur - a.dur);
	}

	toHeader(): string {
		if (!this.enabled || this.entries.length === 0) return '';
		return this.entries.map((entry) => `${entry.name};dur=${entry.dur.toFixed(1)}`).join(', ');
	}
}

export const createServerTiming = (enabled: boolean) => new ServerTiming(enabled);
