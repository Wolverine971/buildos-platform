<!-- apps/web/docs/technical/api/README.md -->

# API Documentation

Welcome to the BuildOS API documentation.

## Quick Links

- [📖 Interactive API Documentation](/docs/api.html) - Test API endpoints directly in your browser
- [🛠 Route Reference](./routes-reference.md) - Complete list of all API endpoints
- [📋 Type Definitions](./types.md) - TypeScript interfaces and types
- [📝 Request/Response Templates](./templates.md) - Standard formats and examples

## Getting Started

1. **Authentication**: Most endpoints require authentication via Supabase session cookies
2. **Base URL**: All API endpoints are prefixed with `/api`
3. **Response Format**: All responses follow a standard JSON format with `success`, `data`, and `error` fields
4. **Rate Limiting**: API requests are rate-limited to prevent abuse

## API Categories

- **Authentication**: User login, registration, and session management
- **Brain Dumps**: Stream-of-consciousness input processing
- **Projects**: Project management and organization
- **Tasks**: Task creation, updates, and scheduling
- **Calendar**: Google Calendar integration
- **Daily Briefs**: Automated daily summaries
- **Voice Notes**: Audio uploads, transcripts, and group attachments
- **Admin**: Administrative functions and analytics

## Development

The API documentation is automatically generated from the SvelteKit route structure. To regenerate:

```bash
pnpm run docs:api
```

Generated on: 2025-09-27T04:23:16.673Z
