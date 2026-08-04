# QuoteBase Sprint Spec: July 9 Meeting Changes

Source: `extras/QuoteBase Meeting - 2026_07_09 09_58 PDT - Notes by Gemini.docx`

This sprint spec captures only the product changes and decisions discussed in the July 9 QuoteBase meeting. It does not restate the entire quote-generation architecture unless needed to explain a meeting decision.

## Sprint Objective

Update QuoteBase so the quote creation, customer workflow, dashboard, and delivery tools better match Western Materials' sales process:

- Create quotes faster with job site creation, multiple materials, and quote date controls.
- Keep Kanban/status movement automatic and event-driven.
- Add quote categories that drive follow-up behavior.
- Improve follow-up, SMS/email delivery, and customer acceptance workflows.
- Add asset and credit-application support for quote/customer onboarding.
- Improve dashboard visibility for large quotes and jobs starting soon.
- Tighten unit/pricing master data so calculations remain controlled.

## 1. Quote Creation Updates

### 1.1 Keep Inline Job Site Creation

Decision:

- Quote creation must continue to support creating a new job site without leaving the quote flow.

Current behavior:

- Existing job site selection exists.
- Inline new job site creation exists with Mapbox address support.

Acceptance criteria:

- Estimator can choose an existing job site for the selected customer.
- Estimator can create a new job site inline.
- Newly created job site is automatically selected for the quote.
- Job site must remain tied to the selected customer.

### 1.2 Add Quote Date And Expiration Date

Decision:

- Quote creation must include mandatory quote date and expiration date fields.
- Price book/PDF import should also retain effective date context where available.

Required fields:

- Quote date.
- Expiration date, stored as `expires_at`.

Acceptance criteria:

- New Quote form requires quote date.
- New Quote form requires expiration date.
- Quote detail, customer PDF, and public quote display the correct quote date/expiration information.
- Saved quote records preserve these fields for reporting and follow-up.

### 1.3 Support Multiple Materials In One Quote

Decision:

- Estimators should be able to add multiple materials to one quote.
- The UI should use an add/plus style interaction rather than requiring a full restart for each material.

Acceptance criteria:

- New Quote supports adding multiple material lines.
- Each material line supports material selection and quantity.
- Each material line can show/recalculate recommended supplier/plant options.
- Quote totals aggregate all material lines.
- Quote PDF and public quote show all line items.

### 1.4 Improve Material Selection UI

Decision:

- Material selection should be efficient and searchable.

Acceptance criteria:

- Material picker supports search/dropdown behavior.
- Material options remain understandable when the same material is available from multiple plants.
- After material and job site are selected, QuoteBase shows the top recommended supplier/plant options.

## 2. Supplier, Plant, And Price Book Updates

### 2.1 Supplier Plant Details

Decision:

- Plant records need more operational detail.

Required additions:

- Plant contact name.
- Operating hours.
- Accurate address/location for logistics.

Acceptance criteria:

- Plant create/edit UI supports contact name.
- Plant create/edit UI supports operating hours.
- Plant list/detail views surface the operational details where useful.

### 2.2 Price Book PDF Date Tracking

Decision:

- Price book PDF uploads should track quote/effective dates more clearly.

Acceptance criteria:

- PDF import keeps effective-through date when detected.
- Import review shows source file name, supplier, plant, detected rows, and effective date context.
- Imported materials preserve source PDF metadata for audit/reference.

## 3. Delivered Option Recommendations

Decision:

- QuoteBase should recommend supplier/plant options using Mapbox distance and plant/job-site coordinates.
- The estimator should see three recommendations for material delivery/trucking options.
- Recommendations should use the existing zone-weighted delivered-economics logic.

Acceptance criteria:

- Recommended options show supplier, plant, material, distance, trucking cost, material cost, and delivered total.
- Zone 1 prioritizes lowest delivered total.
- Zone 2 weighs material and trucking economics, then uses total and distance as tie-breakers.
- Zone 3 prioritizes material economics, then uses total and distance as tie-breakers.
- Recommendations use plant lat/lon and job-site lat/lon.
- Mapbox route distance is used when configured.
- Fallback distance estimate is used when route data is unavailable.
- Recommendations remain explainable in quote audit metadata.

## 4. Quote Categorization And Follow-Up Logic

### 4.1 Add Quote Categories

Decision:

- Quotes need categories that drive board views and follow-up sequences.

Required dimensions:

- Account type:
  - Contractor.
  - Non-contractor.
- Project status:
  - Bid.
  - Existing job.

Acceptance criteria:

- Quote creation captures account type/category.
- Quote creation captures project status.
- Quote list/detail show category fields.
- Category fields are available to follow-up automation.

### 4.2 Separate Kanban Boards By Category

Decision:

- Do not show all category combinations in one confusing board.
- Users should view one category board at a time, likely through a selector/dropdown.

Acceptance criteria:

- Board UI supports filtering/selecting a category view.
- Contractor bid, contractor existing job, non-contractor bid, and non-contractor existing job can be viewed separately.
- Board counts and cards reflect the selected category.

### 4.3 Automate Kanban Status Movement

Decision:

- Kanban status transitions should be automatic, not manual drag/drop.
- This preserves process integrity and data accuracy.

Acceptance criteria:

- Customer/deal Kanban drag/drop is disabled.
- Quote Kanban/manual movement is reviewed and restricted where needed.
- Cards move when workflow events happen, such as:
  - Quote created.
  - Quote submitted.
  - Quote approved.
  - Quote sent.
  - Customer viewed quote.
  - Customer accepted quote.
  - Customer declined quote.
  - Follow-up exhausted/lost.
- Stage/status changes write audit entries with event source.

## 5. Follow-Up Automation

Decision:

- Quote follow-up should vary by quote category and job start timing.
- The system should run a 3-5 attempt follow-up sequence and stop when the customer responds.
- Urgent jobs need sales-rep notification rather than only automated follow-up.

Required behavior:

- Follow-up sequences differ for bid vs existing job.
- Follow-up sequences differ for contractor vs non-contractor.
- Jobs starting soon trigger alerts.
- Customer feedback stops automated follow-up.

Acceptance criteria:

- Quote can store estimated job start date.
- Quote can store estimated job end date where useful.
- Follow-up scheduler can evaluate quote category and start date.
- Follow-up attempts are counted.
- Follow-up stops on accepted, declined, reply/feedback, won, or lost.
- Sales reps are notified for urgent jobs.

## 6. Dashboard Metrics

Decision:

- Dashboard should help sales reps prioritize important quotes.

Required metrics:

- Big quotes.
- Jobs starting soon.

Definitions from meeting:

- Big quotes: quotes over roughly `$5,000-$10,000`.
- Jobs starting soon: jobs with start date within the next 30 days.

Acceptance criteria:

- Dashboard includes a Jobs Starting Soon alert/metric.
- Dashboard includes or updates a Big Quotes metric.
- Thresholds are configurable where possible.
- Dashboard cards link to filtered quote lists.

## 7. Quote Delivery: Email, SMS, And Custom Links

Decision:

- Approved quotes should be deliverable by email or SMS.
- The system should support custom/public quote links for sharing.

Acceptance criteria:

- Email delivery remains available for approved quotes.
- SMS delivery option is designed and integration requirements are identified.
- Public quote link can be generated and copied/shared.
- Delivery events are audited.
- Sent/viewed/customer response states update automatically.

## 8. Asset Library

Decision:

- Users need a centralized asset library for files that can be attached to quotes.

Examples:

- Material specifications.
- Product images.
- Supporting documents.
- Customer-facing attachments.

Acceptance criteria:

- Add an Asset Library area.
- Tenant users can upload assets.
- Assets are organization-scoped.
- Assets can be attached to quotes or selected for quote delivery.
- Asset records track name, type, file, uploader, and created date.

## 9. Electronic Credit Application

Decision:

- After quote acceptance, QuoteBase should support sending an electronic, signable credit application.

Related files added to `extras`:

- `WM Account Application (1).docx`
- `Preliminary Information Notice 2025 (1).pdf`

Acceptance criteria:

- Store credit application template/configuration.
- Send credit application after quote acceptance when required.
- Support electronic signature workflow or define integration.
- Track when the credit application is sent, viewed, completed, or skipped.
- Keep completed credit documents tied to the customer/quote.

## 10. Units And Super Admin Controls

Decision:

- Units should come from an industry-specific database/catalog, not arbitrary manual entry.
- Super Admin/platform control is needed to protect calculation parameters.

Acceptance criteria:

- Platform unit catalog remains the source of approved units.
- Tenant admins can enable/select allowed units.
- Core calculation basis/factors are controlled by platform admin.
- Tenant customization cannot accidentally break quote math.

## 11. Interface Visual Improvements

Decision:

- The UI needs more distinct color treatment to help users distinguish customers, job sites, owners, quote components, and workflow states.

Acceptance criteria:

- Review current dark theme visual hierarchy.
- Add distinct but restrained colors for major entities and quote sections.
- Avoid confusing one-note palettes.
- Preserve readability and professional operational feel.

## 12. Pricing Rules Clarification

Decision:

- John will provide pricing rules, tax rates, vehicle types, and units clarification.
- QuoteBase docs/UI should explain how these parameters affect calculations.

Acceptance criteria:

- Pricing rules documentation is updated.
- UI labels clarify R1-R4, truck rates, minimums, fees, and overhead.
- Docs avoid references to hidden advanced controls as normal estimator steps.
- Tax, vehicle type, and unit setup docs are linked from pricing/quote workflow docs.

## Out Of Scope For This Sprint

- Rebuilding the entire quote engine.
- Replacing the current CRM with a full external CRM clone.
- Fully implementing every SMS provider until provider choice is confirmed.
- Fully implementing e-signature if provider choice is not confirmed.
- Making all quote/category automation perfect before the workflow event model is finalized.
- Supporting every possible supplier PDF format.

## Dependencies

- Stakeholder pricing data:
  - Pricing rules.
  - Tax rates.
  - Vehicle types.
  - Units of measure.
- Credit application final template.
- Decision on SMS gateway/provider.
- Decision on electronic signature provider.
- Confirmation of quote category labels and follow-up timing.
- Confirmation of big quote threshold.

## Definition Of Done

- New Quote still supports inline job site creation.
- Quote date/expiration fields are implemented or scheduled with schema/UI acceptance criteria.
- Multiple material line workflow is implemented or specced for immediate implementation.
- Kanban drag/drop is disabled where lifecycle movement must be event-driven.
- Quote categories and project timing fields are defined.
- Dashboard metric requirements are documented.
- Asset library and credit application requirements are documented.
- Unit catalog/platform control requirements are documented.
- Client-facing docs are updated so they match the meeting decisions and current UI.
- `npm.cmd run lint` and `npm.cmd run build` pass for implemented code changes.
