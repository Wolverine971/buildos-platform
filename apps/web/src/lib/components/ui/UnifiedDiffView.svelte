<!-- apps/web/src/lib/components/ui/UnifiedDiffView.svelte -->
<!--
	Unified (single-column) diff renderer with word-level highlighting.
	GitHub-style: removed lines (red), added lines (green), unchanged context,
	and separator lines for collapsed regions.

	Inkprint design tokens. Svelte 5 runes.
-->
<script lang="ts">
	import { ChevronDown } from '$lib/icons/lucide';
	import type { DocumentDiffLine, DocumentFieldDiff } from '$lib/utils/document-diff';

	interface Props {
		fields: DocumentFieldDiff[];
	}

	let { fields }: Props = $props();

	// Track which separators have been expanded
	let expandedSeparators = $state<Set<string>>(new Set());

	function toggleSeparator(fieldIndex: number, lineIndex: number) {
		const key = `${fieldIndex}-${lineIndex}`;
		const next = new Set(expandedSeparators);
		if (next.has(key)) {
			next.delete(key);
		} else {
			next.add(key);
		}
		expandedSeparators = next;
	}

	function isSeparatorExpanded(fieldIndex: number, lineIndex: number): boolean {
		return expandedSeparators.has(`${fieldIndex}-${lineIndex}`);
	}

	function getLineGutterSymbol(type: DocumentDiffLine['type']): string {
		if (type === 'added') return '+';
		if (type === 'removed') return '\u2212'; // minus sign
		return ' ';
	}

	function getLineBgClass(type: DocumentDiffLine['type']): string {
		switch (type) {
			case 'added':
				return 'bg-success/10';
			case 'removed':
				return 'bg-destructive/10';
			default:
				return '';
		}
	}

	// Use border-l-4 (a default Tailwind class). The original used border-l-3 which
	// isn't part of Tailwind's default config and silently fell back to no left border.
	function getLineBorderClass(type: DocumentDiffLine['type']): string {
		switch (type) {
			case 'added':
				return 'border-l-4 border-success';
			case 'removed':
				return 'border-l-4 border-destructive';
			default:
				return 'border-l-4 border-transparent';
		}
	}

	function getGutterClass(type: DocumentDiffLine['type']): string {
		switch (type) {
			case 'added':
				return 'text-success';
			case 'removed':
				return 'text-destructive';
			default:
				return 'text-muted-foreground/40';
		}
	}
</script>

{#if fields.length === 0}
	<div class="flex items-center justify-center py-12 text-muted-foreground text-sm">
		No changes between these versions.
	</div>
{:else}
	<div class="space-y-4">
		{#each fields as field, fieldIndex (field.field)}
			<div class="border border-border rounded-lg overflow-hidden shadow-ink">
				<!-- Field header -->
				<div
					class="bg-muted px-3 py-1.5 border-b border-border flex items-center justify-between"
				>
					<span class="micro-label text-foreground">{field.label}</span>
					<span class="text-[10px] text-muted-foreground/60 tabular-nums">
						{#if field.stats.modified > 0}
							<span class="text-warning">~{field.stats.modified}</span>
						{/if}
						{#if field.stats.added > 0}
							<span class="text-success">+{field.stats.added}</span>
						{/if}
						{#if field.stats.removed > 0}
							<span class="text-destructive">-{field.stats.removed}</span>
						{/if}
					</span>
				</div>

				<!-- Diff lines -->
				<div class="font-mono text-xs leading-5 overflow-x-auto">
					{#each field.unifiedLines as line, lineIndex (lineIndex)}
						{#if line.type === 'separator'}
							{@const separatorKey = `${fieldIndex}-${lineIndex}`}
							{@const expanded = isSeparatorExpanded(fieldIndex, lineIndex)}
							<!-- Collapsed context separator -->
							<button
								type="button"
								onclick={() => toggleSeparator(fieldIndex, lineIndex)}
								aria-expanded={expanded}
								aria-controls={`diff-hidden-${separatorKey}`}
								class="flex min-h-[44px] w-full cursor-pointer items-center gap-2 border-y border-border/30 bg-muted/50 px-3 py-1 text-[10px] text-muted-foreground/60 transition-colors hover:bg-muted hover:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-reduce:transition-none"
							>
								<ChevronDown
									class="h-3 w-3 shrink-0 transition-transform motion-reduce:transition-none {expanded
										? 'rotate-180'
										: ''}"
								/>
								<span>
									{expanded ? 'Hide' : 'Show'}
									{line.hiddenLineCount} hidden line{line.hiddenLineCount === 1
										? ''
										: 's'}
								</span>
							</button>
							{#if expanded && line.hiddenLines}
								<div id={`diff-hidden-${separatorKey}`}>
									{#each line.hiddenLines as hidden, hiddenIndex (hiddenIndex)}
										<div
											class="flex {getLineBgClass(
												hidden.type
											)} {getLineBorderClass(hidden.type)}"
										>
											<span
												class="w-10 shrink-0 text-right pr-2 select-none text-[10px] tabular-nums {getGutterClass(
													hidden.type
												)} py-px"
											>
												{hidden.lineNumber ?? ''}
											</span>
											<span
												class="w-4 shrink-0 text-center select-none font-bold {getGutterClass(
													hidden.type
												)} py-px"
											>
												{getLineGutterSymbol(hidden.type)}
											</span>
											<span
												class="flex-1 px-2 py-px whitespace-pre-wrap break-words"
											>
												{hidden.content}
											</span>
										</div>
									{/each}
								</div>
							{/if}
						{:else}
							<div
								class="flex {getLineBgClass(line.type)} {getLineBorderClass(
									line.type
								)}"
							>
								<!-- Line number gutter -->
								<span
									class="w-10 shrink-0 text-right pr-2 select-none text-[10px] tabular-nums {getGutterClass(
										line.type
									)} py-px"
								>
									{line.lineNumber ?? ''}
								</span>

								<!-- Change indicator -->
								<span
									class="w-4 shrink-0 text-center select-none font-bold {getGutterClass(
										line.type
									)} py-px"
								>
									{getLineGutterSymbol(line.type)}
								</span>

								<!-- Line content with optional word-level highlighting -->
								<span class="flex-1 px-2 py-px whitespace-pre-wrap break-words">
									{#if line.wordSpans && line.wordSpans.length > 0}
										{#each line.wordSpans as span}
											{#if span.type === 'added'}
												<span class="bg-success/30 rounded-sm"
													>{span.text}</span
												>
											{:else if span.type === 'removed'}
												<span class="bg-destructive/30 rounded-sm"
													>{span.text}</span
												>
											{:else}
												{span.text}
											{/if}
										{/each}
									{:else}
										{line.content}
									{/if}
								</span>
							</div>
						{/if}
					{/each}
				</div>
			</div>
		{/each}
	</div>
{/if}
