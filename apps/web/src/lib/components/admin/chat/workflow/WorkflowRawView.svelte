<!-- apps/web/src/lib/components/admin/chat/workflow/WorkflowRawView.svelte -->
<!-- Every stored collection for the run, collapsed, with copy. Nothing here is derived prose. -->
<script lang="ts">
	import type { WorkflowAuditRun } from '$lib/services/admin/chat-workflow-audit-types';
	import JsonDisclosure from './JsonDisclosure.svelte';

	let { run }: { run: WorkflowAuditRun } = $props();

	const {
		steps,
		dispatches,
		tool_calls,
		specialist_snapshot,
		selection_shadow,
		input_artifact,
		progress_events,
		graph,
		timeline,
		costs,
		timing,
		sources,
		coverage,
		...header
	} = $derived(run);
</script>

<div class="space-y-2">
	<JsonDisclosure title="workflow (run row, context, plan, answer)" value={header} />
	<JsonDisclosure title="steps" value={steps} />
	<JsonDisclosure
		title="dispatches (accounting; tokens are counts, secrets removed)"
		value={dispatches}
	/>
	<JsonDisclosure title="document_reads" value={tool_calls} emptyLabel="none saved" />
	<JsonDisclosure
		title="specialist_snapshot"
		value={specialist_snapshot}
		emptyLabel="none (code-owned profile or missing)"
	/>
	<JsonDisclosure
		title="selection_shadow (Jev, observation only)"
		value={selection_shadow}
		emptyLabel="none recorded"
	/>
	<JsonDisclosure title="input_artifact" value={input_artifact} emptyLabel="not found" />
	<JsonDisclosure
		title="progress_events (saved workflow_progress checkpoints)"
		value={progress_events}
	/>
	<JsonDisclosure title="sources" value={sources} />
	<JsonDisclosure title="graph (derived)" value={graph} />
	<JsonDisclosure title="timeline (derived)" value={timeline} />
	<JsonDisclosure title="costs (derived)" value={costs} />
	<JsonDisclosure title="timing (derived)" value={timing} />
	<JsonDisclosure title="coverage" value={coverage} emptyLabel="no gaps recorded" />
</div>
