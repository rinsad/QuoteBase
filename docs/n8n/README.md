# QuoteBase n8n Workflows

These workflows are importable n8n JSON templates for the QuoteBase / Western Materials automation layer.

## Required n8n Environment Variables

Set these in your self-hosted n8n environment before activating the workflows:

```txt
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVER_ONLY_SERVICE_ROLE_KEY
QUOTEBASE_ORGANIZATION_ID=00000000-0000-0000-0000-000000000001
QUOTEBASE_APP_URL=https://YOUR_APP.vercel.app
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
RESEND_API_KEY=re_...
EMAIL_FROM=Western Materials <quotes@yourdomain.com>
```

Keep `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, and `SLACK_WEBHOOK_URL` in n8n credentials/env vars only. Do not paste them into workflow nodes.

## Workflows

- `workflows/quote-approval-alert.json`
  - Runs every 15 minutes.
  - Pulls `pending_approval` quotes for one organization.
  - Sends one Slack alert per quote/status using n8n workflow static data for dedupe.

- `workflows/quote-response-alert.json`
  - Runs every 10 minutes.
  - Pulls recent customer-viewed/customer-accepted/customer-declined audit events.
  - Sends one Slack alert per audit event.

- `workflows/customer-quote-email-webhook.json`
  - Exposes an n8n webhook.
  - Accepts a QuoteBase payload containing a customer-facing quote URL.
  - Sends the email through Resend.

## Import

n8n supports importing workflows from JSON files. In n8n, open **Workflows**, choose **Import from file**, then select one of the JSON files in `docs/n8n/workflows`.

After import, open each HTTP node once and verify the previewed URL/header values resolve from your n8n environment. Then run manually before activating.

## Why Email Uses a Webhook

QuoteBase stores public quote link token hashes, not raw tokens. That is correct for security, but it means n8n cannot reconstruct `/q/{token}` links from Supabase alone. Email workflows must receive the public `quoteUrl` from QuoteBase at link creation time.

## Production Notes

- The polling workflows read Supabase through the service role key and always filter by `QUOTEBASE_ORGANIZATION_ID`.
- These starter workflows do not update QuoteBase records. State-changing automation should go through future QuoteBase machine-token endpoints so role checks, tenant checks, and audit logging stay centralized.
- n8n webhook production URLs only work after the workflow is activated.
