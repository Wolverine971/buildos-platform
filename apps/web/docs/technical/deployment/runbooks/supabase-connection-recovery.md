# Supabase Connection Recovery Runbook

> **Purpose**: Procedures for diagnosing and recovering from Supabase connection failures in BuildOS
>
> **Severity**: High - Affects all user functionality
>
> **Last Updated**: September 26, 2025

## 🚨 Immediate Response (< 5 minutes)

### 1. Check Service Status

```bash
# Check Supabase status
curl -s https://status.supabase.com/api/v2/status.json | jq '.status.description'

# Check our specific project status
curl -s -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \
  https://$SUPABASE_PROJECT_REF.supabase.co/rest/v1/ \
  | jq '.'
```

### 2. Verify Environment Variables

```bash
# In production environment
echo $PUBLIC_SUPABASE_URL
echo $PUBLIC_SUPABASE_ANON_KEY | head -10
echo $PRIVATE_SUPABASE_SERVICE_KEY | head -10

# Should return valid URLs and keys
```

### 3. Test Basic Connection

```bash
# Test from local environment
npx supabase status --project-ref $SUPABASE_PROJECT_REF

# Test API directly
curl -H "apikey: $SUPABASE_ANON_KEY" \
  https://$SUPABASE_PROJECT_REF.supabase.co/rest/v1/users?select=count
```

## 🔍 Diagnosis Steps

### Connection Error Types

#### Type 1: Authentication Errors

**Symptoms**: 401/403 errors, "API key not valid"

**Check**:

```typescript
// In browser console or server logs
console.log('Supabase URL:', import.meta.env.PUBLIC_SUPABASE_URL);
console.log('Anon Key length:', import.meta.env.PUBLIC_SUPABASE_ANON_KEY?.length);
```

**Common Causes**:

- Expired API keys
- Wrong project reference
- RLS policies blocking access

#### Type 2: Network/DNS Issues

**Symptoms**: Connection timeouts, DNS resolution failures

**Check**:

```bash
# Test DNS resolution
nslookup $SUPABASE_PROJECT_REF.supabase.co

# Test connectivity
ping $SUPABASE_PROJECT_REF.supabase.co

# Check from production server
curl -I https://$SUPABASE_PROJECT_REF.supabase.co
```

#### Type 3: Rate Limiting

**Symptoms**: 429 errors, "Too many requests"

**Check**:

```sql
-- Check request patterns in Supabase dashboard
SELECT
  date_trunc('minute', created_at) as minute,
  count(*) as requests
FROM auth.audit_log_entries
WHERE created_at > now() - interval '1 hour'
GROUP BY minute
ORDER BY minute DESC;
```

#### Type 4: Database Connection Pool Issues

**Symptoms**: "Connection pool exhausted", slow queries

**Check**:

```sql
-- Check active connections
SELECT count(*) as active_connections
FROM pg_stat_activity
WHERE state = 'active';

-- Check long-running queries
SELECT query, state, query_start
FROM pg_stat_activity
WHERE state != 'idle'
  AND query_start < now() - interval '30 seconds';
```

## 🛠️ Recovery Procedures

### For Authentication Errors

1. **Regenerate API Keys**:

    ```bash
    # In Supabase dashboard
    # 1. Go to Settings > API
    # 2. Regenerate anon/service keys
    # 3. Update environment variables

    # Update Vercel environment
    vercel env rm PUBLIC_SUPABASE_ANON_KEY
    vercel env add PUBLIC_SUPABASE_ANON_KEY
    ```

2. **Update RLS Policies**:

    ```sql
    -- Check policy conflicts
    SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
    FROM pg_policies
    WHERE schemaname = 'public';

    -- Fix common RLS issues
    ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

    CREATE POLICY "Users can view own data" ON public.users
      FOR SELECT USING (auth.uid() = id);
    ```

### For Network Issues

1. **DNS Resolution**:

    ```bash
    # If DNS fails, try alternative DNS
    echo "nameserver 8.8.8.8" | sudo tee /etc/resolv.conf

    # Test again
    nslookup $SUPABASE_PROJECT_REF.supabase.co
    ```

2. **Firewall/Security Groups**:
    ```bash
    # Ensure outbound HTTPS (443) is allowed
    telnet $SUPABASE_PROJECT_REF.supabase.co 443
    ```

### For Rate Limiting

1. **Implement Backoff Strategy**:

    ```typescript
    // Add to supabase client config
    const supabase = createClient(url, key, {
    	db: {
    		schema: 'public'
    	},
    	auth: {
    		autoRefreshToken: true,
    		persistSession: true
    	},
    	global: {
    		headers: {
    			'x-my-custom-header': 'buildos'
    		}
    	}
    });

    // Implement retry logic
    async function retrySupabaseCall(fn: () => Promise<any>, maxRetries = 3) {
    	for (let i = 0; i < maxRetries; i++) {
    		try {
    			return await fn();
    		} catch (error) {
    			if (error.status === 429 && i < maxRetries - 1) {
    				await new Promise((resolve) => setTimeout(resolve, Math.pow(2, i) * 1000));
    				continue;
    			}
    			throw error;
    		}
    	}
    }
    ```

### For Connection Pool Issues

1. **Optimize Connection Usage**:

    ```typescript
    // Use connection pooling best practices
    const supabaseConfig = {
    	db: {
    		schema: 'public'
    	},
    	auth: {
    		autoRefreshToken: true,
    		persistSession: false // For server-side
    	}
    };
    ```

2. **Database Cleanup**:
    ```sql
    -- Kill long-running queries
    SELECT pg_terminate_backend(pid)
    FROM pg_stat_activity
    WHERE state != 'idle'
      AND query_start < now() - interval '5 minutes'
      AND query NOT LIKE '%pg_stat_activity%';
    ```

## 📊 Monitoring & Prevention

### Real-time Monitoring

1. **Set up Supabase Dashboard Alerts**:
    - API error rate > 5%
    - Response time > 2 seconds
    - Connection count > 80% of limit

2. **Vercel Function Monitoring**:

    ```typescript
    // Add to API routes
    import { NextResponse } from 'next/server';

    export async function GET() {
    	try {
    		const start = Date.now();
    		const { data, error } = await supabase.from('health_check').select('*').limit(1);
    		const duration = Date.now() - start;

    		if (error) throw error;

    		return NextResponse.json({
    			status: 'healthy',
    			duration,
    			timestamp: new Date().toISOString()
    		});
    	} catch (error) {
    		return NextResponse.json(
    			{
    				status: 'unhealthy',
    				error: error.message
    			},
    			{ status: 503 }
    		);
    	}
    }
    ```

### Preventive Measures

1. **Connection Pool Configuration**:

    ```typescript
    // In supabase client setup
    const supabase = createClient(url, key, {
    	db: {
    		schema: 'public'
    	},
    	auth: {
    		autoRefreshToken: true,
    		persistSession: true
    	},
    	realtime: {
    		params: {
    			eventsPerSecond: 10
    		}
    	}
    });
    ```

2. **Graceful Degradation**:

    ```typescript
    // Implement fallback for critical functions
    async function getProjectWithFallback(projectId: string) {
    	try {
    		const { data, error } = await supabase
    			.from('projects')
    			.select('*')
    			.eq('id', projectId)
    			.single();

    		if (error) throw error;
    		return data;
    	} catch (error) {
    		// Fallback to cache or simplified data
    		return getProjectFromCache(projectId);
    	}
    }
    ```

## 🔗 Related Resources

- [Supabase Status Page](https://status.supabase.com)
- [Supabase Documentation](https://supabase.com/docs)
- [BuildOS Database Schema](/docs/technical/database/schema.md)
- [Performance Troubleshooting Guide](/docs/technical/deployment/runbooks/performance-issues.md)

## 📞 Escalation Contacts

- **Supabase Support**: support@supabase.io
- **Emergency Escalation**: Create ticket at https://app.supabase.com/support
- **Internal Team**: Check #engineering Slack channel

## 📝 Post-Incident Checklist

- [ ] Document root cause in incident report
- [ ] Update monitoring thresholds if needed
- [ ] Review and update this runbook
- [ ] Communicate resolution to stakeholders
- [ ] Schedule post-mortem if significant impact
