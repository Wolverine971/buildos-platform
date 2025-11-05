<!-- apps/web/src/lib/components/email/ImageUploadModal.svelte -->
<script lang="ts">
	import { onMount, createEventDispatcher } from 'svelte';
	import { Upload, Image as ImageIcon, Trash2, Eye, X, Search } from 'lucide-svelte';
	import Modal from '../ui/Modal.svelte';
	import FormField from '../ui/FormField.svelte';
	import TextInput from '../ui/TextInput.svelte';
	import Textarea from '../ui/Textarea.svelte';
	import Select from '../ui/Select.svelte';
	import Button from '../ui/Button.svelte';

	export let isOpen: boolean = false;
	export let emailId: string | null = null;

	const dispatch = createEventDispatcher();

	let activeTab: 'upload' | 'gallery' = 'upload';
	let isLoading = false;
	let isUploading = false;
	let error: string | null = null;
	let searchQuery = '';
	let selectedFilter = 'all'; // all, email, shared

	// Upload state
	let dragActive = false;
	let fileInput: HTMLInputElement;
	let uploadedFile: File | null = null;
	let uploadPreview: string | null = null;

	// Gallery state
	let images: any[] = [];
	let filteredImages: any[] = [];

	onMount(() => {
		if (isOpen) {
			loadImages();
		}
	});

	// Watch for open state changes
	$: if (isOpen) {
		loadImages();
		activeTab = 'upload';
		clearUpload();
	}

	// Filter images based on search and filter
	$: {
		filteredImages = images.filter((image) => {
			const matchesSearch =
				searchQuery === '' ||
				image.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
				image.original_filename.toLowerCase().includes(searchQuery.toLowerCase());

			const matchesFilter =
				selectedFilter === 'all' ||
				(selectedFilter === 'email' && image.storage_path.includes(`emails/${emailId}`)) ||
				(selectedFilter === 'shared' && image.storage_path.includes('shared'));

			return matchesSearch && matchesFilter;
		});
	}

	async function loadImages() {
		isLoading = true;
		error = null;

		try {
			const params = new URLSearchParams({
				images_only: 'true'
			});

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
		const target = event.target as HTMLInputElement;
		const files = target.files;
		if (files && files.length > 0) {
			handleFiles(files);
		}
	}

	function handleFiles(files: FileList) {
		const file = files[0];
		if (!file) return;

		// Validate file type
		if (!file.type.startsWith('image/')) {
			error = 'Please select an image file';
			return;
		}

		// Validate file size (10MB limit)
		if (file.size > 10 * 1024 * 1024) {
			error = 'File size must be less than 10MB';
			return;
		}

		uploadedFile = file;
		error = null;

		// Create preview
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
				// Add to images list
				const attachment = result.data?.attachment || result.attachment;
				images = [attachment, ...images];

				// Clear upload state
				clearUpload();

				// Switch to gallery tab
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

	function selectImage(image: any) {
		dispatch('imageSelected', image);
	}

	async function deleteImage(image: any) {
		if (!confirm('Are you sure you want to delete this image?')) return;

		try {
			const response = await fetch(`/api/admin/emails/attachments?id=${image.id}`, {
				method: 'DELETE'
			});

			if (!response.ok) throw new Error('Failed to delete image');

			// Remove from images list
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
		dispatch('close');
	}
</script>

<Modal {isOpen} onClose={close} title="Insert Image" size="xl">
	<div class="px-3 sm:px-4 lg:px-6 py-3 sm:py-4 space-y-3 sm:space-y-4">
		<!-- Error Message -->
		{#if error}
			<div
				class="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-md p-3"
			>
				<p class="text-rose-800 dark:text-rose-200 text-sm">{error}</p>
			</div>
		{/if}

		<!-- Tabs -->
		<div class="border-b border-gray-200 dark:border-gray-700">
			<nav class="-mb-px flex space-x-6 sm:space-x-8">
				<Button
					onclick={() => (activeTab = 'upload')}
					variant="ghost"
					size="md"
					class="border-b-2 font-medium {activeTab === 'upload'
						? 'border-primary-500 text-primary-600 dark:text-primary-400'
						: 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'}"
				>
					<Upload class="h-4 w-4 inline mr-2" />
					Upload New
				</Button>
				<Button
					onclick={() => (activeTab = 'gallery')}
					variant="ghost"
					size="md"
					class="border-b-2 font-medium {activeTab === 'gallery'
						? 'border-primary-500 text-primary-600 dark:text-primary-400'
						: 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'}"
				>
					<ImageIcon class="h-4 w-4 inline mr-2" />
					Gallery ({images.length})
				</Button>
			</nav>
		</div>

		<!-- Upload Tab -->
		{#if activeTab === 'upload'}
			<div class="space-y-4">
				<!-- Upload Area -->
				<div
					class="border-2 border-dashed rounded-lg p-8 text-center {dragActive
						? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
						: 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'}"
					ondragover={handleDragOver}
					ondragleave={handleDragLeave}
					ondrop={handleDrop}
				>
					{#if uploadPreview}
						<!-- Upload Preview -->
						<div class="space-y-4">
							<div class="flex justify-center">
								<img
									src={uploadPreview}
									alt="Upload preview"
									class="max-w-full max-h-48 rounded-lg shadow-md"
								/>
							</div>
							<div class="text-sm text-gray-600 dark:text-gray-400">
								<p class="font-medium">{uploadedFile?.name}</p>
								<p>{formatFileSize(uploadedFile?.size || 0)}</p>
							</div>
							<div
								class="flex flex-col sm:flex-row justify-center gap-3 sm:space-x-3"
							>
								<Button
									onclick={uploadImage}
									disabled={isUploading}
									variant="primary"
									size="md"
									loading={isUploading}
									class="w-full sm:w-auto"
								>
									{isUploading ? 'Uploading...' : 'Upload Image'}
								</Button>
								<Button
									onclick={clearUpload}
									disabled={isUploading}
									variant="outline"
									size="md"
									class="w-full sm:w-auto"
								>
									Clear
								</Button>
							</div>
						</div>
					{:else}
						<!-- Upload Prompt -->
						<div class="space-y-4">
							<div class="mx-auto h-12 w-12 text-gray-400">
								<Upload class="h-12 w-12" />
							</div>
							<div>
								<p class="text-lg font-medium text-gray-900 dark:text-white">
									Upload an image
								</p>
								<p class="text-sm text-gray-500 dark:text-gray-400">
									Drag and drop or click to select
								</p>
							</div>
							<div class="text-xs text-gray-500 dark:text-gray-400">
								Supports: JPG, PNG, GIF, WebP (Max 10MB)
							</div>
							<Button onclick={() => fileInput?.click()} variant="primary" size="md">
								Select Image
							</Button>
						</div>
					{/if}
				</div>

				<!-- File Input -->
				<input
					bind:this={fileInput}
					type="file"
					accept="image/*"
					onchange={handleFileSelect}
					class="hidden"
				/>
			</div>
		{/if}

		<!-- Gallery Tab -->
		{#if activeTab === 'gallery'}
			<div class="space-y-4">
				<!-- Gallery Controls -->
				<div
					class="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-2 sm:space-y-0"
				>
					<!-- Search -->
					<div class="relative flex-1 sm:max-w-sm">
						<Search
							class="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 z-10"
						/>
						<TextInput
							bind:value={searchQuery}
							placeholder="Search images..."
							size="md"
							class="pl-10 text-xs sm:text-sm"
						/>
					</div>

					<!-- Filter -->
					<div class="flex items-center space-x-2">
						<label class="text-sm font-medium text-gray-700 dark:text-gray-300"
							>Filter:</label
						>
						<Select
							bind:value={selectedFilter}
							size="md"
							class="text-xs sm:text-sm"
							onchange={(e) => (selectedFilter = e.detail)}
						>
							<option value="all">All Images</option>
							<option value="email">This Email</option>
							<option value="shared">Shared</option>
						</Select>
					</div>
				</div>

				<!-- Gallery Grid -->
				{#if isLoading}
					<div class="flex justify-center py-8">
						<div
							class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"
						></div>
					</div>
				{:else if filteredImages.length === 0}
					<div class="text-center py-8">
						<ImageIcon class="h-12 w-12 text-gray-400 mx-auto mb-4" />
						<p class="text-gray-500 dark:text-gray-400">
							{searchQuery ? 'No images match your search' : 'No images uploaded yet'}
						</p>
					</div>
				{:else}
					<div
						class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4 max-h-80 sm:max-h-96 overflow-y-auto"
					>
						{#each filteredImages as image}
							<div
								class="group relative border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden hover:shadow-md transition-shadow"
							>
								<!-- Image -->
								<div class="aspect-square bg-gray-100 dark:bg-gray-800">
									<img
										src={image.url}
										alt={image.original_filename}
										class="w-full h-full object-cover"
									/>
								</div>

								<!-- Overlay -->
								<div
									class="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-opacity flex items-center justify-center"
								>
									<div
										class="opacity-0 group-hover:opacity-100 transition-opacity flex space-x-2"
									>
										<Button
											onclick={() => selectImage(image)}
											variant="primary"
											size="sm"
											class="p-3 rounded-full"
											title="Select image"
										>
											<Eye class="h-4 w-4 sm:h-5 sm:w-5" />
										</Button>
										<Button
											onclick={() => deleteImage(image)}
											variant="primary"
											size="sm"
											class="p-3 rounded-full bg-rose-600 hover:bg-rose-700"
											title="Delete image"
										>
											<Trash2 class="h-4 w-4 sm:h-5 sm:w-5" />
										</Button>
									</div>
								</div>

								<!-- Info -->
								<div class="p-2 bg-white dark:bg-gray-700">
									<p
										class="text-xs font-medium text-gray-900 dark:text-white truncate"
									>
										{image.original_filename}
									</p>
									<p class="text-xs text-gray-500 dark:text-gray-400">
										{formatFileSize(image.file_size)}
									</p>
									{#if image.storage_path.includes('shared')}
										<span
											class="inline-flex px-1 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300 rounded"
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

	<!-- Footer -->
	<div
		class="flex justify-end px-3 sm:px-4 lg:px-6 py-3 sm:py-4 border-t border-gray-200 dark:border-gray-700"
		slot="footer"
	>
		<Button onclick={close} variant="outline" size="md" class="w-full sm:w-auto">Cancel</Button>
	</div>
</Modal>
