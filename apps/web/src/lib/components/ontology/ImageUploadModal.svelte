<!-- apps/web/src/lib/components/ontology/ImageUploadModal.svelte -->
<script lang="ts">
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { toastService } from '$lib/stores/toast.store';
	import { Upload, X } from 'lucide-svelte';
	import type { AssetLinkRole, OntologyImageAsset } from './image-assets/types';

	interface Props {
		isOpen?: boolean;
		projectId: string;
		entityKind?: string | null;
		entityId?: string | null;
		linkRole?: AssetLinkRole;
		onUploaded?: (asset: OntologyImageAsset) => void;
		onClose?: () => void;
	}

	let {
		isOpen = $bindable(false),
		projectId,
		entityKind = null,
		entityId = null,
		linkRole = 'attachment',
		onUploaded,
		onClose
	}: Props = $props();

	let fileInput = $state<HTMLInputElement | null>(null);
	let selectedFile = $state<File | null>(null);
	let uploading = $state(false);
	let caption = $state('');
	let altText = $state('');
	let previewUrl = $state<string | null>(null);
	let formError = $state<string | null>(null);

	$effect(() => {
		if (!isOpen) {
			resetForm();
		}
	});

	$effect(() => {
		return () => {
			if (previewUrl) {
				URL.revokeObjectURL(previewUrl);
			}
		};
	});

	function resetForm() {
		selectedFile = null;
		caption = '';
		altText = '';
		formError = null;
		if (previewUrl) {
			URL.revokeObjectURL(previewUrl);
			previewUrl = null;
		}
		if (fileInput) {
			fileInput.value = '';
		}
	}

	function closeModal() {
		if (uploading) return;
		isOpen = false;
		onClose?.();
	}

	function onFileSelected(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0] ?? null;
		if (!file) {
			selectedFile = null;
			return;
		}
		if (!file.type.startsWith('image/')) {
			formError = 'Please choose an image file';
			selectedFile = null;
			input.value = '';
			return;
		}
		selectedFile = file;
		formError = null;
		if (previewUrl) URL.revokeObjectURL(previewUrl);
		previewUrl = URL.createObjectURL(file);
	}

	async function maybeLinkAsset(assetId: string) {
		if (!entityKind || !entityId) return;
		const linkResponse = await fetch(`/api/onto/assets/${assetId}/links`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				entity_kind: entityKind,
				entity_id: entityId,
				role: linkRole
			})
		});
		const linkPayload = await linkResponse.json().catch(() => null);
		if (!linkResponse.ok) {
			throw new Error(linkPayload?.error ?? 'Failed to attach uploaded image');
		}
	}

	async function handleUpload() {
		if (!selectedFile) {
			formError = 'Select an image file first';
			return;
		}
		uploading = true;
		formError = null;
		try {
			const createResponse = await fetch('/api/onto/assets', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					project_id: projectId,
					file_name: selectedFile.name,
					content_type: selectedFile.type || 'image/jpeg',
					file_size_bytes: selectedFile.size,
					alt_text: altText.trim() || null,
					caption: caption.trim() || null
				})
			});
			const createPayload = await createResponse.json().catch(() => null);
			if (!createResponse.ok) {
				throw new Error(createPayload?.error ?? 'Failed to create image upload');
			}

			const asset = createPayload?.data?.asset as OntologyImageAsset | undefined;
			const uploadUrl = createPayload?.data?.upload?.signed_url as string | undefined;
			if (!asset?.id || !uploadUrl) {
				throw new Error('Upload metadata missing from server response');
			}

			const uploadResponse = await fetch(uploadUrl, {
				method: 'PUT',
				headers: {
					'Content-Type': selectedFile.type || 'application/octet-stream'
				},
				body: selectedFile
			});
			if (!uploadResponse.ok) {
				throw new Error('Storage upload failed');
			}

			const completeResponse = await fetch(`/api/onto/assets/${asset.id}/complete`, {
				method: 'POST'
			});
			const completePayload = await completeResponse.json().catch(() => null);
			if (!completeResponse.ok) {
				throw new Error(completePayload?.error ?? 'Failed to finalize uploaded image');
			}

			await maybeLinkAsset(asset.id);
			onUploaded?.((completePayload?.data?.asset as OntologyImageAsset) ?? asset);
			toastService.success('Image uploaded');
			closeModal();
		} catch (error) {
			formError = error instanceof Error ? error.message : 'Failed to upload image';
			toastService.error(formError);
		} finally {
			uploading = false;
		}
	}
</script>

<Modal bind:isOpen title="Upload Image" size="md" onClose={closeModal}>
	{#snippet children()}
		<div class="space-y-3 px-3 py-2 sm:px-4 sm:py-3">
			{#if formError}
				<p
					class="rounded border border-destructive/40 bg-destructive/10 px-2 py-1 text-xs text-destructive"
				>
					{formError}
				</p>
			{/if}

			<div class="space-y-2">
				<label
					class="text-xs font-medium text-muted-foreground"
					for="onto-image-upload-input"
				>
					Image file
				</label>
				<input
					bind:this={fileInput}
					id="onto-image-upload-input"
					type="file"
					accept="image/*"
					class="block w-full rounded border border-border bg-background px-2 py-1.5 text-xs text-foreground"
					onchange={onFileSelected}
				/>
			</div>

			{#if previewUrl}
				<div class="rounded border border-border bg-muted/30 p-2">
					<img
						src={previewUrl}
						alt="Selected preview"
						class="max-h-48 w-full rounded object-contain"
					/>
					<p class="mt-1 truncate text-[11px] text-muted-foreground">
						{selectedFile?.name}
					</p>
				</div>
			{/if}

			<div class="space-y-1.5">
				<label class="text-xs font-medium text-muted-foreground" for="onto-image-caption">
					Caption (optional)
				</label>
				<input
					id="onto-image-caption"
					type="text"
					class="w-full rounded border border-border bg-background px-2 py-1.5 text-xs text-foreground"
					bind:value={caption}
					placeholder="Team whiteboard sketch"
				/>
			</div>

			<div class="space-y-1.5">
				<label class="text-xs font-medium text-muted-foreground" for="onto-image-alt-text">
					Alt text (optional)
				</label>
				<input
					id="onto-image-alt-text"
					type="text"
					class="w-full rounded border border-border bg-background px-2 py-1.5 text-xs text-foreground"
					bind:value={altText}
					placeholder="Construction progress photo"
				/>
			</div>
		</div>
	{/snippet}

	{#snippet footer()}
		<div class="flex items-center justify-end gap-2">
			<Button size="sm" variant="ghost" class="h-8 px-2 text-xs" onclick={closeModal}>
				<X class="h-3.5 w-3.5" />
				Cancel
			</Button>
			<Button
				size="sm"
				variant="secondary"
				class="h-8 px-2 text-xs"
				disabled={!selectedFile || uploading}
				onclick={handleUpload}
			>
				<Upload class="h-3.5 w-3.5" />
				{uploading ? 'Uploading...' : 'Upload image'}
			</Button>
		</div>
	{/snippet}
</Modal>
