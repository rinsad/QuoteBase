# CRM customer integration setup

QuoteBase can import customers from Pipedrive, Salesforce, HubSpot, and Zoho. An organization may enable more than one CRM. Imported records remain linked to their source using the provider and external record ID, so later synchronizations update the same customer.

## Before configuring a CRM

1. Apply `supabase/migrations/20260815052748_add_crm_customer_identity_framework.sql`.
2. Set `INTEGRATION_ENCRYPTION_KEY` in every QuoteBase runtime. Use the same secret for all instances and do not rotate it without re-encrypting saved credentials.
3. Sign in as a tenant admin and open **Admin → Integrations → CRM customers**.
4. Configure and save a provider before selecting **Sync now**.

Credentials are encrypted server-side. The settings page only returns the last four characters of saved values.

## Pipedrive

Pipedrive is included as a first-class connector.

1. In Pipedrive, open **Personal preferences → API** and copy the personal API token. API-token availability can depend on the Pipedrive plan and permissions.
2. In QuoteBase, open the Pipedrive card.
3. Keep the API URL as `https://api.pipedrive.com/v1`, or use the tenant URL documented for your account.
4. Enter the Pipedrive company domain in **Account / tenant identifier** for operational reference.
5. Paste the token into **API token**, enable the provider, and save.
6. Select **Sync now**.

The connector reads Persons, including their linked organization, primary email, and primary phone. See the official [Pipedrive Persons API](https://developers.pipedrive.com/docs/api/v1/Persons) and [API authentication reference](https://developers.pipedrive.com/docs/api/v1).

## HubSpot

1. In HubSpot, create a private app for the tenant account.
2. Grant at least the contact read scope (`crm.objects.contacts.read`).
3. Copy the private-app access token.
4. In QuoteBase, keep the API URL as `https://api.hubapi.com`, paste the token, enable HubSpot, and save.
5. Select **Sync now**.

The connector reads contacts through `/crm/v3/objects/contacts` and requests first name, last name, email, phone, and company. HubSpot documents bearer-token use in its [authentication overview](https://developers.hubspot.com/docs/apps/developer-platform/build-apps/authentication/overview).

## Salesforce

QuoteBase uses Salesforce OAuth 2.0 Client Credentials Flow for server-to-server synchronization. Salesforce issues a short-lived access token for the configured execution user; no refresh token or interactive user authorization is required.

1. In Salesforce Setup, create an External Client App and enable OAuth.
2. Grant the `Manage user data via APIs (api)` scope.
3. Enable **Client Credentials Flow** in the app and its OAuth policies.
4. Assign a **Run As / Execution User** that has API access and read permission for Contact and Account records. Use a dedicated integration user where possible.
5. In the app settings, copy the **Consumer Key** and **Consumer Secret**. Never share or commit the secret.
6. In QuoteBase, enter the Consumer Key as **Consumer key / Client ID** and the Consumer Secret as **Consumer secret / Client secret**.
7. Use `https://login.salesforce.com` for production or `https://test.salesforce.com` for a sandbox.
8. Enable Salesforce, save, and select **Sync now**.

The connector requests a new access token for each synchronization, discovers the newest available REST API version, and queries active Contact records with their Account name. The callback URL is not used by this flow, although Salesforce may still require one when OAuth is enabled.

## Zoho CRM

1. Open the Zoho API Console and create a server-based or self-client application.
2. Grant `ZohoCRM.modules.contacts.READ` (or a broader CRM modules read scope if required by the tenant).
3. Generate an authorization grant and exchange it for a refresh token. Save the client ID, client secret, and refresh token.
4. Choose the API domain matching the tenant’s data center, for example:
   - US: `https://www.zohoapis.com/crm/v7`
   - EU: `https://www.zohoapis.eu/crm/v7`
   - India: `https://www.zohoapis.in/crm/v7`
   - Australia: `https://www.zohoapis.com.au/crm/v7`
   - Japan: `https://www.zohoapis.jp/crm/v7`
5. Enter the credentials, enable Zoho, save, and select **Sync now**.

QuoteBase exchanges the refresh token at the matching Zoho Accounts domain and imports Contacts. See Zoho’s official [refresh-token guide](https://www.zoho.com/developer/oauth/non-browser-apps/refresh-access-token.html) and [Get Records API](https://www.zoho.com/crm/developer/docs/api/v7/get-records.html).

## How customer selection works

- QuoteBase-native customers are always available.
- Customers from a CRM are shown only while that tenant’s CRM integration is enabled.
- The quote picker searches company, contact, email, and source.
- Synchronization never deletes customers. Existing imported records are updated; disabling a CRM hides its customers from new quote selection.
- If two sources contain the same display name, QuoteBase adds the provider name to keep the local customer key unique.

## Troubleshooting

- **Credentials cannot be decrypted:** confirm every deployment uses the same `INTEGRATION_ENCRYPTION_KEY`, then re-enter the credentials.
- **401/403 from a CRM:** regenerate the credential and confirm required scopes and tenant permissions.
- **API URL rejected:** use the provider’s official domain; arbitrary URLs are intentionally blocked to prevent server-side request forgery.
- **No customers imported:** confirm the provider is enabled, the CRM account contains Contacts/Persons, and the credential can read them.
- **Rate limits:** wait for the provider’s limit window and run the sync again. Each manual run is paginated and bounded.
