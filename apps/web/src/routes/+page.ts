// apps/web/src/routes/+page.ts
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ data, url }) => {
	return {
		...data,
		clientLoadTime: new Date().toISOString(),
		searchParams: url.searchParams.toString()
	};
};

/*
 * COMMENTED OUT: Old dashboard data client-side handling
 * This was re-fetching dashboard data if timezone mismatched.
 * Currently not needed since Dashboard only uses ontology projects.
 *
 * To re-enable timezone-based refresh, uncomment:
 *
 * import { browser } from '$app/environment';
 *
 * function isPromiseLike<T>(value: unknown): value is PromiseLike<T> {
 *   return !!value && typeof (value as PromiseLike<T>).then === 'function';
 * }
 *
 * function getErrorMessage(error: unknown, fallback: string): string {
 *   if (error instanceof Error && error.message) return error.message;
 *   if (typeof error === 'string' && error.length > 0) return error;
 *   return fallback;
 * }
 *
 * export const load: PageLoad = async ({ data, fetch, url }) => {
 *   const base = {
 *     ...data,
 *     clientLoadTime: new Date().toISOString(),
 *     searchParams: url.searchParams.toString()
 *   };
 *
 *   if (!browser || !data.user) {
 *     return base;
 *   }
 *
 *   let dashboardData = data.dashboardData as any;
 *   let dashboardError = data.dashboardError ?? null;
 *   let dashboardLoading = data.dashboardLoading ?? false;
 *
 *   if (isPromiseLike(dashboardData)) {
 *     try {
 *       dashboardData = await dashboardData;
 *       dashboardError = null;
 *     } catch (error) {
 *       dashboardData = null;
 *       dashboardError = getErrorMessage(error, 'Failed to load dashboard data');
 *     }
 *   }
 *
 *   const clientTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
 *   const serverTimezone = data.dashboardTimezone as string | null;
 *
 *   if (
 *     data.user &&
 *     clientTimezone &&
 *     (!dashboardData || (serverTimezone && clientTimezone !== serverTimezone))
 *   ) {
 *     dashboardLoading = true;
 *
 *     try {
 *       const response = await fetch(
 *         `/api/dashboard?timezone=${encodeURIComponent(clientTimezone)}`
 *       );
 *
 *       if (!response.ok) {
 *         throw new Error(`Failed to load dashboard data: ${response.statusText}`);
 *       }
 *
 *       const payload = await response.json();
 *
 *       if (!payload.success) {
 *         throw new Error(payload.error || 'Failed to load dashboard data');
 *       }
 *
 *       dashboardData = payload.data;
 *       dashboardError = null;
 *     } catch (error) {
 *       dashboardError = getErrorMessage(error, 'Failed to load dashboard data');
 *     } finally {
 *       dashboardLoading = false;
 *     }
 *   }
 *
 *   return {
 *     ...base,
 *     dashboardData,
 *     dashboardError,
 *     dashboardLoading,
 *     clientTimezone
 *   };
 * };
 */
