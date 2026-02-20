<!-- apps/web/src/lib/components/email/ImageUploadModal.svelte -->
<script lang="ts">
	import { browser } from '$app/environment';
	import { Upload, Image as ImageIcon, Trash2, Eye, Search } from 'lucide-svelte';
	import Modal from '../ui/Modal.svelte';
	import TextInput from '../ui/TextInput.svelte';
	import Select from '../ui/Select.svelte';
	import Button from '../ui/Button.svelte';

	interface EmailImage {
		id: string;
		url: string;
		filename: string;
		original_filename: string;
		file_size: number;
		storage_path: string;
	}

	interface Props {
		isOpen?: boolean;
		emailId?: string | null;
		onImageSelected?: (image: EmailImage) => void;
		onClose?: () => void;
	}

	let { isOpen = $bindable(false), emailId = null, onImageSelected, onClose }: Props = $props();

	let activeTab = $state<'upload' | 'gallery'>('upload');
	let isLoading = $state(false);
	let isUploading = $state(false);
	let error = $state<string | null>(null);
	let searchQuery = $state('');
	let selectedFilter = $state('all');

	let dragActive = $state(false);
	let fileInput = $state<HTMLInputElement | null>(null);
	let uploadedFile = $state<File | null>(null);
	let uploadPreview = $state<string | null>(null);

	let images = $state<EmailImage[]>([]);

	const filteredImages = $derived.by(() =>
		images.filter((image) => {
			const matchesSearch =
				searchQuery === '' ||
				image.filename?.toLowerCase().includes(searchQuery.toLowerCase()) ||
				image.original_filename?.toLowerCase().includes(searchQuery.toLowerCase());

			const matchesFilter =
				selectedFilter === 'all' ||
				(selectedFilter === 'email' && image.storage_path?.includes(`emails/${emailId}`)) ||
				(selectedFilter === 'shared' && image.storage_path?.includes('shared'));

			return matchesSearch && matchesFilter;
		})
	);

	$effect(() => {
		if (browser && isOpen) {
			void loadImages();
			activeTab = 'upload';
			clearUpload();
		}
	});

	async function loadImages() {
		isLoading = true;
		error = null;

		try {
			const params = new URLSearchParams({ images_only: 'true' });
			const response = await fetch(`/api/admin/emails/attachments?${params}`);
			const result = await response.json();

			if (!result?.success) {
				throw new Error(result?.error?.[0] || 'Failed to load images');
			}

			images = result.data?.attachments || [];
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load images';
		} finally {
			isLoading = false;
		}
	}

	function handleFileSelect(event: Event) {
		const target = event.currentTarget as HTMLInputElement;
		const files = target.files;
		if (files && files.length > 0) {
			handleFiles(files);
		}
	}

	function handleFiles(files: FileList) {
		const file = files[0];
		if (!file) return;

		if (!file.type.startsWith('image/')) {
			error = 'Please select an image file';
			return;
		}

		if (file.size > 10 * 1024 * 1024) {
			error = 'File size must be less than 10MB';
			return;
		}

		uploadedFile = file;
		error = null;

		const reader = new FileReader();
		reader.onload = (e) => {
			uploadPreview = e.target?.result as string;
		};
		reader.readAsDataURL(file);
	}

	function handleDragOver(event: DragEvent) {
		event.preventDefault();
		dragActive = true;
	}

	function handleDragLeave() {
		dragActive = false;
	}

	function handleDrop(event: DragEvent) {
		event.preventDefault();
		dragActive = false;

		const files = event.dataTransfer?.files;
		if (files && files.length > 0) {
			handleFiles(files);
		}
	}

	async function uploadImage() {
		if (!uploadedFile) return;

		isUploading = true;
		error = null;

		try {
			const formData = new FormData();
			formData.append('file', uploadedFile);
			formData.append('is_inline', 'true');

			if (emailId) {
				formData.append('email_id', emailId);
			} else {
				formData.append('is_shared', 'true');
			}

			const response = await fetch('/api/admin/emails/attachments', {
				method: 'POST',
				body: formData
			});

			if (!response.ok) throw new Error('Failed to upload image');

			const result = await response.json();

			if (result.success) {
				const attachment = result.data?.attachment || result.attachment;
				images = [attachment, ...images];
				clearUpload();
				activeTab = 'gallery';
			} else {
				throw new Error(result.error || 'Failed to upload image');
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to upload image';
		} finally {
			isUploading = false;
		}
	}

	function clearUpload() {
		uploadedFile = null;
		uploadPreview = null;
		if (fileInput) {
			fileInput.value = '';
		}
	}

	function selectImage(image: EmailImage) {
		onImageSelected?.(image);
	}

	async function deleteImage(image: EmailImage) {
		if (!confirm('Are you sure you want to delete this image?')) return;

		try {
			const response = await fetch(`/api/admin/emails/attachments?id=${image.id}`, {
				method: 'DELETE'
			});

			if (!response.ok) throw new Error('Failed to delete image');

			images = images.filter((img) => img.id !== image.id);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to delete image';
		}
	}

	function formatFileSize(bytes: number): string {
		if (bytes === 0) return '0 Bytes';
		const k = 1024;
		const sizes = ['Bytes', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
	}

	function close() {
		isOpen = false;
		onClose?.();
	}
</script>

<Modal {isOpen} onClose={close} title="Insert Image" size="xl">
	{#snippet children()}
		<div class="space-y-3 px-3 py-3 sm:space-y-4 sm:px-4 sm:py-4 lg:px-6">
			{#if error}
				<div class="rounded-md border border-destructive/40 bg-destructive/10 p-3">
					<p class="text-sm text-destructive">{error}</p>
				</div>
			{/if}

			<div class="border-b border-border">
				<nav class="-mb-px flex space-x-6 sm:space-x-8">
					<button
						type="button"
						class="border-b-2 px-1 pb-2 text-sm font-medium transition-colors {activeTab ===
						'upload'
							? 'border-accent text-accent'
							: 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'}"
						onclick={() => (activeTab = 'upload')}
					>
						<Upload class="mr-2 inline h-4 w-4" />
						Upload New
					</button>
					<button
						type="button"
						class="border-b-2 px-1 pb-2 text-sm font-medium transition-colors {activeTab ===
						'gallery'
							? 'border-accent text-accent'
							: 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'}"
						onclick={() => (activeTab = 'gallery')}
					>
						<ImageIcon class="mr-2 inline h-4 w-4" />
						Gallery ({images.length})
					</button>
				</nav>
			</div>

			{#if activeTab === 'upload'}
				<div class="space-y-4">
					<div
						class="rounded-lg border-2 border-dashed p-8 text-center transition-colors {dragActive
							? 'border-accent bg-accent/10'
							: 'border-border hover:border-muted-foreground'}"
						role="button"
						tabindex="0"
						aria-label="Drag and drop image upload area"
						onclick={() => fileInput?.click()}
						ondragover={handleDragOver}
						ondragleave={handleDragLeave}
						ondrop={handleDrop}
						onkeydown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault();
								fileInput?.click();
							}
						}}
					>
						{#if uploadPreview}
							<div class="space-y-4">
								<div class="flex justify-center">
									<img
										src={uploadPreview}
										alt="Upload preview"
										class="max-h-48 max-w-full rounded-lg shadow-ink"
									/>
								</div>
								<div class="text-sm text-muted-foreground">
									<p class="font-medium">{uploadedFile?.name}</p>
									<p>{formatFileSize(uploadedFile?.size || 0)}</p>
								</div>
								<div
									class="flex flex-col justify-center gap-3 sm:flex-row sm:space-x-3"
								>
									<Button
										onclick={uploadImage}
										disabled={isUploading}
										variant="secondary"
										size="md"
										class="w-full sm:w-auto"
									>
										{isUploading ? 'Uploading...' : 'Upload Image'}
									</Button>
									<Button
										onclick={clearUpload}
										disabled={isUploading}
										variant="ghost"
										size="md"
										class="w-full sm:w-auto"
									>
										Clear
									</Button>
								</div>
							</div>
						{:else}
							<div class="space-y-4">
								<div class="mx-auto h-12 w-12 text-muted-foreground">
									<Upload class="h-12 w-12" />
								</div>
								<div>
									<p class="text-lg font-medium text-foreground">
										Upload an image
									</p>
									<p class="text-sm text-muted-foreground">
										Drag and drop or click to select
									</p>
								</div>
								<div class="text-xs text-muted-foreground">
									Supports: JPG, PNG, GIF, WebP (Max 10MB)
								</div>
								<Button
									onclick={() => fileInput?.click()}
									variant="secondary"
									size="md"
								>
									Select Image
								</Button>
							</div>
						{/if}
					</div>

					<input
						bind:this={fileInput}
						type="file"
						accept="image/*"
						onchange={handleFileSelect}
						class="hidden"
					/>
				</div>
			{/if}

			{#if activeTab === 'gallery'}
				<div class="space-y-4">
					<div
						class="flex flex-col space-y-2 sm:flex-row sm:items-center sm:justify-between sm:space-y-0"
					>
						<div class="relative flex-1 sm:max-w-sm">
							<Search
								class="absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground"
							/>
							<TextInput
								bind:value={searchQuery}
								placeholder="Search images..."
								size="md"
								class="pl-10 text-xs sm:text-sm"
							/>
						</div>

						<div class="flex items-center space-x-2">
							<div class="text-sm font-medium text-foreground">Filter:</div>
							<Select
								bind:value={selectedFilter}
								size="md"
								class="text-xs sm:text-sm"
								onchange={(e) => (selectedFilter = e)}
							>
								<option value="all">All Images</option>
								<option value="email">This Email</option>
								<option value="shared">Shared</option>
							</Select>
						</div>
					</div>

					{#if isLoading}
						<div class="flex justify-center py-8">
							<div
								class="h-8 w-8 animate-spin rounded-full border-b-2 border-accent"
							></div>
						</div>
					{:else if filteredImages.length === 0}
						<div class="py-8 text-center">
							<ImageIcon class="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
							<p class="text-muted-foreground">
								{searchQuery
									? 'No images match your search'
									: 'No images uploaded yet'}
							</p>
						</div>
					{:else}
						<div
							class="grid max-h-80 grid-cols-2 gap-3 overflow-y-auto sm:max-h-96 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5"
						>
							{#each filteredImages as image}
								<div
									class="group relative overflow-hidden rounded-lg border border-border transition-shadow hover:shadow-ink"
								>
									<div class="aspect-square bg-muted">
										<img
											src={image.url}
											alt={image.original_filename}
											class="h-full w-full object-cover"
										/>
									</div>

									<div
										class="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/50"
									>
										<div
											class="flex space-x-2 opacity-0 transition-opacity group-hover:opacity-100"
										>
											<Button
												onclick={() => selectImage(image)}
												variant="secondary"
												size="sm"
												class="rounded-full p-3"
												title="Select image"
											>
												<Eye class="h-4 w-4 sm:h-5 sm:w-5" />
											</Button>
											<Button
												onclick={() => deleteImage(image)}
												variant="danger"
												size="sm"
												class="rounded-full p-3"
												title="Delete image"
											>
												<Trash2 class="h-4 w-4 sm:h-5 sm:w-5" />
											</Button>
										</div>
									</div>

									<div class="bg-card p-2">
										<p class="truncate text-xs font-medium text-foreground">
											{image.original_filename}
										</p>
										<p class="text-xs text-muted-foreground">
											{formatFileSize(image.file_size)}
										</p>
										{#if image.storage_path?.includes('shared')}
											<span
												class="mt-0.5 inline-flex rounded bg-accent/15 px-1 py-0.5 text-xs font-medium text-accent"
											>
												Shared
											</span>
										{/if}
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/if}
		</div>
	{/snippet}

	{#snippet footer()}
		<div
			class="flex justify-end px-3 py-3 sm:px-4 sm:py-4 lg:px-6 border-t border-border bg-muted/30"
		>
			<Button onclick={close} variant="ghost" size="md" class="w-full sm:w-auto">
				Cancel
			</Button>
		</div>
	{/snippet}
</Modal>
