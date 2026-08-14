// scripts/audits/remediate-inbox-review-loop.mjs
// Dry-run/apply sweep for tasker/52 WP-1 and WP-2.
//
// Usage:
//   node scripts/audits/remediate-inbox-review-loop.mjs
//   node scripts/audits/remediate-inbox-review-loop.mjs --apply
//
// Dry-run is SELECT-only. --apply expires unresolved inbox rows for drift
// observations and executable proposals that fail the shared deterministic
// integrity resolver. Source project_suggestions remain untouched as history.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(new URL('../../apps/web/package.json', import.meta.url));
const { createClient } = require('@supabase/supabase-js');
const {
	projectSuggestionQuarantinedSourceStatus,
	serializeProjectSuggestionIntegrityDiagnostic,
	verifyProjectSuggestionIntegrity
} = await import('../../packages/shared-agent-ops/dist/proposal-context/index.mjs');

const apply = process.argv.includes('--apply');
const env = {};
for (const line of readFileSync(new URL('../../apps/web/.env', import.meta.url), 'utf8').split(
	'\n'
)) {
	const match = line.match(/^([A-Z_]+)=(.*)$/);
	if (match) env[match[1]] = match[2].replace(/^"|"$/g, '');
}

const supabase = createClient(env.PUBLIC_SUPABASE_URL, env.PRIVATE_SUPABASE_SERVICE_KEY);
const { data: inboxRows, error: inboxError } = await supabase
	.from('inbox_items')
	.select('id, project_id, source_ref_id, status, source_status')
	.eq('source_type', 'project_suggestion')
	.eq('audience', 'project_members')
	.in('status', ['pending', 'deciding', 'snoozed', 'blocked', 'deferred'])
	.limit(1000);
if (inboxError) throw inboxError;

const suggestionIds = [...new Set((inboxRows ?? []).map((row) => row.source_ref_id))];
const { data: suggestions, error: suggestionError } = await supabase
	.from('project_suggestions')
	.select('id, project_id, kind, status, title, preview, operations')
	.in('id', suggestionIds)
	.limit(1000);
if (suggestionError) throw suggestionError;

const projectIds = [...new Set((suggestions ?? []).map((row) => row.project_id))];
const { data: projects, error: projectError } = await supabase
	.from('onto_projects')
	.select('id, name')
	.in('id', projectIds);
if (projectError) throw projectError;
const projectName = new Map((projects ?? []).map((project) => [project.id, project.name]));

const inboxBySuggestion = new Map((inboxRows ?? []).map((row) => [row.source_ref_id, row]));
const actions = [];
for (const suggestion of suggestions ?? []) {
	if (suggestion.kind === 'drift') {
		actions.push({
			type: 'observation_not_admitted',
			suggestion,
			sourceStatus: 'observation_not_admitted',
			reason: 'Drift observations remain in Project Review history but are not attention items'
		});
		continue;
	}
	const operations = Array.isArray(suggestion.operations) ? suggestion.operations : [];
	if (operations.length === 0) continue;
	const verification = await verifyProjectSuggestionIntegrity(supabase, {
		projectId: suggestion.project_id,
		operations,
		title: suggestion.title,
		preview: suggestion.preview,
		checkModelAlignment: true
	});
	if (!verification.ok) {
		actions.push({
			type: 'proposal_quarantined',
			suggestion,
			diagnostic: verification.diagnostic,
			sourceStatus: projectSuggestionQuarantinedSourceStatus(verification.diagnostic),
			reason: serializeProjectSuggestionIntegrityDiagnostic(verification.diagnostic)
		});
	}
}

const counts = actions.reduce((result, action) => {
	result[action.type] = (result[action.type] ?? 0) + 1;
	return result;
}, {});
console.log(`=== Tasker 52 remediation sweep (${apply ? 'APPLY' : 'DRY RUN'}) ===`);
console.log(`Unresolved inbox suggestions scanned: ${suggestions?.length ?? 0}`);
console.log('Actions:', counts);
for (const action of actions) {
	const inbox = inboxBySuggestion.get(action.suggestion.id);
	const diagnostic = action.diagnostic ? ` ${action.diagnostic.code}` : '';
	const resolution = action.diagnostic?.resolved_entity_title
		? ` | resolves to: ${action.diagnostic.resolved_entity_title}${action.diagnostic.resolved_destination_title ? ` -> ${action.diagnostic.resolved_destination_title}` : ''}`
		: '';
	console.log(
		`- ${action.type}${diagnostic} | ${projectName.get(action.suggestion.project_id) ?? action.suggestion.project_id} | ${action.suggestion.title} | ${inbox?.status ?? 'missing-inbox-row'}${resolution}`
	);
}

if (!apply) {
	console.log('\nDry run only. Re-run with --apply to expire these inbox rows.');
	process.exit(0);
}

let updated = 0;
for (const action of actions) {
	const { data, error } = await supabase
		.from('inbox_items')
		.update({
			status: 'expired',
			source_status: action.sourceStatus,
			decided_at: new Date().toISOString(),
			blocked_reason: action.reason,
			snoozed_until: null,
			expires_at: null
		})
		.eq('source_type', 'project_suggestion')
		.eq('source_ref_id', action.suggestion.id)
		.in('status', ['pending', 'deciding', 'snoozed', 'blocked', 'deferred'])
		.select('id');
	if (error) throw error;
	updated += data?.length ?? 0;
}
console.log(`\nExpired inbox rows: ${updated}`);
