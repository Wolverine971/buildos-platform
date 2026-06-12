<!-- apps/web/src/lib/components/ui/DiffView.svelte -->
<!--
	Inkprint DiffView Component (Svelte 5)
	- Migrated to Svelte 5 runes
	- Responsive spacing
-->
<script lang="ts">
	import type { DiffLine, FieldDiff } from '$lib/utils/diff';

	interface Props {
		diffs?: FieldDiff[];
		fromVersionLabel?: string;
		toVersionLabel?: string;
		showFieldPriority?: boolean;
	}

	let {
		diffs = [],
		fromVersionLabel = 'Old Version',
		toVersionLabel = 'New Version',
		showFieldPriority = false
	}: Props = $props();

	// Get line classes for diff display - Inkprint design
	function getLineClass(line: DiffLine): string {
		switch (line.type) {
			case 'added':
				return 'bg-success/10 border-l-4 border-success';
			case 'removed':
				return 'bg-destructive/10 border-l-4 border-destructive';
			default:
				return 'bg-muted/50';
		}
	}

	// Pair color with a glyph so the diff stays readable for colorblind users
	// and screen readers (WCAG 1.4.1).
	function getGutterSymbol(line: DiffLine): string {
		if (line.type === 'added') return '+';
		if (line.type === 'removed') return '−';
		return ' ';
	}

	function getGutterColorClass(line: DiffLine): string {
		if (line.type === 'added') return 'text-success';
		if (line.type === 'removed') return 'text-destructive';
		return 'text-muted-foreground/50';
	}
</script>

{#if diffs.length === 0}
	<div class="text-center py-8">
		<p class="text-muted-foreground">No changes detected between these versions.</p>
	</div>
{:else}
	<div class="space-y-4 sm:space-y-6">
		{#each diffs as diff (diff.field)}
			<div class="border border-border rounded-lg overflow-hidden shadow-ink">
				<!-- Field Header -->
				<div class="bg-muted px-3 sm:px-4 py-2 border-b border-border">
					<h3 class="font-medium text-foreground flex items-center">
						{diff.label}
						{#if showFieldPriority && diff.field === 'context'}
							<span class="ml-2 text-xs bg-accent/10 text-accent px-2 py-1 rounded">
								Primary Content
							</span>
						{/if}
					</h3>
				</div>

				<!-- Side-by-side diff -->
				<div
					class="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-border"
				>
					<!-- Old Version -->
					<section
						class="p-3 sm:p-4"
						aria-label={`${diff.label} — ${fromVersionLabel} (removed lines)`}
					>
						<h4 class="text-xs sm:text-sm font-medium text-destructive mb-2 sm:mb-3">
							{fromVersionLabel}
						</h4>
						<div class="font-mono text-xs sm:text-sm space-y-1 max-h-96 overflow-auto">
							{#each diff.oldLines as line (line.lineNumber)}
								<div class="flex items-stretch">
									<span
										class="w-6 sm:w-8 text-muted-foreground text-xs pr-1 sm:pr-2 flex-shrink-0 text-right"
										aria-hidden="true"
									>
										{line.lineNumber}
									</span>
									<span
										class="w-4 shrink-0 select-none text-center font-bold {getGutterColorClass(
											line
										)}"
										aria-hidden="true"
									>
										{getGutterSymbol(line)}
									</span>
									<pre
										class="flex-1 px-1 sm:px-2 py-1 {getLineClass(
											line
										)} whitespace-pre-wrap break-words">{line.content}</pre>
								</div>
							{/each}
						</div>
					</section>

					<!-- New Version -->
					<section
						class="p-3 sm:p-4"
						aria-label={`${diff.label} — ${toVersionLabel} (added lines)`}
					>
						<h4 class="text-xs sm:text-sm font-medium text-success mb-2 sm:mb-3">
							{toVersionLabel}
						</h4>
						<div class="font-mono text-xs sm:text-sm space-y-1 max-h-96 overflow-auto">
							{#each diff.newLines as line (line.lineNumber)}
								<div class="flex items-stretch">
									<span
										class="w-6 sm:w-8 text-muted-foreground text-xs pr-1 sm:pr-2 flex-shrink-0 text-right"
										aria-hidden="true"
									>
										{line.lineNumber}
									</span>
									<span
										class="w-4 shrink-0 select-none text-center font-bold {getGutterColorClass(
											line
										)}"
										aria-hidden="true"
									>
										{getGutterSymbol(line)}
									</span>
									<pre
										class="flex-1 px-1 sm:px-2 py-1 {getLineClass(
											line
										)} whitespace-pre-wrap break-words">{line.content}</pre>
								</div>
							{/each}
						</div>
					</section>
				</div>
			</div>
		{/each}
	</div>
{/if}
