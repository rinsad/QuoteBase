# QuoteBase Quote Generation Process

Client presentation document

## Executive Summary

QuoteBase turns a delivered-material quote into a repeatable, controlled workflow. Instead of relying on spreadsheet formulas, the system uses customer/job-site data, supplier material costs, tenant pricing rules, truck/load planning, fees, sales tax, approval controls, and branded customer output.

The result is a quote that can be calculated consistently, reviewed internally, audited, and sent to the customer as a professional PDF/email package.

## What The System Needs Before It Can Build A Quote

To generate a quote, QuoteBase uses these core inputs:

- Customer
- Job site
- Material
- Quantity
- Supplier/plant data
- Sales tax context
- Organization pricing configuration
- Active vehicle types and capacities

The system also supports controlled estimator inputs when needed:

- Manual route distance
- Manual deadhead distance
- Selected plant override
- Material unit price override
- Truck rate override
- Material and trucking minimum overrides
- Notes and payment terms

These overrides are tracked so the business can see when the calculated result was adjusted.

## Step 1: Select The Customer, Job Site, Material, And Quantity

The estimator starts a quote by selecting an existing customer, an existing job site, the required material, and the requested quantity.

QuoteBase validates that the selected job site belongs to the selected customer. This prevents a quote from accidentally mixing customer and delivery-site records.

## Step 2: Load The Organization Pricing Rules

The system loads the active pricing configuration for the organization. This includes:

- R1, R2, R3, and R4 material markup ranges
- Trucking hourly rates
- Default trucking rate level
- Material minimum
- Trucking minimum
- Fuel surcharge per load
- Environmental fee per load
- Credit-card surcharge percentage

These values are configuration-driven. They are not hardcoded into the quote screen.

## Step 3: Compare Eligible Supplier And Plant Options

When multiple supplier/plant options are available for the same material, QuoteBase compares the complete delivered economics, not just the raw material cost.

The recommendation considers:

- Supplier material cost
- Material tier and unit
- Job-site location
- Supplier/plant location
- Route distance and duration
- Deadhead distance from the nearest yard
- Truck capacity
- Load count
- Fees and tax

If automatic plant selection is enabled, the system recommends the best option. If the estimator chooses to force the selected plant, QuoteBase respects that override and records it.

## Step 4: Apply The Plant Recommendation Rules

QuoteBase uses three quote-size zones:

| Zone | Quote Size | Selection Priority |
| --- | --- | --- |
| Zone 1 | One load or less | Lowest delivered total, including trucking and deadhead |
| Zone 2 | Up to three loads | Weighted material and trucking economics, then total and route distance |
| Zone 3 | Larger orders | Best material economics first, then total and route distance |

This makes the recommendation practical. Small quotes are sensitive to trucking, while larger quotes become more sensitive to material economics.

## Step 5: Calculate Material Price

Each material starts with the supplier buy cost.

QuoteBase then applies the markup range for the material tier:

- R1: commodity materials
- R2: standard materials
- R3: specialty materials
- R4: premium materials

The implemented calculation currently uses the midpoint of the configured min/max range for the selected tier. For ton-based materials, the configured overhead-per-ton amount is also added.

The system calculates:

- Unit cost
- Markup per unit
- Final material unit price
- Material subtotal

If the calculated material subtotal is below the configured material minimum, the minimum is applied.

## Step 6: Calculate Trucking And Load Count

QuoteBase determines the truck/load plan using the material unit, requested quantity, and active vehicle capacities.

For ton and cubic-yard materials, the system chooses the largest compatible active vehicle capacity and calculates the number of loads required. For load-based materials, the requested quantity is treated as the load count.

The trucking calculation uses:

- Route duration
- Round-trip travel
- Deadhead duration where available
- Selected/default truck rate
- Load count
- Trucking minimum

The output includes the selected vehicle, load count, trucking rate level, trucking subtotal, and trucking rate per quoted unit.

## Step 7: Add Fees And Applicable Surcharges

QuoteBase applies organization-level fee settings:

- Fuel surcharge per load
- Environmental fee per load
- Credit-card surcharge when applicable to payment terms

Because these fees are stored in configuration, they can be maintained by admins without changing application code.

## Step 8: Resolve And Apply Sales Tax

Sales tax is resolved from either:

- A selected tax rate record, or
- The job-site city, county, and state

The tax is applied to the taxable quote subtotal:

- Material subtotal
- Trucking subtotal
- Fees subtotal

QuoteBase then calculates the final quote total.

## Step 9: Save The Draft Quote

When the estimator saves the quote, QuoteBase creates:

- A quote header with customer, job site, status, subtotals, tax, and total
- A quote line item with material, supplier, unit cost, markup, load count, trucking, fees, and line total

The quote is saved in draft status first. The system also writes an audit log entry showing the quote number, total, selected supplier, plant recommendation reason, route details, and any overrides used.

## Step 10: Submit For Approval

After review, the draft can be submitted.

If the approval workflow is enabled, the quote moves to pending approval. Admins can then approve, reject, or request changes.

If approval workflow is disabled for the organization, the quote can move directly to approved.

Every status change is logged with before and after values.

## Step 11: Generate Customer Output

Once approved, the quote can be prepared for customer delivery.

QuoteBase can:

- Create a secure public quote link
- Generate a branded PDF
- Attach the PDF to the customer email
- Send the email through the configured provider
- Move the quote to sent after successful delivery

The PDF uses tenant branding, including company name, logo, address, phone number, footer note, and disclaimer.

## Step 12: Customer Response

The customer-facing quote link supports customer response tracking. A sent quote can move into statuses such as viewed, accepted, declined, or changes requested depending on customer action and workflow.

This gives the team visibility after the quote leaves the internal approval process.

## Controls And Traceability

QuoteBase is designed for a multi-tenant quoting environment. The implemented process includes:

- Organization-scoped quote data
- Configuration-driven pricing
- Feature flags for optional behavior
- Approval workflow controls
- Audit logs for quote creation, edits, status changes, public links, and delivery events
- Soft-delete patterns for quote records

These controls help the business understand not only the final price, but how that price was produced.

## Client-Friendly Summary

QuoteBase generates a delivered-material quote by:

1. Gathering customer, job-site, material, and quantity details.
2. Loading the organization pricing configuration.
3. Comparing available supplier/plant options.
4. Recommending the best delivered option based on order size.
5. Calculating material cost, trucking, fees, tax, and total.
6. Saving the quote as a traceable draft.
7. Routing it through approval when required.
8. Producing a branded PDF and customer email after approval.
9. Tracking customer response after the quote is sent.

The key business value is consistency: the same rules are applied every time, quote decisions are auditable, and pricing can be managed through configuration instead of spreadsheet edits.
