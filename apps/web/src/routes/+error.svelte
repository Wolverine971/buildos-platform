<!-- apps/web/src/routes/+error.svelte -->
<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import {
		House,
		RefreshCw,
		ArrowLeft,
		Shield,
		ServerCrash,
		Lock,
		TriangleAlert,
		CircleHelp
	} from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';

	let status = $derived(page.status);
	let message = $derived(page.error?.message || 'An unexpected error occurred');

	// Simple error configurations
	let errorConfig = $derived.by(() => {
		const config: Record<
			number,
			{
				title: string;
				description: string;
				icon: typeof Lock;
				color: 'amber' | 'red' | 'blue' | 'orange' | 'gray';
				showSignIn: boolean;
			}
		> = {
			401: {
				title: 'Authentication Required',
				description: 'You need to sign in to access this page.',
				icon: Lock,
				color: 'amber',
				showSignIn: true
			},
			403: {
				title: 'Access Forbidden',
				description: "You don't have permission to access this resource.",
				icon: Shield,
				color: 'red',
				showSignIn: false
			},
			404: {
				title: 'Page Not Found',
				description: "The page you're looking for doesn't exist.",
				icon: CircleHelp,
				color: 'blue',
				showSignIn: false
			},
			500: {
				title: 'Server Error',
				description: 'Something went wrong on our end.',
				icon: ServerCrash,
				color: 'red',
				showSignIn: false
			},
			503: {
				title: 'Service Unavailable',
				description: 'BuildOS is temporarily unavailable.',
				icon: ServerCrash,
				color: 'orange',
				showSignIn: false
			}
		};

		return (
			config[status] ?? {
				title: `Error ${status}`,
				description: 'An unexpected error occurred.',
				icon: TriangleAlert,
				color: 'gray' as const,
				showSignIn: false
			}
		);
	});

	// Color classes based on error type
	let colorClasses = $derived.by(() => {
		const palette: Record<
			'amber' | 'red' | 'blue' | 'orange' | 'gray',
			{ bg: string; border: string; icon: string }
		> = {
			amber: {
				bg: 'bg-amber-500/10',
				border: 'border-amber-500/30',
				icon: 'text-amber-500'
			},
			red: {
				bg: 'bg-red-500/10',
				border: 'border-red-500/30',
				icon: 'text-red-500'
			},
			blue: {
				bg: 'bg-accent/10',
				border: 'border-accent/30',
				icon: 'text-accent'
			},
			orange: {
				bg: 'bg-amber-500/10',
				border: 'border-amber-500/30',
				icon: 'text-amber-500'
			},
			gray: {
				bg: 'bg-muted',
				border: 'border-border',
				icon: 'text-muted-foreground'
			}
		};

		return palette[errorConfig.color] ?? palette.gray;
	});

	// Extract error icon for template usage
	let ErrorIcon = $derived(errorConfig.icon);

	function handleRefresh() {
		window.location.reload();
	}

	function handleGoBack() {
		if (window.history.length > 1) {
			window.history.back();
		} else {
			goto('/');
		}
	}

	function handleSignIn() {
		const currentPath = page.url.pathname;
		goto(`/auth/login?redirect=${encodeURIComponent(currentPath)}`);
	}

	function handleGoHome() {
		goto('/');
	}
</script>

<svelte:head>
	<title>Error {status} - BuildOS</title>
</svelte:head>

<div class="min-h-screen bg-background text-foreground flex flex-col">
	<!-- Error content -->
	<div class="flex-1 flex items-center justify-center px-4 sm:px-6 lg:px-8">
		<div class="max-w-md w-full space-y-8">
			<!-- Error icon and status -->
			<div class="text-center">
				<div class="flex justify-center mb-6">
					<div
						class="w-20 h-20 {colorClasses.bg} {colorClasses.border} border-2 rounded-full flex items-center justify-center"
					>
						<ErrorIcon class="w-10 h-10 {colorClasses.icon}" />
					</div>
				</div>

				<h1 class="text-3xl font-bold text-foreground mb-2">
					{errorConfig.title}
				</h1>

				<p class="text-muted-foreground mb-4">
					{errorConfig.description}
				</p>

				<!-- Show custom error message if different from default -->
				{#if message !== errorConfig.description}
					<div
						class="mt-4 p-3 {colorClasses.bg} {colorClasses.border} border rounded-lg shadow-ink"
					>
						<p class="text-sm text-foreground">
							{message}
						</p>
					</div>
				{/if}
			</div>

			<!-- Action buttons -->
			<div class="space-y-3">
				{#if errorConfig.showSignIn}
					<Button
						onclick={handleSignIn}
						variant="primary"
						size="lg"
						fullWidth
						icon={Lock}
						class="bg-accent hover:bg-accent/90 shadow-ink pressable"
					>
						Sign In to BuildOS
					</Button>
				{/if}

				<div class="flex flex-col sm:flex-row gap-3 justify-center">
					<Button
						onclick={handleGoHome}
						variant="outline"
						size="md"
						icon={House}
						class="shadow-ink pressable"
					>
						Go Home
					</Button>

					{#if status >= 500}
						<Button
							onclick={handleRefresh}
							variant="outline"
							size="md"
							icon={RefreshCw}
							class="shadow-ink pressable"
						>
							Try Again
						</Button>
					{/if}
				</div>

				<Button
					onclick={handleGoBack}
					variant="ghost"
					size="sm"
					fullWidth
					icon={ArrowLeft}
					class="text-muted-foreground hover:text-foreground pressable"
				>
					Go Back
				</Button>
			</div>
		</div>
	</div>
</div>
