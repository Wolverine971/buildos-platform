<!-- apps/web/src/routes/oauth/authorize/+page.svelte -->
<script lang="ts">
	import type { ActionData, PageData } from './$types';
	import SEOHead from '$lib/components/SEOHead.svelte';
	import {
		Lock,
		Pencil,
		ExternalLink,
		ShieldCheck,
		FolderOpen,
		ListChecks,
		Check
	} from 'lucide-svelte';

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

<div class="min-h-screen bg-background px-4 py-10 sm:px-6 sm:py-14">
	<div class="mx-auto max-w-2xl">
		<!-- Header -->
		<div class="mb-8 flex items-center gap-4">
			<div
				class="tx tx-bloom tx-weak flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-border bg-card shadow-ink"
			>
				<img src="/brain-bolt-80.png" alt="" class="h-9 w-9" />
			</div>
			<div class="min-w-0">
				<p class="text-xs font-medium uppercase tracking-wider text-muted-foreground">
					BuildOS Connector
				</p>
				<h1 class="mt-0.5 text-2xl font-bold text-foreground sm:text-3xl">
					Connect to BuildOS
				</h1>
			</div>
		</div>

		<!-- Connection summary -->
		<div
			class="mb-6 rounded-lg border border-border bg-card p-5 shadow-ink tx tx-grain tx-weak"
		>
			<div class="flex items-start justify-between gap-4">
				<div class="min-w-0">
					<p class="text-xs font-medium uppercase tracking-wider text-muted-foreground">
						Requesting access
					</p>
					<p class="mt-1 truncate text-lg font-semibold text-foreground">
						{data.authorization.client_name}
					</p>
					{#if data.userEmail}
						<p class="mt-1 text-sm text-muted-foreground">
							for <span class="font-medium text-foreground">{data.userEmail}</span>
						</p>
					{/if}
				</div>
				{#if data.authorization.client_uri}
					<a
						href={data.authorization.client_uri}
						target="_blank"
						rel="noreferrer"
						class="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
					>
						<ExternalLink class="h-3.5 w-3.5" />
						Client info
					</a>
				{/if}
			</div>
		</div>

		<form method="POST" action="?/authorize" class="space-y-6">
			{#each hiddenFields as [name, value]}
				<input type="hidden" {name} {value} />
			{/each}

			{#if form?.error}
				<div
					class="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
				>
					<span>{form.error}</span>
				</div>
			{/if}

			<!-- Permission level -->
			<section class="rounded-lg border border-border bg-card p-6 shadow-ink">
				<header class="mb-4">
					<h2 class="text-base font-semibold text-foreground">Permission level</h2>
					<p class="mt-1 text-sm text-muted-foreground">
						Choose what {data.authorization.client_name} can do in BuildOS.
					</p>
				</header>

				<div class="space-y-3">
					<label
						class="group relative flex cursor-pointer gap-3 rounded-lg border p-4 transition-colors"
						class:border-accent={scopeMode === 'read_only'}
						class:bg-accent={false}
						class:bg-muted={scopeMode === 'read_only'}
						class:border-border={scopeMode !== 'read_only'}
						class:bg-background={scopeMode !== 'read_only'}
					>
						<input
							type="radio"
							name="scope_mode"
							value="read_only"
							bind:group={scopeMode}
							class="mt-1 h-4 w-4 shrink-0 accent-foreground"
						/>
						<span class="min-w-0 flex-1">
							<span class="flex items-center gap-2">
								<Lock class="h-4 w-4 text-muted-foreground" />
								<span class="font-medium text-foreground">Read only</span>
								<span
									class="ml-auto rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
								>
									Recommended
								</span>
							</span>
							<span class="mt-1.5 block text-sm leading-relaxed text-muted-foreground">
								Read your selected projects, tasks, documents, and context. Nothing
								is changed.
							</span>
						</span>
					</label>

					<label
						class="group relative flex cursor-pointer gap-3 rounded-lg border p-4 transition-colors"
						class:border-accent={scopeMode === 'read_write'}
						class:bg-muted={scopeMode === 'read_write'}
						class:border-border={scopeMode !== 'read_write'}
						class:bg-background={scopeMode !== 'read_write'}
					>
						<input
							type="radio"
							name="scope_mode"
							value="read_write"
							bind:group={scopeMode}
							class="mt-1 h-4 w-4 shrink-0 accent-foreground"
						/>
						<span class="min-w-0 flex-1">
							<span class="flex items-center gap-2">
								<Pencil class="h-4 w-4 text-muted-foreground" />
								<span class="font-medium text-foreground">Read and write</span>
							</span>
							<span class="mt-1.5 block text-sm leading-relaxed text-muted-foreground">
								Also create and update projects, tasks, and documents. Creating new
								projects requires all-project access below.
							</span>
						</span>
					</label>
				</div>
			</section>

			<!-- Project access -->
			<section class="rounded-lg border border-border bg-card p-6 shadow-ink">
				<header class="mb-4">
					<h2 class="text-base font-semibold text-foreground">Project access</h2>
					<p class="mt-1 text-sm text-muted-foreground">
						Pick which projects this connector can see.
					</p>
				</header>

				<div class="space-y-3">
					<label
						class="flex cursor-pointer gap-3 rounded-lg border p-4 transition-colors"
						class:border-accent={projectScope === 'all'}
						class:bg-muted={projectScope === 'all'}
						class:border-border={projectScope !== 'all'}
						class:bg-background={projectScope !== 'all'}
					>
						<input
							type="radio"
							name="project_scope"
							value="all"
							bind:group={projectScope}
							class="mt-1 h-4 w-4 shrink-0 accent-foreground"
						/>
						<span class="min-w-0 flex-1">
							<span class="flex items-center gap-2">
								<FolderOpen class="h-4 w-4 text-muted-foreground" />
								<span class="font-medium text-foreground">All my projects</span>
							</span>
							<span class="mt-1.5 block text-sm leading-relaxed text-muted-foreground">
								Projects where you are an owner or collaborator. Public project pages
								are not included automatically.
							</span>
						</span>
					</label>

					<label
						class="flex cursor-pointer gap-3 rounded-lg border p-4 transition-colors"
						class:border-accent={projectScope === 'selected'}
						class:bg-muted={projectScope === 'selected'}
						class:border-border={projectScope !== 'selected'}
						class:bg-background={projectScope !== 'selected'}
					>
						<input
							type="radio"
							name="project_scope"
							value="selected"
							bind:group={projectScope}
							class="mt-1 h-4 w-4 shrink-0 accent-foreground"
						/>
						<span class="min-w-0 flex-1">
							<span class="flex items-center gap-2">
								<ListChecks class="h-4 w-4 text-muted-foreground" />
								<span class="font-medium text-foreground">Only selected projects</span>
							</span>
							<span class="mt-1.5 block text-sm leading-relaxed text-muted-foreground">
								Limit this connector to the projects checked below. Creating new
								projects is disabled in this mode.
							</span>
						</span>
					</label>
				</div>

				{#if projectScope === 'selected'}
					<div
						class="mt-4 max-h-72 overflow-y-auto rounded-lg border border-border bg-background p-2"
					>
						{#if data.projects.length === 0}
							<div class="flex flex-col items-center gap-2 px-4 py-8 text-center">
								<FolderOpen class="h-6 w-6 text-muted-foreground" />
								<p class="text-sm text-muted-foreground">
									No projects are available yet.
								</p>
							</div>
						{:else}
							<ul class="space-y-1">
								{#each data.projects as project}
									<li>
										<label
											class="flex cursor-pointer items-start gap-3 rounded-md p-2.5 transition-colors hover:bg-muted/60"
										>
											<input
												type="checkbox"
												name="project_ids"
												value={project.id}
												checked
												class="mt-0.5 h-4 w-4 shrink-0 accent-foreground"
											/>
											<span class="min-w-0 flex-1">
												<span class="block truncate text-sm font-medium text-foreground">
													{project.name}
												</span>
												{#if project.description}
													<span
														class="mt-0.5 block truncate text-xs text-muted-foreground"
													>
														{project.description}
													</span>
												{/if}
											</span>
										</label>
									</li>
								{/each}
							</ul>
						{/if}
					</div>
				{/if}
			</section>

			<!-- Security callout -->
			<section
				class="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground"
			>
				<ShieldCheck class="mt-0.5 h-5 w-5 shrink-0 text-foreground/70" />
				<div class="space-y-1.5">
					<p class="font-medium text-foreground">Your data stays under your control.</p>
					<ul class="space-y-1">
						<li class="flex items-start gap-2">
							<Check class="mt-0.5 h-3.5 w-3.5 shrink-0 text-foreground/60" />
							<span>Tokens are stored as hashes — never in plaintext.</span>
						</li>
						<li class="flex items-start gap-2">
							<Check class="mt-0.5 h-3.5 w-3.5 shrink-0 text-foreground/60" />
							<span>Every tool call is audited.</span>
						</li>
						<li class="flex items-start gap-2">
							<Check class="mt-0.5 h-3.5 w-3.5 shrink-0 text-foreground/60" />
							<span>You can revoke this connector from BuildOS at any time.</span>
						</li>
					</ul>
				</div>
			</section>

			<!-- Actions -->
			<div
				class="flex flex-col-reverse gap-3 border-t border-border pt-6 sm:flex-row sm:justify-end"
			>
				<button
					type="submit"
					name="decision"
					value="deny"
					class="rounded-lg border border-border bg-card px-5 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
				>
					Deny
				</button>
				<button
					type="submit"
					name="decision"
					value="approve"
					class="rounded-lg bg-foreground px-5 py-3 text-sm font-semibold text-background shadow-ink transition-opacity hover:opacity-90"
				>
					Approve connection
				</button>
			</div>
		</form>
	</div>
</div>
