# ADR-001: Use Supabase for Database and Authentication

**Status**: Accepted
**Date**: 2024-03-15
**Decision Makers**: BuildOS Technical Team

## Context

BuildOS needed a backend solution that could provide:

- Reliable PostgreSQL database hosting
- Real-time subscriptions for live updates
- Built-in authentication with OAuth providers
- Row Level Security (RLS) for data protection
- Scalability without infrastructure management
- Cost-effective pricing for a startup

## Decision

We chose Supabase as our primary backend infrastructure, providing:

- PostgreSQL database with full SQL capabilities
- Real-time subscriptions via WebSockets
- Authentication with Google OAuth integration
- Built-in Row Level Security policies
- Edge Functions for serverless compute
- Storage for file uploads

## Consequences

### Positive

- **Rapid Development**: Built-in auth and real-time features accelerate development
- **Security**: RLS provides granular, database-level security
- **Performance**: Edge network ensures low latency globally
- **Cost**: Generous free tier and predictable scaling costs
- **Developer Experience**: Excellent TypeScript support and auto-generated types
- **Real-time Updates**: WebSocket subscriptions work seamlessly with SvelteKit
- **SQL Power**: Full PostgreSQL features including triggers, functions, and views

### Negative

- **Vendor Lock-in**: Migration would require significant refactoring
- **Cold Starts**: Edge functions can have cold start latency
- **Debugging**: RLS policies can be complex to debug
- **Limited Customization**: Some auth flows are harder to customize
- **Regional Limitations**: Primary database in single region (replication costs extra)

## Alternatives Considered

### Firebase

- **Pros**: Mature ecosystem, great real-time features
- **Cons**: NoSQL limitations, more expensive at scale, weaker TypeScript support

### AWS RDS + Cognito

- **Pros**: Full control, proven scale
- **Cons**: Complex setup, higher operational overhead, no built-in real-time

### PlanetScale + Auth0

- **Pros**: Serverless MySQL, best-in-class auth
- **Cons**: More expensive, requires stitching multiple services, no real-time

### Self-hosted PostgreSQL

- **Pros**: Complete control, no vendor lock-in
- **Cons**: High operational overhead, need to build auth/real-time from scratch

## Implementation Notes

Key Supabase features we leverage:

- **RLS Policies**: Every table has policies ensuring users only see their data
- **Database Functions**: Complex brain dump processing logic in PostgreSQL
- **Realtime Subscriptions**: Live project updates across devices
- **Google OAuth**: Seamless authentication for target users
- **Database Triggers**: Automatic timestamp updates and cascading deletes

## Review Schedule

Review this decision in Q2 2025 to assess:

- Performance at scale
- Cost implications with user growth
- Feature limitations encountered
- Alternative solutions maturity
