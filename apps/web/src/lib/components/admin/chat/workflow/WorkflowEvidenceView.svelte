<!-- apps/web/src/lib/components/admin/chat/workflow/WorkflowEvidenceView.svelte -->
<!-- Which specialist actually received each source, and at what coverage. -->
<script lang="ts">
	import type {
		WorkflowAuditRun,
		WorkflowAuditSourceCoverage
	} from '$lib/services/admin/chat-workflow-audit-types';
	import CopyableId from './CopyableId.svelte';

	let { run, onSelectStep }: { run: WorkflowAuditRun; onSelectStep: (stepKey: string) => void } =
		$props();

	const specialists = $derived(run.steps.filter((s) => s.role === 'specialist'));
	const badge = (coverage: WorkflowAuditSourceCoverage) => {
		switch (coverage) {
			case 'full':
				return 'bg-success/10 text-success';
			case 'excerpt':
				return 'bg-accent/10 text-accent';
			case 'inventory_only':
				return 'bg-muted text-foreground';
			case 'not_supplied':
				return 'bg-warning/10 text-warning';
			case 'unavailable':
			case 'empty':
				return 'bg-destructive/10 text-destructive';
			default:
				return 'bg-muted text-muted-foreground';
		}
	};
	const label = (value: string) => value.replace(/_/g, ' ');
</script>

<div class="space-y-4">
	<p class="text-xs text-muted-foreground">
		<span class="rounded bg-success/10 px-1.5 py-0.5 text-success">full</span> saved body ·
		<span class="rounded bg-accent/10 px-1.5 py-0.5 text-accent">excerpt</span> truncated body ·
		<span class="rounded bg-muted px-1.5 py-0.5 text-foreground">inventory only</span>
		title/summary from accepted context ·
		<span class="rounded bg-warning/10 px-1.5 py-0.5 text-warning">not supplied</span> read by
		another agent, not shared under this plan ·
		<span class="rounded bg-destructive/10 px-1.5 py-0.5 text-destructive">unavailable</span> read
		attempted, no usable text.
	</p>

	{#if !run.context}
		<div
			class="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground"
		>
			Context was never accepted for this run, so no source inventory exists.
		</div>
	{:else if run.sources.length === 0}
		<div
			class="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground"
		>
			The accepted context recorded no evidence versions.
		</div>
	{:else}
		<div class="overflow-x-auto rounded-lg border border-border">
			<table class="w-full text-xs">
				<thead class="bg-muted/50 text-left text-muted-foreground">
					<tr>
						<th class="px-2 py-1.5">Source</th><th class="px-2 py-1.5">Kind</th><th
							class="px-2 py-1.5">Version</th
						>
						{#each specialists as s (s.key)}<th class="px-2 py-1.5"
								><button
									type="button"
									class="text-foreground underline-offset-2 hover:underline"
									onclick={() => onSelectStep(s.key)}>{s.label}</button
								></th
							>{/each}
					</tr>
				</thead>
				<tbody>
					{#each run.sources as source (source.id)}
						<tr class="border-t border-border align-top">
							<td class="px-2 py-1"
								><div class="text-foreground">{source.label ?? '(untitled)'}</div>
								<CopyableId value={source.id} /></td
							>
							<td class="px-2 py-1 text-muted-foreground">{source.kind}</td>
							<td class="px-2 py-1 text-muted-foreground">{source.version ?? '-'}</td>
							{#each specialists as s (s.key)}
								{@const receipt = source.receipts.find((r) => r.step_key === s.key)}
								<td class="px-2 py-1"
									><span
										class={`rounded px-1.5 py-0.5 ${badge(receipt?.coverage ?? 'unknown')}`}
										title={receipt?.detail ?? ''}
										>{label(receipt?.coverage ?? 'unknown')}</span
									>{#if receipt?.via && receipt.via !== 'none' && receipt.via !== 'context_inventory'}<div
											class="mt-0.5 text-2xs text-muted-foreground"
										>
											via {label(receipt.via)}
										</div>{/if}</td
								>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}

	{#if run.tool_calls.length}
		{#each run.tool_calls as call (call.id)}
			<div class="rounded-lg border border-border bg-background p-3 text-xs">
				<p class="font-semibold text-foreground">
					Document read by {call.step_key ?? 'an unbound attempt'} · {call.documents
						.length} document(s) · result <CopyableId
						value={call.result_hash}
					/>{#if call.request_hash_matches_run === false}<span
							class="ml-2 rounded bg-destructive/10 px-1.5 py-0.5 text-destructive"
							>request hash mismatch</span
						>{/if}
				</p>
				<ul class="mt-1 space-y-0.5">
					{#each call.documents as doc (doc.id)}<li
							class="flex flex-wrap items-center gap-2"
						>
							<span class="text-foreground">{doc.title ?? doc.id}</span><span
								class={`rounded px-1.5 py-0.5 ${badge(doc.coverage)}`}
								>{label(doc.coverage)}</span
							><span class="text-muted-foreground"
								>{doc.status}{doc.full_characters !== null
									? ` · ${doc.full_characters.toLocaleString()} chars`
									: ''}{doc.content_hash
									? ` · ${doc.content_hash.slice(0, 12)}`
									: ''}</span
							>
						</li>{/each}
				</ul>
			</div>
		{/each}
	{:else if run.policy_ref?.startsWith('internal-document-organization:')}
		<p class="text-xs text-muted-foreground">
			No document read batch is saved for this run{run.coverage.some(
				(c) => c.scope === 'document_read'
			)
				? `: ${run.coverage.find((c) => c.scope === 'document_read')?.detail}`
				: '.'}
		</p>
	{/if}

	{#each run.steps.filter((s) => s.input_evidence) as step (step.key)}
		<div class="rounded-lg border border-accent/40 bg-accent/5 p-3 text-xs">
			<p class="font-semibold text-foreground">Saved evidence handoff → {step.label}</p>
			<p class="mt-1 text-muted-foreground">
				Context <CopyableId value={String(step.input_evidence?.contextHash ?? '')} /> · reads
				<CopyableId value={String(step.input_evidence?.documentReadResultHash ?? '')} /> · organizer
				{String(step.input_evidence?.organizerStatus ?? '-')}{step.input_evidence
					?.documentReadResultHash
					? ''
					: ' · inventory-only handoff (no read batch)'}
			</p>
		</div>
	{/each}

	{#if run.selection_shadow}
		{@const s = run.selection_shadow}
		<div class="rounded-lg border border-dashed border-muted-foreground/50 p-3 text-xs">
			<p class="font-semibold text-foreground">
				Jev shadow selection <span class="font-normal text-muted-foreground"
					>— observation only, outside the executed graph</span
				>
			</p>
			<p class="mt-1 text-muted-foreground">
				Executed bundle <span class="text-foreground">{s.baseline_bundle ?? '-'}</span> ·
				Jev recommended <span class="text-foreground">{s.recommended_bundle ?? '-'}</span>
				{s.agrees_with_baseline === null
					? ''
					: s.agrees_with_baseline
						? '(agrees)'
						: '(disagrees)'} · {s.status}{s.probabilities
					? ` · ${Object.entries(s.probabilities)
							.map(([k, v]) => `${k} ${(v * 100).toFixed(0)}%`)
							.join(', ')}`
					: ''}
			</p>
		</div>
	{/if}
</div>
