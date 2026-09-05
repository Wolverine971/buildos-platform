// vitest.workers.ts
//
// Worker limits for LOCAL vitest runs. Spread into every workspace's
// `test` config: `test: { ...localWorkerLimits(), ... }`.
//
// Why: vitest defaults to (cores - 1) forked workers AND pre-spawns that
// many the moment the pool starts, even for a single test file. On a
// 14-core laptop that is 13 Node processes per `vitest run`, ~300-400MB
// each once busy on top of a ~500MB main Vite process. Every concurrent
// run (turbo fan-out, parallel agents, several editor sessions) multiplies
// it, which is how a laptop ends up swap-thrashing and frozen.
//
// Locally we cap the pool at a small fixed size and spawn lazily. CI keeps
// vitest's defaults. Env overrides (VITEST_MAX_FORKS / VITEST_MIN_FORKS,
// or the THREADS variants) always win over these values because vitest
// applies them after config resolution, so an agent session can tighten
// further without touching the repo.

const LOCAL_MAX_WORKERS = 4;

export function localWorkerLimits(): { maxWorkers?: number; minWorkers?: number } {
	if (process.env.CI) return {};
	return { maxWorkers: LOCAL_MAX_WORKERS, minWorkers: 1 };
}
