# ⚙️ Service Layer Documentation

This directory contains documentation for BuildOS service layer components that handle business logic and external integrations.

## 📁 Contents

### Core Service Documentation
- **`brain-dump-service.md`**: Brain dump processing service architecture and flows
- **`project-service.md`**: Project management service including CRUD operations and real-time updates
- **`calendar-service.md`**: Google Calendar integration service patterns
- **`prompt-service.md`**: AI prompt management and template service

## 🏗️ Service Architecture Patterns

BuildOS follows a layered service architecture:

### 1. Base Service Pattern
All services extend `ApiService` from `src/lib/services/base/api-service.ts`:
- Automatic error handling
- Retry logic with exponential backoff
- Type-safe responses
- Consistent logging

### 2. Service Categories

#### Data Services (Supabase Operations)
- `project.service.ts` - Project CRUD operations
- `braindump.service.ts` - Brain dump data persistence
- `user.service.ts` - User management

#### Processing Services (Business Logic)
- `braindump-processor.ts` - Core brain dump processing
- `phase-generation/` - Project phase generation strategies
- `dailyBrief/` - Daily brief generation

#### Integration Services (External APIs)
- `calendar-service.ts` - Google Calendar sync
- `email.service.ts` - Email delivery
- `stripe.service.ts` - Payment processing

### 3. Real-time Services
- `realtimeProject.service.ts` - Supabase real-time subscriptions
- `realtimeNotifications.service.ts` - Live updates

## 🔄 Development Patterns

When creating new services:
1. Extend `ApiService` base class
2. Implement proper error handling
3. Add comprehensive TypeScript types
4. Include unit tests
5. Document public methods with JSDoc