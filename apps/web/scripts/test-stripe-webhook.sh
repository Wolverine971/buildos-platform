# apps/web/scripts/test-stripe-webhook.sh

# Stripe Webhook Testing Helper Script
# This script helps you test Stripe webhooks locally

echo "🔧 Stripe Webhook Testing Helper"
echo "================================"
echo ""

# Check if Stripe CLI is installed
if ! command -v stripe &> /dev/null; then
    echo "❌ Stripe CLI is not installed"
    echo ""
    echo "Install it with:"
    echo "  brew install stripe/stripe-cli/stripe"
    echo ""
    echo "Or download from: https://stripe.com/docs/stripe-cli#install"
    exit 1
fi

echo "✅ Stripe CLI found"
echo ""

# Check if logged in
if ! stripe config --list &> /dev/null; then
    echo "❌ Not logged into Stripe CLI"
    echo ""
    echo "Please run: stripe login"
    exit 1
fi

echo "✅ Logged into Stripe CLI"
echo ""

echo "📡 Starting webhook forwarding to localhost:5173..."
echo ""
echo "IMPORTANT: Copy the webhook signing secret shown below"
echo "and add it to your .env file as:"
echo ""
echo "  STRIPE_WEBHOOK_SECRET=whsec_[the_secret_shown_below]"
echo ""
echo "Then restart your dev server with: pnpm dev"
echo ""
echo "========================================="
echo ""

# Forward webhooks to local server
stripe listen --forward-to localhost:5173/api/stripe/webhook