# QuoteBase Meeting Change Points

Source: `extras/QuoteBase Meeting - 2026_07_09 09_58 PDT - Notes by Gemini.docx`

These are the product changes discussed in the QuoteBase meeting, separated from the broader quote-generation documentation.

## Change Points

1. Keep job site creation inside the New Quote flow. - Done
2. Add mandatory quote date and quote expiration (`expires_at`) fields. - Done
3. Support multiple materials on one quote with an add/plus interaction. - Done
4. Improve material selection so estimators choose the material first, then QuoteBase recommends supplier/plant options. - Done
5. Add plant operational details such as contact name and operating hours.
6. Improve price book PDF tracking, including effective dates and source file metadata.
7. Show the top three delivered pricing options based on zone-weighted delivered economics, including supplier, plant, material, distance, trucking, buy cost, fees, and tax.
8. Add quote categories for Contractor vs Non-contractor. - Done
9. Add project status categories for Bid vs Existing job. - Done
10. Show separate Kanban board views by quote type instead of mixing all quote types together. The category selector should load one board at a time for Contractor COD, Contractor Account, Non-contractor COD, and Non-contractor Account. Do not stack all four boards on one page because that is too confusing.
11. Keep Kanban movement automatic and event-driven, not manual drag/drop. - Done
12. Add automated follow-up sequences with 3-5 attempts. - Done
13. Stop automated follow-up when the customer responds, accepts, declines, or the quote is marked won/lost. - Done
14. Capture job start and end timing for quote follow-up logic. - Done
15. Add a Jobs Starting Soon dashboard metric/alert. - Done. This should surface quotes tied to jobs starting soon, especially where the customer has not responded yet, so reps know to call quickly and try to win, match, or beat competing pricing before the job starts.
16. Add a Big Quotes dashboard metric, roughly for quotes above the agreed threshold range. - Done
17. Support quote delivery by email and SMS with customer-specific links.
18. Add follow-up feedback capture for quote responses, such as price too high, customer questions, requested changes, or other feedback gathered after a quote is sent.
19. Add an asset library for reusable quote/customer materials. Assets should support material specs, test documents, and material pictures so estimators can attach the relevant files when sending a quote.
20. Add an electronic credit application workflow after quote acceptance. - Done
21. Add an industry-specific unit database with Super Admin controls.
22. Improve interface coloring so the UI is not too visually flat.
23. Clarify pricing, tax, vehicle, unit, and markup documentation for admins.
24. Continue positioning QuoteBase as a combined quoting, CRM, communication, and onboarding workflow.

## Implementation Notes

- Customer/deal Kanban drag/drop has already been removed so stages are driven by lifecycle events.
- Quote Kanban category views are currently implemented by account type and project status; the meeting notes refine this to account type plus payment type, specifically COD vs account.
- Jobs Starting Soon should be treated as a high-priority attention area, not only a dashboard number. If a quoted job starts next week and there is no customer feedback, the system should alert the rep/team to call the customer before the opportunity is lost to a cheaper alternative.
- The quote creation process already supports supplier/plant recommendations, but the meeting asks for the workflow to be refined around job site, material, and top delivered options.
- Advanced/manual quote overrides should stay out of the main estimator flow unless explicitly needed later.
- John mentioned a post-acceptance credit application flow. The customer should receive an electronic form they can complete and sign, not a printable/scanned document workflow. The implemented flow creates a secure `/ca/{token}` link after a quote is won and can email that link to the customer.
- Sample file noted: `extras/Preliminary Information Notice 2025 (1).pdf`. Extracted structure is a two-page California Preliminary Notice form, not a credit application. Fields include job name, job number, address, estimated start/date first supplied, estimated dollar amount, material/labor/service description, subcontractor, general/original contractor, owner, public works contract number, primary lender, additional owner/lender notes, signature, title, name, and date.
- Confirmed credit application sample: `extras/WM Account Application (1).docx`. The public electronic form follows its company information, ordering preference, principal, bank/credit, trade reference, vendor lawsuit, credit terms initials, signature, and personal guaranty sections.
