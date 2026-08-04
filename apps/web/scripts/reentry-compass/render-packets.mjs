// apps/web/scripts/reentry-compass/render-packets.mjs
// Render packets + per-packet evidence appendix for blind scoring.
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
const SCRATCH = process.env.OUT_DIR ?? new URL('./out', import.meta.url).pathname;
const J = (f) => JSON.parse(readFileSync(`${SCRATCH}/${f}`, 'utf8'));
const packets = J('packets/packets.json');
const projectsRaw = J('dump-projects.json');
const actors = J('dump-actors.json');
const tasks = J('dump-tasks.json');
const logs = J('dump-logs.json');
const docs = J('dump-documents.json');
const actorUser = new Map(actors.filter((a) => a.user_id).map((a) => [a.id, a.user_id]));
const projects = projectsRaw.map((p) => ({ ...p, owner: actorUser.get(p.created_by) ?? null }));
const D = 86400e3;

mkdirSync(`${SCRATCH}/packets/render`, { recursive: true });
for (const pk of packets) {
	const asOf = Date.parse(pk.as_of);
	const r = pk.rows;
	const row = (label, v) =>
		v.omit
			? `> ~~${label}~~ — omitted (${v.omit})`
			: Array.isArray(v)
				? v.map((x) => `> **${label}:** ${x.text}`).join('\n')
				: `> **${label}:** ${v.text}`;
	const card = [
		`## Packet ${pk.packet_id}`,
		`kind=${pk.kind} · internal=${pk.internal} · as_of=${pk.as_of} · away_days=${pk.away_days}`,
		'',
		`> **Pick up where you left off**`,
		`> **${pk.ranking.selected.name}**`,
		`>`,
		row('Where it stands', r.where_it_stands),
		row('Since you were away', r.since_you_were_away),
		row('Blocked / needs attention', r.blocked),
		row('Next move', r.next_move),
		`>`,
		`> ${pk.ranking.low_confidence_offer_choice ? '[Low confidence — would offer project choice]' : '[Confident selection]'} · alternate: ${pk.ranking.alternate?.name ?? 'none'}`,
		'',
		'### Machine sources',
		'```json',
		JSON.stringify(pk.rows, null, 1),
		'```'
	].join('\n');

	// Evidence appendix
	const owned = projects.filter(
		(p) =>
			p.owner === pk.user.id &&
			Date.parse(p.created_at) <= asOf &&
			(!p.deleted_at || Date.parse(p.deleted_at) > asOf) &&
			(!p.archived_at || Date.parse(p.archived_at) > asOf)
	);
	const candTable = owned
		.map((p) => {
			const muts = logs.filter(
				(l) =>
					l.project_id === p.id &&
					l.changed_by === pk.user.id &&
					l.change_source !== 'agent_call' &&
					Date.parse(l.created_at) < asOf
			);
			const lastMut = muts.length ? muts[muts.length - 1].created_at : null;
			const act = tasks.filter(
				(t) =>
					t.project_id === p.id &&
					!t.deleted_at &&
					!t.archived_at &&
					Date.parse(t.created_at) <= asOf &&
					!['done'].includes(t.state_key)
			);
			return `| ${p.name.slice(0, 45)} | ${p.state_key ?? '—'} | ${((asOf - Date.parse(p.created_at)) / D).toFixed(0)}d | ${muts.length} | ${lastMut ? ((asOf - Date.parse(lastMut)) / D).toFixed(0) + 'd ago' : 'never'} | ${act.length} |`;
		})
		.join('\n');
	const selTasks = tasks
		.filter(
			(t) =>
				t.project_id === pk.ranking.selected.id &&
				!t.deleted_at &&
				!t.archived_at &&
				Date.parse(t.created_at) <= asOf
		)
		.map(
			(t) =>
				`| ${t.title.slice(0, 55)} | ${t.state_key} | ${t.due_at ? t.due_at.slice(0, 10) : '—'} | ${t.completed_at ? t.completed_at.slice(0, 10) : '—'} | ${t.id.slice(0, 8)} |`
		)
		.join('\n');
	const winLogs = logs
		.filter((l) => l.project_id === pk.ranking.selected.id)
		.slice(-15)
		.map(
			(l) =>
				`| ${l.created_at.slice(0, 16)} | ${l.entity_type} | ${l.action} | ${l.change_source} | ${l.entity_id.slice(0, 8)} |`
		)
		.join('\n');
	const ctxDoc = docs
		.filter(
			(d) =>
				d.project_id === pk.ranking.selected.id &&
				d.type_key === 'document.context.project' &&
				!d.deleted_at
		)
		.sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))[0];
	const proj = projects.find((p) => p.id === pk.ranking.selected.id);
	const evidence = [
		`## Evidence for ${pk.packet_id}`,
		'',
		'### All candidate projects for this user at as_of',
		'| Project | state | age | user muts | last user mut | open tasks |',
		'|---|---|---|---|---|---|',
		candTable,
		'',
		`### Selected project fields (onto_projects, CURRENT values)`,
		'```json',
		JSON.stringify(
			{
				next_step_short: proj?.next_step_short ?? null,
				next_step_source: proj?.next_step_source ?? null,
				next_step_updated_at: proj?.next_step_updated_at ?? null,
				state_key: proj?.state_key ?? null,
				updated_at: proj?.updated_at
			},
			null,
			1
		),
		'```',
		'',
		'### Tasks existing at as_of on selected project (CURRENT state values)',
		'| Title | state | due | completed | id |',
		'|---|---|---|---|---|',
		selTasks || '| (none) | | | | |',
		'',
		'### Last 15 project log rows (all time, selected project)',
		'| at | entity | action | source | entity_id |',
		'|---|---|---|---|---|',
		winLogs || '| (none) | | | | |',
		'',
		'### Start Here context doc',
		ctxDoc
			? `updated_at=${ctxDoc.updated_at}\n\n\`\`\`\n${(ctxDoc.content || ctxDoc.props?.body_markdown || '').slice(0, 1200)}\n\`\`\``
			: '(none)'
	].join('\n');

	writeFileSync(`${SCRATCH}/packets/render/${pk.packet_id}.md`, card + '\n\n---\n\n' + evidence);
}
console.log('rendered', packets.length, 'packets to packets/render/');
