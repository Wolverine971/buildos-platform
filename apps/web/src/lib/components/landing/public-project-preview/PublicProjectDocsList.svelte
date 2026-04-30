<!-- apps/web/src/lib/components/landing/public-project-preview/PublicProjectDocsList.svelte -->
<script lang="ts">
	import { FileText } from 'lucide-svelte';
	import type { OntoDocument } from '$lib/types/onto-api';

	let {
		documents
	}: {
		documents: OntoDocument[];
	} = $props();

	const TYPE_LABELS: Record<string, string> = {
		brief: 'Brief',
		research: 'Research',
		notes: 'Notes',
		outline: 'Outline',
		chapter: 'Chapter',
		script: 'Script',
		spec: 'Spec',
		readme: 'Readme'
	};

	function formatTypeKey(key: string | undefined | null): string {
		if (!key) return 'Document';
		return TYPE_LABELS[key] ?? key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
	}

	function shortSnippet(doc: OntoDocument): string | null {
		if (doc.description && doc.description.trim().length > 0) {
			return doc.description.trim();
		}
		if (doc.content && doc.content.trim().length > 0) {
			const stripped = doc.content
				.replace(/[#*_`>\-]/g, '')
				.replace(/\s+/g, ' ')
				.trim();
			return stripped.length > 0 ? stripped : null;
		}
		return null;
	}
</script>

<section
	class="rounded-lg border border-border bg-card shadow-ink tx tx-frame tx-weak overflow-hidden"
>
	<header class="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/40">
		<div class="flex items-center gap-2">
			<div
				class="h-7 w-7 rounded-md bg-sky-500/10 border border-sky-500/20 flex items-center justify-center"
			>
				<FileText class="w-3.5 h-3.5 text-sky-500" />
			</div>
			<div>
				<p class="text-sm font-semibold text-foreground">Documents</p>
				<p class="text-[10px] sm:text-xs text-muted-foreground">
					{documents.length}
					{documents.length === 1 ? 'document' : 'documents'} in this project
				</p>
			</div>
		</div>
	</header>

	{#if documents.length === 0}
		<div class="px-4 py-6 text-sm text-muted-foreground text-center">
			No documents in this example yet.
		</div>
	{:else}
		<ul class="divide-y divide-border">
			{#each documents as doc (doc.id)}
				{@const snippet = shortSnippet(doc)}
				<li class="px-4 py-3 hover:bg-muted/40 transition-colors">
					<div class="flex items-start gap-3">
						<FileText class="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
						<div class="min-w-0 flex-1">
							<div class="flex items-center gap-2 flex-wrap">
								<p class="text-sm font-medium text-foreground truncate">
									{doc.title || 'Untitled document'}
								</p>
								<span
									class="text-[0.6rem] uppercase tracking-[0.15em] text-muted-foreground border border-border rounded-full px-1.5 py-0.5"
								>
									{formatTypeKey(doc.type_key)}
								</span>
							</div>
							{#if snippet}
								<p
									class="mt-1 text-xs text-muted-foreground leading-relaxed line-clamp-2"
								>
									{snippet}
								</p>
							{/if}
						</div>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</section>
