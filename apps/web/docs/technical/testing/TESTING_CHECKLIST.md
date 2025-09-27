# Comprehensive Testing Checklist

This document provides detailed testing procedures for all phases of development. Use this checklist to ensure comprehensive test coverage and quality assurance.

## Table of Contents

1. [Pre-Development Testing](#pre-development-testing)
2. [Unit Testing](#unit-testing)
3. [Integration Testing](#integration-testing)
4. [UI/E2E Testing](#uie2e-testing)
5. [LLM Testing](#llm-testing)
6. [Performance Testing](#performance-testing)
7. [Security Testing](#security-testing)
8. [Accessibility Testing](#accessibility-testing)
9. [Cross-Platform Testing](#cross-platform-testing)
10. [Deployment Testing](#deployment-testing)

---

## Pre-Development Testing

### Baseline Health Check

Before starting any new development, establish a clean testing baseline:

```bash
# Ensure all existing tests pass
pnpm run test

# Verify type checking
pnpm run check

# Confirm linting standards
pnpm run lint

# Validate build process
pnpm run build

# Run full CI pipeline
pnpm run pre-push
```

### Environment Validation

- [ ] **Node.js version:** Verify 20.19.0+ is installed
- [ ] **pnpm version:** Confirm 8.0+ is available
- [ ] **Database connection:** Supabase connection working
- [ ] **Environment variables:** All required variables set
- [ ] **Git status:** Working directory clean, on correct branch

---

## Unit Testing

### Test Configuration

The project uses **dual Vitest configurations** for efficient testing:

#### Standard Unit Tests

```bash
# Run standard tests (excludes expensive LLM tests)
pnpm run test

# Watch mode for development
pnpm run test:watch

# Coverage report
pnpm run test:coverage
```

**Configuration:** `vitest.config.ts`

- **Environment:** Node.js
- **Excludes:** `**/lib/tests/llm/**` (expensive AI tests)
- **Setup:** `vitest.setup.ts`

#### LLM Tests (Use Sparingly)

```bash
# Run AI/LLM tests (costs money - use carefully)
pnpm run test:llm

# Watch mode for LLM tests
pnpm run test:llm:watch
```

**Configuration:** `vitest.config.llm.ts`

- **Timeout:** 20 seconds (for API calls)
- **Concurrency:** 1 (avoids rate limiting)
- **Includes:** Only `**/lib/tests/llm/**/*.test.ts`

### Unit Testing Checklist

#### Service Layer Testing

- [ ] **Business logic:** All core functions tested in isolation
- [ ] **Error handling:** Exception paths covered
- [ ] **Edge cases:** Boundary conditions tested
- [ ] **Mocking:** External dependencies properly mocked
- [ ] **State management:** State changes validated

#### Component Testing (Svelte)

- [ ] **Rendering:** Components render without errors
- [ ] **Props:** All prop combinations tested
- [ ] **Events:** Event emissions verified
- [ ] **Slots:** Slot content properly rendered
- [ ] **Reactivity:** State changes trigger updates

#### Utility Function Testing

- [ ] **Pure functions:** Input/output validation
- [ ] **Type safety:** TypeScript types respected
- [ ] **Performance:** Functions perform within expectations
- [ ] **Documentation:** JSDoc examples work as documented

#### API Endpoint Testing

- [ ] **Request validation:** Input sanitization and validation
- [ ] **Response formatting:** Consistent `ApiResponse` usage
- [ ] **Authentication:** Proper session handling
- [ ] **Authorization:** Permission boundaries respected
- [ ] **Error responses:** Appropriate status codes and messages

---

## Integration Testing

### Database Integration

- [ ] **CRUD operations:** Create, read, update, delete work correctly
- [ ] **Transactions:** Multi-step operations are atomic
- [ ] **Constraints:** Foreign key and unique constraints enforced
- [ ] **Migrations:** Schema changes apply correctly
- [ ] **Real-time subscriptions:** Live updates functioning
- [ ] **Row Level Security (RLS):** Permissions enforced at DB level

### API Integration

- [ ] **Full request/response cycles:** End-to-end API flows
- [ ] **Authentication flow:** Login, logout, session management
- [ ] **Error propagation:** Errors properly bubbled up
- [ ] **Data validation:** Request/response schemas validated
- [ ] **Rate limiting:** API limits respected

### Service Integration

- [ ] **Service dependencies:** Services interact correctly
- [ ] **Caching behavior:** Cache hits/misses working as expected
- [ ] **Event handling:** Service events properly propagated
- [ ] **Configuration:** Environment-specific behavior validated

### Third-Party Integration

- [ ] **Supabase integration:** Database and auth working
- [ ] **Stripe integration:** Payment flows complete
- [ ] **Google Calendar API:** Event sync functioning
- [ ] **Gmail API:** Email sending operational
- [ ] **OpenAI API:** LLM responses received (if applicable)

---

## UI/E2E Testing

### Playwright Testing Strategy

Use **Playwright MCP** for comprehensive UI testing:

#### Critical User Journeys

Test the main user flows:

- [ ] **User registration/onboarding:** Complete signup process
- [ ] **Authentication:** Login, logout, password reset
- [ ] **Project management:** Create, edit, delete projects
- [ ] **Task management:** Create, update, complete tasks
- [ ] **Recurring tasks:** Setup and manage recurring patterns
- [ ] **Brain dump processing:** Submit and process brain dumps
- [ ] **Calendar integration:** Sync events with Google Calendar
- [ ] **Subscription management:** Trial, upgrade, payment flows

#### Visual Testing

- [ ] **Screenshot regression:** Compare visual changes
- [ ] **Layout consistency:** Components properly positioned
- [ ] **Typography:** Fonts and sizing consistent
- [ ] **Color schemes:** Brand colors applied correctly
- [ ] **Icons and imagery:** Visual assets loading

#### Interaction Testing

- [ ] **Form submission:** All forms submit correctly
- [ ] **Navigation:** Links and routing work properly
- [ ] **Modal dialogs:** Open, close, and interaction behavior
- [ ] **Dropdown menus:** Selection and state management
- [ ] **Drag and drop:** If applicable, verify functionality
- [ ] **Keyboard navigation:** Tab order and keyboard shortcuts

#### State Management Testing

- [ ] **Data persistence:** State maintained across page reloads
- [ ] **Real-time updates:** Live data changes reflected in UI
- [ ] **Error states:** UI properly displays error conditions
- [ ] **Loading states:** Proper loading indicators shown
- [ ] **Empty states:** Appropriate messaging when no data

---

## LLM Testing

### When to Run LLM Tests

**⚠️ Important:** LLM tests cost money and should be used sparingly.

**Run LLM tests when:**

- [ ] Modifying AI prompt templates
- [ ] Changing LLM integration logic
- [ ] Updating brain dump processing
- [ ] Modifying AI-generated content flows
- [ ] Before major releases with AI features

**Do NOT run LLM tests for:**

- [ ] UI-only changes
- [ ] Database schema updates
- [ ] Non-AI feature development
- [ ] Routine bug fixes

### LLM Testing Checklist

```bash
# Run expensive AI tests
pnpm run test:llm
```

- [ ] **Prompt template validation:** Expected outputs generated
- [ ] **Error handling:** Graceful degradation when LLM unavailable
- [ ] **Response parsing:** AI responses correctly processed
- [ ] **Fallback mechanisms:** Backup providers work if primary fails
- [ ] **Rate limiting:** API rate limits respected
- [ ] **Cost monitoring:** Track API usage and costs

### LLM Test Categories

#### Brain Dump Processing

- [ ] **Dual processing system:** Both processing paths working
- [ ] **Task extraction:** AI correctly identifies tasks
- [ ] **Context understanding:** Relevant project context used
- [ ] **Output formatting:** Structured responses generated

#### Daily Brief Generation

- [ ] **Template rendering:** AI uses correct templates
- [ ] **Project summarization:** Accurate project status summaries
- [ ] **Action item identification:** Important tasks highlighted
- [ ] **Personalization:** User-specific content generated

---

## Performance Testing

### Bundle Analysis

```bash
# Analyze bundle size and composition
pnpm run build:analyze
```

- [ ] **Bundle size impact:** New features don't significantly increase bundle
- [ ] **Code splitting:** Large features properly split
- [ ] **Tree shaking:** Unused code eliminated
- [ ] **Asset optimization:** Images and fonts optimized

### Runtime Performance

- [ ] **Page load times:** Initial load under 2 seconds
- [ ] **Time to Interactive (TTI):** Interactive within 3 seconds
- [ ] **Largest Contentful Paint (LCP):** Under 2.5 seconds
- [ ] **First Input Delay (FID):** Under 100ms
- [ ] **Cumulative Layout Shift (CLS):** Under 0.1

### Memory Management

- [ ] **Memory leaks:** No continuous memory growth
- [ ] **Component cleanup:** Proper unmounting and cleanup
- [ ] **Event listener cleanup:** All listeners removed
- [ ] **Subscription cleanup:** Real-time subscriptions properly closed

### Database Performance

- [ ] **Query optimization:** Efficient database queries
- [ ] **Index usage:** Proper indexes for common queries
- [ ] **Connection pooling:** Database connections managed efficiently
- [ ] **Real-time performance:** Subscriptions don't impact performance

### Scalability Testing

- [ ] **Concurrent users:** Handle multiple simultaneous users
- [ ] **Large datasets:** Performance with realistic data volumes
- [ ] **API rate limits:** Graceful handling of rate limits
- [ ] **Resource utilization:** Efficient CPU and memory usage

---

## Security Testing

### Authentication & Authorization

- [ ] **Session management:** Secure session handling
- [ ] **Token validation:** JWT tokens properly validated
- [ ] **Permission boundaries:** Users can't access unauthorized data
- [ ] **Password security:** Proper hashing and validation
- [ ] **OAuth flows:** Google OAuth integration secure

### Data Protection

- [ ] **Input sanitization:** All user inputs properly sanitized
- [ ] **SQL injection prevention:** Parameterized queries used
- [ ] **XSS protection:** User content properly escaped
- [ ] **CSRF protection:** Cross-site request forgery prevented
- [ ] **Sensitive data exposure:** No secrets in client-side code

### API Security

- [ ] **HTTPS enforcement:** All API calls use HTTPS
- [ ] **Rate limiting:** API endpoints properly rate limited
- [ ] **Input validation:** Server-side input validation
- [ ] **Error handling:** No sensitive info in error messages
- [ ] **Audit logging:** Security events properly logged

### Environment Security

- [ ] **Environment variables:** Secrets not committed to repo
- [ ] **Build process:** No secrets in build artifacts
- [ ] **Dependencies:** No known vulnerabilities in dependencies
- [ ] **Configuration:** Secure default configurations

---

## Accessibility Testing

### WCAG Compliance

Following Web Content Accessibility Guidelines (WCAG) 2.1 Level AA:

#### Perceivable

- [ ] **Color contrast:** Minimum 4.5:1 contrast ratio for normal text
- [ ] **Text alternatives:** Images have appropriate alt text
- [ ] **Adaptable content:** Content maintains meaning with CSS disabled
- [ ] **Distinguishable content:** Content distinguishable from background

#### Operable

- [ ] **Keyboard accessible:** All functionality available via keyboard
- [ ] **No seizures:** No content causes seizures or physical reactions
- [ ] **Navigable:** Users can navigate and find content
- [ ] **Input assistance:** Users helped to avoid and correct mistakes

#### Understandable

- [ ] **Readable:** Text readable and understandable
- [ ] **Predictable:** Web pages appear and operate predictably
- [ ] **Input assistance:** Users helped with input errors

#### Robust

- [ ] **Compatible:** Content works with assistive technologies
- [ ] **Valid markup:** HTML validates correctly
- [ ] **Future-proof:** Works with evolving assistive technologies

### Assistive Technology Testing

- [ ] **Screen reader compatibility:** Works with NVDA, JAWS, VoiceOver
- [ ] **Voice control:** Compatible with Dragon NaturallySpeaking
- [ ] **Switch navigation:** Operable with switch devices
- [ ] **Magnification:** Works with screen magnifiers

### Mobile Accessibility

- [ ] **Touch targets:** Minimum 44px touch target size
- [ ] **Gesture alternatives:** Alternative to complex gestures
- [ ] **Orientation support:** Works in both portrait and landscape
- [ ] **Zoom support:** Content scales up to 200% without horizontal scrolling

---

## Cross-Platform Testing

### Browser Compatibility

Test in multiple browsers and versions:

#### Desktop Browsers

- [ ] **Chrome:** Latest stable version
- [ ] **Firefox:** Latest stable version
- [ ] **Safari:** Latest stable version (if Mac available)
- [ ] **Edge:** Latest stable version

#### Mobile Browsers

- [ ] **Chrome Mobile:** Android devices
- [ ] **Safari Mobile:** iOS devices
- [ ] **Samsung Internet:** Android devices
- [ ] **Firefox Mobile:** Android/iOS devices

### Device Testing

#### Screen Sizes

- [ ] **Mobile phones:** 320px - 768px width
- [ ] **Tablets:** 768px - 1024px width
- [ ] **Laptops:** 1024px - 1440px width
- [ ] **Desktop:** 1440px+ width

#### Operating Systems

- [ ] **Windows:** Latest Windows version
- [ ] **macOS:** Latest macOS version (if available)
- [ ] **Linux:** Ubuntu/similar distribution
- [ ] **iOS:** Latest iOS version
- [ ] **Android:** Latest Android version

### Responsive Design Validation

- [ ] **Breakpoint behavior:** Layout adapts correctly at breakpoints
- [ ] **Modal responsiveness:** Modals follow mobile-first patterns
- [ ] **Touch-friendly:** 44px minimum touch targets on mobile
- [ ] **Text readability:** Typography scales appropriately
- [ ] **Image optimization:** Images load efficiently on mobile

---

## Deployment Testing

### Pre-Deployment Validation

```bash
# Full CI pipeline
pnpm run pre-push

# Production build
pnpm run build:prod

# Preview production build
pnpm run preview
```

- [ ] **Build success:** Production build completes without errors
- [ ] **Environment variables:** Production environment variables set
- [ ] **Database migrations:** Schema changes deployed to production DB
- [ ] **Static assets:** All assets properly included in build
- [ ] **Configuration:** Production configuration values correct

### Smoke Testing

After deployment, verify core functionality:

- [ ] **Application loads:** Main page loads successfully
- [ ] **Authentication:** Users can log in successfully
- [ ] **Core features:** Primary user flows work
- [ ] **Database connectivity:** Data loads and saves correctly
- [ ] **External integrations:** Third-party services responding
- [ ] **Error monitoring:** Error tracking system functioning

### Rollback Testing

- [ ] **Rollback plan tested:** Rollback procedure verified
- [ ] **Database rollback:** Schema rollbacks tested (if applicable)
- [ ] **Recovery time:** Rollback can be completed within SLA
- [ ] **Data integrity:** No data loss during rollback process

### Performance Monitoring

- [ ] **Response times:** API response times within acceptable limits
- [ ] **Error rates:** Error rates below threshold
- [ ] **Resource utilization:** CPU, memory usage normal
- [ ] **User experience metrics:** Core Web Vitals meet standards

---

## Testing Automation

### Continuous Integration Testing

Set up automated testing in CI/CD pipeline:

```yaml
# Example GitHub Actions workflow
- name: Run Tests
  run: |
      pnpm run test
      pnpm run check  
      pnpm run lint
      pnpm run build

- name: Run E2E Tests
  run: |
      pnpm run test:e2e

# Only run LLM tests on main branch merges
- name: Run LLM Tests
  if: github.ref == 'refs/heads/main'
  run: pnpm run test:llm
```

### Test Data Management

- [ ] **Test fixtures:** Consistent test data across environments
- [ ] **Data cleanup:** Tests clean up after themselves
- [ ] **Isolation:** Tests don't depend on each other
- [ ] **Seed data:** Predictable initial state for tests

### Test Reporting

- [ ] **Coverage reports:** Code coverage tracked and reported
- [ ] **Test results:** Clear pass/fail reporting
- [ ] **Performance metrics:** Test execution time monitored
- [ ] **Failure notifications:** Team notified of test failures

---

## Emergency Testing Procedures

### Hotfix Testing

For critical production issues:

1. **Minimal test suite:** Run only tests related to the fix
2. **Manual verification:** Manually test the specific issue
3. **Regression check:** Verify fix doesn't break existing functionality
4. **Quick smoke test:** Test critical user journeys
5. **Monitor deployment:** Watch error rates after deployment

### Production Issue Investigation

- [ ] **Reproduce locally:** Attempt to reproduce issue in development
- [ ] **Log analysis:** Review application logs for errors
- [ ] **User impact assessment:** Understand scope of issue
- [ ] **Performance monitoring:** Check if performance related
- [ ] **Data integrity check:** Verify no data corruption

---

## Testing Best Practices

### General Principles

1. **Test early and often:** Don't batch testing to the end
2. **Write tests first:** Consider TDD approach for complex logic
3. **Keep tests simple:** Each test should verify one thing
4. **Use descriptive names:** Test names should explain what they verify
5. **Maintain tests:** Update tests when requirements change

### Test Organization

- **Group related tests:** Use `describe` blocks for organization
- **Use setup/teardown:** Proper before/after hooks for test state
- **Mock external dependencies:** Use mocks for reliable testing
- **Test data factories:** Generate test data programmatically
- **Shared utilities:** Create reusable test helpers

### Debugging Failed Tests

1. **Read the error message:** Understand what exactly failed
2. **Check test data:** Verify test setup is correct
3. **Run in isolation:** Run single test to eliminate interference
4. **Add debug logging:** Use `console.log` to understand state
5. **Check recent changes:** Look at recent commits that might affect test

---

## Quality Gates

### Pre-Commit Quality Gate

All of these must pass before committing code:

```bash
pnpm run check      # Type checking
pnpm run lint       # Code quality
pnpm run test       # Unit tests (no LLM)
```

### Pre-Push Quality Gate

All of these must pass before pushing to remote:

```bash
pnpm run pre-push   # Full CI pipeline
```

This includes:

- ✅ Type checking
- ✅ Unit tests (no LLM)
- ✅ Linting
- ✅ Production build

### Pre-Release Quality Gate

Before releasing to production:

- ✅ All unit tests passing
- ✅ Integration tests passing
- ✅ UI/E2E tests passing
- ✅ Performance benchmarks met
- ✅ Security scan passed
- ✅ Accessibility compliance verified
- ✅ Cross-browser testing completed
- ✅ LLM tests passing (if AI features modified)

---

_This checklist is living documentation. Update it based on learnings and new testing requirements._
