<!-- apps/web/src/lib/components/profile/ContactsTab.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import {
		Users,
		Plus,
		Pencil,
		Trash2,
		Upload,
		FileText,
		RefreshCw,
		Download
	} from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Textarea from '$lib/components/ui/Textarea.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import ConfirmationModal from '$lib/components/ui/ConfirmationModal.svelte';
	import TabHeader from './_shared/TabHeader.svelte';
	import SettingsCard from './_shared/SettingsCard.svelte';
	import { toastService } from '$lib/stores/toast.store';
	import type {
		ContactImportCommitResult,
		ContactImportNormalizedInput,
		ContactImportPreviewRow,
		ContactImportPreviewResult
	} from '$lib/types/profile-contacts';

	interface Props {
		onsuccess?: (event: { message: string }) => void;
		onerror?: (event: { message: string }) => void;
	}

	type ContactMethodRow = {
		id?: string;
		method_type?: string;
		label?: string | null;
		value_display?: string | null;
	};

	type ContactRow = {
		id: string;
		display_name: string;
		given_name?: string | null;
		family_name?: string | null;
		organization?: string | null;
		title?: string | null;
		relationship_label?: string | null;
		notes?: string | null;
		updated_at?: string | null;
		methods?: ContactMethodRow[];
	};

	let { onsuccess, onerror }: Props = $props();

	let contacts = $state<ContactRow[]>([]);
	let loadingContacts = $state(false);
	let savingContact = $state(false);
	let importPreviewLoading = $state(false);
	let importCommitLoading = $state(false);
	let editingContactId = $state<string | null>(null);
	let importPreview = $state<ContactImportPreviewResult | null>(null);
	let importCommitResult = $state<ContactImportCommitResult | null>(null);
	let selectedFile = $state<File | null>(null);
	let importWarning = $state<string | null>(null);

	let showDeleteContactConfirmation = $state(false);
	let pendingDelete = $state<{ id: string; name: string } | null>(null);

	let formState = $state({
		display_name: '',
		given_name: '',
		family_name: '',
		relationship_label: '',
		organization: '',
		title: '',
		phone: '',
		email: '',
		notes: ''
	});

	onMount(() => {
		void loadContacts();
	});

	async function parseApiData<T>(response: Response): Promise<T> {
		const payload = await response.json().catch(() => null);
		if (!response.ok || !payload?.success) {
			throw new Error(payload?.error || payload?.message || 'Request failed');
		}
		return (payload.data ?? {}) as T;
	}

	function buildContactPayload() {
		const methods = [];
		if (formState.phone.trim().length > 0) {
			methods.push({ method_type: 'phone', value: formState.phone.trim() });
		}
		if (formState.email.trim().length > 0) {
			methods.push({ method_type: 'email', value: formState.email.trim() });
		}

		return {
			display_name: formState.display_name.trim(),
			given_name: formState.given_name.trim() || undefined,
			family_name: formState.family_name.trim() || undefined,
			relationship_label: formState.relationship_label.trim() || undefined,
			organization: formState.organization.trim() || undefined,
			title: formState.title.trim() || undefined,
			notes: formState.notes.trim() || undefined,
			methods
		};
	}

	function resetForm() {
		formState = {
			display_name: '',
			given_name: '',
			family_name: '',
			relationship_label: '',
			organization: '',
			title: '',
			phone: '',
			email: '',
			notes: ''
		};
		editingContactId = null;
	}

	async function loadContacts() {
		loadingContacts = true;
		try {
			const response = await fetch('/api/profile/contacts?include_methods=true&limit=200');
			const data = await parseApiData<{ contacts?: ContactRow[] }>(response);
			contacts = Array.isArray(data.contacts) ? data.contacts : [];
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to load contacts';
			toastService.error(message);
			onerror?.({ message });
		} finally {
			loadingContacts = false;
		}
	}

	async function submitContactForm(event: Event) {
		event.preventDefault();
		if (savingContact) return;
		if (!formState.display_name.trim()) {
			const message = 'Display name is required.';
			toastService.error(message);
			onerror?.({ message });
			return;
		}

		savingContact = true;
		try {
			const payload = buildContactPayload();
			const response = editingContactId
				? await fetch(`/api/profile/contacts/${editingContactId}`, {
						method: 'PATCH',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify(payload)
					})
				: await fetch('/api/profile/contacts', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify(payload)
					});

			await parseApiData(response);
			const message = editingContactId ? 'Contact updated.' : 'Contact created.';
			toastService.success(message);
			onsuccess?.({ message });
			resetForm();
			await loadContacts();
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to save contact';
			toastService.error(message);
			onerror?.({ message });
		} finally {
			savingContact = false;
		}
	}

	function startEdit(contact: ContactRow) {
		editingContactId = contact.id;
		formState = {
			display_name: contact.display_name ?? '',
			given_name: contact.given_name ?? '',
			family_name: contact.family_name ?? '',
			relationship_label: contact.relationship_label ?? '',
			organization: contact.organization ?? '',
			title: contact.title ?? '',
			phone: '',
			email: '',
			notes: contact.notes ?? ''
		};
	}

	function requestArchiveContact(contact: ContactRow) {
		if (!contact?.id) return;
		pendingDelete = { id: contact.id, name: contact.display_name || 'this contact' };
		showDeleteContactConfirmation = true;
	}

	async function confirmArchiveContact() {
		const target = pendingDelete;
		if (!target) {
			showDeleteContactConfirmation = false;
			return;
		}

		try {
			const response = await fetch(`/api/profile/contacts/${target.id}`, {
				method: 'DELETE'
			});
			await parseApiData(response);
			const message = 'Contact archived.';
			toastService.success(message);
			onsuccess?.({ message });
			if (editingContactId === target.id) resetForm();
			await loadContacts();
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to archive contact';
			toastService.error(message);
			onerror?.({ message });
		} finally {
			showDeleteContactConfirmation = false;
			pendingDelete = null;
		}
	}

	function cancelArchiveContact() {
		showDeleteContactConfirmation = false;
		pendingDelete = null;
	}

	function formatMethods(contact: ContactRow): string {
		const methods = Array.isArray(contact.methods) ? contact.methods : [];
		if (methods.length === 0) return 'No methods saved';
		return methods
			.slice(0, 3)
			.map((method) => {
				const methodType = method.method_type || 'method';
				const display = method.value_display || '***';
				return `${methodType}: ${display}`;
			})
			.join(' · ');
	}

	function formatLastUpdated(value?: string | null): string {
		if (!value) return 'Unknown';
		const parsed = new Date(value);
		if (Number.isNaN(parsed.getTime())) return 'Unknown';
		return parsed.toLocaleString();
	}

	function maskPreviewMethodValue(methodType: string, value: string): string {
		if (methodType === 'email') {
			const [local = '', domain = ''] = value.split('@');
			if (!domain) return '***';
			const localMask = local.length <= 1 ? '*' : `${local[0]}***`;
			return `${localMask}@${domain}`;
		}
		if (
			methodType === 'phone' ||
			methodType === 'sms' ||
			methodType === 'whatsapp' ||
			methodType === 'telegram'
		) {
			const digits = value.replace(/\D/g, '');
			if (digits.length <= 4) return '***';
			return `***${digits.slice(-4)}`;
		}
		if (value.length <= 6) return '***';
		return `${value.slice(0, 2)}***${value.slice(-2)}`;
	}

	function formatPreviewMethods(row: ContactImportPreviewRow): string {
		const methods = row.normalized_input?.methods ?? [];
		if (methods.length === 0) return 'No methods';
		return methods
			.map((method) => {
				const methodType = method.method_type || 'method';
				const masked = maskPreviewMethodValue(methodType, method.value);
				return `${methodType}: ${masked}`;
			})
			.join(' · ');
	}

	// Humanize raw enum strings (e.g. "create_new" → "Create new") for the preview table.
	function formatImportLabel(value: string): string {
		if (!value) return '';
		const spaced = value.replace(/_/g, ' ');
		return spaced.charAt(0).toUpperCase() + spaced.slice(1);
	}

	// Reserve color for state: ready = success, error = destructive, otherwise muted.
	function importStatusClass(status: string): string {
		if (status === 'ready') return 'text-success';
		if (status === 'error' || status === 'errors') return 'text-destructive';
		return 'text-muted-foreground';
	}

	function handleFileSelection(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0] ?? null;
		selectedFile = file;
		importPreview = null;
		importCommitResult = null;
		importWarning = null;
	}

	function downloadCsvTemplate() {
		const csvTemplate =
			'display_name,given_name,family_name,relationship_label,organization,title,phone,email,notes\n' +
			'Stacy Chen,Stacy,Chen,teammate,BuildOS,Product Manager,+14155551234,stacy@example.com,Primary project contact\n';
		const blob = new Blob([csvTemplate], { type: 'text/csv;charset=utf-8' });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = 'contacts-import-template.csv';
		document.body.appendChild(anchor);
		anchor.click();
		document.body.removeChild(anchor);
		URL.revokeObjectURL(url);
	}

	async function previewImport() {
		if (!selectedFile || importPreviewLoading) return;
		importPreviewLoading = true;
		importCommitResult = null;
		importWarning = null;

		try {
			const formData = new FormData();
			formData.append('file', selectedFile);
			const response = await fetch('/api/profile/contacts/import/preview', {
				method: 'POST',
				body: formData
			});
			const data = await parseApiData<ContactImportPreviewResult>(response);
			importPreview = data;
			const message = `Preview ready: ${data.summary.ready} row(s) can be imported.`;
			toastService.success(message);
			onsuccess?.({ message });
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to preview CSV import';
			importWarning = message;
			toastService.error(message);
			onerror?.({ message });
		} finally {
			importPreviewLoading = false;
		}
	}

	function getReadyRowsForCommit(): Array<{
		row_number: number;
		action: 'create_new' | 'upsert_existing';
		normalized_input: ContactImportNormalizedInput;
		matched_contact_id?: string;
	}> {
		if (!importPreview) return [];
		return importPreview.rows.flatMap((row) => {
			if (
				row.status !== 'ready' ||
				(row.action !== 'create_new' && row.action !== 'upsert_existing') ||
				!row.normalized_input
			) {
				return [];
			}

			return [
				{
					row_number: row.row_number,
					action: row.action,
					normalized_input: row.normalized_input as ContactImportNormalizedInput,
					...(row.matched_contact_id
						? { matched_contact_id: row.matched_contact_id }
						: {})
				}
			];
		});
	}

	async function commitImport() {
		if (!importPreview || importCommitLoading) return;
		const rows = getReadyRowsForCommit();
		if (rows.length === 0) {
			const message = 'No ready rows to import.';
			toastService.error(message);
			onerror?.({ message });
			return;
		}

		importCommitLoading = true;
		try {
			const response = await fetch('/api/profile/contacts/import/commit', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ rows })
			});
			const data = await parseApiData<ContactImportCommitResult>(response);
			importCommitResult = data;
			await loadContacts();
			const message = `Import complete: ${data.summary.imported} row(s) imported.`;
			toastService.success(message);
			onsuccess?.({ message });
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to import contacts';
			toastService.error(message);
			onerror?.({ message });
		} finally {
			importCommitLoading = false;
		}
	}
</script>

<div class="space-y-4 sm:space-y-5">
	<TabHeader
		icon={Users}
		title="Contacts"
		description="Manage your personal contact memory. Sensitive values stay masked by default."
	/>

	<!-- Add/Edit Contact -->
	<SettingsCard
		title={editingContactId ? 'Edit Contact' : 'Add Contact'}
		icon={Pencil}
		labelledById="contacts-form-heading"
	>
		{#snippet actions()}
			{#if editingContactId}
				<Button variant="ghost" size="sm" onclick={resetForm}>Cancel edit</Button>
			{/if}
		{/snippet}

		<form class="space-y-4" onsubmit={submitContactForm}>
			<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
				<FormField label="Display name" labelFor="contact-display-name" required={true}>
					<TextInput
						id="contact-display-name"
						bind:value={formState.display_name}
						placeholder="Display name"
						required
					/>
				</FormField>
				<FormField label="Relationship" labelFor="contact-relationship">
					<TextInput
						id="contact-relationship"
						bind:value={formState.relationship_label}
						placeholder="e.g. teammate, client"
					/>
				</FormField>
				<FormField label="Given name" labelFor="contact-given-name">
					<TextInput
						id="contact-given-name"
						bind:value={formState.given_name}
						placeholder="Given name"
					/>
				</FormField>
				<FormField label="Family name" labelFor="contact-family-name">
					<TextInput
						id="contact-family-name"
						bind:value={formState.family_name}
						placeholder="Family name"
					/>
				</FormField>
				<FormField label="Organization" labelFor="contact-organization">
					<TextInput
						id="contact-organization"
						bind:value={formState.organization}
						placeholder="Organization"
					/>
				</FormField>
				<FormField label="Title" labelFor="contact-title">
					<TextInput
						id="contact-title"
						bind:value={formState.title}
						placeholder="Title"
					/>
				</FormField>
				<FormField label="Phone" labelFor="contact-phone">
					<TextInput
						id="contact-phone"
						bind:value={formState.phone}
						type="tel"
						placeholder="Phone (optional)"
					/>
				</FormField>
				<FormField label="Email" labelFor="contact-email">
					<TextInput
						id="contact-email"
						bind:value={formState.email}
						type="email"
						placeholder="Email (optional)"
					/>
				</FormField>
			</div>
			<FormField label="Notes" labelFor="contact-notes">
				<Textarea
					id="contact-notes"
					bind:value={formState.notes}
					placeholder="Notes (optional)"
					rows={3}
					autoResize
				/>
			</FormField>
			{#if editingContactId}
				<p class="text-xs text-muted-foreground">
					Existing method values remain masked. Add a new phone/email value here if you
					need to update methods.
				</p>
			{/if}
			<div class="flex justify-end">
				<Button
					type="submit"
					variant="primary"
					size="sm"
					loading={savingContact}
					icon={Plus}
				>
					{editingContactId ? 'Save changes' : 'Add contact'}
				</Button>
			</div>
		</form>
	</SettingsCard>

	<!-- Bulk Upload -->
	<SettingsCard
		title="Bulk Upload (CSV)"
		icon={Upload}
		labelledById="contacts-bulk-upload-heading"
	>
		{#snippet actions()}
			<Button variant="outline" size="sm" onclick={downloadCsvTemplate} icon={Download}>
				Download template
			</Button>
		{/snippet}

		<div class="space-y-4">
			<FormField label="CSV File" labelFor="contacts-csv-input">
				<input
					id="contacts-csv-input"
					type="file"
					accept=".csv,text/csv"
					onchange={handleFileSelection}
					class="block w-full text-sm text-foreground rounded-md file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-accent file:text-accent-foreground hover:file:bg-accent/90 file:cursor-pointer file:transition-colors file:shadow-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
				/>
			</FormField>

			<div class="flex flex-wrap items-center justify-end gap-2">
				<Button
					variant="outline"
					size="sm"
					icon={Upload}
					disabled={!selectedFile}
					loading={importPreviewLoading}
					onclick={previewImport}
				>
					Preview import
				</Button>
				<Button
					variant="primary"
					size="sm"
					icon={FileText}
					disabled={!importPreview || getReadyRowsForCommit().length === 0}
					loading={importCommitLoading}
					onclick={commitImport}
				>
					Confirm import
				</Button>
			</div>

			{#if importWarning}
				<p class="text-xs text-destructive">{importWarning}</p>
			{/if}

			{#if importPreview}
				<div class="space-y-3">
					<p class="text-sm text-muted-foreground">
						Rows: {importPreview.summary.total} · Ready: {importPreview.summary.ready} ·
						Skipped:
						{importPreview.summary.skipped} · Errors: {importPreview.summary.errors}
					</p>
					<div class="max-h-64 overflow-auto border border-border rounded-md">
						<table class="w-full min-w-[640px] text-sm">
							<thead class="bg-muted/60 text-left sticky top-0">
								<tr>
									<th class="px-3 py-2">Row</th>
									<th class="px-3 py-2">Contact</th>
									<th class="px-3 py-2">Methods (masked)</th>
									<th class="px-3 py-2">Status</th>
									<th class="px-3 py-2">Action</th>
									<th class="px-3 py-2">Reason</th>
								</tr>
							</thead>
							<tbody>
								{#each importPreview.rows as row (`import-preview-${row.row_number}`)}
									<tr class="border-t border-border">
										<td class="px-3 py-2">{row.row_number}</td>
										<td class="px-3 py-2">
											{row.normalized_input?.display_name ?? 'Unknown'}
										</td>
										<td class="px-3 py-2 text-muted-foreground">
											{formatPreviewMethods(row)}
										</td>
										<td class="px-3 py-2">
											<span
												class="font-medium {importStatusClass(row.status)}"
											>
												{formatImportLabel(row.status)}
											</span>
										</td>
										<td class="px-3 py-2 text-muted-foreground">
											{formatImportLabel(row.action)}
										</td>
										<td class="px-3 py-2 text-muted-foreground">
											{row.reason ??
												(row.matched_contact_name
													? `Matched ${row.matched_contact_name}`
													: 'Ready')}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</div>
			{/if}

			{#if importCommitResult}
				<p class="text-sm text-muted-foreground">
					Imported: {importCommitResult.summary.imported} · Failed: {importCommitResult
						.summary.failed}
				</p>
			{/if}
		</div>
	</SettingsCard>

	<!-- Saved Contacts -->
	<SettingsCard
		title="Saved Contacts"
		description="{contacts.length} total"
		icon={Users}
		labelledById="contacts-saved-heading"
	>
		{#snippet actions()}
			<Button variant="outline" size="sm" onclick={loadContacts} icon={RefreshCw}>
				Refresh
			</Button>
		{/snippet}

		{#if loadingContacts}
			<p class="text-sm text-muted-foreground">Loading contacts...</p>
		{:else if contacts.length === 0}
			<p class="text-sm text-muted-foreground">
				No contacts yet. Add one manually or upload a CSV file.
			</p>
		{:else}
			<div class="space-y-2">
				{#each contacts as contact (contact.id)}
					<div
						class="border border-border rounded-md p-3 hover:border-accent/50 transition-colors"
					>
						<div class="flex flex-wrap items-start justify-between gap-3">
							<div class="min-w-0">
								<p class="font-semibold text-sm text-foreground truncate">
									{contact.display_name}
								</p>
								<p class="text-xs text-muted-foreground mt-0.5 truncate">
									{contact.relationship_label || 'No relationship'} · {contact.organization ||
										'No org'}
								</p>
								<p class="text-xs text-muted-foreground mt-0.5 truncate">
									{formatMethods(contact)}
								</p>
								<p class="text-xs text-muted-foreground/70 mt-0.5 truncate">
									Updated {formatLastUpdated(contact.updated_at)}
								</p>
							</div>
							<div class="flex items-center gap-1.5">
								<Button
									variant="ghost"
									size="sm"
									icon={Pencil}
									onclick={() => startEdit(contact)}
								>
									Edit
								</Button>
								<Button
									variant="danger"
									size="sm"
									icon={Trash2}
									onclick={() => requestArchiveContact(contact)}
								>
									Archive
								</Button>
							</div>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</SettingsCard>
</div>

<!-- Archive Confirmation Modal -->
<ConfirmationModal
	isOpen={showDeleteContactConfirmation}
	title="Delete contact"
	confirmText="Delete"
	cancelText="Cancel"
	confirmVariant="danger"
	onconfirm={confirmArchiveContact}
	oncancel={cancelArchiveContact}
>
	Archive {pendingDelete?.name ?? 'this contact'}? You can still view archived contacts via API.
</ConfirmationModal>
