# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: journeys.spec.ts >> login, edit a task, and reload authenticated state
- Location: tests/browser/journeys.spec.ts:26:1

# Error details

```
Test timeout of 45000ms exceeded.
```

```
Error: locator.fill: Test timeout of 45000ms exceeded.
Call log:
  - waiting for getByPlaceholder('Task title...')

```

# Page snapshot

```yaml
- generic [ref=e2]:
  - generic [ref=e3]:
    - link "Skip to main content" [ref=e4] [cursor=pointer]:
      - /url: "#main-content"
    - navigation "Main navigation" [ref=e5]:
      - generic [ref=e7]:
        - generic [ref=e8]:
          - link "BuildOS" [ref=e10] [cursor=pointer]:
            - /url: /today
            - generic [ref=e11]: BuildOS
            - generic [ref=e12]:
              - generic [ref=e13]: Build
              - generic [ref=e14]: OS
          - generic [ref=e15]:
            - link "Today" [ref=e16] [cursor=pointer]:
              - /url: /today
              - img [ref=e17]
              - generic [ref=e18]: Today
            - link "Workspace" [ref=e19] [cursor=pointer]:
              - /url: /projects
              - img [ref=e20]
              - generic [ref=e21]: Workspace
            - link "History" [ref=e22] [cursor=pointer]:
              - /url: /history
              - img [ref=e23]
              - generic [ref=e24]: History
        - generic [ref=e25]:
          - button "Open Agent Work" [ref=e26] [cursor=pointer]:
            - img [ref=e27]
          - button "Open AI Inbox" [ref=e28] [cursor=pointer]:
            - img [ref=e29]
          - button "Open Workspace chat" [ref=e30] [cursor=pointer]:
            - generic [ref=e32]: Workspace chat
          - button "User menu" [ref=e34] [cursor=pointer]:
            - generic [ref=e35]: Browser Tester
    - main [ref=e36]:
      - main [ref=e38]:
        - generic [ref=e39]:
          - generic [ref=e40]:
            - generic [ref=e41]:
              - generic [ref=e42]:
                - heading "Today" [level=1] [ref=e43]
                - paragraph [ref=e44]: Monday, October 26
              - paragraph [ref=e45]: 0 events · 1 task
            - button "Plan my day" [ref=e46] [cursor=pointer]:
              - generic [ref=e47]:
                - img [ref=e48]
                - text: Plan my day
          - generic [ref=e49]:
            - button "Today's brief" [ref=e51] [cursor=pointer]:
              - img [ref=e52]
              - generic [ref=e53]: Today's brief
            - link "Open your Workspace" [ref=e54] [cursor=pointer]:
              - /url: /projects
              - generic [ref=e55]: Workspace
              - img [ref=e56]
            - button "Refresh today's agenda" [ref=e57] [cursor=pointer]:
              - img [ref=e59]
        - generic [ref=e61]:
          - region "Tasks without a set time" [ref=e64]:
            - generic [ref=e65]:
              - heading "Anytime today" [level=2] [ref=e66]
              - generic [ref=e67]: "1"
            - region "Due today" [ref=e69]:
              - heading "Due today" [level=3] [ref=e70]
              - generic [ref=e72]:
                - heading "Browser test project" [level=4] [ref=e74]:
                  - link "Browser test project" [ref=e75] [cursor=pointer]:
                    - /url: /projects/30000000-0000-4000-8000-000000000001
                    - img [ref=e76]
                    - generic [ref=e77]: Browser test project
                - list [ref=e78]:
                  - listitem [ref=e79]:
                    - generic [ref=e82]:
                      - button "Mark \"Review browser fixture\" done" [ref=e83] [cursor=pointer]:
                        - img [ref=e85]
                      - button "Open task details for \"Review browser fixture\"" [ref=e87] [cursor=pointer]:
                        - generic [ref=e88]: Review browser fixture
                      - generic [ref=e89]:
                        - button "Edit task \"Review browser fixture\"" [active] [ref=e90] [cursor=pointer]:
                          - img [ref=e91]
                        - button "Chat about \"Review browser fixture\"" [ref=e92] [cursor=pointer]:
                          - img [ref=e93]
          - generic [ref=e95]:
            - generic [ref=e96]:
              - button "Hide the list" [pressed] [ref=e97] [cursor=pointer]:
                - img [ref=e98]
              - img [ref=e100]
              - generic [ref=e101]:
                - heading "Review browser fixture" [level=3] [ref=e102]
                - link "Browser test project" [ref=e104] [cursor=pointer]:
                  - /url: /projects/30000000-0000-4000-8000-000000000001
                  - img [ref=e105]
                  - generic [ref=e106]: Browser test project
              - generic [ref=e107]:
                - button "Previous task" [disabled] [ref=e108]:
                  - img [ref=e109]
                - generic [ref=e110]: 1 / 1
                - button "Next task" [disabled] [ref=e111]:
                  - img [ref=e112]
                - button "Chat about this task" [ref=e114] [cursor=pointer]
                - button "Mark done" [disabled] [ref=e115]:
                  - img [ref=e116]
                - button "Focus" [ref=e117] [cursor=pointer]:
                  - img [ref=e118]
                - link "Open the full page" [ref=e119] [cursor=pointer]:
                  - /url: /projects/30000000-0000-4000-8000-000000000001/tasks/40000000-0000-4000-8000-000000000001
                  - img [ref=e120]
                - button "Close" [ref=e121] [cursor=pointer]:
                  - img [ref=e122]
            - alert [ref=e124]:
              - generic [ref=e125]: Could not load this task.
              - button "Try again" [ref=e126] [cursor=pointer]:
                - img [ref=e127]
                - text: Try again
            - generic [ref=e128]:
              - generic [ref=e129]: ↑ ↓ walk the list
              - generic [ref=e130]: F focus
              - generic [ref=e131]: Esc back out
    - contentinfo [ref=e132]:
      - generic [ref=e135]:
        - generic [ref=e137]: © 2026 BuildOS
        - navigation "App footer links" [ref=e138]:
          - link "Help" [ref=e139] [cursor=pointer]:
            - /url: /help
          - link "Docs" [ref=e140] [cursor=pointer]:
            - /url: /docs
          - link "Feedback" [ref=e141] [cursor=pointer]:
            - /url: /feedback
          - link "Privacy" [ref=e142] [cursor=pointer]:
            - /url: /privacy
          - link "Terms" [ref=e143] [cursor=pointer]:
            - /url: /terms
          - button "Privacy choices" [ref=e144] [cursor=pointer]
  - generic [ref=e145]: Today | BuildOS
```

# Test source

```ts
  1  | // apps/web/tests/browser/journeys.spec.ts
  2  | import { test, expect, type Page } from '@playwright/test';
  3  | 
  4  | const fixture = 'http://127.0.0.1:54329';
  5  | const projectId = '30000000-0000-4000-8000-000000000001';
  6  | async function login(page: Page) {
  7  | 	await page.goto('/auth/login');
  8  | 	const consent = page.getByRole('button', {name:'Necessary only', exact:true});
  9  | 	if (await consent.isVisible()) await consent.click();
  10 | 	await page.getByLabel('Email', { exact: true }).fill('browser@example.test');
  11 | 	await page.getByLabel('Password', { exact: true }).fill('Browser-fixture-password-1!');
  12 | 	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  13 | 	await expect(page).toHaveURL(/\/today/);
  14 | }
  15 | test.beforeEach(async ({ page, request }) => {
  16 | 	await request.post(`${fixture}/__fixture/reset`);
  17 | 	await page.routeWebSocket('**/*', socket => socket.close());
  18 | 	await page.route('**/*', (route) => {
  19 | 		const url = new URL(route.request().url());
  20 | 		if (url.pathname.startsWith('/_vercel/')) return route.fulfill({status:200,contentType:'application/javascript',body:''});
  21 | 		return ['127.0.0.1', 'localhost'].includes(url.hostname)
  22 | 			? route.continue()
  23 | 			: route.abort('blockedbyclient');
  24 | 	});
  25 | });
  26 | test('login, edit a task, and reload authenticated state', async ({ page, request }) => {
  27 | 	const errors: string[] = [];
  28 | 	page.on('pageerror', (error) => errors.push(error.message));
  29 | 	await login(page);
  30 | 	await expect(page.getByText('Browser test project').first()).toBeVisible();
  31 | 	await page.getByRole('button', {name:'Edit task \"Review browser fixture\"',exact:true}).click();
> 32 | 	await page.getByPlaceholder('Task title...').fill('Task edited in browser');
     |                                               ^ Error: locator.fill: Test timeout of 45000ms exceeded.
  33 | 	await page.getByRole('button',{name:'Save Changes',exact:true}).click();
  34 | 	await expect(page.getByPlaceholder('Task title...')).not.toBeVisible();
  35 | 	await page.reload();
  36 | 	await expect(page).toHaveURL(/\/today/);
  37 | 	await expect(page.getByText('Task edited in browser').first()).toBeVisible();
  38 | 	expect(errors).toEqual([]);
  39 | 	const state = await (await request.get(`${fixture}/__fixture/state`)).json();
  40 | 	expect(state.unexpected).toEqual([]);
  41 | 	expect(state.tables.onto_tasks[0].title).toBe('Task edited in browser');
  42 | 	expect(state.tables.errors).toEqual([]);
  43 | });
  44 | 
```