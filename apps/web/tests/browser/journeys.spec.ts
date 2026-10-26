// apps/web/tests/browser/journeys.spec.ts
import { test, expect, type Page } from '@playwright/test';

const fixture = 'http://127.0.0.1:54329';
const projectId = '30000000-0000-4000-8000-000000000001';
async function login(page: Page) {
	await page.goto('/auth/login');
	const consent = page.getByRole('button', {name:'Necessary only', exact:true});
	if (await consent.isVisible()) await consent.click();
	await page.getByLabel('Email', { exact: true }).fill('browser@example.test');
	await page.getByLabel('Password', { exact: true }).fill('Browser-fixture-password-1!');
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await expect(page).toHaveURL(/\/today/);
}
test.beforeEach(async ({ page, request }) => {
	await request.post(`${fixture}/__fixture/reset`);
	await page.routeWebSocket('**/*', socket => socket.close());
	await page.route('**/*', (route) => {
		const url = new URL(route.request().url());
		if (url.pathname.startsWith('/_vercel/')) return route.fulfill({status:200,contentType:'application/javascript',body:''});
		return ['127.0.0.1', 'localhost'].includes(url.hostname)
			? route.continue()
			: route.abort('blockedbyclient');
	});
});
test('login, edit a task, and reload authenticated state', async ({ page, request }) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await login(page);
	await expect(page.getByText('Browser test project').first()).toBeVisible();
	await page.getByRole('button', {name:'Edit task \"Review browser fixture\"',exact:true}).click();
	await page.getByPlaceholder('Task title...').fill('Task edited in browser');
	await page.getByRole('button',{name:'Save Changes',exact:true}).click();
	await expect(page.getByPlaceholder('Task title...')).not.toBeVisible();
	await page.reload();
	await expect(page).toHaveURL(/\/today/);
	await expect(page.getByText('Task edited in browser').first()).toBeVisible();
	expect(errors).toEqual([]);
	const state = await (await request.get(`${fixture}/__fixture/state`)).json();
	expect(state.unexpected).toEqual([]);
	expect(state.tables.onto_tasks[0].title).toBe('Task edited in browser');
	expect(state.tables.errors).toEqual([]);
});
