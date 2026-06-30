# CRM-lite Workflow Guide

CRM-lite is the lightweight sales pipeline inside QuoteBase. It lives on the
Customers page and helps track early leads, contacts, companies, and potential
deals before they become full customer quotes.

It is not a full CRM automation system yet. Think of it as a simple lead and
deal tracker that sits next to the customer desk and quote pipeline.

## Where To Find It

Open:

```text
/customers
```

The Customers page has two related areas:

- CRM-lite: companies, contacts, deal board, and lead imports.
- Customer desk: actual QuoteBase customers and job sites used for quote
  creation.

## Main CRM-lite Tables

CRM-lite stores data in four main tables:

- `crm_companies`
- `crm_contacts`
- `crm_deals`
- `crm_lead_captures`

Each record belongs to one organization through `organization_id`.

The CRM tables also have row-level security and organization-scoped foreign
keys, so one tenant should not see or modify another tenant's CRM data.

## How Leads Enter CRM-lite

CRM-lite can receive leads from:

- CSV import on the Customers page.
- Web form webhook:

```text
POST /api/customers?source=web_form
```

The schema also supports `manual` as a source, but the current UI mainly exposes
CSV import and deal-stage movement.

## CSV Import Flow

When a user imports a CSV file, QuoteBase reads up to 250 rows.

Supported CSV-style fields include:

- `company_name`, `company`, or `account`
- `contact_name`, `contact`, or `name`
- `title`
- `email`
- `phone`
- `domain` or `website`
- `deal_title`, `deal`, or `opportunity`
- `deal_value`, `value`, or `amount`
- `expected_close_date` or `close_date`
- `notes`

## Sample CSV Import File

You can use this as a starter CSV for testing CRM-lite imports:

```csv
company_name,contact_name,title,email,phone,domain,deal_title,deal_value,expected_close_date,notes
Acme Siteworks,Maya Lopez,Project Manager,maya@example.test,213-555-0184,acmesiteworks.test,Los Angeles yard material package,1984.38,2026-07-15,Needs aggregate pricing for a yard expansion.
North Ridge Builders,Daniel Kim,Estimator,daniel@example.test,818-555-0139,northridgebuilders.test,Fontana road base supply,12650.00,2026-07-22,Large project; confirm trucking assumptions before quoting.
Pacific Demo Group,Sofia Ramirez,Owner,sofia@example.test,562-555-0161,pacificdemo.test,Recycled base delivery,4200.00,2026-07-08,Customer asked for fast turnaround and COD terms.
Golden State Landscapes,Ethan Brooks,Operations Lead,ethan@example.test,949-555-0147,goldenstatelandscapes.test,Decorative rock for parkway,3150.00,2026-07-30,May need multiple small deliveries.
Harbor Civil Works,Nina Patel,Procurement Manager,nina@example.test,310-555-0198,harborcivil.test,Drain rock and trucking,8750.00,2026-08-05,Check supplier availability near Long Beach.
```

Minimum required field:

- `company_name`

Recommended fields:

- `contact_name`
- `email`
- `phone`
- `deal_title`
- `deal_value`
- `expected_close_date`
- `notes`

If `deal_title` is blank, QuoteBase creates a default deal title from the
company name.

For each valid row, QuoteBase:

1. Creates or updates a CRM company.
2. Creates or updates a CRM contact if a contact name or email exists.
3. Creates a CRM deal.
4. Stores the original row in `crm_lead_captures`.
5. Writes audit activity for the import.

## Web Form Lead Flow

External forms can submit leads to:

```text
POST /api/customers?source=web_form
```

The request must include a valid webhook secret, either through:

```text
x-quotebase-webhook-secret
```

or a bearer token in:

```text
Authorization
```

The payload must include either:

- `organization_id`
- `organization_slug`

After validation, QuoteBase processes the web form lead the same way as a CSV
lead: company, contact, deal, lead capture, and audit entry.

## Deal Board

CRM-lite shows deals on a kanban board with these stages:

- New Lead
- Qualified
- Quoted
- Won
- Lost

Dragging a deal to another column updates `crm_deals.stage`.

Only admins and account managers can move CRM deals.

## Deal Stage Audit Log

Every deal-stage move is audited.

Examples:

```text
crm.deal.stage.new
crm.deal.stage.qualified
crm.deal.stage.quoted
crm.deal.stage.won
crm.deal.stage.lost
```

The audit entry records the old stage, new stage, deal value, deal title, and
that the change came from CRM kanban drag-and-drop.

## Relationship To Customers

CRM-lite companies and contacts are separate from regular QuoteBase customers.

The regular customer records live in:

```text
customers
job_sites
```

Those records are what the quote creation workflow uses.

CRM-lite tables have optional fields that can link back to customers:

- `crm_companies.customer_id`
- `crm_contacts.customer_id`
- `crm_deals.customer_id`

However, the current UI does not fully automate converting a CRM company into a
QuoteBase customer.

## Relationship To Quotes

CRM-lite deals can also store:

```text
crm_deals.quote_id
```

That means the database is ready to connect a CRM deal to a quote.

Current limitation: quote creation does not automatically create or update a CRM
deal. Creating a quote does not automatically move a CRM deal to `quoted`.

So the current practical workflow is:

```text
CSV/Web lead
-> CRM company/contact/deal
-> move deal through CRM stages
-> separately create customer/job site/quote
```

## What CRM-lite Is Good For Today

Use CRM-lite for:

- Importing lead lists.
- Tracking inbound companies and contacts.
- Seeing a simple deal pipeline.
- Moving opportunities from new to qualified, quoted, won, or lost.
- Keeping lightweight sales activity inside QuoteBase.

## What CRM-lite Does Not Do Yet

CRM-lite does not yet fully handle:

- Automatic CRM deal to quote conversion.
- Automatic quote to CRM deal linking.
- Automatic stage movement when a quote is created, sent, accepted, or lost.
- Full activity timeline per CRM contact.
- Tasks, reminders, calls, meetings, or email sync.
- Advanced CRM reporting.

## Practical Mental Model

Use CRM-lite before quoting.

Use the customer desk and quote workflow when the lead becomes real enough to
price.

The clean future version is:

```text
Lead
-> CRM deal
-> Qualified
-> Create customer/job site
-> Create quote
-> Deal moves to Quoted
-> Customer accepts
-> Deal moves to Won
```

The current version supports the first half well, and the database already has
the fields needed for deeper CRM-to-quote automation later.
