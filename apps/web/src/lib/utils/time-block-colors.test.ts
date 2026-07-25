// apps/web/src/lib/utils/time-block-colors.test.ts
import { describe, expect, it } from 'vitest';
import {
	DATA_DARK_FOREGROUND_HEX,
	DATA_LIGHT_FOREGROUND_HEX,
	getDataColorForeground
} from './time-block-colors';

describe('getDataColorForeground', () => {
	it('uses dark ink on light calendar colors', () => {
		expect(getDataColorForeground('#F6BF26')).toBe(DATA_DARK_FOREGROUND_HEX);
		expect(getDataColorForeground('#ffffff')).toBe(DATA_DARK_FOREGROUND_HEX);
		expect(getDataColorForeground('#fff')).toBe(DATA_DARK_FOREGROUND_HEX);
	});

	it('uses white on dark calendar colors', () => {
		expect(getDataColorForeground('#D50000')).toBe(DATA_LIGHT_FOREGROUND_HEX);
		expect(getDataColorForeground('#0B8043')).toBe(DATA_LIGHT_FOREGROUND_HEX);
	});

	it('falls back safely for non-hex values', () => {
		expect(getDataColorForeground('hsl(var(--muted))')).toBe(DATA_LIGHT_FOREGROUND_HEX);
	});
});
