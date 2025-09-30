<!-- apps/web/src/lib/components/test/LogoutTest.svelte -->
<script lang="ts">
	import { logout, forceLogout, forceAuthRefresh } from '$lib/utils/auth';
	import { createSupabaseBrowser } from '$lib/supabase';
	import Button from '$lib/components/ui/Button.svelte';

	export let user: any;

	let isLoggingOut = false;
	let testResults: string[] = [];
	let clientSession: any = null;
	let serverAuthState: any = null;

	const supabase = createSupabaseBrowser();

	async function testStandardLogout() {
		isLoggingOut = true;
		testResults = ['Starting standard logout...'];

		try {
			await logout('/auth/login?message=Logged out successfully');
			testResults = [...testResults, 'Standard logout completed'];
		} catch (error) {
			testResults = [...testResults, `Error: ${error.message}`];
			isLoggingOut = false;
		}
	}

	async function testForceLogout() {
		isLoggingOut = true;
		testResults = ['Starting force logout...'];

		try {
			await forceLogout('/auth/login?message=Force logged out');
		} catch (error) {
			testResults = [...testResults, `Error: ${error.message}`];
		}
	}

	async function checkAuthState() {
		testResults = [...testResults, '=== Checking Auth State ==='];

		// Check client-side Supabase session
		try {
			const {
				data: { session }
			} = await supabase.auth.getSession();
			clientSession = session;
			testResults = [
				...testResults,
				`Client Supabase: ${session ? 'Logged in' : 'Logged out'} (User: ${session?.user?.email || 'none'})`
			];
		} catch (error) {
			testResults = [...testResults, `Client check error: ${error.message}`];
		}

		// Check server state via API
		try {
			const response = await fetch('/api/health', {
				credentials: 'include',
				headers: {
					'Cache-Control': 'no-cache',
					Pragma: 'no-cache'
				}
			});
			const data = await response.json();
			serverAuthState = data;
			testResults = [
				...testResults,
				`Server API: ${data.authenticated ? 'Logged in' : 'Logged out'} (User: ${data.userId || 'none'})`
			];
		} catch (error) {
			testResults = [...testResults, `Server check error: ${error.message}`];
		}

		// Check page data (server-rendered state)
		testResults = [
			...testResults,
			`Page Data: ${user ? 'Logged in' : 'Logged out'} (User: ${user?.email || 'none'})`
		];

		// Check for mismatches
		const clientLoggedIn = !!clientSession;
		const serverLoggedIn = !!serverAuthState?.authenticated;
		const pageDataLoggedIn = !!user;

		if (clientLoggedIn !== serverLoggedIn || serverLoggedIn !== pageDataLoggedIn) {
			testResults = [...testResults, '⚠️ AUTH STATE MISMATCH DETECTED!'];
		}

		testResults = [...testResults, '=== End Auth Check ==='];
	}

	async function manualCookieClear() {
		testResults = [...testResults, 'Manually clearing cookies via server...'];

		try {
			const response = await fetch('/auth/logout', {
				method: 'POST',
				credentials: 'include',
				headers: {
					'Content-Type': 'application/json'
				}
			});
			testResults = [...testResults, `Server response: ${response.status}`];

			if (response.redirected) {
				testResults = [...testResults, `Redirect to: ${response.url}`];
			}
		} catch (error) {
			testResults = [...testResults, `Manual clear error: ${error.message}`];
		}
	}

	async function forceRefresh() {
		testResults = [...testResults, 'Forcing auth refresh...'];

		try {
			await forceAuthRefresh();
			testResults = [...testResults, 'Auth refresh completed'];
		} catch (error) {
			testResults = [...testResults, `Refresh error: ${error.message}`];
		}
	}

	async function checkCookies() {
		testResults = [...testResults, '=== Checking Cookies ==='];

		// Get all cookies from document.cookie
		const cookies = document.cookie.split(';').map((c) => c.trim());
		const authCookies = cookies.filter((c) => {
			const name = c.split('=')[0];
			return name.includes('sb-') || name.includes('supabase') || name.includes('auth');
		});

		if (authCookies.length > 0) {
			testResults = [...testResults, 'Auth cookies found:'];
			authCookies.forEach((cookie) => {
				const [name, value] = cookie.split('=');
				testResults = [...testResults, `  ${name}: ${value?.substring(0, 20)}...`];
			});
		} else {
			testResults = [...testResults, 'No auth cookies found in document.cookie'];
		}

		testResults = [...testResults, '=== End Cookie Check ==='];
	}

	async function fullDiagnostic() {
		testResults = ['=== FULL DIAGNOSTIC ==='];
		await checkCookies();
		await checkAuthState();
		testResults = [...testResults, '=== END DIAGNOSTIC ==='];
	}
</script>

<div class="p-4 bg-yellow-100 dark:bg-yellow-900 rounded-lg max-w-4xl mx-auto my-4">
	<h3 class="font-bold mb-4 text-lg">🔧 Logout Debug Panel</h3>

	<div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
		<div class="bg-white dark:bg-gray-800 p-3 rounded">
			<p class="text-sm font-semibold">Page Data (Server)</p>
			<p class="text-sm">{user?.email || 'Not logged in'}</p>
			<p class="text-xs text-gray-500">{user?.id || 'No ID'}</p>
		</div>

		<div class="bg-white dark:bg-gray-800 p-3 rounded">
			<p class="text-sm font-semibold">Client Session</p>
			<p class="text-sm">{clientSession?.user?.email || 'Not checked'}</p>
			<p class="text-xs text-gray-500">{clientSession?.user?.id || 'No ID'}</p>
		</div>

		<div class="bg-white dark:bg-gray-800 p-3 rounded">
			<p class="text-sm font-semibold">Server API</p>
			<p class="text-sm">
				{serverAuthState?.authenticated ? 'Authenticated' : 'Not checked'}
			</p>
			<p class="text-xs text-gray-500">{serverAuthState?.userId || 'No ID'}</p>
		</div>
	</div>

	<div class="grid grid-cols-2 md:grid-cols-3 gap-2 mb-4">
		<Button
			on:click={fullDiagnostic}
			disabled={isLoggingOut}
			size="sm"
			variant="ghost"
			class="px-3 py-2 bg-blue-500 text-white text-sm hover:bg-blue-600 disabled:opacity-50"
		>
			Full Diagnostic
		</Button>

		<Button
			on:click={testStandardLogout}
			disabled={isLoggingOut}
			size="sm"
			variant="ghost"
			class="px-3 py-2 bg-orange-500 text-white text-sm hover:bg-orange-600 disabled:opacity-50"
		>
			Standard Logout
		</Button>

		<Button
			on:click={testForceLogout}
			disabled={isLoggingOut}
			size="sm"
			variant="ghost"
			class="px-3 py-2 bg-red-500 text-white text-sm hover:bg-red-600 disabled:opacity-50"
		>
			Force Logout
		</Button>

		<Button
			on:click={checkAuthState}
			disabled={isLoggingOut}
			size="sm"
			variant="ghost"
			class="px-3 py-2 bg-green-500 text-white text-sm hover:bg-green-600 disabled:opacity-50"
		>
			Check Auth State
		</Button>

		<Button
			on:click={manualCookieClear}
			disabled={isLoggingOut}
			size="sm"
			variant="ghost"
			class="px-3 py-2 bg-purple-500 text-white text-sm hover:bg-purple-600 disabled:opacity-50"
		>
			Manual Clear
		</Button>

		<Button
			on:click={forceRefresh}
			disabled={isLoggingOut}
			size="sm"
			variant="ghost"
			class="px-3 py-2 bg-indigo-500 text-white text-sm hover:bg-indigo-600 disabled:opacity-50"
		>
			Force Refresh
		</Button>
	</div>

	{#if testResults.length > 0}
		<div
			class="bg-gray-900 text-green-400 p-3 rounded text-xs font-mono overflow-x-auto max-h-96 overflow-y-auto"
		>
			{#each testResults as result}
				<div class={result.includes('⚠️') ? 'text-yellow-400 font-bold' : ''}>{result}</div>
			{/each}
		</div>
	{/if}

	{#if isLoggingOut}
		<div class="mt-2 text-center">
			<div
				class="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900"
			></div>
			<p class="text-sm mt-1">Logging out...</p>
		</div>
	{/if}
</div>
