<!-- apps/web/src/lib/components/docs/SwaggerUI.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';

	let {
		specUrl = '/openapi.json',
		title = 'API Documentation',
		description = 'Interactive API documentation'
	}: {
		specUrl?: string;
		title?: string;
		description?: string;
	} = $props();

	let swaggerContainer = $state<HTMLElement>();
	let isLoading = $state(true);
	let error: string | null = $state(null);

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
		background: hsl(var(--accent));
		color: hsl(var(--accent-foreground));
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
		border: 3px solid hsl(var(--muted));
		border-top: 3px solid hsl(var(--accent));
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
		color: hsl(var(--destructive));
		font-size: 1.125rem;
		margin-bottom: 1rem;
	}

	.retry-button {
		background: hsl(var(--accent));
		color: hsl(var(--accent-foreground));
		border: none;
		padding: 0.5rem 1rem;
		border-radius: 0.375rem;
		font-weight: 500;
		cursor: pointer;
		transition: background-color 0.2s;
	}

	.retry-button:hover {
		background: hsl(var(--accent) / 0.9);
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
		background: hsl(var(--muted) / 0.45);
		padding: 1rem;
		border-radius: 0.5rem;
		margin-bottom: 1rem;
	}

	:global(.swagger-ui .opblock-tag) {
		font-size: 1.25rem;
		font-weight: 600;
		color: hsl(var(--foreground));
	}

	:global(.swagger-ui .opblock.opblock-get .opblock-summary-method) {
		background: hsl(var(--success));
	}

	:global(.swagger-ui .opblock.opblock-post .opblock-summary-method) {
		background: hsl(var(--info));
	}

	:global(.swagger-ui .opblock.opblock-put .opblock-summary-method) {
		background: hsl(var(--warning));
	}

	:global(.swagger-ui .opblock.opblock-delete .opblock-summary-method) {
		background: hsl(var(--destructive));
	}

	:global(.swagger-ui .opblock.opblock-patch .opblock-summary-method) {
		background: hsl(var(--accent));
	}
</style>
