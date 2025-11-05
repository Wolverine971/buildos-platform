<!-- apps/web/src/lib/components/docs/SwaggerUI.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';

	export let specUrl = '/openapi.json';
	export let title = 'API Documentation';
	export let description = 'Interactive API documentation';

	let swaggerContainer: HTMLElement;
	let isLoading = true;
	let error: string | null = null;

	onMount(async () => {
		if (!browser) return;

		try {
			// Dynamically import Swagger UI
			const [SwaggerUIBundle, SwaggerUIStandalonePreset] = await Promise.all([
				import('swagger-ui-dist/swagger-ui-bundle.js'),
				import('swagger-ui-dist/swagger-ui-standalone-preset.js')
			]);

			SwaggerUIBundle.default({
				url: specUrl,
				dom_id: '#swagger-ui-container',
				presets: [SwaggerUIBundle.default.presets.apis, SwaggerUIStandalonePreset.default],
				layout: 'StandaloneLayout',
				deepLinking: true,
				showExtensions: true,
				showCommonExtensions: true,
				defaultModelsExpandDepth: 2,
				defaultModelExpandDepth: 2,
				tryItOutEnabled: true,
				supportedSubmitMethods: ['get', 'post', 'put', 'delete', 'patch'],
				docExpansion: 'list',
				filter: true,
				onComplete: function () {
					console.log('Swagger UI loaded successfully');
					isLoading = false;
				},
				onFailure: function (err: any) {
					console.error('Swagger UI failed to load:', err);
					error = 'Failed to load API documentation';
					isLoading = false;
				}
			});
		} catch (err) {
			console.error('Error loading Swagger UI:', err);
			error = 'Failed to initialize API documentation';
			isLoading = false;
		}
	});
</script>

<svelte:head>
	<link
		rel="stylesheet"
		type="text/css"
		href="https://unpkg.com/swagger-ui-dist@latest/swagger-ui.css"
	/>
</svelte:head>

<div class="swagger-ui-wrapper">
	<div class="swagger-header">
		<h1 class="swagger-title">{title}</h1>
		<p class="swagger-description">{description}</p>
	</div>

	{#if isLoading}
		<div class="loading-container">
			<div class="loading-spinner"></div>
			<p>Loading API documentation...</p>
		</div>
	{/if}

	{#if error}
		<div class="error-container">
			<p class="error-message">{error}</p>
			<button
				class="retry-button"
				onclick={() => {
					error = null;
					isLoading = true;
					window.location.reload();
				}}
			>
				Retry
			</button>
		</div>
	{/if}

	<div
		id="swagger-ui-container"
		bind:this={swaggerContainer}
		class:hidden={isLoading || error}
	></div>
</div>

<style>
	.swagger-ui-wrapper {
		width: 100%;
		min-height: 600px;
	}

	.swagger-header {
		background: linear-gradient(135deg, #1e40af 0%, #3730a3 100%);
		color: white;
		padding: 2rem;
		margin-bottom: 2rem;
		border-radius: 0.5rem;
	}

	.swagger-title {
		margin: 0 0 0.5rem 0;
		font-size: 1.875rem;
		font-weight: 700;
	}

	.swagger-description {
		margin: 0;
		opacity: 0.9;
		font-size: 1.125rem;
	}

	.loading-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 4rem 2rem;
		text-align: center;
	}

	.loading-spinner {
		width: 40px;
		height: 40px;
		border: 3px solid #f3f4f6;
		border-top: 3px solid #3b82f6;
		border-radius: 50%;
		animation: spin 1s linear infinite;
		margin-bottom: 1rem;
	}

	@keyframes spin {
		0% {
			transform: rotate(0deg);
		}
		100% {
			transform: rotate(360deg);
		}
	}

	.error-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 4rem 2rem;
		text-align: center;
	}

	.error-message {
		color: #dc2626;
		font-size: 1.125rem;
		margin-bottom: 1rem;
	}

	.retry-button {
		background: #3b82f6;
		color: white;
		border: none;
		padding: 0.5rem 1rem;
		border-radius: 0.375rem;
		font-weight: 500;
		cursor: pointer;
		transition: background-color 0.2s;
	}

	.retry-button:hover {
		background: #2563eb;
	}

	.hidden {
		display: none;
	}

	/* Override some Swagger UI styles to match our theme */
	:global(.swagger-ui .topbar) {
		display: none;
	}

	:global(.swagger-ui .info) {
		margin: 0;
	}

	:global(.swagger-ui .scheme-container) {
		background: #f8fafc;
		padding: 1rem;
		border-radius: 0.5rem;
		margin-bottom: 1rem;
	}

	:global(.swagger-ui .opblock-tag) {
		font-size: 1.25rem;
		font-weight: 600;
		color: #1f2937;
	}

	:global(.swagger-ui .opblock.opblock-get .opblock-summary-method) {
		background: #10b981;
	}

	:global(.swagger-ui .opblock.opblock-post .opblock-summary-method) {
		background: #3b82f6;
	}

	:global(.swagger-ui .opblock.opblock-put .opblock-summary-method) {
		background: #f59e0b;
	}

	:global(.swagger-ui .opblock.opblock-delete .opblock-summary-method) {
		background: #ef4444;
	}

	:global(.swagger-ui .opblock.opblock-patch .opblock-summary-method) {
		background: #8b5cf6;
	}
</style>
