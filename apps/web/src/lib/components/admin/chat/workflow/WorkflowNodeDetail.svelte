<!-- apps/web/src/lib/components/admin/chat/workflow/WorkflowNodeDetail.svelte -->
<!-- Stored inputs, outputs, tool activity, timing, cost, errors and ids for one graph node. -->
<script lang="ts">
	import type { WorkflowAuditRun } from '$lib/services/admin/chat-workflow-audit-types';
	import {
		formatDateTime,
		formatDuration
	} from '$lib/services/admin/chat-session-audit-formatters';
	import CopyableId from './CopyableId.svelte';
	import JsonDisclosure from './JsonDisclosure.svelte';

	let { run, nodeId }: { run: WorkflowAuditRun; nodeId: string | null } = $props();

	const node = $derived(run.graph.nodes.find((n) => n.id === nodeId) ?? null);
	const step = $derived(
		node?.kind === 'step' && node.step_key
			? (run.steps.find((s) => s.key === node.step_key) ?? null)
			: null
	);
	const toolCall = $derived(
		node?.kind === 'tool'
			? (run.tool_calls.find((c) => `tool:${c.id}` === node.id) ?? null)
			: null
	);
	const stepDispatches = $derived(
		step ? run.dispatches.filter((d) => d.step_key === step.key) : []
	);
	const stepToolCalls = $derived(
		step ? run.tool_calls.filter((c) => step.tool_call_ids.includes(c.id)) : []
	);

	const usd = (micro: number | null | undefined) =>
		micro === null || micro === undefined ? 'unknown' : `$${(micro / 1_000_000).toFixed(6)}`;
	const coverageLabel = (value: string) => value.replace(/_/g, ' ');
</script>

{#if !node}
	<div class="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
		Select a node in the graph to see its stored inputs, outputs, timing, cost and ids.
	</div>
{:else}
	<section class="space-y-3 rounded-lg border border-border bg-card p-4" aria-live="polite">
		<header class="flex flex-wrap items-start justify-between gap-2">
			<div>
				<p class="text-2xs uppercase tracking-wider text-muted-foreground">
					{node.kind === 'shadow' ? 'selector observation' : node.kind}
				</p>
				<h3 class="text-base font-semibold text-foreground">{node.label}</h3>
				{#if node.sublabel}<p class="text-xs text-muted-foreground">{node.sublabel}</p>{/if}
			</div>
			<span
				class="rounded-full bg-muted px-2 py-0.5 text-2xs font-medium uppercase tracking-wider text-foreground"
				>{coverageLabel(node.state)}</span
			>
		</header>

		{#if node.kind === 'request'}
			<pre
				class="max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-background p-3 text-sm text-foreground">{run.request_message ||
					'(request text not recorded)'}</pre>
			<dl class="grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
				<dt class="text-muted-foreground">Turn run</dt>
				<dd><CopyableId value={run.turn_run_id} /></dd>
				<dt class="text-muted-foreground">Request hash</dt>
				<dd><CopyableId value={run.request_hash} /></dd>
				<dt class="text-muted-foreground">Policy</dt>
				<dd class="text-foreground">{run.policy_ref ?? '-'}</dd>
				<dt class="text-muted-foreground">Input artifact</dt>
				<dd>
					{#if run.input_artifact}
						<CopyableId value={run.input_artifact.id} /> · {run.input_artifact
							.history_count ?? 0} history message(s) · hash match {run.input_artifact
							.request_hash_matches_run === null
							? 'unknown'
							: run.input_artifact.request_hash_matches_run
								? 'yes'
								: 'NO'}
					{:else}<span class="text-muted-foreground">not found (coverage gap)</span>{/if}
				</dd>
			</dl>
			{#if run.input_artifact}
				<JsonDisclosure
					title="Admitted request (stored)"
					value={run.input_artifact.request}
				/>
				<JsonDisclosure
					title="Admitted history (stored)"
					value={run.input_artifact.history}
				/>
			{/if}
			<JsonDisclosure title="Policy (stored)" value={run.policy} />
		{:else if node.kind === 'context' && run.context}
			<dl class="grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
				<dt class="text-muted-foreground">Context id</dt>
				<dd><CopyableId value={run.context.context_id} /></dd>
				<dt class="text-muted-foreground">Hash</dt>
				<dd><CopyableId value={run.context.context_hash} /></dd>
				<dt class="text-muted-foreground">Accepted</dt>
				<dd class="text-foreground">
					{formatDateTime(run.context.accepted_at)} · generation {run.context
						.accepted_generation ?? '-'}
				</dd>
				<dt class="text-muted-foreground">Size</dt>
				<dd class="text-foreground">
					{run.context.context_bytes?.toLocaleString() ?? '-'} bytes · {run.context
						.evidence_versions.length} evidence versions
				</dd>
				<dt class="text-muted-foreground">Preparation</dt>
				<dd class="text-foreground">{run.context.preparation_version ?? '-'}</dd>
			</dl>
			<JsonDisclosure
				title="Evidence versions (what the agents could see)"
				value={run.context.evidence_versions}
			/>
			<JsonDisclosure title="Context identity" value={run.context.context_identity} />
			<JsonDisclosure
				title="Context payload (saved project context)"
				value={run.context.payload}
			/>
		{:else if step}
			{#if step.display_note}
				<p class="rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">
					{step.display_note}
				</p>
			{/if}
			<dl class="grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
				<dt class="text-muted-foreground">Role</dt>
				<dd class="text-foreground">{step.role} · {step.capability ?? '-'}</dd>
				<dt class="text-muted-foreground">Depends on</dt>
				<dd class="text-foreground">{step.depends_on.join(', ') || 'nothing (root)'}</dd>
				<dt class="text-muted-foreground">Status row</dt>
				<dd class="text-foreground">
					{step.status}{step.quality ? ` · ${step.quality}` : ''}{step.failure_code
						? ` · ${step.failure_code}`
						: ''}
				</dd>
				<dt class="text-muted-foreground">Timing</dt>
				<dd class="text-foreground">
					{formatDateTime(step.timing.started_at)} → {formatDateTime(
						step.timing.ended_at
					)} · {formatDuration(step.timing.duration_ms)}
				</dd>
				<dt class="text-muted-foreground">Cost</dt>
				<dd class="text-foreground">
					settled {usd(step.cost.settled_micro_usd)}{step.cost
						.uncertain_reserved_micro_usd
						? ` · uncertain exposure ${usd(step.cost.uncertain_reserved_micro_usd)}`
						: ''}{step.cost.reserved_outstanding_micro_usd
						? ` · outstanding ${usd(step.cost.reserved_outstanding_micro_usd)}`
						: ''}{step.cost.released_count
						? ` · ${step.cost.released_count} released`
						: ''}
				</dd>
				<dt class="text-muted-foreground">Accepted attempt</dt>
				<dd><CopyableId value={step.accepted_attempt_id} /></dd>
				<dt class="text-muted-foreground">Result hash</dt>
				<dd><CopyableId value={step.result_hash} /></dd>
				<dt class="text-muted-foreground">Sources</dt>
				<dd class="text-foreground">{step.source_coverage_summary}</dd>
				<dt class="text-muted-foreground">Evidence binding</dt>
				<dd class="text-foreground">{coverageLabel(step.input_evidence_coverage)}</dd>
			</dl>

			{#if step.specialist}
				<div class="rounded-md border border-border bg-background p-3 text-xs">
					<p class="font-semibold text-foreground">
						Pinned specialist · {step.specialist.id}@{step.specialist.version ?? '?'}
						<span class="font-normal text-muted-foreground"
							>(from this run's snapshot)</span
						>
					</p>
					<p class="mt-1 text-muted-foreground">
						Model {step.specialist.primary_model ?? '-'}{step.specialist.fallback_models
							.length
							? ` → fallback ${step.specialist.fallback_models.join(', ')}`
							: ''} · Tools {step.specialist.allowed_tool_ids.join(', ') || 'none'}
					</p>
					{#if step.specialist.system_prompt}
						<details class="mt-2">
							<summary class="cursor-pointer text-foreground"
								>System instructions (stored)</summary
							>
							<pre
								class="mt-1 max-h-64 overflow-auto whitespace-pre-wrap text-2xs text-foreground">{step
									.specialist.system_prompt}</pre>
						</details>
					{/if}
					{#if step.specialist.slot_assignment}
						<details class="mt-1">
							<summary class="cursor-pointer text-foreground"
								>Slot assignment (stored)</summary
							>
							<pre
								class="mt-1 max-h-40 overflow-auto whitespace-pre-wrap text-2xs text-foreground">{step
									.specialist.slot_assignment}</pre>
						</details>
					{/if}
				</div>
			{:else if step.role === 'specialist'}
				<p class="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
					Specialist definition is code-owned for this profile and was not stored with the
					run. Its exact system prompt is not shown because it cannot be verified for this
					run.
				</p>
			{/if}

			<div class="rounded-md border border-border bg-background p-3 text-xs">
				<p class="font-semibold text-foreground">What is persisted for this agent</p>
				<ul class="mt-1 grid grid-cols-1 gap-x-4 sm:grid-cols-2">
					{#each Object.entries(step.prompt_coverage) as [key, value] (key)}
						<li class="flex justify-between gap-2">
							<span class="text-muted-foreground">{coverageLabel(key)}</span><span
								class={value.startsWith('not_') ||
								value === 'missing' ||
								value === 'none'
									? 'text-warning'
									: 'text-foreground'}>{coverageLabel(value)}</span
							>
						</li>
					{/each}
				</ul>
			</div>

			{#if step.attempts.length}
				<div class="overflow-x-auto">
					<table class="w-full text-xs">
						<thead
							><tr class="text-left text-muted-foreground"
								><th class="py-1 pr-2">Attempt</th><th class="py-1 pr-2">State</th
								><th class="py-1 pr-2">Id</th><th class="py-1 pr-2">Dispatches</th
								></tr
							></thead
						>
						<tbody>
							{#each step.attempts as attempt (attempt.attempt_id)}
								<tr class="border-t border-border"
									><td class="py-1 pr-2 text-foreground">{attempt.index}</td><td
										class="py-1 pr-2 text-foreground">{attempt.state}</td
									><td class="py-1 pr-2"
										><CopyableId value={attempt.attempt_id} /></td
									><td class="py-1 pr-2 text-muted-foreground"
										>{attempt.dispatch_ids.length
											? attempt.dispatch_ids
													.map((id) => id.slice(0, 8))
													.join(', ')
											: 'none recorded'}</td
									></tr
								>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}

			{#if step.report}
				<div class="rounded-md border border-border bg-background p-3 text-xs">
					<p class="font-semibold text-foreground">Accepted report</p>
					<p class="mt-1 text-foreground">{step.report.summary}</p>
					{#if step.report.findings.length}
						<p class="mt-2 font-medium text-muted-foreground">Findings</p>
						<ul class="list-disc space-y-1 pl-4">
							{#each step.report.findings as finding, i (i)}
								<li class="text-foreground">
									{finding.claim}
									<span class="text-muted-foreground"
										>({finding.basis}; {finding.evidence
											.map((e) => e.label)
											.join(', ') || 'no evidence refs'})</span
									>
								</li>
							{/each}
						</ul>
					{/if}
					{#if step.report.risks.length}
						<p class="mt-2 font-medium text-muted-foreground">Risks</p>
						<ul class="list-disc space-y-1 pl-4">
							{#each step.report.risks as risk, i (i)}<li class="text-foreground">
									{risk.risk}
									<span class="text-muted-foreground"
										>({risk.evidence.map((e) => e.label).join(', ') ||
											'no evidence refs'})</span
									>
								</li>{/each}
						</ul>
					{/if}
					{#if step.report.unknowns.length}<p class="mt-2 text-muted-foreground">
							Unknowns: {step.report.unknowns.join('; ')}
						</p>{/if}
					{#if step.report.recommendation}<p class="mt-2 text-foreground">
							Recommendation: {step.report.recommendation}
						</p>{/if}
					{#if step.report.unsupported_references || step.report.unsupported_findings}<p
							class="mt-2 text-warning"
						>
							Validator dropped {step.report.unsupported_findings ?? 0} unsupported finding(s)
							and {step.report.unsupported_references ?? 0} unsupported reference(s).
						</p>{/if}
				</div>
			{/if}

			<JsonDisclosure
				title="Assignment (stored)"
				value={step.assignment}
				emptyLabel="missing"
			/>
			<JsonDisclosure
				title="Accepted result (stored)"
				value={step.result}
				emptyLabel={step.key === 'editor' && run.answer.synthesis_status === 'accepted'
					? 'the answer text is the editor output'
					: 'none'}
			/>
			<JsonDisclosure
				title="Saved evidence handoff binding"
				value={step.input_evidence}
				emptyLabel={coverageLabel(step.input_evidence_coverage)}
			/>

			{#if stepToolCalls.length}
				{#each stepToolCalls as call (call.id)}
					<div class="rounded-md border border-border bg-background p-3 text-xs">
						<p class="font-semibold text-foreground">
							Tool: {call.tool} · attempt <CopyableId value={call.step_attempt_id} /> ·
							result <CopyableId value={call.result_hash} />
						</p>
						<ul class="mt-1 space-y-0.5">
							{#each call.documents as doc (doc.id)}
								<li class="flex flex-wrap items-center gap-2">
									<span class="text-foreground">{doc.title ?? doc.id}</span><span
										class="rounded bg-muted px-1.5 py-0.5 text-2xs"
										>{coverageLabel(doc.coverage)}</span
									><span class="text-muted-foreground"
										>{doc.status}{doc.full_characters !== null
											? ` · ${doc.full_characters.toLocaleString()} chars`
											: ''}{doc.truncated ? ' · truncated' : ''}</span
									>
								</li>
							{/each}
						</ul>
					</div>
				{/each}
			{/if}

			{#if stepDispatches.length}
				<div class="overflow-x-auto">
					<table class="w-full text-xs">
						<thead
							><tr class="text-left text-muted-foreground"
								><th class="py-1 pr-2">Dispatch</th><th class="py-1 pr-2">Kind</th
								><th class="py-1 pr-2">Phys.</th><th class="py-1 pr-2">Model</th><th
									class="py-1 pr-2">State</th
								><th class="py-1 pr-2">Reserved</th><th class="py-1 pr-2">Actual</th
								><th class="py-1 pr-2">Duration</th><th class="py-1 pr-2"
									>Provider req</th
								></tr
							></thead
						>
						<tbody>
							{#each stepDispatches as d (d.dispatch_id)}
								<tr class="border-t border-border">
									<td class="py-1 pr-2"><CopyableId value={d.dispatch_id} /></td>
									<td class="py-1 pr-2 text-foreground">{d.dispatch_kind}</td>
									<td class="py-1 pr-2 text-foreground">{d.physical_attempt}</td>
									<td class="py-1 pr-2 text-foreground">{d.model_requested}</td>
									<td class="py-1 pr-2"
										><span
											class={`rounded px-1.5 py-0.5 text-2xs ${d.cost_state === 'uncertain' ? 'bg-destructive/10 text-destructive' : d.cost_state === 'settled' ? 'bg-success/10 text-success' : 'bg-muted text-foreground'}`}
											>{d.cost_state}</span
										></td
									>
									<td class="py-1 pr-2 text-muted-foreground"
										>{usd(d.reserved_micro_usd)}</td
									>
									<td class="py-1 pr-2 text-foreground"
										>{d.actual_micro_usd === null
											? 'unknown'
											: usd(d.actual_micro_usd)}</td
									>
									<td class="py-1 pr-2 text-muted-foreground"
										>{formatDuration(d.duration_ms)}</td
									>
									<td class="py-1 pr-2"
										><CopyableId value={d.provider_request_id} /></td
									>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		{:else if toolCall}
			<dl class="grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
				<dt class="text-muted-foreground">Called by</dt>
				<dd class="text-foreground">
					{toolCall.step_key ?? 'unbound attempt'} · attempt <CopyableId
						value={toolCall.step_attempt_id}
					/>
				</dd>
				<dt class="text-muted-foreground">Result hash</dt>
				<dd><CopyableId value={toolCall.result_hash} /></dd>
				<dt class="text-muted-foreground">Request hash matches run</dt>
				<dd class="text-foreground">
					{toolCall.request_hash_matches_run === null
						? 'unknown'
						: toolCall.request_hash_matches_run
							? 'yes'
							: 'NO — binding mismatch'}
				</dd>
				<dt class="text-muted-foreground">Saved at</dt>
				<dd class="text-foreground">
					{formatDateTime(toolCall.created_at)} · generation {toolCall.execution_generation ??
						'-'}
				</dd>
			</dl>
			<div class="overflow-x-auto">
				<table class="w-full text-xs">
					<thead
						><tr class="text-left text-muted-foreground"
							><th class="py-1 pr-2">Document</th><th class="py-1 pr-2">Status</th><th
								class="py-1 pr-2">Coverage</th
							><th class="py-1 pr-2">Version</th><th class="py-1 pr-2"
								>Content hash</th
							><th class="py-1 pr-2">Chars</th></tr
						></thead
					>
					<tbody>
						{#each toolCall.documents as doc (doc.id)}
							<tr class="border-t border-border"
								><td class="py-1 pr-2 text-foreground">{doc.title ?? doc.id}</td><td
									class="py-1 pr-2 text-foreground">{doc.status}</td
								><td class="py-1 pr-2 text-foreground"
									>{coverageLabel(doc.coverage)}{doc.truncated
										? ' (truncated)'
										: ''}</td
								><td class="py-1 pr-2 text-muted-foreground"
									>{doc.version ?? '-'}</td
								><td class="py-1 pr-2"><CopyableId value={doc.content_hash} /></td
								><td class="py-1 pr-2 text-muted-foreground"
									>{doc.full_characters?.toLocaleString() ?? '-'}</td
								></tr
							>
						{/each}
					</tbody>
				</table>
			</div>
			{#each toolCall.documents.filter((d) => d.content) as doc (doc.id)}
				<details class="rounded-md border border-border bg-background">
					<summary class="cursor-pointer px-3 py-2 text-xs font-medium text-foreground"
						>Saved text: {doc.title ?? doc.id}</summary
					>
					<pre
						class="max-h-72 overflow-auto whitespace-pre-wrap border-t border-border px-3 py-2 text-2xs text-foreground">{doc.content}</pre>
				</details>
			{/each}
			<JsonDisclosure title="Raw read result (stored, hashed)" value={toolCall.result} />
		{:else if node.kind === 'answer'}
			<dl class="grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
				<dt class="text-muted-foreground">Synthesis</dt>
				<dd class="text-foreground">
					{run.answer.synthesis_status ?? '-'}{run.answer.synthesis_quality
						? ` · ${run.answer.synthesis_quality}`
						: ''}
				</dd>
				<dt class="text-muted-foreground">Accepted at</dt>
				<dd class="text-foreground">{formatDateTime(run.answer.synthesis_accepted_at)}</dd>
				<dt class="text-muted-foreground">Answer id</dt>
				<dd><CopyableId value={run.answer.answer_id} /></dd>
				<dt class="text-muted-foreground">Editor attempt</dt>
				<dd><CopyableId value={run.answer.editor_step_attempt_id} /></dd>
				<dt class="text-muted-foreground">Text sha256</dt>
				<dd><CopyableId value={run.answer.text_sha256} /></dd>
				<dt class="text-muted-foreground">Terminal outcome</dt>
				<dd class="text-foreground">{run.terminal_outcome ?? 'none yet'}</dd>
			</dl>
			<pre
				class="max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-background p-3 text-sm text-foreground">{run
					.answer.text || '(no answer text saved)'}</pre>
		{:else if node.kind === 'shadow' && run.selection_shadow}
			{@const s = run.selection_shadow}
			<p class="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
				Observation only. Jev did not choose the executing agents or grant tools; its cost
				is selector telemetry outside the workflow budget.
			</p>
			<dl class="grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
				<dt class="text-muted-foreground">Status</dt>
				<dd class="text-foreground">{s.status}{s.reason ? ` · ${s.reason}` : ''}</dd>
				<dt class="text-muted-foreground">Baseline (executed)</dt>
				<dd class="text-foreground">{s.baseline_bundle ?? '-'}</dd>
				<dt class="text-muted-foreground">Jev selected / recommended</dt>
				<dd class="text-foreground">
					{s.selected_bundle ?? '-'} / {s.recommended_bundle ?? '-'}
					{s.agrees_with_baseline === null
						? ''
						: s.agrees_with_baseline
							? '(agrees)'
							: '(disagrees)'}
				</dd>
				<dt class="text-muted-foreground">Probabilities</dt>
				<dd class="text-foreground">
					{s.probabilities
						? Object.entries(s.probabilities)
								.map(([k, v]) => `${k} ${(v * 100).toFixed(1)}%`)
								.join(', ')
						: '-'}{s.confidence !== null
						? ` · confidence ${(s.confidence * 100).toFixed(1)}%`
						: ''}{s.margin !== null ? ` · margin ${(s.margin * 100).toFixed(1)}%` : ''}
				</dd>
				<dt class="text-muted-foreground">Model</dt>
				<dd class="text-foreground">{s.model_used ?? s.model_requested ?? '-'}</dd>
				<dt class="text-muted-foreground">Cost / latency</dt>
				<dd class="text-foreground">
					{s.cost_usd === null ? 'unknown' : `$${s.cost_usd.toFixed(8)}`} · {formatDuration(
						s.duration_ms
					)} · {s.attempts ?? '?'} attempt(s)
				</dd>
				<dt class="text-muted-foreground">Context binding</dt>
				<dd class="text-foreground">
					{s.context_matches_run === null
						? 'unknown'
						: s.context_matches_run
							? 'matches run context'
							: 'DOES NOT match run context'}
				</dd>
				<dt class="text-muted-foreground">Hashes</dt>
				<dd>
					input <CopyableId value={s.input_hash} /> result <CopyableId
						value={s.result_hash}
					/>
				</dd>
			</dl>
			{#if s.candidates.length}
				<ul class="space-y-1 text-xs">
					{#each s.candidates as candidate (candidate.id)}
						<li class="rounded-md border border-border bg-background px-3 py-2">
							<span class="font-medium text-foreground">{candidate.id}</span
							>{candidate.id === s.baseline_bundle
								? ' · executed'
								: ''}{candidate.id === s.recommended_bundle
								? ' · Jev recommended'
								: ''}<span class="text-muted-foreground">
								— {candidate.description ?? ''}
								{candidate.specialists.length
									? `· ${candidate.specialists.join(', ')}`
									: ''}
								{candidate.tools.length
									? `· tools ${candidate.tools.join(', ')}`
									: ''}</span
							>
						</li>
					{/each}
				</ul>
			{/if}
			<JsonDisclosure title="Shadow input (stored)" value={s.input} />
			<JsonDisclosure title="Shadow result (stored)" value={s.result} />
		{/if}
	</section>
{/if}
