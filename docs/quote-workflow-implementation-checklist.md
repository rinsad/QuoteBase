# Quote Workflow Implementation Checklist

This checklist captures the latest product decisions for rebuilding the QuoteBase quote flow around customer/job site, material, plant selection, distance, and pricing.

## 1. Quote Flow UI Cleanup

- [ ] Rebuild the workflow around this order:
  - Select customer.
  - Select existing job site or add a new job site.
  - Select material.
  - Show matching supplier/plant options .
  - Choose plant option and finalize pricing.

## 2. Admin-Controlled Master Data

- [ ] Keep supplier, plant, material, pricing, units, and tax master data under Admin control.
- [ ] Ensure all master-data records remain tenant-scoped by `organization_id`.
- [ ] Use soft-delete/deactivation for master-data records instead of hard delete.

## 3. Supplier, Plant, And Yard Model

- [ ] Model each supplier as having one or many plants.
- [ ] Treat each supplier location as a plant.
- [ ] Decide whether "yard" should be an official UI alias for "plant".
- [x] Store plant address/location accurately because trucking cost depends on distance to job site.
- [ ] Support adding suppliers and plants one by one through Admin.

## 4. Plant Price Sheet PDF Upload

- [ ] Add PDF upload under each plant or supplier plant record.
- [ ] Store uploaded plant price sheets with tenant and plant association.
- [ ] Extract plant address from the PDF where available.
- [ ] Extract material names from the PDF.
- [ ] Extract material prices from the PDF.
- [ ] Extract unit of measure from the PDF, such as ton, cubic yard, or load.
- [ ] Save extracted materials and prices into QuoteBase for that plant.
- [ ] Add a review/approval step before extracted PDF data updates live pricing.
- [ ] Keep SKU optional because current commodity materials do not use SKUs, but future resale businesses may.

## 5. Customer And Job Site Data

- [ ] Add customer category/type to customer profiles.
- [ ] Include categories such as contractor, homeowner, city agency, county agency, state agency, and other configurable types.
- [ ] Support contractors having many job sites.
- [ ] In quote creation, allow users to select an existing job site for the customer.
- [x] In quote creation, allow users to add a new job site/address without leaving the quote flow.
- [ ] Validate that the selected job site belongs to the selected customer.

## 6. Location And Distance Calculation

- [x] Add geocoding for each plant address.
- [x] Add geocoding for each job site address.
- [x] Use Mapbox as the location provider for address search, fallback geocoding, and route distance.
- [x] Configure Mapbox address search per tenant under Admin instead of using application environment variables.
- [x] Add distance calculation between job site and supplier/plant.
- [x] Cache calculated distances so reps do not repeatedly calculate the same route manually.
- [x] Use cached distance data when comparing plant options.

## 7. Material Selection

- [ ] Improve material field with typeahead search.
- [ ] Show matching material suggestions as the user types.
- [ ] Match materials across plants so selecting one material can reveal all plants that carry it.
- [ ] Include optional SKU support in the data model and UI where relevant.
- [ ] Avoid requiring SKU for commodity material businesses.

## 8. Unit Of Measurement Settings

- [x] Make quote quantity unit explicit.
- [ ] Support units such as tons, cubic yards, and loads.
- [x] Allow each tenant/business to define its own units in settings.
- [x] Add platform-managed unit catalog so tenant admins choose approved units instead of typing arbitrary unit codes.
- [x] Seed common weight, volume, load, count, area, and distance units in the global catalog.
- [ ] Associate plant material pricing with the correct unit of measure.
- [x] Add quote conversion basis/factor so enabled tenant units can drive truck/load calculation.
- [ ] Prevent material pricing for incompatible units unless a conversion rule exists.

## 9. Plant Options After Material Selection

- [ ] After customer/job site and material are selected, automatically show matching plants/suppliers that carry the material.
- [ ] Show plant/supplier name.
- [ ] Show distance or miles from plant to job site.
- [ ] Show plant material price.
- [ ] Show trucking cost or distance-based trucking estimate.
- [ ] Show total delivered cost.
- [ ] Show margin information.
- [ ] Make this combined material and supplier/plant selection step efficient, because this currently happens manually through Slack.

## 10. Pricing And Tax Rules

- [ ] Remove manual sale price override from the quote flow.
- [ ] Pull pricing from the selected plant price book instead of ad-hoc manual pricing.
- [ ] Apply sales tax only to material cost.
- [ ] Do not apply sales tax to trucking, delivery, service fees, or other non-material charges.
- [ ] Improve the advanced pricing/trucking section so it clearly separates:
  - Material price.
  - Trucking/service charges.
  - Sales tax on material.
  - Other fees.
  - Margin.
- [ ] Simplify pricing rules to match the actual business model.
- [ ] Remove unclear pricing options that sales reps should not control.

## 11. Volume-Based Markup

- [ ] Support markup by quantity/volume.
- [ ] Apply higher markup for small volume orders.
- [ ] Apply lower markup for large volume orders.
- [ ] Store volume markup rules in tenant pricing configuration or related pricing tables.
- [ ] Avoid hardcoded markups, fees, taxes, or minimums in application code.

## 12. Platform Expansion Requirements

- [ ] Design customer categories, SKUs, units, materials/products, and pricing so the platform can support other resale or distribution businesses.
- [ ] Keep the system subscription-SaaS ready for multiple tenants.
- [ ] Preserve the long-term goal of replacing or combining:
  - Quoting platform functionality such as Quoter or ScalePad.
  - CRM functionality such as Pipedrive.
  - Email marketing/outreach functionality such as ActiveCampaign or Instantly.

## 13. Implementation Safeguards

- [ ] Every new business table must include `organization_id`.
- [ ] Every query against business tables must filter by `organization_id`.
- [ ] Enable RLS policies on new tables before inserting data.
- [ ] Add role checks so only admins can manage master data.
- [ ] Validate API inputs with Zod.
- [ ] Log every state-changing API call with `logAction()`.
- [ ] Ensure audit log records include user, organization, action, target, before, and after values.
- [ ] Add indexes for columns used in filtering, joins, and distance/material lookups.
- [ ] Use pagination for list endpoints that may exceed 100 records.

## Open Questions

- [ ] Should "yard" appear in the UI, or should the product consistently use "plant"?
- [ ] Should PDF extraction update pricing automatically after admin approval, or create draft/import-review records first?
- [ ] What exact customer category list should ship as defaults?
- [ ] What volume tiers should be used for markup rules?
- [ ] Are fuel surcharge, delivery minimum, environmental fees, or other fees still part of the simplified pricing model?
