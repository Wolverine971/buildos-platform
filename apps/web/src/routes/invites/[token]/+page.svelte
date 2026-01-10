<!-- apps/web/src/routes/invites/[token]/+page.svelte -->
<script lang="ts">
	import { AlertCircle, ArrowRight, Loader2, UserPlus } from 'lucide-svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>Accept Invite | BuildOS</title>
</svelte:head>

<div class="min-h-screen bg-background flex items-center justify-center px-4 py-8">
	<div class="w-full max-w-sm">
		{#if data?.status === 'error'}
			<!-- Error State -->
			<div
				class="rounded-lg border border-border bg-card p-4 shadow-ink tx tx-static tx-weak"
			>
				<div class="flex items-start gap-3">
					<div
						class="shrink-0 flex items-center justify-center w-9 h-9 rounded-lg bg-red-500/10"
					>
						<AlertCircle class="w-5 h-5 text-red-500" />
					</div>
					<div class="min-w-0 flex-1">
						<p
							class="text-[0.65rem] uppercase tracking-[0.15em] text-muted-foreground mb-1"
						>
							Invite Error
						</p>
						<h1 class="text-base font-semibold text-foreground">
							Could not accept invite
						</h1>
						<p class="mt-1.5 text-sm text-muted-foreground">{data.message}</p>
					</div>
				</div>
				<div class="mt-4 pt-3 border-t border-border">
					<a
						href="/projects"
						class="inline-flex items-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-accent-foreground shadow-ink pressable transition-colors hover:bg-accent/90"
					>
						Go to projects
						<ArrowRight class="w-4 h-4" />
					</a>
				</div>
			</div>
		{:else}
			<!-- Loading/Processing State -->
			<div class="rounded-lg border border-border bg-card p-4 shadow-ink tx tx-frame tx-weak">
				<div class="flex items-start gap-3">
					<div
						class="shrink-0 flex items-center justify-center w-9 h-9 rounded-lg bg-accent/10"
					>
						<UserPlus class="w-5 h-5 text-accent" />
					</div>
					<div class="min-w-0 flex-1">
						<p
							class="text-[0.65rem] uppercase tracking-[0.15em] text-muted-foreground mb-1"
						>
							Project Invite
						</p>
						<h1 class="text-base font-semibold text-foreground">Accepting invite</h1>
						<p class="mt-1.5 text-sm text-muted-foreground">
							You'll be redirected to the project shortly.
						</p>
					</div>
				</div>
				<div
					class="mt-4 pt-3 border-t border-border flex items-center gap-2 text-sm text-muted-foreground"
				>
					<Loader2 class="w-4 h-4 animate-spin text-accent" />
					<span>Processing...</span>
				</div>
			</div>
		{/if}
	</div>
</div>
