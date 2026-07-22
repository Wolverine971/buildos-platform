import { describe, expect, it, vi } from 'vitest';

const { createAppSupabaseBrowser, createPackageSupabaseBrowser } = vi.hoisted(() => ({
	createAppSupabaseBrowser: vi.fn(),
	createPackageSupabaseBrowser: vi.fn()
}));

vi.mock('$app/environment', () => ({ browser: false }));
vi.mock('$lib/supabase', () => ({ createSupabaseBrowser: createAppSupabaseBrowser }));
vi.mock('@buildos/supabase-client', () => ({
	createSupabaseBrowser: createPackageSupabaseBrowser
}));

import './sms.service';
import './browser-push.service';
import './notification-preferences.service';

describe('browser-only service lifecycle', () => {
	it('does not create browser Supabase clients while modules are evaluated for SSR', () => {
		expect(createAppSupabaseBrowser).not.toHaveBeenCalled();
		expect(createPackageSupabaseBrowser).not.toHaveBeenCalled();
	});
});
