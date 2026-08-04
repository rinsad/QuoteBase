# Plant Price Sheet PDF Import GUI Proposal

This proposal covers the future workflow for importing supplier/plant price sheet PDFs into QuoteBase, mapping extracted rows to materials, and activating plant-specific prices for quote creation.

## Goal

Each supplier can have one or many plants. Each plant can carry many materials. Suppliers usually send plant price sheets as PDFs, and each supplier may use a different PDF/table format.

The import UI should make PDF extraction reviewable, repeatable, and safe before prices become available in quote creation.

## Recommended Workflow

1. Admin selects a supplier.
2. Admin selects a plant.
3. Admin uploads the plant price sheet PDF.
4. System extracts possible material rows from the PDF.
5. Admin maps detected columns to QuoteBase fields.
6. Admin reviews material matches and prices.
7. Admin approves or schedules the import.
8. Quote creation uses the latest active plant material prices.

## Navigation

Recommended location:

`Admin > Suppliers > Supplier Detail > Plant Detail > Price Sheets`

Each plant should show price sheet history:

- Current active price sheet
- Previous imports
- Uploaded by
- Upload date
- Effective date
- Status: Draft, Needs Review, Active, Archived

## Upload Screen

Fields:

- PDF file upload
- Effective date
- Optional notes
- Extract price sheet button

The upload should not update live pricing immediately.

## Extraction Review Screen

Use a split-screen layout.

Left side:

- PDF viewer
- Page thumbnails
- Highlighted detected table areas

Right side:

- Extracted editable grid

Grid columns:

- Material name
- Unit
- Price
- Notes / extra detected text
- Confidence
- Status

Admins should be able to edit extracted cells before saving.

## Supplier/Plant Mapping Templates

Because each supplier can use a different PDF format, QuoteBase should save reusable mapping templates.

Example template:

`Supplier A - Plant 1 Price Sheet Template`

Template stores:

- Which detected column maps to material name
- Which detected column maps to unit
- Which detected column maps to price
- Rows to skip
- Header detection rules
- Unit normalization rules
- Price cleanup rules

On future uploads for the same supplier/plant, QuoteBase should apply the saved template automatically.

## Column Mapping Step

If extraction confidence is low, show a mapping UI.

Example:

| Detected column | Map to |
| --- | --- |
| Description | Material name |
| UOM | Unit |
| FOB Price | Price |
| Product Code | Ignore |
| Notes | Notes |

Actions:

- Save as supplier template
- Apply once
- Re-run extraction

## Material Matching Step

After mapping, show what each extracted row will do.

Possible actions:

- Update existing material
- Create new material
- Ignore row
- Needs review

Example:

| Extracted material | Matched material | Unit | Price | Action |
| --- | --- | --- | --- | --- |
| 3/4 Crushed Rock | 3/4 Crushed Rock | ton | $18.50 | Update |
| Class II Base | Class 2 Base | ton | $21.00 | Review match |
| Sand Fill | New | cy | $14.00 | Create |

## Activation Step

Do not immediately overwrite live pricing.

Supported actions:

- Save as draft
- Approve and activate
- Schedule effective date

Once activated, the imported material prices become the current active plant price book used by quote creation.

## Key Safeguards

- Imported rows must be tenant-scoped by `organization_id`.
- Imported units must map to active tenant units from the platform unit catalog.
- Price updates should create audit log entries.
- Existing prices should not be overwritten without admin approval.
- Old active price sheets should be archived, not deleted.
- The original PDF should remain linked to the import record for traceability.

## Implementation Notes

Suggested core tables:

- `plant_price_sheet_imports`
- `plant_price_sheet_rows`
- `plant_price_sheet_templates`
- `plant_material_prices` or reuse/extend current `materials` model if plant equals supplier location

Suggested statuses:

- `uploaded`
- `mapping_required`
- `review_required`
- `approved`
- `active`
- `archived`
- `failed`

The first implementation should focus on a review workflow with manual correction, then improve automation with saved templates and confidence scoring.
