// scripts/agentic/llm-incidents-render.ts
//
// Rendering for scripts/agentic/llm-incidents.ts. One incident uses the same
// investigation packet as the admin page's export
// (apps/web/src/lib/services/admin/model-incidents/packet.ts), so the terminal
// and the browser hand Claude Code or Codex identical text. The list is a
// terminal table.
import {
	assembleStream,
	renderIncidentPacket,
	throughputBars
} from '../../apps/web/src/lib/services/admin/model-incidents/packet';
import {
	longestSilence,
	seconds
} from '../../apps/web/src/lib/services/admin/model-incidents/story';
import type { ModelIncidentRow } from '../../apps/web/src/lib/services/admin/model-incidents/types';

export type IncidentRow = Record<string, unknown>;

export { assembleStream, longestSilence, throughputBars };

const record = (value: unknown): Record<string, unknown> =>
	value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};

export function renderIncident(row: IncidentRow): string {
	return renderIncidentPacket(row as unknown as ModelIncidentRow);
}

export function renderIncidentList(rows: IncidentRow[]): string {
	if (!rows.length) return 'No incidents in this window.';
	const header =
		'when (UTC)           kind   reason                     role             model / provider                          http  lasted   left running                id';
	return [
		header,
		...rows.map((row) => {
			const eventual = row.eventual ? record(row.eventual) : null;
			const ran = eventual
				? eventual.status === 'running'
					? 'running'
					: `${String(eventual.ended_by)} ${seconds(eventual.total_ms as number)}`
				: '—';
			return [
				String(row.created_at).slice(0, 19).replace('T', ' ').padEnd(20),
				String(row.kind).padEnd(6),
				String(row.reason).slice(0, 26).padEnd(26),
				String(row.pass_role ?? '—').padEnd(16),
				`${String(row.model_used ?? row.model_requested)} / ${String(row.provider ?? '—')}`
					.slice(0, 41)
					.padEnd(41),
				String(row.http_status ?? '—').padEnd(5),
				seconds(row.duration_ms as number).padEnd(8),
				ran.slice(0, 27).padEnd(27),
				String(row.id)
			].join(' ');
		})
	].join('\n');
}
