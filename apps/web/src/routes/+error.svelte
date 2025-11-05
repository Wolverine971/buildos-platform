<!-- apps/web/src/routes/+error.svelte -->
<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import {
		Home,
		RefreshCw,
		ArrowLeft,
		Shield,
		ServerCrash,
		Lock,
		AlertTriangle,
		HelpCircle
	} from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';

	$: status = $page.status;
	$: message = $page.error?.message || 'An unexpected error occurred';

	// Simple error configurations
	$: errorConfig = {
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
			icon: HelpCircle,
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
	}[status] || {
		title: `Error ${status}`,
		description: 'An unexpected error occurred.',
		icon: AlertTriangle,
		color: 'gray',
		showSignIn: false
	};

	// Color classes based on error type
	$: colorClasses = {
		amber: {
			bg: 'bg-amber-50 dark:bg-amber-900/10',
			border: 'border-amber-200 dark:border-amber-800',
			icon: 'text-amber-600 dark:text-amber-400'
		},
		red: {
			bg: 'bg-red-50 dark:bg-red-900/10',
			border: 'border-red-200 dark:border-red-800',
			icon: 'text-red-600 dark:text-red-400'
		},
		blue: {
			bg: 'bg-blue-50 dark:bg-blue-900/10',
			border: 'border-blue-200 dark:border-blue-800',
			icon: 'text-blue-600 dark:text-blue-400'
		},
		orange: {
			bg: 'bg-orange-50 dark:bg-orange-900/10',
			border: 'border-orange-200 dark:border-orange-800',
			icon: 'text-orange-600 dark:text-orange-400'
		},
		gray: {
			bg: 'bg-gray-50 dark:bg-gray-900/10',
			border: 'border-gray-200 dark:border-gray-800',
			icon: 'text-gray-600 dark:text-gray-400'
		}
	}[errorConfig.color];

	// Extract error icon for template usage
	$: ErrorIcon = errorConfig.icon;

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
		const currentPath = $page.url.pathname;
		goto(`/auth/login?redirect=${encodeURIComponent(currentPath)}`);
	}

	function handleGoHome() {
		goto('/');
	}
</script>

<svelte:head>
	<title>Error {status} - BuildOS</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
	<!-- Error content -->
	<div class="flex-1 flex items-center justify-center px-4 sm:px-6 lg:px-8">
		<div class="max-w-md w-full space-y-8">
			<!-- Error icon and status -->
			<div class="text-center">
				<div class="flex justify-center mb-6">
					<div
						class="w-20 h-20 {colorClasses.bg} {colorClasses.border} border-2 rounded-full flex items-center justify-center"
					>
						<ErrorIcon
							class="w-10 h-10 {colorClasses.icon}"
						/>
					</div>
				</div>

				<h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-2">
					{errorConfig.title}
				</h1>

				<p class="text-gray-600 dark:text-gray-400 mb-4">
					{errorConfig.description}
				</p>

				<!-- Show custom error message if different from default -->
				{#if message !== errorConfig.description}
					<div class="mt-4 p-3 {colorClasses.bg} {colorClasses.border} border rounded-lg">
						<p class="text-sm text-gray-700 dark:text-gray-300">
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
						class="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 transform hover:scale-[1.02] shadow-lg"
					>
						Sign In to BuildOS
					</Button>
				{/if}

				<div class="flex flex-col sm:flex-row gap-3 justify-center">
					<Button onclick={handleGoHome} variant="outline" size="md" icon={Home}>
						Go Home
					</Button>

					{#if status >= 500}
						<Button
							onclick={handleRefresh}
							variant="outline"
							size="md"
							icon={RefreshCw}
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
					class="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
				>
					Go Back
				</Button>
			</div>
		</div>
	</div>
</div>
