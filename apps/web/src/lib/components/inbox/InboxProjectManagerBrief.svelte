<!-- apps/web/src/lib/components/inbox/InboxProjectManagerBrief.svelte -->
<script lang="ts">
	import { resolve } from '$app/paths';
	import {
		AlertTriangle,
		ChevronDown,
		CircleAlert,
		FileText,
		ListTodo,
		Target
	} from '$lib/icons/lucide';
	import type {
		ProjectLoopBrief,
		ProjectReviewAttentionLevel,
		ProjectReviewBriefIssue,
		ProjectSuggestionEvidenceRef
	} from '@buildos/shared-types';

	type BriefEvidence = ProjectSuggestionEvidenceRef & { href: string | null };
	type BriefView = {
		attention: ProjectReviewAttentionLevel;
		bottomLine: string;
		recommendation: string | null;
		question: string | null;
		whyUserNeeded: string | null;
		evidence: BriefEvidence[];
		issues: ProjectReviewBriefIssue[];
	};

	let {
		brief = null,
		audit = null,
		projectId
	}: {
		brief?: ProjectLoopBrief | Record<string, unknown> | null;
		audit?: Record<string, unknown> | null;
		projectId: string;
	} = $props();

	function asRecord(value: unknown): Record<string, unknown> | null {
		return value && typeof value === 'object' && !Array.isArray(value)
			? (value as Record<string, unknown>)
			: null;
	}

	function readString(value: unknown): string | null {
		return typeof value === 'string' && value.trim() ? value.trim() : null;
	}

	function readableManagerText(value: unknown): string | null {
		const text = readString(value);
		if (!text) return null;
		if (/\b[a-z][a-z0-9]*_[a-z0-9_]+\b/.test(text)) return null;
		if (
			/\bcanonical (?:project )?documents?\b/i.test(text) ||
			/\bconsolidate or expand\b/i.test(text) ||
			/\bcomplete audit follow-up\b/i.test(text)
		) {
			return null;
		}
		return text;
	}

	function records(value: unknown): Record<string, unknown>[] {
		return Array.isArray(value)
			? value.filter(
					(item): item is Record<string, unknown> =>
						Boolean(item) && typeof item === 'object' && !Array.isArray(item)
				)
			: [];
	}

	function normalizeEvidence(value: unknown): ProjectSuggestionEvidenceRef[] {
		return records(value)
			.map((ref): ProjectSuggestionEvidenceRef | null => {
				const entityType = readString(ref.entity_type) ?? 'unknown';
				const title = readString(ref.title) ?? readString(ref.label);
				if (!title) return null;
				return {
					entity_type: [
						'project',
						'goal',
						'document',
						'task',
						'calendar_event',
						'external',
						'unknown'
					].includes(entityType)
						? (entityType as ProjectSuggestionEvidenceRef['entity_type'])
						: 'unknown',
					...(readString(ref.entity_id) ? { entity_id: readString(ref.entity_id)! } : {}),
					title,
					...(readString(ref.reason) ? { reason: readString(ref.reason)! } : {}),
					...(readString(ref.excerpt) ? { excerpt: readString(ref.excerpt)! } : {})
				};
			})
			.filter((ref): ref is ProjectSuggestionEvidenceRef => Boolean(ref));
	}

	function evidenceHref(ref: ProjectSuggestionEvidenceRef): string | null {
		if (!ref.entity_id) return null;
		if (ref.entity_type === 'document' || ref.entity_type === 'task') {
			const params = new URLSearchParams({
				entity: ref.entity_type,
				entity_id: ref.entity_id
			});
			return `${resolve('/projects/[id]', { id: projectId })}?${params}`;
		}
		if (ref.entity_type === 'project' || ref.entity_type === 'goal') {
			return resolve('/projects/[id]', { id: projectId });
		}
		return null;
	}

	function uniqueEvidence(values: ProjectSuggestionEvidenceRef[]): BriefEvidence[] {
		const seen: string[] = [];
		return values
			.filter((ref) => {
				const key = `${ref.entity_type}:${ref.entity_id ?? ''}:${ref.title}`;
				if (seen.includes(key)) return false;
				seen.push(key);
				return true;
			})
			.slice(0, 8)
			.map((ref) => ({ ...ref, href: evidenceHref(ref) }));
	}

	function normalizeIssue(
		value: Record<string, unknown>,
		index: number
	): ProjectReviewBriefIssue | null {
		const headline = readString(value.headline) ?? readString(value.title);
		const summary = readString(value.summary) ?? readString(value.description) ?? headline;
		if (!headline || !summary) return null;
		const category = readString(value.category) ?? readString(value.dimension) ?? 'other';
		const priority = readString(value.priority);
		const severity = readString(value.severity);
		return {
			category: [
				'project_drift',
				'document_drift',
				'document_quality',
				'task_drift',
				'task_conflict',
				'risk',
				'other'
			].includes(category)
				? (category as ProjectReviewBriefIssue['category'])
				: category.includes('document')
					? 'document_quality'
					: category.includes('task')
						? 'task_drift'
						: category.includes('scope') || category.includes('drift')
							? 'project_drift'
							: 'other',
			severity:
				severity === 'critical' || priority === 'high'
					? 'critical'
					: severity === 'important' || priority === 'medium'
						? 'important'
						: 'minor',
			headline,
			summary,
			recommendation: readString(value.recommendation),
			candidate_ids: Array.isArray(value.candidate_ids)
				? value.candidate_ids.filter((id): id is string => typeof id === 'string')
				: [`audit-${index}`],
			evidence_refs: normalizeEvidence(value.evidence_refs)
		};
	}

	function issueKey(issue: ProjectReviewBriefIssue): string {
		return JSON.stringify([
			issue.category,
			issue.severity,
			issue.headline,
			issue.summary,
			issue.recommendation,
			[...issue.candidate_ids].sort(),
			issue.evidence_refs.map((ref) => [
				ref.entity_type,
				ref.entity_id ?? '',
				ref.title,
				ref.reason ?? '',
				ref.excerpt ?? ''
			])
		]);
	}

	function uniqueIssues(issues: ProjectReviewBriefIssue[]): ProjectReviewBriefIssue[] {
		const seen = new Set<string>();
		return issues.filter((issue) => {
			const key = issueKey(issue);
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		});
	}

	function issueWorkNames(issue: ProjectReviewBriefIssue): string[] {
		return issue.evidence_refs
			.filter((ref) => ref.entity_type === 'document' || ref.entity_type === 'task')
			.map((ref) => ref.title)
			.slice(0, 3);
	}

	function auditIssueHeadline(issue: ProjectReviewBriefIssue): string {
		const names = issueWorkNames(issue);
		const namedWork = names.length ? names.join(' and ') : null;
		if (issue.category === 'document_quality') {
			return namedWork
				? `${namedWork} need a clearer role in this project`
				: 'The project documents need a clearer structure';
		}
		if (issue.category === 'document_drift') {
			return namedWork
				? `${namedWork} may no longer match the current plan`
				: 'A project document may no longer match the current plan';
		}
		if (issue.category === 'task_drift' || issue.category === 'task_conflict') {
			return namedWork
				? `${namedWork} appear to overlap or compete`
				: 'Some active tasks appear to overlap or compete';
		}
		if (issue.category === 'project_drift') {
			return 'Recent work may be pulling this project away from its current direction';
		}
		return 'The project audit found something that needs your decision';
	}

	function auditIssueRecommendation(issue: ProjectReviewBriefIssue): string {
		const names = issueWorkNames(issue);
		const namedWork = names.length ? names.join(', ') : 'the affected work';
		if (issue.category === 'document_quality') {
			return `I recommend reviewing ${namedWork} together, keeping the most current document as the main one, and folding useful material from the others into it.`;
		}
		if (issue.category === 'document_drift') {
			return `I recommend checking ${namedWork} against the current plan, then updating or archiving what is stale.`;
		}
		if (issue.category === 'task_drift' || issue.category === 'task_conflict') {
			return `I recommend keeping one owner and next step for ${namedWork}, then closing or merging duplicate work.`;
		}
		if (issue.category === 'project_drift') {
			return 'I recommend keeping the current project direction and explicitly parking work that does not support it.';
		}
		return `I recommend reviewing ${namedWork} and choosing the smallest concrete next step.`;
	}

	function auditDecisionQuestion(issue: ProjectReviewBriefIssue | null): string {
		if (issue?.category === 'document_quality' || issue?.category === 'document_drift') {
			return 'Do you want to organize the project documents this way?';
		}
		if (issue?.category === 'task_drift' || issue?.category === 'task_conflict') {
			return 'Do you want to consolidate this task work?';
		}
		return 'Do you want to follow this recommendation?';
	}

	function fromProjectReview(value: Record<string, unknown>): BriefView {
		const decision = asRecord(value.decision);
		const issues = uniqueIssues(
			records(value.issues)
				.map(normalizeIssue)
				.filter((issue): issue is ProjectReviewBriefIssue => Boolean(issue))
		);
		const evidence = [
			...normalizeEvidence(decision?.evidence_refs),
			...issues.flatMap((issue) => issue.evidence_refs)
		];
		const attention = readString(value.attention_level);
		return {
			attention:
				attention === 'urgent' || attention === 'minor' || attention === 'none'
					? attention
					: 'decision',
			bottomLine:
				readString(value.bottom_line) ??
				readString(value.state_summary) ??
				'Your project needs a decision.',
			recommendation:
				readString(decision?.recommendation) ?? readString(value.recommendation),
			question: readString(decision?.question),
			whyUserNeeded: readString(decision?.why_user_needed),
			evidence: uniqueEvidence(evidence),
			issues
		};
	}

	function fromAudit(value: Record<string, unknown>): BriefView {
		const recommendations = [
			...records(value.recommendations),
			...records(value.top_actions)
		].filter(
			(candidate, index, list) =>
				list.findIndex((item) => readString(item.title) === readString(candidate.title)) ===
				index
		);
		const issues = uniqueIssues(
			recommendations
				.map(normalizeIssue)
				.filter((issue): issue is ProjectReviewBriefIssue => Boolean(issue))
				.map((issue) => ({
					...issue,
					headline: readableManagerText(issue.headline) ?? auditIssueHeadline(issue),
					summary: readableManagerText(issue.summary) ?? auditIssueHeadline(issue),
					recommendation:
						readableManagerText(issue.recommendation) ?? auditIssueRecommendation(issue)
				}))
		);
		const lead = recommendations[0] ?? null;
		const leadIssue = issues[0] ?? null;
		const readableLeadTitle = readableManagerText(lead?.title);
		const evidence = [
			...normalizeEvidence(lead?.evidence_refs),
			...issues.flatMap((issue) => issue.evidence_refs),
			...normalizeEvidence(value.evidence_refs)
		];
		const priority = readString(lead?.priority);
		return {
			attention: priority === 'high' ? 'urgent' : 'decision',
			bottomLine:
				readableLeadTitle ??
				(leadIssue ? auditIssueHeadline(leadIssue) : null) ??
				readableManagerText(value.summary) ??
				'The project audit found something that needs a decision.',
			recommendation:
				(readableLeadTitle ? readableManagerText(lead?.summary) : null) ??
				(readableLeadTitle ? readableManagerText(lead?.description) : null) ??
				(leadIssue ? auditIssueRecommendation(leadIssue) : null),
			question:
				lead && readString(lead?.role) === 'decision_point'
					? (readableManagerText(lead?.title) ?? auditDecisionQuestion(leadIssue))
					: lead
						? auditDecisionQuestion(leadIssue)
						: null,
			whyUserNeeded: lead
				? 'The audit can identify the tradeoff, but this project-direction choice needs your judgment.'
				: null,
			evidence: uniqueEvidence(evidence),
			issues
		};
	}

	const view = $derived.by<BriefView>(() => {
		const briefRecord = asRecord(brief);
		if (briefRecord?.version === 2) return fromProjectReview(briefRecord);
		const auditRecord = asRecord(audit);
		if (auditRecord) return fromAudit(auditRecord);
		return {
			attention: 'decision',
			bottomLine: 'Your project needs a decision.',
			recommendation: null,
			question: null,
			whyUserNeeded: null,
			evidence: [],
			issues: []
		};
	});

	const secondaryIssues = $derived(view.issues.slice(1));

	const categoryLabels: Record<ProjectReviewBriefIssue['category'], string> = {
		project_drift: 'Project direction',
		document_drift: 'Document drift',
		document_quality: 'Document quality',
		task_drift: 'Task drift',
		task_conflict: 'Task conflict',
		risk: 'Risk',
		other: 'Project note'
	};

	function evidenceIcon(type: ProjectSuggestionEvidenceRef['entity_type']) {
		if (type === 'document') return FileText;
		if (type === 'task') return ListTodo;
		return Target;
	}
</script>

<div class="min-w-0">
	<div class="flex flex-wrap items-center gap-2">
		<span
			class="micro-label inline-flex items-center gap-1 rounded-full border px-2 py-1 font-semibold {view.attention ===
			'urgent'
				? 'border-destructive/35 bg-destructive/10 text-destructive'
				: view.attention === 'decision'
					? 'border-accent/35 bg-accent/10 text-accent'
					: 'border-border bg-muted/40 text-muted-foreground'}"
		>
			{#if view.attention === 'urgent'}
				<AlertTriangle class="h-3 w-3" aria-hidden="true" />
				Urgent
			{:else if view.attention === 'decision'}
				<CircleAlert class="h-3 w-3" aria-hidden="true" />
				Decision needed
			{:else if view.attention === 'minor'}
				<Target class="h-3 w-3" aria-hidden="true" />
				Minor project note
			{:else}
				<Target class="h-3 w-3" aria-hidden="true" />
				On track
			{/if}
		</span>
	</div>

	<p class="mt-2 break-words text-base font-semibold leading-snug text-foreground">
		{view.bottomLine}
	</p>

	{#if view.recommendation}
		<div class="mt-3 rounded-lg border border-accent/25 bg-accent/5 p-3">
			<p class="micro-label font-semibold text-accent">My recommendation</p>
			<p class="mt-1 break-words text-sm leading-relaxed text-foreground">
				{view.recommendation}
			</p>
		</div>
	{/if}

	{#if view.question}
		<div class="mt-3">
			<p class="micro-label font-semibold text-muted-foreground">Your decision</p>
			<p class="mt-1 break-words text-sm font-semibold leading-relaxed text-foreground">
				{view.question}
			</p>
			{#if view.whyUserNeeded}
				<p class="mt-1.5 break-words text-xs leading-relaxed text-muted-foreground">
					<span class="font-semibold text-foreground/80">Why I need you:</span>
					{view.whyUserNeeded}
				</p>
			{/if}
		</div>
	{/if}

	{#if view.evidence.length}
		<div class="mt-4">
			<p class="micro-label font-semibold text-muted-foreground">Work involved</p>
			<div class="mt-1.5 flex flex-wrap gap-1.5">
				{#each view.evidence as ref (`${ref.entity_type}-${ref.entity_id ?? ref.title}`)}
					{@const Icon = evidenceIcon(ref.entity_type)}
					{#if ref.href}
						<a
							href={ref.href}
							class="inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground hover:border-accent/40 hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
							title={ref.reason ?? ref.title}
						>
							<Icon class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
							<span class="min-w-0 break-words">{ref.title}</span>
						</a>
					{:else}
						<span
							class="inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2.5 py-1.5 text-xs text-muted-foreground"
							title={ref.reason ?? ref.title}
						>
							<Icon class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
							<span class="min-w-0 break-words">{ref.title}</span>
						</span>
					{/if}
				{/each}
			</div>
		</div>
	{/if}

	{#if secondaryIssues.length}
		<details class="group mt-3 border-t border-border/70 pt-2">
			<summary
				class="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-md px-1 text-xs font-semibold text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
			>
				<span>
					Other things I noticed ({secondaryIssues.length})
				</span>
				<ChevronDown
					class="h-4 w-4 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none"
					aria-hidden="true"
				/>
			</summary>
			<div class="space-y-2 pb-1 pt-1.5">
				{#each secondaryIssues as issue (issueKey(issue))}
					<div class="rounded-md border border-border bg-muted/20 p-2.5">
						<div class="flex flex-wrap items-center gap-1.5">
							<span class="micro-label font-semibold text-muted-foreground">
								{categoryLabels[issue.category]}
							</span>
							<span class="text-2xs text-muted-foreground">·</span>
							<span
								class="text-2xs font-medium {issue.severity === 'critical'
									? 'text-destructive'
									: 'text-muted-foreground'}"
							>
								{issue.severity === 'critical'
									? 'Important'
									: issue.severity === 'important'
										? 'Needs attention'
										: 'Minor'}
							</span>
						</div>
						<p class="mt-1 break-words text-xs font-semibold text-foreground">
							{issue.headline}
						</p>
						<p class="mt-1 break-words text-2xs leading-relaxed text-muted-foreground">
							{issue.summary}
						</p>
					</div>
				{/each}
			</div>
		</details>
	{/if}
</div>
