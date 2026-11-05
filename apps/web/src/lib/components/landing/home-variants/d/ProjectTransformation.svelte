<!-- A deliberately small illustration: every output is present in the visible note. -->
<script lang="ts">
	import { ArrowRight, Circle, FileText } from '$lib/icons/lucide';
</script>

<figure class="overflow-hidden rounded-lg border border-border-strong bg-card shadow-ink">
	<figcaption class="sr-only">
		Illustrative example: notes become a website launch project.
	</figcaption>
	<div class="grid md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
		<div class="min-w-0 p-5 sm:p-6 lg:p-8">
			<p class="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
				<span class="stamp" aria-hidden="true">01</span>Your notes
			</p>
			<blockquote
				class="mt-3 max-w-sm font-notes text-base leading-relaxed text-foreground sm:text-lg"
			>
				“Website launch: write the homepage copy first, then the pricing page. Keep my
				launch notes together.”
			</blockquote>
			<p class="mt-3 text-sm text-muted-foreground">Illustrative example</p>
		</div>
		<article
			aria-labelledby="d-example-title"
			class="min-w-0 border-t border-border-strong bg-background p-5 sm:p-6 md:border-t-0 md:border-l lg:p-8"
		>
			<p class="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
				<span class="stamp" aria-hidden="true">02</span>A project to return to
			</p>
			<h2 id="d-example-title" class="mt-2 text-2xl font-semibold tracking-tight">
				Website launch
			</h2>
			<div class="mt-4 rounded-md border border-accent/30 bg-accent/10 p-4">
				<p class="flex items-center gap-2 text-sm font-medium text-foreground">
					<ArrowRight class="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />Your next
					step
				</p>
				<p class="mt-1 text-base font-semibold leading-relaxed text-foreground">
					Write the homepage copy
				</p>
			</div>
			<ul class="mt-4 space-y-3 text-sm leading-relaxed">
				<li class="flex items-start gap-2.5">
					<Circle
						class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
						aria-hidden="true"
					/><span
						><span class="text-muted-foreground">Then:</span> Write the pricing page</span
					>
				</li>
				<li class="flex items-start gap-2.5">
					<FileText
						class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
						aria-hidden="true"
					/><span><span class="text-muted-foreground">Document:</span> Launch notes</span>
				</li>
			</ul>
		</article>
	</div>
</figure>
