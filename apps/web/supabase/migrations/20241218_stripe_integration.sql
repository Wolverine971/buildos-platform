-- supabase/migrations/20241218_stripe_integration.sql
-- Run this migration to add Stripe payment support to BuildOS

-- Create subscription plans table
CREATE TABLE IF NOT EXISTS subscription_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stripe_price_id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    price_cents INTEGER NOT NULL,
    currency TEXT DEFAULT 'usd',
    billing_interval TEXT CHECK (billing_interval IN ('month', 'year')) DEFAULT 'month',
    interval_count INTEGER DEFAULT 1,
    features JSONB DEFAULT '[]'::jsonb,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create customer subscriptions table
CREATE TABLE IF NOT EXISTS customer_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    stripe_customer_id TEXT NOT NULL,
    stripe_subscription_id TEXT UNIQUE NOT NULL,
    stripe_price_id TEXT REFERENCES subscription_plans(stripe_price_id),
    plan_id UUID REFERENCES subscription_plans(id),
    status TEXT NOT NULL CHECK (status IN (
        'active', 'canceled', 'incomplete', 
        'incomplete_expired', 'past_due', 'trialing', 'unpaid'
    )),
    current_period_start TIMESTAMP WITH TIME ZONE,
    current_period_end TIMESTAMP WITH TIME ZONE,
    cancel_at TIMESTAMP WITH TIME ZONE,
    canceled_at TIMESTAMP WITH TIME ZONE,
    trial_start TIMESTAMP WITH TIME ZONE,
    trial_end TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create payment methods table
CREATE TABLE IF NOT EXISTS payment_methods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    stripe_payment_method_id TEXT UNIQUE NOT NULL,
    type TEXT NOT NULL,
    card_brand TEXT,
    card_last4 TEXT,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create invoices table for record keeping
CREATE TABLE IF NOT EXISTS invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    stripe_invoice_id TEXT UNIQUE NOT NULL,
    stripe_customer_id TEXT NOT NULL,
    subscription_id UUID REFERENCES customer_subscriptions(id),
    amount_paid INTEGER NOT NULL,
    amount_due INTEGER NOT NULL,
    currency TEXT DEFAULT 'usd',
    status TEXT NOT NULL,
    invoice_pdf TEXT,
    hosted_invoice_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create discount codes table for beta users and promotions
CREATE TABLE IF NOT EXISTS discount_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,
    stripe_coupon_id TEXT,
    description TEXT,
    discount_type TEXT CHECK (discount_type IN ('percentage', 'fixed_amount')) NOT NULL,
    discount_value INTEGER NOT NULL, -- percentage (0-100) or cents for fixed amount
    duration TEXT CHECK (duration IN ('once', 'forever', 'repeating')) NOT NULL,
    duration_in_months INTEGER, -- only for 'repeating' duration
    max_redemptions INTEGER,
    times_redeemed INTEGER DEFAULT 0,
    valid_from TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    valid_until TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create user discounts table to track applied discounts
CREATE TABLE IF NOT EXISTS user_discounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    discount_code_id UUID REFERENCES discount_codes(id) NOT NULL,
    stripe_subscription_id TEXT,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(user_id, discount_code_id)
);

-- Add stripe fields to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'free',
ADD COLUMN IF NOT EXISTS subscription_plan_id UUID REFERENCES subscription_plans(id),
ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMP WITH TIME ZONE;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_customer_subscriptions_user_id ON customer_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_customer_subscriptions_status ON customer_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_payment_methods_user_id ON payment_methods(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_user_id ON invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_discount_codes_code ON discount_codes(code);
CREATE INDEX IF NOT EXISTS idx_user_discounts_user_id ON user_discounts(user_id);

-- Create updated_at trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add updated_at triggers
CREATE TRIGGER update_subscription_plans_updated_at BEFORE UPDATE ON subscription_plans
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_customer_subscriptions_updated_at BEFORE UPDATE ON customer_subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payment_methods_updated_at BEFORE UPDATE ON payment_methods
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_discount_codes_updated_at BEFORE UPDATE ON discount_codes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) policies
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE discount_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_discounts ENABLE ROW LEVEL SECURITY;

-- Subscription plans are public read
CREATE POLICY "Subscription plans are viewable by everyone" ON subscription_plans
    FOR SELECT USING (is_active = true);

-- Users can only see their own subscription data
CREATE POLICY "Users can view own subscriptions" ON customer_subscriptions
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view own payment methods" ON payment_methods
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view own invoices" ON invoices
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view own discounts" ON user_discounts
    FOR SELECT USING (auth.uid() = user_id);

-- Active discount codes are public read
CREATE POLICY "Active discount codes are viewable" ON discount_codes
    FOR SELECT USING (
        is_active = true 
        AND (valid_until IS NULL OR valid_until > CURRENT_TIMESTAMP)
        AND (max_redemptions IS NULL OR times_redeemed < max_redemptions)
    );

-- Insert default subscription plan ($20/month)
INSERT INTO subscription_plans (
    stripe_price_id,
    name,
    description,
    price_cents,
    currency,
    billing_interval,
    interval_count,
    features
) VALUES (
    'price_placeholder', -- Replace with actual Stripe price ID
    'BuildOS Pro',
    'Full access to BuildOS with unlimited projects and AI features',
    2000, -- $20.00
    'usd',
    'month',
    1,
    '[
        "Unlimited projects",
        "Advanced AI brain dump processing",
        "Google Calendar integration",
        "Daily AI briefs",
        "Priority support",
        "API access"
    ]'::jsonb
) ON CONFLICT (stripe_price_id) DO NOTHING;

-- Insert beta user discount (example: 50% off forever)
INSERT INTO discount_codes (
    code,
    description,
    discount_type,
    discount_value,
    duration,
    metadata
) VALUES (
    'BETA50',
    'Beta user 50% discount',
    'percentage',
    50,
    'forever',
    '{"type": "beta_user"}'::jsonb
) ON CONFLICT (code) DO NOTHING;

-- Helper function to check if user has active subscription
CREATE OR REPLACE FUNCTION has_active_subscription(user_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 
        FROM customer_subscriptions 
        WHERE user_id = user_uuid 
        AND status IN ('active', 'trialing')
        AND (current_period_end IS NULL OR current_period_end > CURRENT_TIMESTAMP)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to get user's subscription status
CREATE OR REPLACE FUNCTION get_user_subscription_status(user_uuid UUID)
RETURNS TABLE (
    has_subscription BOOLEAN,
    subscription_status TEXT,
    current_period_end TIMESTAMP WITH TIME ZONE,
    is_beta_user BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COALESCE(cs.status IN ('active', 'trialing'), false) as has_subscription,
        COALESCE(cs.status, 'free') as subscription_status,
        cs.current_period_end,
        EXISTS (
            SELECT 1 FROM user_discounts ud
            JOIN discount_codes dc ON ud.discount_code_id = dc.id
            WHERE ud.user_id = user_uuid
            AND dc.metadata->>'type' = 'beta_user'
        ) as is_beta_user
    FROM users u
    LEFT JOIN customer_subscriptions cs ON u.id = cs.user_id
        AND cs.status IN ('active', 'trialing', 'past_due')
    WHERE u.id = user_uuid
    ORDER BY cs.created_at DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;