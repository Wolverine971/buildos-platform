#!/bin/bash

# Architecture placeholders
echo "# Brain Dump Flow Architecture
PLACEHOLDER - To be migrated from audits/BRAINDUMP_FLOW_AUDIT_2025.md" > docs/technical/architecture/brain-dump-flow.md

echo "# Supabase Architecture
PLACEHOLDER - To be migrated from existing architecture docs" > docs/technical/architecture/supabase-design.md

echo "# AI Pipeline Architecture
PLACEHOLDER - Document OpenAI integration patterns" > docs/technical/architecture/ai-pipeline.md

echo "# Calendar Sync Architecture
PLACEHOLDER - To be migrated from CALENDAR_SERVICE_FLOW.md" > docs/technical/architecture/calendar-sync.md

# ADRs
echo "# ADR-001: Why Supabase
PLACEHOLDER - Document decision to use Supabase" > docs/technical/architecture/decisions/ADR-001-supabase.md

echo "# ADR-002: Dual Processing Architecture
PLACEHOLDER - Document brain dump dual processing decision" > docs/technical/architecture/decisions/ADR-002-dual-processing.md

echo "# ADR-003: Project Calendars
PLACEHOLDER - Document per-project calendar decision" > docs/technical/architecture/decisions/ADR-003-project-calendars.md

# Services
echo "# Brain Dump Service Documentation
PLACEHOLDER - Implementation details for brain dump processing" > docs/technical/services/brain-dump-service.md

echo "# Project Service Documentation
PLACEHOLDER - Project management service layer" > docs/technical/services/project-service.md

echo "# Calendar Service Documentation
PLACEHOLDER - Google Calendar integration service" > docs/technical/services/calendar-service.md

echo "# Prompt Service Documentation
PLACEHOLDER - AI prompt management service" > docs/technical/services/prompt-service.md

# API endpoints
echo "# Brain Dumps API
PLACEHOLDER - Document /api/braindumps/* endpoints" > docs/technical/api/endpoints/braindumps.md

echo "# Projects API
PLACEHOLDER - Document /api/projects/* endpoints" > docs/technical/api/endpoints/projects.md

echo "# Calendar API
PLACEHOLDER - Document /api/calendar/* endpoints" > docs/technical/api/endpoints/calendar.md

echo "# Daily Briefs API
PLACEHOLDER - Document /api/daily-briefs/* endpoints" > docs/technical/api/endpoints/daily-briefs.md

# Database
echo "# Database Schema Documentation
PLACEHOLDER - Generated from database.schema.ts" > docs/technical/database/schema.md

echo "# Row Level Security Policies
PLACEHOLDER - Document Supabase RLS policies" > docs/technical/database/rls-policies.md

echo "# Database Indexes
PLACEHOLDER - Performance optimization indexes" > docs/technical/database/indexes.md

# Runbooks
echo "# Supabase Connection Recovery
PLACEHOLDER - How to recover from Supabase connection issues" > docs/technical/deployment/runbooks/supabase-recovery.md

echo "# OpenAI Rate Limiting Response
PLACEHOLDER - Handling OpenAI API rate limits" > docs/technical/deployment/runbooks/openai-rate-limiting.md

echo "# Calendar Webhook Failures
PLACEHOLDER - Troubleshooting calendar webhook issues" > docs/technical/deployment/runbooks/calendar-webhook-failures.md

echo "# Stripe Webhook Validation
PLACEHOLDER - Fixing Stripe webhook signature failures" > docs/technical/deployment/runbooks/stripe-webhook-validation.md

echo "# Incident Response Template
PLACEHOLDER - Standard incident response procedures" > docs/technical/deployment/runbooks/incident-response.md

# Testing
echo "# Testing Strategy
PLACEHOLDER - Overall testing approach" > docs/technical/testing/strategy.md

echo "# Vitest Configuration
PLACEHOLDER - Unit test setup with Vitest" > docs/technical/testing/vitest-setup.md

echo "# LLM Testing Patterns
PLACEHOLDER - Testing AI prompts and responses" > docs/technical/testing/llm-testing.md

# Development
echo "# Getting Started
PLACEHOLDER - Quick setup guide for developers" > docs/technical/development/getting-started.md

echo "# SvelteKit Patterns
PLACEHOLDER - SvelteKit best practices" > docs/technical/development/sveltekit-patterns.md

echo "# Svelte 5 Runes Guide
PLACEHOLDER - Using $state, $derived, $effect" > docs/technical/development/svelte5-runes.md

echo "Created all technical documentation placeholders"
