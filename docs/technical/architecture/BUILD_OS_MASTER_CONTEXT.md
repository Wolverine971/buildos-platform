# BUILD OS MASTER CONTEXT

## Overview

Build OS is a sophisticated AI-powered project management system that combines intelligent task management, content processing, and automation capabilities. This document serves as the comprehensive guide to the system's architecture, features, and development roadmap.

## Core System Architecture

### Technology Stack

- **Framework**: SvelteKit 2.16+ with Svelte 5.33+
- **Database**: Supabase (PostgreSQL with real-time subscriptions)
- **AI/LLM**: OpenAI integration with local Ollama support
- **Authentication**: Supabase Auth with Google OAuth
- **Payments**: Stripe for subscription management
- **Email**: Gmail API integration
- **Calendar**: Google Calendar with bidirectional sync
- **Styling**: TailwindCSS with custom component library

### Service Architecture Pattern

- Instance-based services with singleton pattern (not static methods)
- Client-side caching with LRU eviction and TTL
- Consistent error handling with `ApiResponse` utility
- Background processing for long-running operations
- Real-time updates via WebSockets and SSE

## Major Features

### 1. Brain Dump System (Modal-Based)

#### Overview

The Brain Dump feature has been redesigned as a modal-accessible system, allowing users to capture and process information from anywhere within the application.

#### Implementation Details

- **Access**: Available via modal from any page (removed from main navigation)
- **Primary Component**: `BrainDumpModal.svelte` (1,382 lines)
- **State Management**: Centralized store in `brain-dump.store.ts`
- **Service Layer**: `brain-dump.service.ts` handles API operations

#### Dual vs Single Processing Logic

**Processing Thresholds**:

- **Single Processing**: Content < 5,000 characters
    - Direct processing with immediate results
    - Single LLM call for extraction
    - Optimized for quick captures
- **Dual Processing**: Content ≥ 5,000 characters OR combined context ≥ 8,000 characters
    - Parallel processing of context and tasks
    - Real-time progress updates via SSE
    - Streaming results with retry mechanisms
    - Better handling of complex information

**Key Features**:

- Voice recording with WebSpeech API
- Live transcription with fallback
- Attachment support (images, documents)
- Project context integration
- Automatic task extraction
- Operation validation and execution

### 2. Recurring Tasks System

#### Implementation (January 2025 - completed)

Complete recurring task support with comprehensive management capabilities.

**Recurrence Patterns**:

- Daily
- Weekdays only
- Weekly (specific days)
- Biweekly
- Monthly (date or day-based)
- Quarterly
- Yearly

**Key Components**:

- `RecurrenceSelector.svelte`: Pattern selection with preview
- `RecurringDeleteModal.svelte`: Deletion scope management
- `recurring_task_instances` table: Instance tracking
- Google Calendar sync with RRULE generation

**Deletion Options**:

- Single instance only
- This and future instances
- All instances

### 3. Admin Dashboard System

#### Comprehensive Analytics Platform

Full-featured admin dashboard with real-time monitoring and management.

**Features**:

- **User Analytics**: Registration trends, active users, engagement metrics
- **Revenue Tracking**: MRR, churn rate, conversion metrics
- **System Health**: Error monitoring, performance metrics
- **Beta Program**: Feature flag management, user enrollment
- **Feedback System**: Categorized feedback with resolution tracking
- **Template Analytics**: Usage statistics and performance

**Key Routes**:

- `/admin`: Main dashboard
- `/admin/errors`: Error monitoring and resolution
- `/admin/feedback`: User feedback management
- `/admin/users`: User management interface

### 4. Project Management System

#### Hierarchical Structure

- **Projects**: Top-level containers with metadata
- **Phases**: Project subdivisions with timelines
- **Tasks**: Actionable items with priorities
- **Context Documents**: Supporting materials and references

#### Advanced Features

- Real-time collaboration via Supabase subscriptions
- Automated task generation from brain dumps
- Progress tracking and analytics
- Calendar integration for scheduling
- Daily briefs with AI summaries

### 5. Subscription & Payment System

#### Stripe Integration

Complete subscription management with trial support.

**Features**:

- 14-day free trial with automatic conversion
- Multiple subscription tiers
- Dunning management for failed payments
- Customer portal integration
- Invoice generation and download
- Usage-based limits enforcement

### 6. Calendar Integration

#### Google Calendar Sync

Bidirectional synchronization with advanced features.

**Capabilities**:

- Task scheduling with automatic sync
- Recurring event support with RRULE
- Webhook handling for real-time updates
- Conflict resolution
- Time zone management

### 7. Email System

#### Gmail Integration

Automated email management and notifications.

**Features**:

- OAuth-based authentication
- Automated notifications
- Email tracking and analytics
- Template-based messaging
- Bulk operations support

## System Gaps & Considerations

### Current Limitations

1. **Documentation Gaps**:
    - Admin dashboard features undocumented
    - Recurring tasks implementation needs user guide
    - Brain dump modal transition not reflected in docs
    - Error handling patterns need documentation

2. **Technical Debt**:
    - Some components still using old static service patterns
    - Inconsistent error handling in older routes
    - Mobile optimization needed for complex views
    - Performance optimization for large datasets

3. **Feature Completeness**:
    - Collaboration features partially implemented
    - Notification system needs expansion
    - Offline support not implemented
    - Export functionality limited

## Future Development Priorities

### Phase 1: Immediate (September 2025)

1. **Documentation & Polish**:
    - Complete admin dashboard documentation
    - Create user guides for recurring tasks
    - Update brain dump documentation for modal system
    - Add API documentation for integrations

2. **Performance Optimization**:
    - Implement lazy loading for large lists
    - Optimize database queries with better indexing
    - Add response caching for frequently accessed data
    - Reduce bundle size with code splitting

3. **User Experience Enhancements**:
    - Add keyboard shortcuts for common actions
    - Implement undo/redo functionality
    - Enhance mobile responsiveness
    - Add dark mode support

### Phase 2: Short-term (October-November 2025)

1. **Collaboration Features**:
    - Multi-user project support
    - Real-time collaborative editing
    - Comment and mention system
    - Activity feeds and notifications

2. **AI Enhancements**:
    - Custom AI model fine-tuning
    - Improved context understanding
    - Batch operation support
    - Smart suggestions and autocomplete

3. **Integration Expansion**:
    - Slack integration for notifications
    - GitHub/GitLab integration for development projects
    - Notion/Confluence import/export
    - Zapier/Make.com webhooks

### Phase 3: Medium-term (Q4 2025 - Q1 2026)

1. **Enterprise Features**:
    - Team management and permissions
    - SSO/SAML authentication
    - Audit logging and compliance
    - Advanced reporting and analytics

2. **Mobile Applications**:
    - Native iOS application
    - Native Android application
    - Offline synchronization
    - Push notifications

3. **Advanced Automation**:
    - Workflow automation builder
    - Custom trigger system
    - Conditional logic for operations
    - Integration with CI/CD pipelines

### Phase 4: Long-term Vision (2026)

1. **AI Assistant Evolution**:
    - Proactive task suggestions
    - Predictive project planning
    - Natural language interface
    - Voice-first interaction mode

2. **Platform Expansion**:
    - API marketplace for extensions
    - Custom plugin system
    - White-label solutions
    - Multi-tenant architecture

3. **Analytics & Intelligence**:
    - Predictive analytics for project success
    - Resource optimization algorithms
    - Team performance insights
    - Industry benchmarking

## General Development Instructions

### Code Quality Standards

1. **Service Layer Pattern**:
    - Always use instance-based services with singleton pattern
    - Implement caching where appropriate
    - Use `ApiResponse` for consistent error handling
    - Avoid direct Supabase calls in components

2. **Component Architecture**:
    - Follow modal standards in `MODAL_STANDARDS.md`
    - Ensure mobile-first responsive design
    - Implement proper loading and error states
    - Use composition over inheritance

3. **Performance Guidelines**:
    - Lazy load heavy components
    - Implement virtual scrolling for large lists
    - Use optimistic UI updates
    - Minimize bundle size with dynamic imports

4. **Testing Requirements**:
    - Write unit tests for critical business logic
    - Implement integration tests for API routes
    - Add E2E tests for critical user flows
    - Maintain >70% code coverage

5. **Security Practices**:
    - Never expose sensitive data in client code
    - Implement proper authentication checks
    - Use CSRF protection for mutations
    - Validate all user inputs
    - Implement rate limiting

### Development Workflow

1. **Before Starting**:
    - Review this master context document
    - Check for existing similar implementations
    - Consider mobile-first design
    - Plan for error handling

2. **During Development**:
    - Follow existing patterns in codebase
    - Update types when modifying schemas
    - Add appropriate logging
    - Consider performance implications

3. **Before Committing**:
    - Run `pnpm run pre-push`
    - Update relevant documentation
    - Test on mobile devices
    - Verify accessibility standards

4. **After Deployment**:
    - Monitor error logs
    - Check performance metrics
    - Gather user feedback
    - Update documentation if needed

### Critical Reminders

- **Brain Dump Access**: Now modal-based, not a separate route
- **Dual Processing**: Triggers at 5,000 characters, not 3,000
- **Service Pattern**: Use instance-based, not static methods
- **Error Handling**: Always use `ApiResponse` utility
- **Mobile First**: All new features must work on mobile
- **Real-time Updates**: Consider subscription requirements
- **Calendar Sync**: Handle timezone and recurrence edge cases
- **Performance**: Monitor and optimize for large datasets

## System Health Checklist

### Daily Monitoring

- [ ] Check error logs in admin dashboard
- [ ] Monitor API response times
- [ ] Review failed payment notifications
- [ ] Check calendar sync status
- [ ] Monitor AI processing queue

### Weekly Tasks

- [ ] Review user feedback
- [ ] Analyze usage metrics
- [ ] Check subscription conversions
- [ ] Update documentation
- [ ] Plan feature releases

### Monthly Reviews

- [ ] Performance optimization analysis
- [ ] Security audit
- [ ] Database optimization
- [ ] Cost analysis
- [ ] User satisfaction survey

## Contact & Support

For questions about this system:

- Technical Issues: Check `/admin/errors` for system status
- User Feedback: Submit via feedback modal
- Development: Refer to `/docs/development/` guides
- Architecture: See `/docs/architecture/` documentation

---

_Last Updated: August 2025_
_Version: 2.0.0_
_Status: Production_
