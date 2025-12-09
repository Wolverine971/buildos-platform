<!-- packages/twilio-service/docs/implementation/twilio-integration-plan-updated.md -->

# Twilio SMS Integration for BuildOS Platform

## Tailored Implementation Plan

## Overview

This updated plan integrates Twilio SMS capabilities into the existing BuildOS platform architecture, leveraging the current Supabase queue system, worker service, and monorepo structure. The implementation follows established BuildOS patterns and integrates seamlessly with existing systems.

## Quick Start Implementation

### Phase 1: Package Setup (Day 1)

#### 1.1 Create Twilio Service Package

```bash
# Create package directory
mkdir -p packages/twilio-service/src/services

# Initialize package files
cd packages/twilio-service
```

#### 1.2 Package Configuration

**packages/twilio-service/package.json:**

```json
{
	"name": "@buildos/twilio-service",
	"version": "1.0.0",
	"private": true,
	"description": "Twilio SMS integration for BuildOS platform",
	"main": "./dist/index.js",
	"module": "./dist/index.mjs",
	"types": "./dist/index.d.ts",
	"exports": {
		".": {
			"types": "./dist/index.d.ts",
			"import": "./dist/index.mjs",
			"require": "./dist/index.js"
		}
	},
	"scripts": {
		"build": "tsup src/index.ts --format cjs,esm --dts",
		"dev": "tsup src/index.ts --format cjs,esm --dts --watch",
		"clean": "rm -rf dist .turbo",
		"typecheck": "tsc --noEmit",
		"test": "vitest",
		"test:run": "vitest run"
	},
	"dependencies": {
		"@buildos/shared-types": "workspace:*",
		"@buildos/supabase-client": "workspace:*",
		"@supabase/supabase-js": "^2.39.8",
		"twilio": "^4.23.0"
	},
	"devDependencies": {
		"@types/node": "^20.11.10",
		"tsup": "^8.3.5",
		"typescript": "^5.9.2",
		"vitest": "^3.2.4"
	}
}
```

**packages/twilio-service/tsconfig.json:**

```json
{
	"compilerOptions": {
		"target": "ES2020",
		"module": "ESNext",
		"lib": ["ES2020"],
		"moduleResolution": "node",
		"declaration": true,
		"outDir": "./dist",
		"rootDir": "./src",
		"strict": true,
		"esModuleInterop": true,
		"skipLibCheck": true,
		"forceConsistentCasingInFileNames": true,
		"resolveJsonModule": true,
		"isolatedModules": true
	},
	"include": ["src/**/*"],
	"exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

### Phase 2: Database Schema (Day 1)

#### 2.1 Create Migration File

**apps/web/supabase/migrations/20250928_add_sms_messaging_tables.sql:**

```sql
-- Create enums for SMS messaging
CREATE TYPE sms_status AS ENUM (
  'pending',
  'queued',
  'sending',
  'sent',
  'delivered',
  'failed',
  'undelivered',
  'scheduled',
  'cancelled'
);

CREATE TYPE sms_priority AS ENUM ('low', 'normal', 'high', 'urgent');

-- SMS Templates table (follows existing pattern from notification templates)
CREATE TABLE sms_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  template_key VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  description TEXT,

  -- Template content
  message_template TEXT NOT NULL CHECK (LENGTH(TRIM(message_template)) > 0),

  -- Variable configuration (follows BuildOS pattern)
  template_vars JSONB DEFAULT '{}',
  required_vars JSONB DEFAULT '[]',

  -- Settings
  max_length INTEGER DEFAULT 160,
  is_active BOOLEAN DEFAULT true,

  -- Metadata
  usage_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_template_key CHECK (template_key ~ '^[a-z0-9_]+$')
);

-- SMS Messages table (integrates with existing queue_jobs)
CREATE TABLE sms_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Message details
  phone_number TEXT NOT NULL,
  message_content TEXT NOT NULL,
  template_id UUID REFERENCES sms_templates(id) ON DELETE SET NULL,
  template_vars JSONB,

  -- Status tracking
  status sms_status NOT NULL DEFAULT 'pending',
  priority sms_priority NOT NULL DEFAULT 'normal',

  -- Scheduling
  scheduled_for TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,

  -- Twilio integration
  twilio_sid TEXT,
  twilio_status TEXT,
  twilio_error_code INTEGER,
  twilio_error_message TEXT,

  -- Retry logic
  attempt_count INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  next_retry_at TIMESTAMPTZ,

  -- Related data
  queue_job_id UUID REFERENCES queue_jobs(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,

  -- Metadata
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User SMS preferences (extends existing user preferences pattern)
CREATE TABLE user_sms_preferences (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Contact info
  phone_number TEXT,
  phone_verified BOOLEAN DEFAULT false,
  phone_verified_at TIMESTAMPTZ,

  -- Notification preferences
  task_reminders BOOLEAN DEFAULT false,
  daily_brief_sms BOOLEAN DEFAULT false,
  urgent_alerts BOOLEAN DEFAULT true,

  -- Timing preferences (follows daily_brief pattern)
  quiet_hours_start TIME DEFAULT '21:00',
  quiet_hours_end TIME DEFAULT '08:00',
  timezone TEXT DEFAULT 'America/Los_Angeles',

  -- Rate limiting
  daily_sms_limit INTEGER DEFAULT 10,
  daily_sms_count INTEGER DEFAULT 0,
  daily_count_reset_at TIMESTAMPTZ DEFAULT NOW(),

  -- Opt-out
  opted_out BOOLEAN DEFAULT false,
  opted_out_at TIMESTAMPTZ,
  opt_out_reason TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_user_sms_prefs UNIQUE(user_id)
);

-- Create indexes for performance (follows existing pattern)
CREATE INDEX idx_sms_messages_user_status ON sms_messages(user_id, status);
CREATE INDEX idx_sms_messages_scheduled ON sms_messages(scheduled_for)
  WHERE status IN ('pending', 'scheduled');
CREATE INDEX idx_sms_messages_queue_job ON sms_messages(queue_job_id);
CREATE INDEX idx_sms_templates_key ON sms_templates(template_key);
CREATE INDEX idx_sms_templates_active ON sms_templates(is_active, template_key);

-- Enable Row Level Security (follows BuildOS pattern)
ALTER TABLE sms_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sms_preferences ENABLE ROW LEVEL SECURITY;

-- RLS Policies for sms_messages
CREATE POLICY "Users can view their own SMS messages" ON sms_messages
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own SMS messages" ON sms_messages
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role has full access to SMS messages" ON sms_messages
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- RLS Policies for user_sms_preferences
CREATE POLICY "Users can view their own SMS preferences" ON user_sms_preferences
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own SMS preferences" ON user_sms_preferences
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role has full access to SMS preferences" ON user_sms_preferences
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- RLS Policies for sms_templates (admin only for modifications)
CREATE POLICY "Everyone can view active SMS templates" ON sms_templates
  FOR SELECT USING (is_active = true);

CREATE POLICY "Admin users can manage SMS templates" ON sms_templates
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.is_admin = true
    )
  );

CREATE POLICY "Service role has full access to SMS templates" ON sms_templates
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Add triggers for updated_at (uses existing function)
CREATE TRIGGER update_sms_messages_updated_at
  BEFORE UPDATE ON sms_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sms_templates_updated_at
  BEFORE UPDATE ON sms_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_sms_preferences_updated_at
  BEFORE UPDATE ON user_sms_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add SMS job type to existing queue_type enum
ALTER TYPE queue_type ADD VALUE IF NOT EXISTS 'send_sms';

-- Create helper function for queueing SMS
CREATE OR REPLACE FUNCTION queue_sms_message(
  p_user_id UUID,
  p_phone_number TEXT,
  p_message TEXT,
  p_priority sms_priority DEFAULT 'normal',
  p_scheduled_for TIMESTAMPTZ DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_message_id UUID;
  v_job_id UUID;
  v_queue_priority INTEGER;
BEGIN
  -- Convert priority to numeric value for queue
  v_queue_priority := CASE p_priority
    WHEN 'urgent' THEN 1
    WHEN 'high' THEN 5
    WHEN 'normal' THEN 10
    WHEN 'low' THEN 20
  END;

  -- Create SMS message record
  INSERT INTO sms_messages (
    user_id,
    phone_number,
    message_content,
    priority,
    scheduled_for,
    metadata,
    status
  ) VALUES (
    p_user_id,
    p_phone_number,
    p_message,
    p_priority,
    p_scheduled_for,
    p_metadata,
    CASE
      WHEN p_scheduled_for IS NOT NULL AND p_scheduled_for > NOW()
      THEN 'scheduled'::sms_status
      ELSE 'pending'::sms_status
    END
  ) RETURNING id INTO v_message_id;

  -- Queue the job if it should be sent now or soon
  IF p_scheduled_for IS NULL OR p_scheduled_for <= NOW() + INTERVAL '5 minutes' THEN
    -- Use existing add_queue_job function
    v_job_id := add_queue_job(
      p_user_id := p_user_id,
      p_job_type := 'send_sms',
      p_metadata := jsonb_build_object(
        'message_id', v_message_id,
        'phone_number', p_phone_number,
        'message', p_message,
        'priority', p_priority
      ),
      p_scheduled_for := COALESCE(p_scheduled_for, NOW()),
      p_priority := v_queue_priority
    );

    -- Update message with queue job reference
    UPDATE sms_messages
    SET queue_job_id = v_job_id, status = 'queued'::sms_status
    WHERE id = v_message_id;
  END IF;

  RETURN v_message_id;
END;
$$;

-- Seed initial SMS templates
INSERT INTO sms_templates (template_key, name, message_template, template_vars) VALUES
  ('task_reminder', 'Task Reminder', 'BuildOS: {{task_name}} is due {{due_time}}. {{task_context}}',
   '{"task_name": "string", "due_time": "string", "task_context": "string"}'::jsonb),

  ('daily_brief_ready', 'Daily Brief Ready', 'Your BuildOS daily brief is ready! Key focus: {{main_focus}}. Check the app for details.',
   '{"main_focus": "string"}'::jsonb),

  ('urgent_task', 'Urgent Task Alert', 'URGENT: {{task_name}} needs attention. Due: {{due_date}}. Reply STOP to opt out.',
   '{"task_name": "string", "due_date": "string"}'::jsonb),

  ('welcome_sms', 'Welcome Message', 'Welcome to BuildOS! We''ll help you stay on track. Reply HELP for commands or STOP to opt out.',
   '{}'::jsonb);

-- Analyze tables for query optimization
ANALYZE sms_messages;
ANALYZE sms_templates;
ANALYZE user_sms_preferences;
```

### Phase 3: Environment Variables (Day 1)

#### 3.1 Update Environment Files

**apps/web/.env.example:** (Add these lines)

```bash
# Twilio Configuration
PRIVATE_TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
PRIVATE_TWILIO_AUTH_TOKEN=your-auth-token
PRIVATE_TWILIO_MESSAGING_SERVICE_SID=MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
PRIVATE_TWILIO_VERIFY_SERVICE_SID=VAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx  # Optional for phone verification
PRIVATE_TWILIO_STATUS_CALLBACK_URL=https://your-domain.com/api/webhooks/twilio/status

# SMS Rate Limiting (optional)
PRIVATE_SMS_RATE_LIMIT_PER_MINUTE=10
PRIVATE_SMS_RATE_LIMIT_PER_HOUR=100
```

**apps/worker/.env.example:** (Add these lines)

```bash
# Twilio Configuration (Worker needs same access)
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_MESSAGING_SERVICE_SID=MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_STATUS_CALLBACK_URL=https://your-domain.com/api/webhooks/twilio/status
```

**turbo.json:** (Add to globalEnv array)

```json
"PRIVATE_TWILIO_ACCOUNT_SID",
"PRIVATE_TWILIO_AUTH_TOKEN",
"PRIVATE_TWILIO_MESSAGING_SERVICE_SID",
"PRIVATE_TWILIO_VERIFY_SERVICE_SID",
"PRIVATE_TWILIO_STATUS_CALLBACK_URL",
"TWILIO_ACCOUNT_SID",
"TWILIO_AUTH_TOKEN",
"TWILIO_MESSAGING_SERVICE_SID"
```

### Phase 4: Core Twilio Service Implementation (Day 2)

#### 4.1 Twilio Client Wrapper

**packages/twilio-service/src/client.ts:**

```typescript
import twilio from 'twilio';
import type { Twilio } from 'twilio';
import type { MessageInstance } from 'twilio/lib/rest/api/v2010/account/message';

export interface TwilioConfig {
	accountSid: string;
	authToken: string;
	messagingServiceSid: string;
	verifyServiceSid?: string;
	statusCallbackUrl?: string;
}

export class TwilioClient {
	private client: Twilio;
	private config: TwilioConfig;

	constructor(config: TwilioConfig) {
		this.config = config;
		this.client = twilio(config.accountSid, config.authToken);
	}

	async sendSMS(params: {
		to: string;
		body: string;
		scheduledAt?: Date;
		metadata?: Record<string, any>;
	}): Promise<MessageInstance> {
		const messageParams: any = {
			messagingServiceSid: this.config.messagingServiceSid,
			to: this.formatPhoneNumber(params.to),
			body: params.body
		};

		// Handle scheduling (Twilio supports up to 7 days)
		if (params.scheduledAt) {
			const now = new Date();
			const diffHours = (params.scheduledAt.getTime() - now.getTime()) / (1000 * 60 * 60);

			if (diffHours > 0 && diffHours <= 168) {
				// Within 7 days
				messageParams.sendAt = params.scheduledAt.toISOString();
				messageParams.scheduleType = 'fixed';
			}
		}

		// Add status callback for delivery tracking
		if (this.config.statusCallbackUrl) {
			messageParams.statusCallback = this.config.statusCallbackUrl;

			// Pass metadata through status callback
			if (params.metadata) {
				const callbackUrl = new URL(this.config.statusCallbackUrl);
				Object.entries(params.metadata).forEach(([key, value]) => {
					callbackUrl.searchParams.append(key, String(value));
				});
				messageParams.statusCallback = callbackUrl.toString();
			}
		}

		try {
			return await this.client.messages.create(messageParams);
		} catch (error: any) {
			// Handle Twilio-specific errors
			if (error.code === 21211) {
				throw new Error(`Invalid phone number: ${params.to}`);
			} else if (error.code === 21610) {
				throw new Error('Message body exceeds maximum length');
			} else if (error.code === 21614) {
				throw new Error('Phone number is not SMS capable');
			}
			throw error;
		}
	}

	async verifyPhoneNumber(phoneNumber: string): Promise<{ verificationSid: string }> {
		if (!this.config.verifyServiceSid) {
			throw new Error('Verify service SID not configured');
		}

		const verification = await this.client.verify.v2
			.services(this.config.verifyServiceSid)
			.verifications.create({
				to: this.formatPhoneNumber(phoneNumber),
				channel: 'sms'
			});

		return { verificationSid: verification.sid };
	}

	async checkVerification(phoneNumber: string, code: string): Promise<boolean> {
		if (!this.config.verifyServiceSid) {
			throw new Error('Verify service SID not configured');
		}

		try {
			const verificationCheck = await this.client.verify.v2
				.services(this.config.verifyServiceSid)
				.verificationChecks.create({
					to: this.formatPhoneNumber(phoneNumber),
					code
				});

			return verificationCheck.status === 'approved';
		} catch (error) {
			return false;
		}
	}

	async getMessageStatus(messageSid: string): Promise<string> {
		const message = await this.client.messages(messageSid).fetch();
		return message.status;
	}

	async cancelScheduledMessage(messageSid: string): Promise<void> {
		await this.client.messages(messageSid).update({ status: 'canceled' });
	}

	private formatPhoneNumber(phone: string): string {
		// Remove all non-numeric characters
		const cleaned = phone.replace(/\D/g, '');

		// Add US country code if not present
		if (cleaned.length === 10) {
			return `+1${cleaned}`;
		} else if (cleaned.length === 11 && cleaned.startsWith('1')) {
			return `+${cleaned}`;
		} else if (cleaned.startsWith('+')) {
			return phone;
		}

		return `+${cleaned}`;
	}
}
```

#### 4.2 SMS Service with Template Support

**packages/twilio-service/src/services/sms.service.ts:**

```typescript
import type { SupabaseClient } from '@supabase/supabase-js';
import { TwilioClient } from '../client';
import type { Database } from '@buildos/shared-types';

export class SMSService {
	private twilioClient: TwilioClient;
	private supabase: SupabaseClient<Database>;

	constructor(twilioClient: TwilioClient, supabase: SupabaseClient<Database>) {
		this.twilioClient = twilioClient;
		this.supabase = supabase;
	}

	async sendTaskReminder(params: {
		userId: string;
		phoneNumber: string;
		taskName: string;
		dueDate: Date;
		projectContext?: string;
	}) {
		// Get template
		const { data: template } = await this.supabase
			.from('sms_templates')
			.select('*')
			.eq('template_key', 'task_reminder')
			.eq('is_active', true)
			.single();

		if (!template) {
			throw new Error('Task reminder template not found');
		}

		// Format the message
		const dueTime = this.formatRelativeTime(params.dueDate);
		const message = this.renderTemplate(template.message_template, {
			task_name: params.taskName,
			due_time: dueTime,
			task_context: params.projectContext || ''
		});

		// Check user preferences
		const canSend = await this.checkUserSMSPreferences(params.userId, 'task_reminders');
		if (!canSend) {
			throw new Error('User has disabled task reminder SMS');
		}

		// Create message record
		const { data: smsMessage } = await this.supabase
			.from('sms_messages')
			.insert({
				user_id: params.userId,
				phone_number: params.phoneNumber,
				message_content: message,
				template_id: template.id,
				template_vars: {
					task_name: params.taskName,
					due_time: dueTime,
					task_context: params.projectContext
				},
				priority: this.calculatePriority(params.dueDate),
				metadata: {
					type: 'task_reminder',
					task_name: params.taskName,
					due_date: params.dueDate
				}
			})
			.select()
			.single();

		// Send via Twilio
		try {
			const twilioMessage = await this.twilioClient.sendSMS({
				to: params.phoneNumber,
				body: message,
				metadata: {
					message_id: smsMessage.id,
					user_id: params.userId
				}
			});

			// Update with Twilio SID
			await this.supabase
				.from('sms_messages')
				.update({
					twilio_sid: twilioMessage.sid,
					status: 'sent',
					sent_at: new Date().toISOString()
				})
				.eq('id', smsMessage.id);

			// Update template usage
			await this.supabase.rpc('increment', {
				table_name: 'sms_templates',
				row_id: template.id,
				column_name: 'usage_count'
			});

			return { success: true, messageId: smsMessage.id };
		} catch (error: any) {
			// Update message with error
			await this.supabase
				.from('sms_messages')
				.update({
					status: 'failed',
					twilio_error_message: error.message,
					twilio_error_code: error.code
				})
				.eq('id', smsMessage.id);

			throw error;
		}
	}

	async sendDailyBriefNotification(params: {
		userId: string;
		phoneNumber: string;
		mainFocus: string;
		briefId: string;
	}) {
		const { data: template } = await this.supabase
			.from('sms_templates')
			.select('*')
			.eq('template_key', 'daily_brief_ready')
			.eq('is_active', true)
			.single();

		if (!template) {
			throw new Error('Daily brief template not found');
		}

		const message = this.renderTemplate(template.message_template, {
			main_focus: params.mainFocus
		});

		// Send with high priority
		return this.sendWithRetry({
			userId: params.userId,
			phoneNumber: params.phoneNumber,
			message,
			templateId: template.id,
			priority: 'high',
			metadata: {
				type: 'daily_brief',
				brief_id: params.briefId
			}
		});
	}

	private async sendWithRetry(params: any, maxAttempts = 3) {
		let lastError: any;

		for (let attempt = 1; attempt <= maxAttempts; attempt++) {
			try {
				return await this.sendMessage(params);
			} catch (error: any) {
				lastError = error;

				// Don't retry for certain errors
				if (error.code === 21211 || error.code === 21614) {
					throw error;
				}

				// Exponential backoff
				if (attempt < maxAttempts) {
					await new Promise((resolve) =>
						setTimeout(resolve, Math.pow(2, attempt) * 1000)
					);
				}
			}
		}

		throw lastError;
	}

	private async sendMessage(params: any) {
		// Implementation details for sending a single message
		// Similar to sendTaskReminder but more generic
	}

	private renderTemplate(template: string, vars: Record<string, any>): string {
		return template.replace(/{{(\w+)}}/g, (match, key) => {
			return vars[key] || '';
		});
	}

	private formatRelativeTime(date: Date): string {
		const now = new Date();
		const diff = date.getTime() - now.getTime();
		const hours = Math.floor(diff / (1000 * 60 * 60));

		if (hours < 1) {
			const minutes = Math.floor(diff / (1000 * 60));
			return `in ${minutes} minutes`;
		} else if (hours < 24) {
			return `in ${hours} hours`;
		} else {
			const days = Math.floor(hours / 24);
			return `in ${days} days`;
		}
	}

	private calculatePriority(dueDate: Date): string {
		const hoursUntilDue = (dueDate.getTime() - Date.now()) / (1000 * 60 * 60);

		if (hoursUntilDue < 1) return 'urgent';
		if (hoursUntilDue < 24) return 'high';
		if (hoursUntilDue < 72) return 'normal';
		return 'low';
	}

	private async checkUserSMSPreferences(
		userId: string,
		preferenceType: string
	): Promise<boolean> {
		const { data: prefs } = await this.supabase
			.from('user_sms_preferences')
			.select('*')
			.eq('user_id', userId)
			.single();

		if (!prefs || !prefs.phone_verified || prefs.opted_out) {
			return false;
		}

		// Check quiet hours
		const now = new Date();
		const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

		if (prefs.quiet_hours_start && prefs.quiet_hours_end) {
			const isInQuietHours = this.isTimeInRange(
				currentTime,
				prefs.quiet_hours_start,
				prefs.quiet_hours_end
			);

			if (isInQuietHours && preferenceType !== 'urgent_alerts') {
				return false;
			}
		}

		// Check daily limit
		if (prefs.daily_sms_count >= prefs.daily_sms_limit) {
			return false;
		}

		return prefs[preferenceType] === true;
	}

	private isTimeInRange(current: string, start: string, end: string): boolean {
		// Handle overnight quiet hours (e.g., 21:00 to 08:00)
		if (start > end) {
			return current >= start || current <= end;
		}
		return current >= start && current <= end;
	}
}
```

### Phase 5: Worker Integration (Day 2)

#### 5.1 SMS Job Processor

**apps/worker/src/workers/smsWorker.ts:**

```typescript
import type { LegacyJob } from '../workers/shared/jobAdapter';
import { TwilioClient, SMSService } from '@buildos/twilio-service';
import { createClient } from '@supabase/supabase-js';
import { updateJobStatus } from '../lib/supabase';
import { notifyUser } from '../lib/services/notification-service';

const twilioClient = new TwilioClient({
	accountSid: process.env.PRIVATE_TWILIO_ACCOUNT_SID!,
	authToken: process.env.PRIVATE_TWILIO_AUTH_TOKEN!,
	messagingServiceSid: process.env.PRIVATE_TWILIO_MESSAGING_SERVICE_SID!,
	statusCallbackUrl: process.env.PRIVATE_TWILIO_STATUS_CALLBACK_URL
});

const supabase = createClient(
	process.env.PUBLIC_SUPABASE_URL!,
	process.env.PRIVATE_SUPABASE_SERVICE_KEY!
);

const smsService = new SMSService(twilioClient, supabase);

export async function processSMSJob(job: LegacyJob<any>) {
	const { message_id, phone_number, message, priority } = job.data;

	try {
		await updateJobStatus(job.id, 'processing', 'send_sms');

		// Update progress
		await job.updateProgress({
			current: 1,
			total: 3,
			message: 'Sending SMS...'
		});

		// Get message details from database
		const { data: smsMessage } = await supabase
			.from('sms_messages')
			.select('*')
			.eq('id', message_id)
			.single();

		if (!smsMessage) {
			throw new Error('SMS message not found');
		}

		// Send via Twilio
		const twilioMessage = await twilioClient.sendSMS({
			to: phone_number,
			body: message,
			metadata: {
				message_id,
				user_id: job.data.user_id
			}
		});

		await job.updateProgress({
			current: 2,
			total: 3,
			message: 'Updating status...'
		});

		// Update message status
		await supabase
			.from('sms_messages')
			.update({
				status: 'sent',
				twilio_sid: twilioMessage.sid,
				sent_at: new Date().toISOString()
			})
			.eq('id', message_id);

		await job.updateProgress({
			current: 3,
			total: 3,
			message: 'SMS sent successfully'
		});

		await updateJobStatus(job.id, 'completed', 'send_sms');

		// Notify user of successful send (optional)
		await notifyUser(job.data.user_id, 'sms_sent', {
			message_id,
			phone_number
		});

		return { success: true, twilio_sid: twilioMessage.sid };
	} catch (error: any) {
		console.error('SMS job failed:', error);

		// Update message status with error
		await supabase
			.from('sms_messages')
			.update({
				status: 'failed',
				twilio_error_message: error.message,
				attempt_count: supabase.raw('attempt_count + 1')
			})
			.eq('id', message_id);

		await updateJobStatus(job.id, 'failed', 'send_sms', error.message);

		// Check if we should retry
		const { data: message } = await supabase
			.from('sms_messages')
			.select('attempt_count, max_attempts')
			.eq('id', message_id)
			.single();

		if (message && message.attempt_count < message.max_attempts) {
			// Re-queue with exponential backoff
			const delay = Math.pow(2, message.attempt_count) * 60; // minutes

			await supabase.rpc('add_queue_job', {
				p_user_id: job.data.user_id,
				p_job_type: 'send_sms',
				p_metadata: job.data,
				p_scheduled_for: new Date(Date.now() + delay * 60000).toISOString(),
				p_priority: priority === 'urgent' ? 1 : 10
			});
		}

		throw error;
	}
}
```

#### 5.2 Register SMS Worker

**apps/worker/src/lib/supabaseQueue.ts:** (Add to existing file)

```typescript
// Import the SMS worker
import { processSMSJob } from '../workers/smsWorker';

// In the constructor or initialization, add the SMS processor
this.registerProcessor('send_sms', processSMSJob);
```

### Phase 6: Web App Integration (Day 3)

#### 6.1 SMS Service for Web App

**apps/web/src/lib/services/sms.service.ts:**

```typescript
import { ApiService } from './base/api-service';
import type { ServiceResponse } from './base/types';
import { supabase } from '$lib/supabase';

export interface SendSMSParams {
	userId: string;
	phoneNumber: string;
	message: string;
	templateKey?: string;
	templateVars?: Record<string, any>;
	priority?: 'low' | 'normal' | 'high' | 'urgent';
	scheduledFor?: Date;
	metadata?: Record<string, any>;
}

export class SMSService extends ApiService {
	private static instance: SMSService;

	private constructor() {
		super();
	}

	public static getInstance(): SMSService {
		if (!SMSService.instance) {
			SMSService.instance = new SMSService();
		}
		return SMSService.instance;
	}

	async sendSMS(params: SendSMSParams): Promise<ServiceResponse<{ messageId: string }>> {
		try {
			// Check user SMS preferences
			const { data: prefs } = await supabase
				.from('user_sms_preferences')
				.select('*')
				.eq('user_id', params.userId)
				.single();

			if (!prefs || !prefs.phone_verified) {
				return {
					success: false,
					errors: [
						'Phone number not verified. Please verify your phone number in settings.'
					]
				};
			}

			if (prefs.opted_out) {
				return {
					success: false,
					errors: ['SMS notifications are disabled. Enable them in settings.']
				};
			}

			// Queue the SMS message
			const { data, error } = await supabase.rpc('queue_sms_message', {
				p_user_id: params.userId,
				p_phone_number: params.phoneNumber || prefs.phone_number,
				p_message: params.message,
				p_priority: params.priority || 'normal',
				p_scheduled_for: params.scheduledFor?.toISOString() || null,
				p_metadata: params.metadata || {}
			});

			if (error) {
				throw error;
			}

			return {
				success: true,
				data: { messageId: data }
			};
		} catch (error: any) {
			console.error('Failed to send SMS:', error);
			return {
				success: false,
				errors: [error.message || 'Failed to send SMS']
			};
		}
	}

	async sendTaskReminder(taskId: string): Promise<ServiceResponse<{ messageId: string }>> {
		try {
			// Get task details
			const { data: task } = await supabase
				.from('tasks')
				.select('*, projects(name)')
				.eq('id', taskId)
				.single();

			if (!task) {
				return {
					success: false,
					errors: ['Task not found']
				};
			}

			// Get user preferences
			const { data: prefs } = await supabase
				.from('user_sms_preferences')
				.select('*')
				.eq('user_id', task.user_id)
				.single();

			if (!prefs?.phone_number || !prefs.task_reminders) {
				return {
					success: false,
					errors: ['Task reminders are disabled or phone not configured']
				};
			}

			// Use the template-based approach
			return this.sendSMS({
				userId: task.user_id,
				phoneNumber: prefs.phone_number,
				message: '', // Will be filled by template
				templateKey: 'task_reminder',
				templateVars: {
					task_name: task.name,
					due_time: task.due_date,
					task_context: task.projects?.name
				},
				priority: task.priority === 'critical' ? 'urgent' : 'normal',
				metadata: {
					task_id: taskId,
					project_id: task.project_id
				}
			});
		} catch (error: any) {
			console.error('Failed to send task reminder:', error);
			return {
				success: false,
				errors: [error.message || 'Failed to send task reminder']
			};
		}
	}

	async verifyPhoneNumber(
		phoneNumber: string
	): Promise<ServiceResponse<{ verificationSent: boolean }>> {
		try {
			const response = await this.post('/api/sms/verify', { phoneNumber });
			return response;
		} catch (error: any) {
			return {
				success: false,
				errors: [error.message || 'Failed to send verification']
			};
		}
	}

	async confirmVerification(
		phoneNumber: string,
		code: string
	): Promise<ServiceResponse<{ verified: boolean }>> {
		try {
			const response = await this.post('/api/sms/verify/confirm', {
				phoneNumber,
				code
			});

			if (response.success) {
				// Update user preferences
				const {
					data: { user }
				} = await supabase.auth.getUser();
				if (user) {
					await supabase.from('user_sms_preferences').upsert({
						user_id: user.id,
						phone_number: phoneNumber,
						phone_verified: true,
						phone_verified_at: new Date().toISOString()
					});
				}
			}

			return response;
		} catch (error: any) {
			return {
				success: false,
				errors: [error.message || 'Failed to verify phone number']
			};
		}
	}
}

// Export singleton instance
export const smsService = SMSService.getInstance();
```

#### 6.2 API Endpoints

**apps/web/src/routes/api/sms/verify/+server.ts:**

```typescript
import { json } from '@sveltejs/kit';
import { TwilioClient } from '@buildos/twilio-service';
import {
	PRIVATE_TWILIO_ACCOUNT_SID,
	PRIVATE_TWILIO_AUTH_TOKEN,
	PRIVATE_TWILIO_MESSAGING_SERVICE_SID,
	PRIVATE_TWILIO_VERIFY_SERVICE_SID
} from '$env/static/private';

const twilioClient = new TwilioClient({
	accountSid: PRIVATE_TWILIO_ACCOUNT_SID,
	authToken: PRIVATE_TWILIO_AUTH_TOKEN,
	messagingServiceSid: PRIVATE_TWILIO_MESSAGING_SERVICE_SID,
	verifyServiceSid: PRIVATE_TWILIO_VERIFY_SERVICE_SID
});

export async function POST({ request, locals }) {
	const session = await locals.auth();
	if (!session?.user) {
		return json({ success: false, errors: ['Unauthorized'] }, { status: 401 });
	}

	const { phoneNumber } = await request.json();

	try {
		const result = await twilioClient.verifyPhoneNumber(phoneNumber);
		return json({ success: true, verificationSent: true });
	} catch (error: any) {
		return json(
			{
				success: false,
				errors: [error.message || 'Failed to send verification']
			},
			{ status: 400 }
		);
	}
}
```

### Phase 7: UI Components (Day 3)

#### 7.1 Phone Verification Component

**apps/web/src/lib/components/settings/PhoneVerification.svelte:**

```typescript
<script lang="ts">
  import { smsService } from '$lib/services/sms.service';
  import { toastService } from '$lib/stores/toast.store';

  let phoneNumber = $state('');
  let verificationCode = $state('');
  let verificationSent = $state(false);
  let isVerifying = $state(false);

  async function sendVerification() {
    if (!phoneNumber) {
      toastService.error('Please enter a phone number');
      return;
    }

    isVerifying = true;
    const result = await smsService.verifyPhoneNumber(phoneNumber);

    if (result.success) {
      verificationSent = true;
      toastService.success('Verification code sent!');
    } else {
      toastService.error(result.errors?.[0] || 'Failed to send verification');
    }
    isVerifying = false;
  }

  async function confirmVerification() {
    if (!verificationCode) {
      toastService.error('Please enter the verification code');
      return;
    }

    isVerifying = true;
    const result = await smsService.confirmVerification(phoneNumber, verificationCode);

    if (result.success) {
      toastService.success('Phone number verified successfully!');
      // Refresh the page or update parent component
      window.location.reload();
    } else {
      toastService.error('Invalid verification code');
    }
    isVerifying = false;
  }
</script>

<div class="space-y-4">
  {#if !verificationSent}
    <div>
      <label for="phone" class="block text-sm font-medium text-gray-700">
        Phone Number
      </label>
      <div class="mt-1 flex gap-2">
        <input
          type="tel"
          id="phone"
          bind:value={phoneNumber}
          placeholder="+1 (555) 123-4567"
          class="flex-1 rounded-md border-gray-300 shadow-sm"
          disabled={isVerifying}
        />
        <button
          onclick={sendVerification}
          disabled={isVerifying || !phoneNumber}
          class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {isVerifying ? 'Sending...' : 'Send Code'}
        </button>
      </div>
    </div>
  {:else}
    <div>
      <label for="code" class="block text-sm font-medium text-gray-700">
        Verification Code
      </label>
      <div class="mt-1 flex gap-2">
        <input
          type="text"
          id="code"
          bind:value={verificationCode}
          placeholder="123456"
          maxlength="6"
          class="flex-1 rounded-md border-gray-300 shadow-sm"
          disabled={isVerifying}
        />
        <button
          onclick={confirmVerification}
          disabled={isVerifying || !verificationCode}
          class="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
        >
          {isVerifying ? 'Verifying...' : 'Verify'}
        </button>
      </div>
      <button
        onclick={() => verificationSent = false}
        class="mt-2 text-sm text-blue-600 hover:text-blue-800"
      >
        Use a different number
      </button>
    </div>
  {/if}
</div>
```

### Phase 8: Testing & Monitoring (Day 4)

#### 8.1 Testing Strategy

**packages/twilio-service/src/**tests**/sms.test.ts:**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SMSService } from '../services/sms.service';
import { TwilioClient } from '../client';

vi.mock('../client');

describe('SMS Service', () => {
	let smsService: SMSService;
	let mockTwilioClient: any;
	let mockSupabase: any;

	beforeEach(() => {
		mockTwilioClient = {
			sendSMS: vi.fn().mockResolvedValue({ sid: 'test-sid' })
		};

		mockSupabase = {
			from: vi.fn().mockReturnThis(),
			select: vi.fn().mockReturnThis(),
			eq: vi.fn().mockReturnThis(),
			single: vi.fn().mockResolvedValue({
				data: {
					id: 'template-id',
					message_template: 'Test {{name}}'
				}
			})
		};

		smsService = new SMSService(mockTwilioClient, mockSupabase);
	});

	it('should send task reminder SMS', async () => {
		const params = {
			userId: 'user-123',
			phoneNumber: '+15551234567',
			taskName: 'Complete report',
			dueDate: new Date(Date.now() + 3600000)
		};

		const result = await smsService.sendTaskReminder(params);

		expect(result.success).toBe(true);
		expect(mockTwilioClient.sendSMS).toHaveBeenCalledWith(
			expect.objectContaining({
				to: '+15551234567',
				body: expect.stringContaining('Complete report')
			})
		);
	});

	// Add more tests...
});
```

#### 8.2 Monitoring Queries

**SQL Dashboard Queries:**

```sql
-- Daily SMS metrics
SELECT
  DATE(created_at) as date,
  COUNT(*) as total_messages,
  COUNT(*) FILTER (WHERE status = 'sent') as sent,
  COUNT(*) FILTER (WHERE status = 'delivered') as delivered,
  COUNT(*) FILTER (WHERE status = 'failed') as failed,
  AVG(EXTRACT(EPOCH FROM (sent_at - created_at))) as avg_send_time_seconds
FROM sms_messages
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- Template usage
SELECT
  t.name,
  t.usage_count,
  COUNT(m.id) as messages_sent,
  AVG(CASE WHEN m.status = 'delivered' THEN 1 ELSE 0 END) as delivery_rate
FROM sms_templates t
LEFT JOIN sms_messages m ON m.template_id = t.id
GROUP BY t.id, t.name, t.usage_count
ORDER BY t.usage_count DESC;

-- User engagement
SELECT
  u.user_id,
  u.phone_verified,
  u.task_reminders,
  u.daily_brief_sms,
  COUNT(m.id) as messages_received,
  MAX(m.sent_at) as last_message_sent
FROM user_sms_preferences u
LEFT JOIN sms_messages m ON m.user_id = u.user_id
WHERE u.opted_out = false
GROUP BY u.user_id, u.phone_verified, u.task_reminders, u.daily_brief_sms
ORDER BY messages_received DESC;
```

## Implementation Checklist

### Day 1

- [ ] Create Twilio Service package structure
- [ ] Configure package.json and tsconfig.json
- [ ] Run database migration for SMS tables
- [ ] Add environment variables to .env files
- [ ] Update turbo.json with new env vars

### Day 2

- [ ] Implement TwilioClient wrapper
- [ ] Create SMS Service with template support
- [ ] Implement SMS worker processor
- [ ] Register SMS job type in queue system
- [ ] Test worker integration

### Day 3

- [ ] Create web app SMS service
- [ ] Implement API endpoints for verification
- [ ] Build phone verification UI component
- [ ] Add SMS preferences to user settings
- [ ] Test end-to-end flow

### Day 4

- [ ] Write unit tests
- [ ] Set up monitoring dashboards
- [ ] Test rate limiting and error handling
- [ ] Document API usage
- [ ] Deploy to staging environment

## Key Integration Points

1. **Queue System**: Leverages existing Supabase queue (pgmq) infrastructure
2. **Worker Service**: Integrates seamlessly with existing job processors
3. **User Preferences**: Extends current preference system for SMS settings
4. **Templates**: Follows email template patterns for consistency
5. **Error Handling**: Uses established error logging service
6. **Monitoring**: Integrates with existing dashboard and metrics

## Security Considerations

1. **Phone Verification**: Required before sending any SMS
2. **Rate Limiting**: Per-user and global limits enforced
3. **Quiet Hours**: Respects user-defined quiet periods
4. **Opt-out**: STOP keyword handling and preference management
5. **RLS Policies**: Row-level security on all SMS tables
6. **Audit Trail**: Complete message history and delivery tracking

## Cost Optimization

1. **Message Pooling**: Use Twilio Messaging Service for better deliverability
2. **Template Caching**: Reduce database queries for frequently used templates
3. **Smart Scheduling**: Batch non-urgent messages during off-peak hours
4. **Delivery Optimization**: Skip SMS for users who haven't engaged recently

## Next Steps

After implementation:

1. Add WhatsApp Business API support
2. Implement MMS for rich media
3. Add international number support
4. Build SMS analytics dashboard
5. Create A/B testing framework for message optimization

This tailored plan integrates perfectly with the existing BuildOS architecture, reusing established patterns and infrastructure while adding robust SMS capabilities.
