// apps/web/scripts/agentic-e2e/dump-turn-decisions.mjs
// Usage (from apps/web, with .env loaded): node scripts/agentic-e2e/dump-turn-decisions.mjs <evidence.json> <out.json> [scenarioId]
// Pulls chat_tool_executions rows (full contract + reviewer arguments) for every turn_run in a retained battery artifact.
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
const sb = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.PRIVATE_SUPABASE_SERVICE_KEY);
const [artifact, out, scenarioFilter] = process.argv.slice(2);
const d = JSON.parse(fs.readFileSync(artifact,'utf8'));
const rows = [];
for (const t of d.turns) {
  if (scenarioFilter && t.scenarioId !== scenarioFilter) continue;
  const id = t.turnRun?.id; if (!id) continue;
  const { data, error } = await sb.from('chat_tool_executions').select('sequence_index,tool_name,arguments,result,success,error_message').eq('turn_run_id', id).order('sequence_index');
  rows.push({ scenario: t.scenarioId, rep: t.repetition, pass: t.assertionPassed, turn_run: id, execs: data ?? [], error: error?.message });
}
fs.writeFileSync(out, JSON.stringify(rows));
console.log('wrote', out, rows.length);
