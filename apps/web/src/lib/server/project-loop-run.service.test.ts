// apps/web/src/lib/server/project-loop-run.service.test.ts
import { describe, expect, it } from 'vitest';
import { finalizeProjectLoopRunIfComplete } from './project-loop-run.service';

type Row = Record<string, any>;

function createDb(tables: { project_loop_runs: Row[]; project_suggestions: Row[] }) {
	return {
		tables,
		from(name: keyof typeof tables) {
			const filters: Array<(row: Row) => boolean> = [];
			let patch: Row | null = null;
			const rows = () => tables[name].filter((row) => filters.every((f) => f(row)));
			const builder: any = {
				select: () => builder,
				update: (value: Row) => ((patch = value), builder),
				eq: (column: string, value: unknown) => (
					filters.push((row) => row[column] === value),
					builder
				),
				in: (column: string, values: unknown[]) => (
					filters.push((row) => values.includes(row[column])),
					builder
				),
				limit: () => builder,
				maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
				then: (resolve: (value: unknown) => unknown) => {
					const matched = rows();
					if (patch) for (const row of matched) Object.assign(row, patch);
					return Promise.resolve({ data: matched, error: null }).then(resolve);
				}
			};
			return builder;
		}
	};
}

const decisionBrief = (candidateIds: string[]) => ({
	version: 2,
	attention_level: 'decision',
	candidate_ids: candidateIds
});

describe('finalizeProjectLoopRunIfComplete', () => {
	it('completes a run once every child suggestion is decided', async () => {
		const db = createDb({
			project_loop_runs: [{ id: 'run-1', status: 'waiting_review', brief: null }],
			project_suggestions: [{ id: 's-1', run_id: 'run-1', status: 'accepted' }]
		});

		await finalizeProjectLoopRunIfComplete(db, 'run-1');

		expect(db.tables.project_loop_runs[0]!.status).toBe('completed');
	});

	it('keeps a v2 decision brief in review while a project-wide candidate is pending', async () => {
		const db = createDb({
			project_loop_runs: [
				{ id: 'run-1', status: 'waiting_review', brief: decisionBrief(['older-1']) }
			],
			project_suggestions: [
				{ id: 's-1', run_id: 'run-1', status: 'accepted' },
				{ id: 'older-1', run_id: 'run-0', status: 'pending' }
			]
		});

		await finalizeProjectLoopRunIfComplete(db, 'run-1');

		expect(db.tables.project_loop_runs[0]!.status).toBe('waiting_review');
	});

	it('completes a v2 decision brief once its candidates are decided', async () => {
		const db = createDb({
			project_loop_runs: [
				{ id: 'run-1', status: 'waiting_review', brief: decisionBrief(['older-1']) }
			],
			project_suggestions: [{ id: 'older-1', run_id: 'run-0', status: 'rejected' }]
		});

		await finalizeProjectLoopRunIfComplete(db, 'run-1');

		expect(db.tables.project_loop_runs[0]!.status).toBe('completed');
	});
});
