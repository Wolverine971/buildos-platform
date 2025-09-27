// worker-queue/tests/scheduler.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { addHours, addDays, setHours, setMinutes } from 'date-fns';
import { utcToZonedTime, zonedTimeToUtc } from 'date-fns-tz';

// Mock the imports
vi.mock('./lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

vi.mock('./queue', () => ({
  queueBriefGeneration: vi.fn(),
}));

import { calculateNextRunTime, UserBriefPreference, validateUserPreference } from '../src/scheduler';

describe('Brief Scheduler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('calculateNextRunTime', () => {
    it('should schedule daily brief 24 hours apart', () => {
      const now = new Date('2024-01-15T10:00:00Z'); // 10:00 UTC
      const preference = {
        user_id: 'user-1',
        frequency: 'daily',
        time_of_day: '09:00:00',
        timezone: 'UTC',
        is_active: true,
      };

      const nextRun = calculateNextRunTime(preference as UserBriefPreference, now);
      
      // Should schedule for tomorrow at 09:00 since 09:00 today has passed
      expect(nextRun).toEqual(new Date('2024-01-16T09:00:00Z'));
    });

    it('should schedule for today if time hasnt passed', () => {
      const now = new Date('2024-01-15T08:00:00Z'); // 08:00 UTC
      const preference = {
        user_id: 'user-1',
        frequency: 'daily',
        time_of_day: '09:00:00',
        timezone: 'UTC',
        is_active: true,
      };

      const nextRun = calculateNextRunTime(preference as UserBriefPreference, now);
      
      // Should schedule for today at 09:00 since it hasn't passed yet
      expect(nextRun).toEqual(new Date('2024-01-15T09:00:00Z'));
    });

    it('should handle different timezones correctly', () => {
      const now = new Date('2024-01-15T10:00:00Z'); // 10:00 UTC = 05:00 EST
      const preference = {
        user_id: 'user-1',
        frequency: 'daily',
        time_of_day: '09:00:00',
        timezone: 'America/New_York',
        is_active: true,
      };

      const nextRun = calculateNextRunTime(preference as UserBriefPreference, now);
      
      // Should schedule for today at 09:00 EST (14:00 UTC)
      expect(nextRun).toEqual(new Date('2024-01-15T14:00:00Z'));
    });

    it('should handle weekly frequency', () => {
      const now = new Date('2024-01-15T10:00:00Z'); // Monday
      const preference = {
        user_id: 'user-1',
        frequency: 'weekly',
        day_of_week: 1, // Monday
        time_of_day: '09:00:00',
        timezone: 'UTC',
        is_active: true,
      };

      const nextRun = calculateNextRunTime(preference as UserBriefPreference, now);
      
      // Should schedule for next Monday since 09:00 today has passed
      expect(nextRun).toEqual(new Date('2024-01-22T09:00:00Z'));
    });

    it('should use defaults for null values', () => {
      const now = new Date('2024-01-15T08:00:00Z');
      const preference = {
        user_id: 'user-1',
        frequency: null,
        time_of_day: null,
        timezone: null,
        is_active: true,
      };

      const nextRun = calculateNextRunTime(preference as UserBriefPreference, now);
      
      // Should use defaults: daily frequency, 09:00:00 time, UTC timezone
      expect(nextRun).toEqual(new Date('2024-01-15T09:00:00Z'));
    });
  });

  describe('validateUserPreference', () => {
    it('should validate correct preferences', () => {
      const preference = {
        frequency: 'daily',
        time_of_day: '09:00:00',
        timezone: 'UTC',
        day_of_week: 1,
      };

      const errors = validateUserPreference(preference);
      expect(errors).toHaveLength(0);
    });

    it('should catch invalid frequency', () => {
      const preference = {
        frequency: 'invalid',
      };

      const errors = validateUserPreference(preference);
      expect(errors).toContain('Invalid frequency. Must be daily, weekly, or custom');
    });

    it('should catch invalid time format', () => {
      const preference = {
        time_of_day: '25:00:00',
      };

      const errors = validateUserPreference(preference);
      expect(errors).toContain('Invalid hours in time_of_day');
    });

    it('should catch invalid day_of_week', () => {
      const preference = {
        day_of_week: 7,
      };

      const errors = validateUserPreference(preference);
      expect(errors).toContain('Invalid day_of_week. Must be between 0 (Sunday) and 6 (Saturday)');
    });
  });
});

// Integration test helper
export async function testSchedulerIntegration() {
  console.log('🧪 Testing scheduler integration...');
  
  // Test 1: Verify 24-hour scheduling
  const testUser = 'test-user-1';
  const preference = {
    user_id: testUser,
    frequency: 'daily',
    time_of_day: '09:00:00',
    timezone: 'UTC',
    is_active: true,
  };

  // Mock current time as 10:00 UTC
  const mockNow = new Date('2024-01-15T10:00:00Z');
  const nextRun = calculateNextRunTime(preference as UserBriefPreference, mockNow) as Date;
  
  console.log('Expected next run:', new Date('2024-01-16T09:00:00Z'));
  console.log('Actual next run:', nextRun);
  
  const timeDiff = nextRun.getTime() - mockNow.getTime();
  const hoursDiff = timeDiff / (1000 * 60 * 60);
  
  console.log(`Time difference: ${hoursDiff} hours`);
  console.log(`✅ 24-hour scheduling test: ${hoursDiff === 23 ? 'PASSED' : 'FAILED'}`);
  
  // Test 2: Verify timezone handling
  const easternPreference = {
    ...preference,
    timezone: 'America/New_York',
  };
  
  const easternNextRun = calculateNextRunTime(easternPreference as UserBriefPreference, mockNow);
  console.log('Eastern timezone next run:', easternNextRun);
  
  return {
    utcNextRun: nextRun,
    easternNextRun: easternNextRun,
    timeDifference: hoursDiff,
  };
}