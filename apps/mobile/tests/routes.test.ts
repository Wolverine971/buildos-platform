// apps/mobile/tests/routes.test.ts
import { describe, expect, it } from 'vitest';

import {
	OPEN_PROJECT_PARAM,
	PROJECT_ROUTE,
	projectHref,
	projectLinkPath,
	TAB_LABEL,
	TAB_ROUTE,
	tabStackFromSegment
} from '@/lib/routes';

describe('tab stacks', () => {
	it('reads the shared layout segment', () => {
		expect(tabStackFromSegment('(today)')).toBe('today');
		expect(tabStackFromSegment('(workspace)')).toBe('workspace');
		expect(tabStackFromSegment(undefined)).toBe('today');
		expect(tabStackFromSegment(TAB_ROUTE.workspace)).toBe('workspace');
	});

	it('labels each tab like the tab bar', () => {
		expect(TAB_LABEL).toEqual({ today: 'Today', workspace: 'Workspace' });
	});
});

describe('projectHref', () => {
	it('names the tab group, so the project stays in the tab it was opened from', () => {
		expect(projectHref('today', 'p1')).toEqual({
			pathname: '/(tabs)/(today)/project/[id]',
			params: { id: 'p1' }
		});
		expect(projectHref('workspace', 'p1')).toEqual({
			pathname: '/(tabs)/(workspace)/project/[id]',
			params: { id: 'p1' }
		});
	});

	it('points at the route the stacks register', () => {
		expect(projectHref('today', 'x').pathname.endsWith(`/${PROJECT_ROUTE}`)).toBe(true);
	});
});

describe('projectLinkPath', () => {
	const workspace = '/(tabs)/(workspace)/project/abc';

	it('sends project links to the Workspace stack', () => {
		expect(projectLinkPath('buildos://project/abc')).toBe(workspace);
		expect(projectLinkPath('buildos:///project/abc/')).toBe(workspace);
		expect(projectLinkPath('exp://192.168.1.20:8081/--/project/abc')).toBe(workspace);
		expect(projectLinkPath('https://build-os.com/projects/abc')).toBe(workspace);
		expect(projectLinkPath('/project/abc')).toBe(workspace);
	});

	it('keeps the query string and hash', () => {
		expect(projectLinkPath('buildos://project/abc?tab=docs#top')).toBe(`${workspace}?tab=docs#top`);
	});

	it('opens warm links through the Workspace root, so the grid is under the project', () => {
		const viaRoot = `/(tabs)/(workspace)/projects?${OPEN_PROJECT_PARAM}=abc`;
		expect(projectLinkPath('buildos://project/abc', false)).toBe(viaRoot);
		expect(projectLinkPath('/project/abc', false)).toBe(viaRoot);
		expect(projectLinkPath('https://build-os.com/projects/abc?tab=docs', false)).toBe(viaRoot);
		expect(projectLinkPath('buildos://reader?kind=task&id=t1', false)).toBeNull();
	});

	it('leaves every other link alone', () => {
		expect(projectLinkPath('exp://192.168.1.20:8081')).toBeNull();
		expect(projectLinkPath('exp://192.168.1.20:8081/--/')).toBeNull();
		expect(projectLinkPath('buildos://projects')).toBeNull();
		expect(projectLinkPath('buildos://reader?kind=task&id=t1')).toBeNull();
		expect(projectLinkPath('buildos://project')).toBeNull();
		expect(projectLinkPath('buildos://project/abc/docs')).toBeNull();
		expect(projectLinkPath('https://build-os.com/')).toBeNull();
		expect(projectLinkPath('/(tabs)/(today)/project/abc')).toBeNull();
		expect(projectLinkPath('')).toBeNull();
	});
});
