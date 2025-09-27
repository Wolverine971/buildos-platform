Areas to Review with Context7

⏺ 1. Supabase & SvelteKit SSR ✅

Your implementation looks good, but verify:

- Using @supabase/ssr (latest approach) ✅
- Proper cookie handling in hooks.server.ts ✅
- PKCE flow authentication ✅

2. Stripe Subscription Management

Check these patterns with Context7:

- Webhook signature verification (stripe.webhooks.constructEvent)
- Subscription lifecycle management (create, update, cancel)
- Customer portal integration
- Checkout session handling for subscriptions
- Consider the new 2025-03-31.basil API changes if upgrading

3. OpenAI Integration

Verify:

- Stream handling for real-time responses
- Token optimization strategies
- Error handling and retry patterns
- Prompt engineering best practices

4. TipTap Editor

Review:

- Extension configuration
- Custom node/mark implementations
- Collaboration features if needed
- Image handling and storage integration

5. Google APIs (Calendar/Gmail)

Check:

- OAuth2 token refresh patterns
- Batch operations for performance
- RRULE generation for recurring events
- Proper scope management

6. Svelte 5 Patterns

Verify usage of:

- New rune syntax ($state, $derived, $effect)
- Component composition patterns
- Store migration to runes
- Performance optimizations

Key Libraries to Check with Context7:

// Priority libraries to verify:

- @supabase/ssr // Auth & database
- @sveltejs/kit // Framework patterns
- stripe // Payment processing
- openai // AI integration
- @tiptap/core // Rich text editing
- googleapis // Calendar/Email
- lucide-svelte // Icons
- date-fns // Date handling

Recommended Context7 Queries:

1. mcp**context7**get-library-docs for Stripe webhook best practices
2. Check OpenAI streaming patterns for your daily brief generation
3. Verify Google Calendar recurring event handling
4. Review TipTap collaborative editing if planning multi-user features

Your codebase is generally well-structured and follows good patterns. Context7 can help ensure you're using the
latest best practices for each library, especially as they evolve rapidly.
