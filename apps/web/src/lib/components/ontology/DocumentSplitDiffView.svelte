<!-- apps/web/src/lib/components/ontology/DocumentSplitDiffView.svelte -->
<!--
	Split (two-column) diff renderer for document version comparison.
	Left column: "from" version, Right column: "to" version.
	Word-level highlighting and context collapsing.

	Inkprint design tokens. Svelte 5 runes.
-->
<script lang="ts">
	import { ChevronDown } from 'lucide-svelte';
	import type {
		DocumentDiffLine,
		DocumentFieldDiff,
		DiffWordSpan
	} from '$lib/utils/document-diff';

	interface Props {
		fields: DocumentFieldDiff[];
		fromLabel?: string;
		toLabel?: string;
	}

	let { fields, fromLabel = 'Previous', toLabel = 'Current' }: Props = $props();

	/**
	 * Split unified lines into left (removed/unchanged) and right (added/unchanged) columns.
	 * Pair removed+added lines on the same row for visual alignment.
	 */
	interface SplitRow {
		left: DocumentDiffLine | null;
		right: DocumentDiffLine | null;
	}

	function splitLines(unifiedLines: DocumentDiffLine[]): SplitRow[] {
		const rows: SplitRow[] = [];
		let i = 0;

		while (i < unifiedLines.length) {
			const line = unifiedLines[i]!;

			if (line.type === 'unchanged' || line.type === 'separator') {
				rows.push({ left: line, right: line });
				i++;
				continue;
			}

			// Collect contiguous removed+added block
			const removedBlock: DocumentDiffLine[] = [];
			while (i < unifiedLines.length && unifiedLines[i]!.type === 'removed') {
				removedBlock.push(unifiedLines[i]!);
				i++;
			}
			const addedBlock: DocumentDiffLine[] = [];
			while (i < unifiedLines.length && unifiedLines[i]!.type === 'added') {
				addedBlock.push(unifiedLines[i]!);
				i++;
			}

			// Pair them row by row
			const maxLen = Math.max(removedBlock.length, addedBlock.length);
			for (let j = 0; j < maxLen; j++) {
				rows.push({
					left: removedBlock[j] ?? null,
					right: addedBlock[j] ?? null
				});
			}
		}

		return rows;
	}

	function getCellBgClass(line: DocumentDiffLine | null): string {
		if (!line) return 'bg-muted/30';
		switch (line.type) {
			case 'added':
				return 'bg-emerald-50 dark:bg-emerald-900/15';
			case 'removed':
				return 'bg-rose-50 dark:bg-rose-900/15';
			default:
				return '';
		}
	}

	function getGutterClass(line: DocumentDiffLine | null): string {
		if (!line) return 'text-muted-foreground/20';
		switch (line.type) {
			case 'added':
				return 'text-emerald-600 dark:text-emerald-400';
			case 'removed':
				return 'text-rose-600 dark:text-rose-400';
			default:
				return 'text-muted-foreground/40';
		}
	}

	function renderSpans(spans: DiffWordSpan[] | undefined, content: string): string {
		// For template use - we render spans inline in the template
		return content;
	}
</script>

{#if fields.length === 0}
	<div class="flex items-center justify-center py-12 text-muted-foreground text-sm">
		No changes between these versions.
	</div>
{:else}
	<div class="space-y-4">
		{#each fields as field, fieldIndex (field.field)}
			{@const splitRows = splitLines(field.unifiedLines)}
			<div class="border border-border rounded-lg overflow-hidden shadow-ink">
				<!-- Field header -->
				<div
					class="bg-muted px-3 py-1.5 border-b border-border flex items-center justify-between"
				>
					<span class="micro-label text-foreground">{field.label.toUpperCase()}</span>
					<span class="text-[10px] text-muted-foreground/60 tabular-nums">
						{#if field.stats.modified > 0}
							<span class="text-amber-600 dark:text-amber-400"
								>~{field.stats.modified}</span
							>
						{/if}
						{#if field.stats.added > 0}
							<span class="text-emerald-600 dark:text-emerald-400"
								>+{field.stats.added}</span
							>
						{/if}
						{#if field.stats.removed > 0}
							<span class="text-rose-600 dark:text-rose-400"
								>-{field.stats.removed}</span
							>
						{/if}
					</span>
				</div>

				<!-- Column headers -->
				<div class="grid grid-cols-2 divide-x divide-border border-b border-border">
					<div class="px-3 py-1">
						<span class="text-[10px] font-medium text-rose-600 dark:text-rose-400"
							>{fromLabel}</span
						>
					</div>
					<div class="px-3 py-1">
						<span class="text-[10px] font-medium text-emerald-600 dark:text-emerald-400"
							>{toLabel}</span
						>
					</div>
				</div>

				<!-- Split diff content -->
				<div class="font-mono text-xs leading-5 overflow-x-auto">
					{#each splitRows as row, rowIndex (rowIndex)}
						{#if row.left?.type === 'separator'}
							<!-- Separator spans both columns -->
							<div
								class="flex items-center gap-2 px-3 py-1 bg-muted/50 border-y border-border/30 text-[10px] text-muted-foreground/60"
							>
								<ChevronDown class="w-3 h-3 shrink-0" />
								<span>
									{row.left.hiddenLineCount} hidden line{row.left
										.hiddenLineCount === 1
										? ''
										: 's'}
								</span>
							</div>
						{:else}
							<div class="grid grid-cols-2 divide-x divide-border/30">
								<!-- Left (from) cell -->
								<div class="flex {getCellBgClass(row.left)}">
									<span
										class="w-8 shrink-0 text-right pr-1.5 select-none text-[10px] tabular-nums {getGutterClass(
											row.left
										)} py-px"
									>
										{row.left?.lineNumber ?? ''}
									</span>
									<span
										class="flex-1 px-1.5 py-px whitespace-pre-wrap break-words"
									>
										{#if row.left}
											{#if row.left.wordSpans && row.left.wordSpans.length > 0}
												{#each row.left.wordSpans as span}
													{#if span.type === 'removed'}
														<span
															class="bg-rose-200/60 dark:bg-rose-700/40 rounded-sm"
															>{span.text}</span
														>
													{:else}
														{span.text}
													{/if}
												{/each}
											{:else}
												{row.left.content}
											{/if}
										{/if}
									</span>
								</div>

								<!-- Right (to) cell -->
								<div class="flex {getCellBgClass(row.right)}">
									<span
										class="w-8 shrink-0 text-right pr-1.5 select-none text-[10px] tabular-nums {getGutterClass(
											row.right
										)} py-px"
									>
										{row.right?.lineNumber ?? ''}
									</span>
									<span
										class="flex-1 px-1.5 py-px whitespace-pre-wrap break-words"
									>
										{#if row.right}
											{#if row.right.wordSpans && row.right.wordSpans.length > 0}
												{#each row.right.wordSpans as span}
													{#if span.type === 'added'}
														<span
															class="bg-emerald-200/60 dark:bg-emerald-700/40 rounded-sm"
															>{span.text}</span
														>
													{:else}
														{span.text}
													{/if}
												{/each}
											{:else}
												{row.right.content}
											{/if}
										{/if}
									</span>
								</div>
							</div>
						{/if}
					{/each}
				</div>
			</div>
		{/each}
	</div>
{/if}
