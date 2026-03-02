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

	async function archiveContact(contactId: string) {
		if (!contactId) return;
		if (
			!window.confirm('Archive this contact? You can still view archived contacts via API.')
		) {
			return;
		}

		try {
			const response = await fetch(`/api/profile/contacts/${contactId}`, {
				method: 'DELETE'
			});
			await parseApiData(response);
			const message = 'Contact archived.';
			toastService.success(message);
			onsuccess?.({ message });
			if (editingContactId === contactId) resetForm();
			await loadContacts();
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to archive contact';
			toastService.error(message);
			onerror?.({ message });
		}
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
		return importPreview.rows
			.filter(
				(row) =>
					row.status === 'ready' &&
					(row.action === 'create_new' || row.action === 'upsert_existing') &&
					row.normalized_input
			)
			.map((row) => ({
				row_number: row.row_number,
				action: row.action,
				normalized_input: row.normalized_input as ContactImportNormalizedInput,
				...(row.matched_contact_id ? { matched_contact_id: row.matched_contact_id } : {})
			}));
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

<div class="space-y-4 sm:space-y-6">
	<div class="flex items-start gap-3 sm:gap-4">
		<div
			class="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-accent shadow-ink flex-shrink-0"
		>
			<Users class="w-5 h-5 sm:w-6 sm:h-6 text-accent-foreground" />
		</div>
		<div class="flex-1 min-w-0">
			<h2 class="text-lg sm:text-2xl font-bold text-foreground">Contacts</h2>
			<p class="text-xs sm:text-base text-muted-foreground mt-1">
				Manage your personal contact memory. Sensitive values stay masked by default.
			</p>
		</div>
		<Button variant="outline" size="sm" onclick={loadContacts} icon={RefreshCw}>Refresh</Button>
	</div>

	<div class="bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak p-4 sm:p-6">
		<div class="flex items-center justify-between gap-3 mb-4">
			<h3 class="text-base sm:text-lg font-semibold text-foreground">
				{editingContactId ? 'Edit Contact' : 'Add Contact'}
			</h3>
			{#if editingContactId}
				<Button variant="ghost" size="sm" onclick={resetForm}>Cancel edit</Button>
			{/if}
		</div>

		<form class="space-y-3" onsubmit={submitContactForm}>
			<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
				<TextInput
					bind:value={formState.display_name}
					placeholder="Display name"
					required
				/>
				<TextInput
					bind:value={formState.relationship_label}
					placeholder="Relationship label"
				/>
				<TextInput bind:value={formState.given_name} placeholder="Given name" />
				<TextInput bind:value={formState.family_name} placeholder="Family name" />
				<TextInput bind:value={formState.organization} placeholder="Organization" />
				<TextInput bind:value={formState.title} placeholder="Title" />
				<TextInput bind:value={formState.phone} type="tel" placeholder="Phone (optional)" />
				<TextInput
					bind:value={formState.email}
					type="email"
					placeholder="Email (optional)"
				/>
			</div>
			<Textarea
				bind:value={formState.notes}
				placeholder="Notes (optional)"
				rows={3}
				autoResize
			/>
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
	</div>

	<div class="bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak p-4 sm:p-6">
		<div class="flex flex-wrap items-center justify-between gap-3 mb-4">
			<h3 class="text-base sm:text-lg font-semibold text-foreground">Bulk Upload (CSV)</h3>
			<Button variant="outline" size="sm" onclick={downloadCsvTemplate} icon={Download}>
				Download template
			</Button>
		</div>

		<div class="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-3 items-center">
			<input
				type="file"
				accept=".csv,text/csv"
				onchange={handleFileSelection}
				class="text-sm"
			/>
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
			<p class="text-xs text-destructive mt-3">{importWarning}</p>
		{/if}

		{#if importPreview}
			<div class="mt-4 space-y-3">
				<p class="text-sm text-muted-foreground">
					Rows: {importPreview.summary.total} · Ready: {importPreview.summary.ready} · Skipped:
					{importPreview.summary.skipped} · Errors: {importPreview.summary.errors}
				</p>
				<div class="max-h-64 overflow-auto border border-border rounded-md">
					<table class="w-full text-sm">
						<thead class="bg-muted/60 text-left">
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
									<td class="px-3 py-2">{row.status}</td>
									<td class="px-3 py-2">{row.action}</td>
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
			<p class="text-sm text-muted-foreground mt-3">
				Imported: {importCommitResult.summary.imported} · Failed: {importCommitResult
					.summary.failed}
			</p>
		{/if}
	</div>

	<div class="bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak p-4 sm:p-6">
		<div class="flex items-center justify-between gap-3 mb-4">
			<h3 class="text-base sm:text-lg font-semibold text-foreground">Saved Contacts</h3>
			<p class="text-xs text-muted-foreground">{contacts.length} total</p>
		</div>

		{#if loadingContacts}
			<p class="text-sm text-muted-foreground">Loading contacts...</p>
		{:else if contacts.length === 0}
			<p class="text-sm text-muted-foreground">
				No contacts yet. Add one manually or upload a CSV file.
			</p>
		{:else}
			<div class="space-y-3">
				{#each contacts as contact (contact.id)}
					<div class="border border-border rounded-md p-3">
						<div class="flex flex-wrap items-start justify-between gap-3">
							<div class="min-w-0">
								<p class="font-semibold text-foreground">{contact.display_name}</p>
								<p class="text-xs text-muted-foreground mt-1">
									{contact.relationship_label || 'No relationship'} · {contact.organization ||
										'No org'}
								</p>
								<p class="text-xs text-muted-foreground mt-1">
									{formatMethods(contact)}
								</p>
								<p class="text-xs text-muted-foreground mt-1">
									Last updated: {formatLastUpdated(contact.updated_at)}
								</p>
							</div>
							<div class="flex items-center gap-2">
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
									onclick={() => archiveContact(contact.id)}
								>
									Archive
								</Button>
							</div>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>
