<!-- apps/web/src/routes/oauth/authorize/+page.svelte -->
<script lang="ts">
	import type { ActionData, PageData } from './$types';
	import SEOHead from '$lib/components/SEOHead.svelte';
	import { Lock, Pencil, ExternalLink } from 'lucide-svelte';

	let { data, form }: { data: PageData; form?: ActionData } = $props();
	let scopeMode = $state<'read_only' | 'read_write'>('read_only');
	let projectScope = $state<'all' | 'selected'>('all');

	const hiddenFields = $derived([
		['client_id', data.authorization.client_id],
		['redirect_uri', data.authorization.redirect_uri],
		['response_type', data.authorization.response_type],
		['scope', data.authorization.scope],
		['state', data.authorization.state ?? ''],
		['code_challenge', data.authorization.code_challenge],
		['code_challenge_method', data.authorization.code_challenge_method],
		['resource', data.authorization.resource]
	]);
</script>

<SEOHead
	title="Connect BuildOS Connector"
	description="Approve scoped BuildOS Connector access."
	canonical="https://build-os.com/oauth/authorize"
	noindex
/>

<div class="min-h-screen bg-background px-4 py-10 sm:px-6">
	<div class="mx-auto max-w-2xl">
		<div class="mb-8 flex items-center gap-4">
			<div
				class="flex h-12 w-12 items-center justify-center rounded border border-border bg-card shadow-ink"
			>
				<img src="/brain-bolt-80.png" alt="" class="h-8 w-8" />
			</div>
			<div>
				<h1 class="text-2xl font-bold text-foreground">Connect BuildOS</h1>
				<p class="text-sm text-muted-foreground">
					Approve scoped access for {data.authorization.client_name}.
				</p>
			</div>
		</div>

		<form method="POST" action="?/authorize" class="space-y-6">
			{#each hiddenFields as [name, value]}
				<input type="hidden" {name} {value} />
			{/each}

			{#if form?.error}
				<div
					class="rounded border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
				>
					{form.error}
				</div>
			{/if}

			<section class="rounded border border-border bg-card p-6 shadow-ink">
				<div class="mb-5 flex items-start justify-between gap-4">
					<div>
						<h2 class="text-lg font-semibold text-foreground">
							{data.authorization.client_name}
						</h2>
						<p class="mt-1 text-sm text-muted-foreground">
							Will connect to the BuildOS Connector for {data.userEmail ??
								'your account'}.
						</p>
					</div>
					{#if data.authorization.client_uri}
						<a
							href={data.authorization.client_uri}
							target="_blank"
							rel="noreferrer"
							class="inline-flex items-center gap-1 text-sm text-accent hover:underline"
						>
							<ExternalLink class="h-4 w-4" />
							Client
						</a>
					{/if}
				</div>

				<div class="space-y-3">
					<label
						class="flex cursor-pointer gap-3 rounded border border-border bg-background p-4"
					>
						<input
							type="radio"
							name="scope_mode"
							value="read_only"
							bind:group={scopeMode}
							class="mt-1"
						/>
						<span>
							<span class="flex items-center gap-2 font-medium text-foreground">
								<Lock class="h-4 w-4" />
								Read only
							</span>
							<span class="mt-1 block text-sm text-muted-foreground">
								Claude can read selected BuildOS projects, tasks, documents, and
								context.
							</span>
						</span>
					</label>

					<label
						class="flex cursor-pointer gap-3 rounded border border-border bg-background p-4"
					>
						<input
							type="radio"
							name="scope_mode"
							value="read_write"
							bind:group={scopeMode}
							class="mt-1"
						/>
						<span>
							<span class="flex items-center gap-2 font-medium text-foreground">
								<Pencil class="h-4 w-4" />
								Read and write
							</span>
							<span class="mt-1 block text-sm text-muted-foreground">
								Claude can also create and update tasks and documents in selected
								projects.
							</span>
						</span>
					</label>
				</div>
			</section>

			<section class="rounded border border-border bg-card p-6 shadow-ink">
				<h2 class="text-lg font-semibold text-foreground">Project Access</h2>
				<div class="mt-4 space-y-3">
					<label class="flex cursor-pointer gap-3">
						<input
							type="radio"
							name="project_scope"
							value="all"
							bind:group={projectScope}
						/>
						<span>
							<span class="font-medium text-foreground"
								>All current collaborator projects</span
							>
							<span class="block text-sm text-muted-foreground">
								Expose projects where your account is an owner or collaborator.
								Public project pages are not included automatically.
							</span>
						</span>
					</label>
					<label class="flex cursor-pointer gap-3">
						<input
							type="radio"
							name="project_scope"
							value="selected"
							bind:group={projectScope}
						/>
						<span>
							<span class="font-medium text-foreground">Selected projects</span>
							<span class="block text-sm text-muted-foreground">
								Limit this connector to the checked projects below.
							</span>
						</span>
					</label>
				</div>

				{#if projectScope === 'selected'}
					<div
						class="mt-5 max-h-64 space-y-2 overflow-y-auto rounded border border-border bg-background p-3"
					>
						{#if data.projects.length === 0}
							<p class="text-sm text-muted-foreground">
								No projects are available yet.
							</p>
						{:else}
							{#each data.projects as project}
								<label
									class="flex cursor-pointer gap-3 rounded p-2 hover:bg-muted/60"
								>
									<input
										type="checkbox"
										name="project_ids"
										value={project.id}
										checked
									/>
									<span>
										<span class="block text-sm font-medium text-foreground"
											>{project.name}</span
										>
										{#if project.description}
											<span class="block text-xs text-muted-foreground"
												>{project.description}</span
											>
										{/if}
									</span>
								</label>
							{/each}
						{/if}
					</div>
				{/if}
			</section>

			<section
				class="rounded border border-border bg-card p-6 text-sm text-muted-foreground shadow-ink"
			>
				<p>
					You can revoke this connector from BuildOS later. Tokens are stored as hashes,
					and tool calls are audited for security.
				</p>
			</section>

			<div class="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
				<button
					type="submit"
					name="decision"
					value="deny"
					class="rounded border border-border px-5 py-3 text-sm font-medium text-foreground hover:bg-muted"
				>
					Deny
				</button>
				<button
					type="submit"
					name="decision"
					value="approve"
					class="rounded bg-accent px-5 py-3 text-sm font-semibold text-accent-foreground hover:bg-accent/90"
				>
					Approve Connection
				</button>
			</div>
		</form>
	</div>
</div>
