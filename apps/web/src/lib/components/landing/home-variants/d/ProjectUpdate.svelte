<!-- Readable summary of case-update-chat and case-update-task captures, not a live response.
     Task priority and due date rechecked against the public project API on 2026-11-04. -->
<script lang="ts">
	import { ArrowRight, Check, ExternalLink } from '$lib/icons/lucide';
	const evidenceLink =
		'inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-semibold text-foreground underline underline-offset-4 hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring';
</script>

<figure class="overflow-hidden rounded-lg border border-border-strong bg-background shadow-ink">
	<figcaption
		class="border-b border-border bg-card px-5 py-3 text-sm text-muted-foreground sm:px-6"
	>
		Recorded example · Fading Crown
	</figcaption>
	<div class="p-5 sm:p-6">
		<p class="text-sm font-medium text-muted-foreground">You asked</p>
		<blockquote class="mt-2 font-notes text-lg leading-relaxed text-foreground">
			“Push the beta-reader pass out a week and bump it to priority 1.”
		</blockquote>
		<div class="mt-5 border-t border-border pt-5">
			<p class="flex items-center gap-2 text-sm font-medium text-muted-foreground">
				<Check class="h-4 w-4 shrink-0" aria-hidden="true" />Back in the project
			</p>
			<p class="mt-2 text-lg font-semibold leading-snug tracking-tight">
				Beta-reader pass: chapters 1–14
			</p>
			<dl class="mt-4 grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-3">
				<div>
					<dt class="text-sm text-muted-foreground">Due date</dt>
					<dd class="mt-1 flex items-center gap-2 whitespace-nowrap text-base">
						<span class="text-muted-foreground"
							><span class="sr-only">Previously </span>Aug 17</span
						><ArrowRight
							class="h-4 w-4 shrink-0 text-muted-foreground"
							aria-hidden="true"
						/><span class="font-semibold"
							><span class="sr-only">Now </span><time datetime="2026-08-24"
								>Aug 24</time
							></span
						>
					</dd>
				</div>
				<div>
					<dt class="text-sm text-muted-foreground">Priority</dt>
					<dd class="mt-1 flex items-center gap-2 whitespace-nowrap text-base">
						<span class="text-muted-foreground"
							><span class="sr-only">Previously </span>2</span
						><ArrowRight
							class="h-4 w-4 shrink-0 text-muted-foreground"
							aria-hidden="true"
						/><span class="font-semibold"><span class="sr-only">Now </span>1</span>
					</dd>
				</div>
			</dl>
		</div>
	</div>
	<div class="border-t border-border px-5 py-3 sm:px-6">
		<p class="text-sm text-muted-foreground">Readable summary of the original captures.</p>
		<div class="mt-1 flex flex-wrap gap-x-5">
			<a
				href="/home/case-update-chat-light.jpg"
				target="_blank"
				rel="noreferrer"
				aria-label="View original chat at full size (new tab)"
				class="{evidenceLink} dark:hidden"
				>View original chat<ExternalLink
					class="h-3.5 w-3.5 shrink-0"
					aria-hidden="true"
				/></a
			>
			<a
				href="/home/case-update-chat-dark.jpg"
				target="_blank"
				rel="noreferrer"
				aria-label="View original chat at full size (new tab)"
				class="{evidenceLink} hidden dark:inline-flex"
				>View original chat<ExternalLink
					class="h-3.5 w-3.5 shrink-0"
					aria-hidden="true"
				/></a
			>
			<a
				href="/home/case-update-task-dark.jpg"
				target="_blank"
				rel="noreferrer"
				aria-label="View saved task at full size (new tab)"
				class={evidenceLink}
				>View saved task<ExternalLink class="h-3.5 w-3.5 shrink-0" aria-hidden="true" /></a
			>
		</div>
	</div>
</figure>
