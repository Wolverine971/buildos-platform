<!-- apps/web/src/routes/projects/[id]/documents/[document_id]/+page.svelte -->
<!--
	Document Focus Page - dedicated document workspace with project back navigation.
-->
<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { toastService } from '$lib/stores/toast.store';
	import Button from '$lib/components/ui/Button.svelte';
	import ConfirmationModal from '$lib/components/ui/ConfirmationModal.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import RichMarkdownEditor from '$lib/components/ui/RichMarkdownEditor.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Textarea from '$lib/components/ui/Textarea.svelte';
	import LinkedEntities from '$lib/components/ontology/linked-entities/LinkedEntities.svelte';
	import StateDisplay from '$lib/components/ontology/StateDisplay.svelte';
	import { DOCUMENT_STATES } from '$lib/types/onto';
	import type { EntityKind } from '$lib/components/ontology/linked-entities/linked-entities.types';
	import {
		AlertTriangle,
		Archive,
		ArrowLeft,
		Calendar,
		CheckCircle2,
		ChevronDown,
		Circle,
		Clock,
		FileText,
		Flag,
		FolderOpen,
		Layers,
		ListChecks,
		Loader,
		RefreshCw,
		RotateCcw,
		Save,
		Target
	} from 'lucide-svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let projectOverride = $state<PageData['project'] | null>(null);
	let documentOverride = $state<PageData['document'] | null>(null);
	let plansOverride = $state<PageData['plans'] | null>(null);
	let goalsOverride = $state<PageData['goals'] | null>(null);
	let documentsOverride = $state<PageData['documents'] | null>(null);
	let milestonesOverride = $state<PageData['milestones'] | null>(null);
	let tasksOverride = $state<PageData['tasks'] | null>(null);
	let risksOverride = $state<PageData['risks'] | null>(null);
	let eventsOverride = $state<PageData['events'] | null>(null);
	let linkedEntitiesOverride = $state<PageData['linkedEntities'] | null>(null);

	const project = $derived(projectOverride ?? data.project);
	const document = $derived(documentOverride ?? data.document);
	const plans = $derived(plansOverride ?? data.plans ?? []);
	const goals = $derived(goalsOverride ?? data.goals ?? []);
	const documents = $derived(documentsOverride ?? data.documents ?? []);
	const milestones = $derived(milestonesOverride ?? data.milestones ?? []);
	const tasks = $derived(tasksOverride ?? data.tasks ?? []);
	const risks = $derived(risksOverride ?? data.risks ?? []);
	const events = $derived(eventsOverride ?? data.events ?? []);
	const linkedEntities = $derived(linkedEntitiesOverride ?? data.linkedEntities ?? {});

	let title = $state('');
	let description = $state('');
	let content = $state('');
	let stateKey = $state('draft');
	let typeKey = $state('');
	let serverUpdatedAt = $state<string | null>(null);
	let lastLoadedVersionKey = $state('');
	let saveSnapshot = $state({
		title: '',
		description: '',
		content: '',
		stateKey: '',
		typeKey: ''
	});

	let isSaving = $state(false);
	let isRefreshing = $state(false);
	let isArchiving = $state(false);
	let error = $state('');
	let showArchiveConfirm = $state(false);

	let expandedPanels = $state<Record<string, boolean>>({
		links: true,
		events: true,
		tasks: true,
		documents: true,
		goals: false,
		plans: false,
		milestones: false,
		risks: false
	});

	const hasUnsavedChanges = $derived(
		title !== saveSnapshot.title ||
			description !== saveSnapshot.description ||
			content !== saveSnapshot.content ||
			stateKey !== saveSnapshot.stateKey ||
			typeKey !== saveSnapshot.typeKey
	);

	const otherDocuments = $derived.by(() =>
		documents.filter((item: any) => item.id !== document?.id).slice(0, 12)
	);
	const documentVisuals = $derived(getDocumentVisuals(stateKey));
	const DocumentIcon = $derived(documentVisuals.icon);
	const isArchivedDocument = $derived(stateKey === 'archived');

	function getDocumentContent(doc: any): string {
		return (doc?.content as string) ?? (doc?.props?.body_markdown as string) ?? '';
	}

	function applyDocument(nextDocument: any) {
		title = nextDocument?.title ?? '';
		description = nextDocument?.description ?? nextDocument?.props?.description ?? '';
		content = getDocumentContent(nextDocument);
		stateKey = normalizeDocumentState(nextDocument?.state_key);
		typeKey = nextDocument?.type_key ?? '';
		serverUpdatedAt = nextDocument?.updated_at ?? null;
		saveSnapshot = { title, description, content, stateKey, typeKey };
		error = '';
	}

	$effect(() => {
		if (!document) return;
		const nextKey = `${document.id ?? ''}:${document.updated_at ?? ''}`;
		if (nextKey === lastLoadedVersionKey) return;
		lastLoadedVersionKey = nextKey;
		applyDocument(document);
	});

	function normalizeDocumentState(state?: string | null): string {
		if (!state) return 'draft';
		const normalized = state
			.trim()
			.toLowerCase()
			.replace(/[\s-]+/g, '_');
		return DOCUMENT_STATES.includes(normalized as (typeof DOCUMENT_STATES)[number])
			? normalized
			: 'draft';
	}

	function getDocumentVisuals(state: string) {
		const normalized = state?.toLowerCase() || '';
		if (normalized === 'published' || normalized === 'ready') {
			return { icon: CheckCircle2, color: 'text-success' };
		}
		if (normalized === 'in_review') {
			return { icon: Clock, color: 'text-warning' };
		}
		if (normalized === 'archived') {
			return { icon: Archive, color: 'text-muted-foreground' };
		}
		return { icon: Circle, color: 'text-accent' };
	}

	function formatDate(dateString?: string | null) {
		if (!dateString) return 'Unknown';
		const parsed = new Date(dateString);
		if (Number.isNaN(parsed.getTime())) return 'Unknown';
		return parsed.toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	function formatEventDate(event: { start_at?: string | null }) {
		if (!event.start_at) return 'Date not set';
		const parsed = new Date(event.start_at);
		if (Number.isNaN(parsed.getTime())) return 'Date not set';
		return parsed.toLocaleDateString(undefined, {
			weekday: 'short',
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	function togglePanel(key: string) {
		expandedPanels = { ...expandedPanels, [key]: !expandedPanels[key] };
	}

	function entityLabel(entity: any): string {
		return entity?.title || entity?.name || entity?.goal || entity?.description || 'Untitled';
	}

	function openEntity(kind: EntityKind, id: string) {
		if (!project?.id) return;
		if (kind === 'task') {
			goto(`/projects/${project.id}/tasks/${id}`);
			return;
		}
		if (kind === 'document') {
			goto(`/projects/${project.id}/documents/${id}`);
			return;
		}
	}

	async function handleSave() {
		if (!document?.id) return;
		if (!title.trim()) {
			error = 'Document title is required';
			return;
		}

		isSaving = true;
		error = '';

		try {
			const body: Record<string, unknown> = {
				title: title.trim(),
				description: description.trim() || null,
				content,
				state_key: stateKey,
				force_version: true
			};
			if (typeKey.trim()) {
				body.type_key = typeKey.trim();
			}
			if (serverUpdatedAt) {
				body.expected_updated_at = serverUpdatedAt;
			}

			const response = await fetch(`/api/onto/documents/${document.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});
			const payload = await response.json().catch(() => null);
			if (!response.ok) {
				throw new Error(payload?.error || 'Failed to update document');
			}

			const updatedDocument = payload?.data?.document;
			if (updatedDocument) {
				documentOverride = updatedDocument;
				lastLoadedVersionKey = `${updatedDocument.id ?? ''}:${updatedDocument.updated_at ?? ''}`;
				applyDocument(updatedDocument);
			}
			toastService.success('Document updated');
			await refreshData({ silent: true });
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to update document';
			error = message;
			toastService.error(message);
		} finally {
			isSaving = false;
		}
	}

	async function refreshData(options: { silent?: boolean } = {}) {
		const projectId = project?.id;
		const documentId = document?.id;
		if (!projectId || !documentId) return;

		isRefreshing = true;
		try {
			const [projectResponse, documentResponse, eventsResponse, linkedResponse] =
				await Promise.all([
					fetch(`/api/onto/projects/${projectId}`),
					fetch(`/api/onto/documents/${documentId}/full`),
					fetch(`/api/onto/projects/${projectId}/events?limit=1000`),
					fetch(
						`/api/onto/edges/linked?sourceId=${documentId}&sourceKind=document&projectId=${projectId}&includeAvailable=false`
					)
				]);

			if (!projectResponse.ok || !documentResponse.ok) {
				throw new Error('Failed to refresh document');
			}

			const [projectData, documentData, eventsData, linkedData] = await Promise.all([
				projectResponse.json(),
				documentResponse.json(),
				eventsResponse.ok ? eventsResponse.json() : Promise.resolve(null),
				linkedResponse.ok ? linkedResponse.json() : Promise.resolve(null)
			]);

			projectOverride = projectData.data?.project || project;
			documentOverride = documentData.data?.document || document;
			linkedEntitiesOverride = documentData.data?.linkedEntities || {};
			plansOverride = projectData.data?.plans || [];
			goalsOverride = projectData.data?.goals || [];
			documentsOverride = projectData.data?.documents || [];
			milestonesOverride = projectData.data?.milestones || [];
			tasksOverride = projectData.data?.tasks || [];
			risksOverride = projectData.data?.risks || [];
			const linkedEventIds = new Set(
				(linkedData?.data?.linkedEntities?.events ?? []).map(
					(linkedEvent: { id?: string }) => linkedEvent.id
				)
			);
			eventsOverride = (eventsData?.data?.events || []).filter(
				(event: any) =>
					(event?.owner_entity_type === 'document' &&
						event?.owner_entity_id === documentId) ||
					linkedEventIds.has(event?.id)
			);

			if (!options.silent) {
				toastService.success('Document refreshed');
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to refresh document';
			toastService.error(message);
		} finally {
			isRefreshing = false;
		}
	}

	async function handleArchive() {
		if (!document?.id) return;
		isArchiving = true;
		try {
			const response = await fetch(`/api/onto/documents/${document.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'archive',
					archive_children_mode: 'promote_children'
				})
			});
			const payload = await response.json().catch(() => null);
			if (!response.ok) {
				throw new Error(payload?.error || 'Failed to archive document');
			}
			toastService.success('Document archived');
			showArchiveConfirm = false;
			await refreshData({ silent: true });
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to archive document';
			toastService.error(message);
		} finally {
			isArchiving = false;
		}
	}

	async function handleRestore() {
		if (!document?.id) return;
		isArchiving = true;
		try {
			const response = await fetch(`/api/onto/documents/${document.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'restore',
					restore_state_key: 'draft'
				})
			});
			const payload = await response.json().catch(() => null);
			if (!response.ok) {
				throw new Error(payload?.error || 'Failed to restore document');
			}
			toastService.success('Document restored');
			await refreshData({ silent: true });
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to restore document';
			toastService.error(message);
		} finally {
			isArchiving = false;
		}
	}
</script>

<svelte:window
	onkeydown={(event) => {
		if (!browser) return;
		if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
			event.preventDefault();
			void handleSave();
		}
	}}
/>

<svelte:head>
	<title>{title || 'Document'} | {project?.name || 'Project'} | BuildOS</title>
</svelte:head>

<div class="min-h-screen bg-background overflow-x-hidden">
	<header
		class="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 tx tx-strip tx-weak"
	>
		<div class="mx-auto max-w-screen-2xl px-2 sm:px-4 lg:px-6 py-1.5 sm:py-2">
			<div class="flex items-center gap-1.5 sm:gap-3 min-w-0">
				<button
					type="button"
					onclick={() => goto(`/projects/${project?.id}`)}
					class="p-1 sm:p-1.5 rounded-lg hover:bg-muted transition-colors shrink-0 pressable"
					aria-label="Back to project"
				>
					<ArrowLeft class="w-4 h-4 text-muted-foreground" />
				</button>
				<div
					class="w-7 h-7 sm:w-8 sm:h-8 rounded-md bg-accent/10 flex items-center justify-center shrink-0"
				>
					<DocumentIcon class="w-3.5 h-3.5 sm:w-4 sm:h-4 {documentVisuals.color}" />
				</div>
				<div class="min-w-0 flex-1">
					<h1
						class="text-sm sm:text-base font-semibold text-foreground leading-tight truncate"
					>
						{title || 'Untitled Document'}
					</h1>
					<a
						href={`/projects/${project?.id}`}
						class="text-[10px] sm:text-xs text-muted-foreground hover:text-foreground transition-colors truncate block"
					>
						{project?.name || 'Project'}
					</a>
				</div>
				<StateDisplay state={stateKey} entityKind="document" />
			</div>
		</div>
	</header>

	<main class="mx-auto max-w-screen-2xl px-2 sm:px-4 lg:px-6 py-2 sm:py-4 overflow-x-hidden">
		<div
			class="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_360px] gap-2 sm:gap-4 lg:gap-6"
		>
			<div class="min-w-0 space-y-2 sm:space-y-3">
				<section
					class="bg-card border border-border shadow-ink tx tx-grain tx-weak wt-paper sp-block overflow-hidden"
				>
					<div class="p-3 sm:p-4">
						<form
							class="space-y-2.5 sm:space-y-3"
							onsubmit={(event) => {
								event.preventDefault();
								void handleSave();
							}}
						>
							<FormField
								label="Title"
								labelFor="document-title"
								required={true}
								error={!title.trim() && error ? 'Required' : ''}
							>
								<TextInput
									id="document-title"
									bind:value={title}
									required={true}
									disabled={isSaving || isArchivedDocument}
									error={!title.trim() && error ? true : false}
									size="md"
									class="font-medium"
								/>
							</FormField>

							<FormField label="Description" labelFor="document-description">
								<Textarea
									id="document-description"
									bind:value={description}
									rows={3}
									disabled={isSaving || isArchivedDocument}
									size="md"
								/>
							</FormField>

							<div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
								<FormField label="State" labelFor="document-state" required={true}>
									<Select
										id="document-state"
										bind:value={stateKey}
										disabled={isSaving || isArchivedDocument}
										size="sm"
										placeholder="State"
									>
										{#each DOCUMENT_STATES.filter((state) => state !== 'archived' || isArchivedDocument) as state}
											<option value={state}>{state.replace('_', ' ')}</option>
										{/each}
									</Select>
								</FormField>

								<FormField label="Type" labelFor="document-type">
									<TextInput
										id="document-type"
										bind:value={typeKey}
										disabled={isSaving || isArchivedDocument}
										size="sm"
									/>
								</FormField>
							</div>

							{#if error}
								<div
									class="p-2 bg-destructive/10 border border-destructive/30 rounded-lg tx tx-static tx-weak"
								>
									<p class="text-xs sm:text-sm text-destructive">{error}</p>
								</div>
							{/if}
						</form>
					</div>
				</section>

				<section
					class="bg-card border border-border shadow-ink tx tx-grain tx-weak wt-paper overflow-hidden"
				>
					<div class="p-2 sm:p-3">
						<RichMarkdownEditor
							bind:value={content}
							fillHeight={true}
							maxLength={50000}
							size="base"
							label="Document Content"
							helpText="Markdown supported"
							disabled={isSaving || isArchivedDocument}
							onSave={handleSave}
						/>
					</div>
					<div
						class="flex items-center justify-between gap-2 px-2 sm:px-3 py-2 border-t border-border bg-muted/30"
					>
						<div class="flex items-center gap-2 min-w-0">
							{#if hasUnsavedChanges}
								<span class="flex items-center gap-1 text-[10px] text-warning">
									<span class="w-1.5 h-1.5 rounded-full bg-warning animate-pulse"
									></span>
									Unsaved changes
								</span>
							{:else}
								<span class="text-[10px] text-muted-foreground">
									Updated {formatDate(document?.updated_at)}
								</span>
							{/if}
						</div>
						<button
							type="button"
							onclick={handleSave}
							disabled={isSaving || isArchivedDocument || !title.trim()}
							class="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-accent-foreground text-xs font-semibold rounded-lg shadow-ink pressable disabled:opacity-50"
						>
							{#if isSaving}
								<Loader class="w-3.5 h-3.5 animate-spin" />
							{:else}
								<Save class="w-3.5 h-3.5" />
							{/if}
							<span>Save</span>
						</button>
					</div>
				</section>

				<section
					class="bg-card border border-border rounded-lg shadow-ink tx tx-thread tx-weak overflow-hidden"
				>
					<button
						type="button"
						onclick={() => togglePanel('links')}
						class="w-full flex items-center justify-between gap-2 px-2.5 sm:px-3 py-2 text-left hover:bg-muted/60 transition-colors pressable"
					>
						<div class="flex items-center gap-2">
							<div
								class="w-6 h-6 rounded-md bg-info/10 flex items-center justify-center"
							>
								<Layers class="w-3 h-3 text-info" />
							</div>
							<span class="text-xs sm:text-sm font-semibold text-foreground"
								>Links</span
							>
						</div>
						<ChevronDown
							class="w-3.5 h-3.5 text-muted-foreground transition-transform duration-[120ms] {expandedPanels.links
								? 'rotate-180'
								: ''}"
						/>
					</button>
					{#if expandedPanels.links && document?.id && project?.id}
						<div class="border-t border-border p-2">
							<LinkedEntities
								sourceId={document.id}
								sourceKind="document"
								projectId={project.id}
								initialLinkedEntities={linkedEntities}
								onEntityClick={openEntity}
								onLinksChanged={() => refreshData({ silent: true })}
							/>
						</div>
					{/if}
				</section>

				<div
					class="sm:hidden fixed bottom-0 left-0 right-0 z-40 flex items-center justify-between gap-2 px-3 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] bg-card/95 backdrop-blur border-t border-border shadow-ink-strong"
				>
					<button
						type="button"
						onclick={() => void refreshData()}
						disabled={isRefreshing || isSaving}
						class="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-muted-foreground border border-border rounded-lg hover:bg-muted transition-colors pressable disabled:opacity-50"
					>
						<RefreshCw class="w-3.5 h-3.5 {isRefreshing ? 'animate-spin' : ''}" />
						<span>Refresh</span>
					</button>
					<button
						type="button"
						onclick={handleSave}
						disabled={isSaving || isArchivedDocument || !title.trim()}
						class="flex items-center justify-center gap-1.5 px-4 py-2 bg-accent text-accent-foreground text-xs font-semibold rounded-lg shadow-ink pressable disabled:opacity-50 flex-1 max-w-[180px]"
					>
						{#if isSaving}
							<Loader class="w-3.5 h-3.5 animate-spin" />
						{:else}
							<Save class="w-3.5 h-3.5" />
						{/if}
						<span>Save Document</span>
					</button>
				</div>
				<div class="sm:hidden h-[calc(4rem+env(safe-area-inset-bottom))]"></div>
			</div>

			<aside
				class="min-w-0 space-y-2 lg:sticky lg:top-16 lg:max-h-[calc(100vh-80px)] lg:overflow-y-auto lg:pr-1"
			>
				<section
					class="bg-card border border-border shadow-ink tx tx-frame tx-weak wt-paper sp-block overflow-hidden"
				>
					<div class="px-3 py-2.5 flex items-center gap-2">
						<Button
							variant="primary"
							size="sm"
							onclick={handleSave}
							loading={isSaving}
							disabled={isSaving || isArchivedDocument || !title.trim()}
							class="pressable flex-1"
						>
							<Save class="w-3.5 h-3.5" />
							Save
						</Button>
						<button
							type="button"
							onclick={() => void refreshData()}
							disabled={isRefreshing}
							class="p-2 rounded-lg border border-border hover:bg-muted transition-colors disabled:opacity-50 pressable"
							aria-label="Refresh document"
						>
							<RefreshCw
								class="w-3.5 h-3.5 text-muted-foreground {isRefreshing
									? 'animate-spin'
									: ''}"
							/>
						</button>
						{#if isArchivedDocument}
							<button
								type="button"
								onclick={handleRestore}
								disabled={isArchiving}
								class="p-2 rounded-lg border border-border hover:bg-muted transition-colors disabled:opacity-50 pressable"
								aria-label="Restore document"
							>
								<RotateCcw class="w-3.5 h-3.5 text-muted-foreground" />
							</button>
						{:else}
							<button
								type="button"
								onclick={() => (showArchiveConfirm = true)}
								disabled={isArchiving || isSaving}
								class="p-2 rounded-lg border border-border hover:bg-destructive/10 hover:border-destructive/30 transition-colors disabled:opacity-50 pressable"
								aria-label="Archive document"
							>
								<Archive class="w-3.5 h-3.5 text-destructive" />
							</button>
						{/if}
					</div>
					<div class="px-3 pb-3 text-[10px] text-muted-foreground">
						Created {formatDate(document?.created_at)} · Updated {formatDate(
							document?.updated_at
						)}
					</div>
				</section>

				<p
					class="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground px-1 mt-3 mb-1"
				>
					Project Context
				</p>

				{#if events.length > 0}
					<section
						class="bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak overflow-hidden"
					>
						<button
							type="button"
							onclick={() => togglePanel('events')}
							class="w-full flex items-center justify-between gap-2 px-2.5 py-2 text-left hover:bg-muted/50 transition-colors pressable"
						>
							<div class="flex items-center gap-2">
								<div
									class="w-6 h-6 rounded-md bg-warning/10 flex items-center justify-center"
								>
									<Calendar class="w-3 h-3 text-warning" />
								</div>
								<span class="text-xs font-semibold text-foreground">Events</span>
								<span class="text-[10px] text-muted-foreground"
									>({events.length})</span
								>
							</div>
							<ChevronDown
								class="w-3.5 h-3.5 text-muted-foreground transition-transform duration-[120ms] {expandedPanels.events
									? 'rotate-180'
									: ''}"
							/>
						</button>
						{#if expandedPanels.events}
							<div class="border-t border-border max-h-40 overflow-y-auto">
								<ul class="divide-y divide-border/80">
									{#each events.slice(0, 8) as event}
										<li class="px-2.5 py-1.5">
											<div class="flex items-start gap-2">
												<Calendar
													class="w-3 h-3 text-warning shrink-0 mt-0.5"
												/>
												<div class="min-w-0 flex-1">
													<span
														class="text-xs text-foreground truncate block"
														>{event.title || 'Untitled event'}</span
													>
													<span
														class="text-[10px] text-muted-foreground truncate block"
														>{formatEventDate(event)}</span
													>
												</div>
											</div>
										</li>
									{/each}
								</ul>
							</div>
						{/if}
					</section>
				{/if}

				{#if otherDocuments.length > 0}
					<section
						class="bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak overflow-hidden"
					>
						<button
							type="button"
							onclick={() => togglePanel('documents')}
							class="w-full flex items-center justify-between gap-2 px-2.5 py-2 text-left hover:bg-muted/50 transition-colors pressable"
						>
							<div class="flex items-center gap-2">
								<div
									class="w-6 h-6 rounded-md bg-accent/10 flex items-center justify-center"
								>
									<FileText class="w-3 h-3 text-accent" />
								</div>
								<span class="text-xs font-semibold text-foreground">Documents</span>
								<span class="text-[10px] text-muted-foreground"
									>({otherDocuments.length})</span
								>
							</div>
							<ChevronDown
								class="w-3.5 h-3.5 text-muted-foreground transition-transform duration-[120ms] {expandedPanels.documents
									? 'rotate-180'
									: ''}"
							/>
						</button>
						{#if expandedPanels.documents}
							<div class="border-t border-border max-h-48 overflow-y-auto">
								<ul class="divide-y divide-border/80">
									{#each otherDocuments as doc}
										<li>
											<a
												href={`/projects/${project?.id}/documents/${doc.id}`}
												class="w-full flex items-center gap-2 px-2.5 py-1.5 text-left hover:bg-accent/5 transition-colors pressable"
											>
												<FileText class="w-3 h-3 text-accent shrink-0" />
												<span class="text-xs text-foreground truncate"
													>{doc.title}</span
												>
											</a>
										</li>
									{/each}
								</ul>
							</div>
						{/if}
					</section>
				{/if}

				{#if tasks.length > 0}
					<section
						class="bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak overflow-hidden"
					>
						<button
							type="button"
							onclick={() => togglePanel('tasks')}
							class="w-full flex items-center justify-between gap-2 px-2.5 py-2 text-left hover:bg-muted/50 transition-colors pressable"
						>
							<div class="flex items-center gap-2">
								<div
									class="w-6 h-6 rounded-md bg-muted flex items-center justify-center"
								>
									<ListChecks class="w-3 h-3 text-muted-foreground" />
								</div>
								<span class="text-xs font-semibold text-foreground">Tasks</span>
								<span class="text-[10px] text-muted-foreground"
									>({tasks.length})</span
								>
							</div>
							<ChevronDown
								class="w-3.5 h-3.5 text-muted-foreground transition-transform duration-[120ms] {expandedPanels.tasks
									? 'rotate-180'
									: ''}"
							/>
						</button>
						{#if expandedPanels.tasks}
							<div class="border-t border-border max-h-40 overflow-y-auto">
								<ul class="divide-y divide-border/80">
									{#each tasks.slice(0, 10) as task}
										<li>
											<a
												href={`/projects/${project?.id}/tasks/${task.id}`}
												class="w-full flex items-center gap-2 px-2.5 py-1.5 text-left hover:bg-accent/5 transition-colors pressable"
											>
												<ListChecks
													class="w-3 h-3 text-muted-foreground shrink-0"
												/>
												<span class="text-xs text-foreground truncate"
													>{task.title}</span
												>
											</a>
										</li>
									{/each}
								</ul>
							</div>
						{/if}
					</section>
				{/if}

				{#if goals.length > 0}
					<section
						class="bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak overflow-hidden"
					>
						<button
							type="button"
							onclick={() => togglePanel('goals')}
							class="w-full flex items-center justify-between gap-2 px-2.5 py-2 text-left hover:bg-muted/50 transition-colors pressable"
						>
							<div class="flex items-center gap-2">
								<div
									class="w-6 h-6 rounded-md bg-warning/10 flex items-center justify-center"
								>
									<Target class="w-3 h-3 text-warning" />
								</div>
								<span class="text-xs font-semibold text-foreground">Goals</span>
								<span class="text-[10px] text-muted-foreground"
									>({goals.length})</span
								>
							</div>
							<ChevronDown
								class="w-3.5 h-3.5 text-muted-foreground transition-transform duration-[120ms] {expandedPanels.goals
									? 'rotate-180'
									: ''}"
							/>
						</button>
						{#if expandedPanels.goals}
							<div class="border-t border-border max-h-32 overflow-y-auto">
								<ul class="divide-y divide-border/80">
									{#each goals as goal}
										<li class="flex items-center gap-2 px-2.5 py-1.5">
											<Target class="w-3 h-3 text-warning shrink-0" />
											<span class="text-xs text-foreground truncate"
												>{entityLabel(goal)}</span
											>
										</li>
									{/each}
								</ul>
							</div>
						{/if}
					</section>
				{/if}

				{#if plans.length > 0}
					<section
						class="bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak overflow-hidden"
					>
						<button
							type="button"
							onclick={() => togglePanel('plans')}
							class="w-full flex items-center justify-between gap-2 px-2.5 py-2 text-left hover:bg-muted/50 transition-colors pressable"
						>
							<div class="flex items-center gap-2">
								<div
									class="w-6 h-6 rounded-md bg-info/10 flex items-center justify-center"
								>
									<Calendar class="w-3 h-3 text-info" />
								</div>
								<span class="text-xs font-semibold text-foreground">Plans</span>
								<span class="text-[10px] text-muted-foreground"
									>({plans.length})</span
								>
							</div>
							<ChevronDown
								class="w-3.5 h-3.5 text-muted-foreground transition-transform duration-[120ms] {expandedPanels.plans
									? 'rotate-180'
									: ''}"
							/>
						</button>
						{#if expandedPanels.plans}
							<div class="border-t border-border max-h-32 overflow-y-auto">
								<ul class="divide-y divide-border/80">
									{#each plans as plan}
										<li class="flex items-center gap-2 px-2.5 py-1.5">
											<Calendar class="w-3 h-3 text-info shrink-0" />
											<span class="text-xs text-foreground truncate"
												>{entityLabel(plan)}</span
											>
										</li>
									{/each}
								</ul>
							</div>
						{/if}
					</section>
				{/if}

				{#if milestones.length > 0}
					<section
						class="bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak overflow-hidden"
					>
						<button
							type="button"
							onclick={() => togglePanel('milestones')}
							class="w-full flex items-center justify-between gap-2 px-2.5 py-2 text-left hover:bg-muted/50 transition-colors pressable"
						>
							<div class="flex items-center gap-2">
								<div
									class="w-6 h-6 rounded-md bg-success/10 flex items-center justify-center"
								>
									<Flag class="w-3 h-3 text-success" />
								</div>
								<span class="text-xs font-semibold text-foreground">Milestones</span
								>
								<span class="text-[10px] text-muted-foreground"
									>({milestones.length})</span
								>
							</div>
							<ChevronDown
								class="w-3.5 h-3.5 text-muted-foreground transition-transform duration-[120ms] {expandedPanels.milestones
									? 'rotate-180'
									: ''}"
							/>
						</button>
						{#if expandedPanels.milestones}
							<div class="border-t border-border max-h-32 overflow-y-auto">
								<ul class="divide-y divide-border/80">
									{#each milestones as milestone}
										<li class="flex items-center gap-2 px-2.5 py-1.5">
											<Flag class="w-3 h-3 text-success shrink-0" />
											<span class="text-xs text-foreground truncate"
												>{entityLabel(milestone)}</span
											>
										</li>
									{/each}
								</ul>
							</div>
						{/if}
					</section>
				{/if}

				{#if risks.length > 0}
					<section
						class="bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak overflow-hidden"
					>
						<button
							type="button"
							onclick={() => togglePanel('risks')}
							class="w-full flex items-center justify-between gap-2 px-2.5 py-2 text-left hover:bg-muted/50 transition-colors pressable"
						>
							<div class="flex items-center gap-2">
								<div
									class="w-6 h-6 rounded-md bg-destructive/10 flex items-center justify-center"
								>
									<AlertTriangle class="w-3 h-3 text-destructive" />
								</div>
								<span class="text-xs font-semibold text-foreground">Risks</span>
								<span class="text-[10px] text-muted-foreground"
									>({risks.length})</span
								>
							</div>
							<ChevronDown
								class="w-3.5 h-3.5 text-muted-foreground transition-transform duration-[120ms] {expandedPanels.risks
									? 'rotate-180'
									: ''}"
							/>
						</button>
						{#if expandedPanels.risks}
							<div class="border-t border-border max-h-32 overflow-y-auto">
								<ul class="divide-y divide-border/80">
									{#each risks as risk}
										<li class="flex items-center gap-2 px-2.5 py-1.5">
											<AlertTriangle
												class="w-3 h-3 text-destructive shrink-0"
											/>
											<span class="text-xs text-foreground truncate"
												>{entityLabel(risk)}</span
											>
										</li>
									{/each}
								</ul>
							</div>
						{/if}
					</section>
				{/if}

				{#if events.length === 0 && otherDocuments.length === 0 && tasks.length === 0 && goals.length === 0 && plans.length === 0 && milestones.length === 0 && risks.length === 0}
					<section
						class="bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak p-4 text-center"
					>
						<FolderOpen class="w-5 h-5 text-muted-foreground mx-auto mb-2" />
						<p class="text-xs text-muted-foreground">No project context to show yet.</p>
					</section>
				{/if}
			</aside>
		</div>
	</main>
</div>

{#if showArchiveConfirm}
	<ConfirmationModal
		isOpen={showArchiveConfirm}
		title="Archive Document"
		confirmText="Archive"
		confirmVariant="danger"
		loading={isArchiving}
		loadingText="Archiving..."
		icon="danger"
		onconfirm={handleArchive}
		oncancel={() => (showArchiveConfirm = false)}
	>
		{#snippet content()}
			<p class="text-sm text-muted-foreground">
				Archive <span class="font-semibold text-foreground">"{title}"</span>? Child
				documents will be promoted in the document tree.
			</p>
		{/snippet}
	</ConfirmationModal>
{/if}
