# BuildOS Documentation

Welcome to the BuildOS platform documentation. This guide will help you understand, deploy, and extend the BuildOS productivity platform.

## 📚 Documentation Structure

### Getting Started

- [Deployment Guide](./DEPLOYMENT.md) - Deploy BuildOS to production
- [Environment Variables](./ENVIRONMENT_VARIABLES.md) - Configuration reference
- [Migration Plan](./MIGRATION_PLAN.md) - Database migration strategies

### Features & Integrations

- [SMS Integration](./sms-integration.md) - Complete SMS/Twilio integration documentation
- [SMS Setup Guide](./guides/sms-setup-guide.md) - Step-by-step Twilio setup
- [SMS Testing Guide](./guides/sms-testing-guide.md) - Testing SMS functionality

### API Reference

- [SMS API Reference](./api/sms-api-reference.md) - Complete SMS API documentation

### Development

- [TODO](./TODO.md) - Development roadmap and tasks

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- pnpm 9+
- Supabase account
- Twilio account (for SMS features)

### Basic Setup

1. **Clone the repository**

   ```bash
   git clone https://github.com/your-org/buildos-platform.git
   cd buildos-platform
   ```

2. **Install dependencies**

   ```bash
   pnpm install
   ```

3. **Configure environment**

   ```bash
   cp apps/web/.env.example apps/web/.env
   cp apps/worker/.env.example apps/worker/.env
   # Edit .env files with your credentials
   ```

4. **Run migrations**

   ```bash
   cd apps/web
   pnpm supabase migration up
   ```

5. **Start development**
   ```bash
   pnpm dev
   ```

## 🏗️ Architecture Overview

BuildOS is a monorepo consisting of:

- **apps/web** - SvelteKit frontend application
- **apps/worker** - Background job processing service
- **packages/shared-types** - Shared TypeScript types
- **packages/supabase-client** - Shared Supabase configuration
- **packages/twilio-service** - SMS/Twilio integration service

## 🔧 Core Features

### Brain Dump System

AI-powered system that transforms unstructured thoughts into actionable tasks and projects.

### Project Management

Comprehensive project tracking with phases, tasks, and calendar integration.

### Daily Briefs

AI-generated daily summaries delivered via email and SMS.

### SMS Notifications

Real-time SMS notifications for:

- Task reminders
- Daily brief alerts
- Urgent notifications
- Custom messages

### Integrations

- **Google Calendar** - Bi-directional calendar sync
- **Stripe** - Payment processing (optional)
- **Twilio** - SMS notifications
- **OpenAI** - AI processing

## 📱 SMS Integration

The SMS integration provides:

### Features

- Phone number verification
- Task reminders via SMS
- Daily brief notifications
- Quiet hours support
- Opt-out management
- Template-based messaging

### Setup Steps

1. [Create Twilio account](./guides/sms-setup-guide.md#step-1-create-twilio-account)
2. [Configure Messaging Service](./guides/sms-setup-guide.md#step-2-configure-messaging-service)
3. [Set environment variables](./guides/sms-setup-guide.md#step-4-configure-buildos-environment)
4. [Run migrations](./guides/sms-setup-guide.md#step-5-run-database-migration)
5. [Test integration](./guides/sms-setup-guide.md#step-8-test-the-integration)

For detailed setup, see the [SMS Setup Guide](./guides/sms-setup-guide.md).

## 🧪 Testing

### Unit Tests

```bash
pnpm test
```

### SMS Integration Tests

```bash
pnpm test --filter=@buildos/twilio-service
```

### E2E Tests

```bash
pnpm test:e2e
```

## 🚢 Deployment

BuildOS can be deployed to:

- **Vercel** (Web app)
- **Railway** (Worker service)
- **Supabase** (Database & Auth)

See [Deployment Guide](./DEPLOYMENT.md) for detailed instructions.

## 🔐 Security

### Best Practices

- All credentials in environment variables
- Row-level security on all database tables
- Webhook signature validation
- Rate limiting on all APIs
- Phone verification required for SMS

### Compliance

- GDPR compliant data handling
- TCPA compliant SMS messaging
- Automatic opt-out handling
- Audit logging for all operations

## 📊 Monitoring

### Key Metrics

- SMS delivery rates
- Queue processing times
- API response times
- Error rates by service

### Health Checks

- `/health` - API health check
- `/api/queue/stats` - Queue statistics
- Database connection monitoring
- Twilio service status

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Run `pnpm pre-push`
6. Submit a pull request

## 📝 License

[Your License Here]

## 🆘 Support

- Documentation: This directory
- Issues: GitHub Issues
- Discussions: GitHub Discussions

## 🔗 Quick Links

- [Twilio Console](https://console.twilio.com)
- [Supabase Dashboard](https://app.supabase.com)
- [Vercel Dashboard](https://vercel.com/dashboard)
- [Railway Dashboard](https://railway.app/dashboard)

## 📖 Additional Resources

### SMS Integration

- [SMS Integration Overview](./sms-integration.md)
- [API Reference](./api/sms-api-reference.md)
- [Setup Guide](./guides/sms-setup-guide.md)
- [Testing Guide](./guides/sms-testing-guide.md)

### Development

- [Environment Variables](./ENVIRONMENT_VARIABLES.md)
- [Database Migrations](./MIGRATION_PLAN.md)
- [Development TODO](./TODO.md)

### Deployment

- [Production Deployment](./DEPLOYMENT.md)
- [Railway Setup](./DEPLOYMENT.md#railway-deployment)
- [Vercel Setup](./DEPLOYMENT.md#vercel-deployment)
