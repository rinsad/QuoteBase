# Quote Creation Workflow Guide

This guide explains how QuoteBase creates a quote and the logic behind each step.

## 1. Setup Required

Before QuoteBase can calculate a quote, the tenant needs master data:

- Customers
- Job sites
- Materials
- Suppliers/plants
- Vehicle types
- Sales tax rates
- Admin > Pricing configuration
- Optional Slack integration for approval/status notifications
- Optional Authorize.net integration for COD card payment acceptance

The pricing configuration is the heart of the quote engine. It stores R1-R4 markups, trucking rates, minimums, fees, overhead, and surcharges.

## 2. Start A New Quote

The estimator goes to:

```text
Quotes > New Quote
```

They choose:

- Customer
- Job site
- Material
- Quantity
- Tax area, usually inferred from job site
- Optional overrides like material price, trucking minimum, truck rate, manual route distance, or manual deadhead distance

QuoteBase validates that the selected job site belongs to the selected customer.

## 3. Load Quote Context

The system loads tenant-scoped data:

- Active customers
- Active job sites
- Active materials
- Active suppliers
- Active vehicle types
- Pricing configuration
- Sales tax rates
- Supplier markup rules

This is why missing Admin > Pricing setup breaks quote calculation.

## 4. Select Supplier / Plant

QuoteBase does not simply pick the cheapest material.

It compares delivered economics:

- Material cost
- Supplier/plant location
- Job-site location
- Route distance/duration
- Deadhead distance
- Trucking cost
- Load count
- Fees
- Tax

The recommendation logic uses zones:

- Zone 1: one load or less. Lowest delivered total wins.
- Zone 2: up to three loads. Weighted material and trucking economics.
- Zone 3: larger orders. Material economics matter most, then delivered total and distance.

Small jobs care more about freight. Big jobs care more about material cost.

## 5. Material Pricing

Each material has a supplier buy cost.

QuoteBase then applies either:

- A catalog markup rule, if one matches, or
- R1-R4 tier markup from Admin > Pricing

Current tier logic uses the midpoint:

```text
R2 min = $8
R2 max = $12
R2 markup = $10/unit
```

Material sell price is supplier cost plus the selected markup.

```text
material sell price = supplier cost + markup
```

Then:

```text
material subtotal =
max(material sell price * quantity, material minimum)
```

## 6. Trucking Logic

QuoteBase chooses a vehicle/load plan based on material unit and quantity.

For ton/cubic-yard materials:

```text
load count = quantity / truck capacity
```

It uses the largest compatible active vehicle.

Trucking cost is based on:

- Round-trip route duration
- Deadhead duration
- Selected/default trucking rate
- Load count
- Trucking minimum

If route data is missing, it falls back to hourly rate times load count.

```text
trucking subtotal =
max(raw trucking cost, trucking minimum * load count)
```

## 7. Fees

Fees are per load:

```text
fees =
(fuel surcharge per load + environmental fee per load) * load count
```

If payment terms are COD and credit-card surcharge is enabled, QuoteBase can add the card surcharge.

## 8. Tax

Tax is applied to:

```text
material subtotal
+ trucking subtotal
+ fees subtotal
```

Then:

```text
total =
material + trucking + fees + tax
```

## 9. Save Draft

When the estimator saves, QuoteBase creates:

- One `quotes` row
- One or more `quote_items` rows
- An audit log entry

The quote starts as:

```text
draft
```

The quote stores totals at the header level. Each line stores its own material, trucking, fees, and tax calculation details.

## 10. Approval Workflow

After saving, the estimator submits the quote.

If approval workflow is enabled:

```text
draft -> pending_approval
```

Then an admin can move it to:

```text
pending_approval -> approved
pending_approval -> rejected
pending_approval -> changes_requested
```

If approval workflow is disabled:

```text
draft -> approved
```

## 11. Slack Approval And Status Notifications

Slack is optional and depends on:

- The `slack_notifications` feature flag
- Admin > Integrations > Slack being enabled
- Valid Slack webhook/signing settings
- A configured admin approver email for Slack actions

When a quote moves to `pending_approval`, QuoteBase can post a Slack approval message with:

- Quote number
- Customer
- Job site
- Total
- Material/trucking/fees/tax summary
- Material breakdown
- Plant-selection context where available
- Buttons to accept, reject, request changes, or open QuoteBase

Slack buttons can move the quote through approval:

```text
pending_approval -> approved
pending_approval -> rejected
pending_approval -> changes_requested
```

Slack requests are verified with the Slack signing secret before QuoteBase accepts the action.

Slack status notifications are non-blocking. If Slack fails, the quote workflow still continues and QuoteBase records the quote state change.

When a quote is approved, rejected, or changes requested, QuoteBase can also direct-message the estimator if the Slack bot token can resolve the estimator by email.

## 12. Send To Customer

After approval, QuoteBase can:

- Generate a PDF
- Create a public customer quote link
- Send an email
- Move the quote to sent

Usually:

```text
approved -> sent
```

Then the customer can view or respond through the public quote link.

## 13. Authorize.net Payment Flow

Authorize.net is optional and is used for COD quote acceptance when hosted card payments are enabled.

Setup happens in:

```text
Admin > Integrations > Authorize.net
```

Admins configure:

- Enable/disable Authorize.net
- Sandbox or production mode
- API Login ID
- Transaction Key

Credentials are encrypted before storage. QuoteBase stores credential metadata, not raw card details.

When a customer opens a public quote link and the customer payment terms require card payment:

```text
public quote link -> Pay and accept quote -> hosted card checkout
```

QuoteBase requests a short-lived hosted payment token from Authorize.net using:

- Quote number
- Quote total
- Customer email, when available
- Return URL
- Cancel URL
- IFrame communicator URL

The card entry form is hosted by Authorize.net. QuoteBase does not collect or store raw card numbers.

If payment is approved, QuoteBase records the payment attempt and completes the public quote response as accepted.

High-level flow:

```text
sent/viewed quote
-> customer chooses Pay and accept
-> Authorize.net hosted payment
-> payment approved
-> quote accepted/won response recorded
```

If Authorize.net is not configured, COD customers cannot complete hosted card acceptance until the integration is fixed.

## 14. Follow-Up

Once sent, QuoteBase sets a follow-up date.

The follow-up agent later scans open quotes:

```text
sent
viewed
follow_up
```

If the follow-up date is due, it creates a follow-up draft.

## Core Pipeline

```text
Customer + Job Site + Material + Quantity
-> load tenant pricing
-> compare plants/suppliers
-> calculate material
-> calculate trucking
-> add fees
-> apply tax
-> save draft
-> approval
-> optional Slack review/status notification
-> PDF/email
-> optional Authorize.net payment for COD acceptance
-> customer response/follow-up
```

## Main Design Principle

QuoteBase separates business rules from code.

Admins manage pricing configuration and master data. The quote engine applies those rules consistently and logs what happened.
