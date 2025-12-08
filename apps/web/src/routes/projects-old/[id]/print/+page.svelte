<!-- apps/web/src/routes/projects/[id]/print/+page.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { marked } from 'marked';
	import { format } from 'date-fns';
	import type { PageData } from './$types';
	import { browser } from '$app/environment';

	let { data }: { data: PageData } = $props();

	const project = data.project;

	// Handle marked.parse() properly
	let contextHTML = $state('');
	let isReady = $state(false);
	let isPreparing = $state(false);

	// DEBUG MODE - disable auto-print to see content on screen
	let debugMode = $state(false);

	// Process markdown to HTML - CLIENT ONLY
	onMount(async () => {
		if (project?.context) {
			try {
				const result = marked.parse(project.context);
				// Handle both sync and async versions of marked
				contextHTML = result instanceof Promise ? await result : result;
				console.log('✅ Markdown parsed, length:', contextHTML.length);
			} catch (err) {
				console.error('Error parsing markdown:', err);
				contextHTML = `<pre style="white-space: pre-wrap;">${project.context}</pre>`;
			}
		} else {
			console.log('⚠️ No project context found');
		}
		isReady = true;
		console.log('✅ isReady set to true');
	});

	// Auto-print when ready - AGGRESSIVE polling approach
	$effect(() => {
		if (isReady && browser && !debugMode) {
			const printWhenReady = async () => {
				try {
					isPreparing = true;
					console.log('🖨️ Starting print preparation...');

					// CRITICAL: Wait for Svelte to actually render the DOM
					await new Promise((resolve) => setTimeout(resolve, 100));

					// Step 1: Poll for content to actually exist in DOM with dimensions
					console.log('📏 Polling for content visibility...');
					let attempts = 0;
					const maxAttempts = 50; // 5 seconds max
					let contentElement: HTMLElement | null = null;

					while (attempts < maxAttempts) {
						contentElement = document.querySelector('.prose') as HTMLElement;

						if (contentElement) {
							// Check if element has actual dimensions (is rendered)
							const rect = contentElement.getBoundingClientRect();
							const hasContent = contentElement.textContent?.trim().length ?? 0 > 0;
							const hasHeight = rect.height > 0;
							const hasWidth = rect.width > 0;

							console.log(
								`Attempt ${attempts + 1}: content=${hasContent}, height=${rect.height}, width=${rect.width}`
							);

							if (hasContent && hasHeight && hasWidth) {
								console.log('✅ Content is visible and has dimensions!');
								break;
							}
						}

						attempts++;
						await new Promise((resolve) => setTimeout(resolve, 100));
					}

					if (attempts >= maxAttempts) {
						console.error('❌ Content never became visible after 5 seconds');
						throw new Error('Content timeout');
					}

					// Step 2: Wait for fonts (critical for layout stability)
					console.log('🔤 Waiting for fonts...');
					await document.fonts.ready;
					console.log('✅ Fonts ready');

					// Step 3: Wait for all images to load
					console.log('🖼️ Waiting for images...');
					const images = document.querySelectorAll('img');
					await Promise.all(
						Array.from(images).map(
							(img) =>
								new Promise((resolve) => {
									if (img.complete) {
										resolve(undefined);
									} else {
										img.addEventListener('load', () => resolve(undefined));
										img.addEventListener('error', () => resolve(undefined));
										// Timeout after 3 seconds
										setTimeout(() => resolve(undefined), 3000);
									}
								})
						)
					);
					console.log('✅ All images loaded');

					// Step 4: Force browser to complete ALL layout calculations
					console.log('🔄 Forcing layout reflow...');
					let printPage = document.querySelector('.print-page') as HTMLElement;
					if (printPage) {
						// Force a complete reflow by reading multiple layout properties
						void printPage.offsetHeight;
						void printPage.offsetWidth;
						void printPage.scrollHeight;
						void printPage.clientHeight;

						// Force repaint by modifying and resetting a style
						const originalTransform = printPage.style.transform;
						printPage.style.transform = 'translateZ(0)';
						void printPage.offsetHeight; // Force reflow
						printPage.style.transform = originalTransform;
					}
					console.log('✅ Layout reflow complete');

					// Step 5: Wait for paint to complete (multiple RAF + extra time)
					console.log('🎨 Waiting for paint cycles...');
					await new Promise((resolve) => {
						requestAnimationFrame(() => {
							requestAnimationFrame(() => {
								requestAnimationFrame(() => {
									requestAnimationFrame(() => {
										// Extra delay for compositor
										setTimeout(resolve, 300);
									});
								});
							});
						});
					});
					console.log('✅ Paint cycles complete');

					// Step 6: Final verification - content is ACTUALLY visible
					if (contentElement) {
						const finalRect = contentElement.getBoundingClientRect();
						console.log(
							`📊 Final dimensions: ${finalRect.width}x${finalRect.height}, text length: ${contentElement.textContent?.length}`
						);

						if (finalRect.height === 0 || finalRect.width === 0) {
							throw new Error('Content has zero dimensions');
						}
					}

					console.log('🖨️ READY TO PRINT!');
					isPreparing = false;

					// DEBUG: Log what's actually in the DOM before printing
					const debugContent = document.querySelector('.prose');
					console.log('📋 DEBUG - DOM Content Check:');
					console.log('  - .prose exists:', !!debugContent);
					console.log('  - .prose HTML length:', debugContent?.innerHTML.length);
					console.log(
						'  - .prose text content:',
						debugContent?.textContent?.substring(0, 100)
					);
					console.log(
						'  - .prose computed style:',
						window.getComputedStyle(debugContent!).display
					);
					console.log(
						'  - .prose visibility:',
						window.getComputedStyle(debugContent!).visibility
					);
					console.log(
						'  - .prose opacity:',
						window.getComputedStyle(debugContent!).opacity
					);

					// DEBUG: Check parent containers
					printPage = document.querySelector('.print-page');
					console.log(
						'  - .print-page display:',
						window.getComputedStyle(printPage!).display
					);
					console.log(
						'  - .print-page visibility:',
						window.getComputedStyle(printPage!).visibility
					);

					const printContainer = document.querySelector('.print-container');
					console.log(
						'  - .print-container display:',
						window.getComputedStyle(printContainer!).display
					);

					// Small final delay before print
					await new Promise((resolve) => setTimeout(resolve, 200));

					window.print();
					console.log('✅ Print dialog opened');
				} catch (err) {
					console.error('❌ Error preparing print:', err);
					isPreparing = false;

					// Last resort: wait longer and try anyway
					console.log('⏳ Fallback: waiting 3 seconds and printing anyway...');
					await new Promise((resolve) => setTimeout(resolve, 3000));
					window.print();
				}
			};

			printWhenReady();
		}
	});

	// Format dates
	const formatDate = (dateString: string | null) => {
		if (!dateString) return null;
		try {
			return format(new Date(dateString), 'MMMM d, yyyy');
		} catch {
			return null;
		}
	};

	const startDate = formatDate(project.start_date);
	const endDate = formatDate(project.end_date);
	const generatedDate = format(new Date(), 'MMMM d, yyyy');
</script>

<svelte:head>
	<title>{project.name} - Context Document</title>
</svelte:head>

<div class="print-container">
	{#if debugMode}
		<button
			style="position: fixed; top: 10px; right: 10px; z-index: 9999; background: #3b82f6; color: white; padding: 12px 20px; border-radius: 6px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); cursor: pointer; border: none; font-size: 14px;"
			onclick={() => {
				debugMode = false;
			}}
		>
			<strong>DEBUG MODE</strong> - Content should be visible below. Click to trigger auto-print.
		</button>
	{/if}
	<div class="print-page">
		<!-- Content -->
		<div class="content">
			<div class="no-break">
				<div class="flex">
					<h1 class="title">{project.name}</h1>
					<div class="logo ml-auto">
						<img src="/brain-bolt.png" alt="BuildOS" class="logo-img" />
					</div>
				</div>
				{#if project.status || startDate || endDate}
					<div class="metadata">
						{#if startDate}
							<span class="date">Started {startDate}</span>
						{/if}
						{#if endDate}
							<span class="date">Due {endDate}</span>
						{/if}
					</div>
				{/if}

				<div class="divider"></div>
			</div>
			{#if isPreparing}
				<p class="preparing-print">Preparing print preview...</p>
			{/if}
			{#if !isReady}
				<p class="loading">Loading content...</p>
			{:else if contextHTML}
				<div class="prose">
					{@html contextHTML}
				</div>
			{:else if project.context}
				<div class="prose">
					<pre
						style="white-space: pre-wrap; font-family: inherit;">{project.context}</pre>
				</div>
			{:else}
				<p class="empty">No context document provided for this project.</p>
			{/if}
		</div>

		<!-- Footer -->
		<div class="footer no-break no-print">
			<span>Generated by BuildOS on {generatedDate}</span>
		</div>
	</div>
</div>

<style>
	/* ===== SCREEN STYLES ===== */
	.print-container {
		width: 100%;
	}

	.print-page {
		max-width: 210mm;
		margin: 0 auto;
		background: white;
		color: #111827;
		font-family:
			-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica', 'Arial',
			sans-serif;
	}

	.logo {
		text-align: right;
		display: flex;
		justify-content: flex-end;
		align-items: center;
	}

	.logo-img {
		width: 48px;
		height: 48px;
		object-fit: contain;
	}

	.title {
		font-size: 32px;
		font-weight: 700;
		color: #1e3a8a;
	}

	.metadata {
		display: flex;
		gap: 15px;
		flex-wrap: wrap;
	}

	.date {
		font-size: 14px;
		color: #6b7280;
		display: inline-block;
		line-height: 24px;
	}

	.divider {
		height: 2px;
		background: linear-gradient(to right, #3b82f6, #60a5fa, transparent);
		margin-top: 20px;
	}

	.content {
		padding: 40px 50px;
		background: white;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
		min-height: 400px;
	}

	.prose {
		font-size: 16px;
		line-height: 1.6;
		color: #374151;
		/* CRITICAL: Ensure content is always visible */
		visibility: visible !important;
		opacity: 1 !important;
		display: block !important;
	}

	.loading {
		text-align: center;
		color: #6b7280;
		padding: 60px 0;
	}

	.preparing-print {
		text-align: center;
		color: #3b82f6;
		padding: 20px 0;
		font-weight: 500;
		animation: pulse 1.5s ease-in-out infinite;
	}

	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.5;
		}
	}

	.empty {
		text-align: center;
		color: #9ca3af;
		font-style: italic;
		padding: 60px 0;
	}

	.footer {
		margin-top: 20px;
		padding: 20px 50px;
		background: white;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
		font-size: 12px;
		color: #9ca3af;
		text-align: center;
	}

	/* Markdown content styling - ENSURE EVERYTHING IS VISIBLE */
	.prose :global(*) {
		visibility: visible !important;
		opacity: 1 !important;
	}

	.prose :global(h1) {
		font-size: 28px;
		font-weight: 600;
		color: #1e3a8a;
		margin: 30px 0 15px 0;
		display: block !important;
	}

	.prose :global(h2) {
		font-size: 24px;
		font-weight: 600;
		color: #2563eb;
		margin: 25px 0 12px 0;
		display: block !important;
	}

	.prose :global(h3) {
		font-size: 20px;
		font-weight: 500;
		color: #3b82f6;
		margin: 20px 0 10px 0;
		display: block !important;
	}

	.prose :global(p) {
		margin: 12px 0;
		display: block !important;
	}

	.prose :global(ul),
	.prose :global(ol) {
		margin: 12px 0;
		padding-left: 25px;
		display: block;
	}

	.prose :global(li) {
		margin: 6px 0;
		display: list-item;
	}

	.prose :global(strong) {
		font-weight: 600;
		color: #111827;
	}

	.prose :global(code) {
		background: #f3f4f6;
		padding: 2px 6px;
		border-radius: 3px;
		font-family: monospace;
		font-size: 14px;
		color: #dc2626;
	}

	.prose :global(pre) {
		background: #f9fafb;
		border: 1px solid #e5e7eb;
		padding: 15px;
		border-radius: 6px;
		overflow-x: auto;
		margin: 15px 0;
		display: block;
	}

	.prose :global(pre code) {
		background: transparent;
		padding: 0;
		color: #1f2937;
	}

	.prose :global(blockquote) {
		border-left: 4px solid #3b82f6;
		padding-left: 15px;
		margin: 15px 0;
		color: #6b7280;
		font-style: italic;
		display: block;
	}

	.prose :global(table) {
		width: 100%;
		border-collapse: collapse;
		margin: 15px 0;
		display: table;
	}

	.prose :global(th),
	.prose :global(td) {
		border: 1px solid #e5e7eb;
		padding: 8px;
		text-align: left;
	}

	.prose :global(th) {
		background: #f3f4f6;
		font-weight: 600;
	}

	.prose :global(a) {
		color: #3b82f6;
		text-decoration: underline;
	}

	/* ===== MINIMAL PRINT STYLES - USE SCREEN STYLES ===== */
	@media print {
		@page {
			size: A4;
			margin: 15mm;
		}

		/* Hide debug button */
		button {
			display: none !important;
		}

		/* Hide loading messages */
		.loading,
		.empty,
		.preparing-print {
			display: none !important;
		}
	}
</style>
