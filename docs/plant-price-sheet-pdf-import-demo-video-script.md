# Plant Price Sheet PDF Import Demo Video Script

## Purpose

Create a short narrated concept demo for the supplier plant price sheet import workflow before implementation.

The demo should show how an admin uploads a supplier/plant PDF, reviews extracted rows, maps materials/prices/units, and activates the price sheet for quote creation.

## Recommended Video Format

- Length: 60 to 75 seconds
- Style: Clean SaaS product walkthrough
- Voice: Calm, confident, product-demo narration
- Audience: John / stakeholders reviewing the workflow before build
- Screen format: 16:9 landscape

## Storyboard

### Scene 1: Admin Opens Plant Price Sheets

Visual:
- Admin dashboard.
- Supplier profile selected.
- Plant tab open.
- A clear action button: `Upload Price Sheet`.

Voiceover:
> In QuoteBase, every supplier can have one or many plants. Each plant can carry its own material price sheet, because location, material price, and trucking distance all affect the final quote.

On-screen text:
- Supplier > Plant > Price Sheets
- Upload PDF price sheet

### Scene 2: Upload PDF

Visual:
- Upload panel with supplier and plant already selected.
- Drop zone for PDF.
- Fields for effective date and notes.

Voiceover:
> The admin uploads the PDF under the correct plant. QuoteBase stores the original file, then starts extracting the plant address, material names, unit of measure, and prices.

On-screen text:
- PDF stored under the plant
- Extract address, material, unit, price

### Scene 3: Extraction Review

Visual:
- Split screen.
- Left side: PDF preview.
- Right side: extracted table.
- Rows include material name, unit, price, confidence, and status.

Voiceover:
> Instead of trusting the PDF blindly, the admin reviews the extraction in a side-by-side screen. The PDF stays visible, and every extracted material row can be checked or corrected before saving.

On-screen text:
- Review before import
- Edit extracted rows
- Flag low-confidence values

### Scene 4: Column Mapping Template

Visual:
- Mapping controls for supplier-specific PDF format.
- Dropdowns for Material Name, Unit, Price, Plant Address.
- Save as supplier template toggle.

Voiceover:
> Since every supplier may use a different PDF format, QuoteBase lets the admin map columns once and save that mapping as a supplier template. The next upload from the same supplier becomes much faster.

On-screen text:
- Supplier-specific mapping
- Save template for future PDFs

### Scene 5: Material Matching

Visual:
- Extracted material rows matched to existing master materials.
- Suggestions appear while typing.
- New material option available for admin approval.

Voiceover:
> Extracted material names are matched to the master material catalog. Admins can accept suggestions, search existing materials, or create a new material when it is truly new.

On-screen text:
- Match to master materials
- Prevent duplicate names
- Admin-controlled setup

### Scene 6: Activate Price Sheet

Visual:
- Import summary.
- Rows imported, rows needing review, previous price changes.
- Button: `Activate Price Sheet`.

Voiceover:
> Before activation, QuoteBase shows a summary of changes, including new prices and any materials needing review. Once activated, this plant price book becomes available in quote creation.

On-screen text:
- Activate plant price book
- Track price changes
- Use in quote creation

### Scene 7: Quote Creation Impact

Visual:
- Quote flow.
- User selects customer/job site and material.
- Matching plants appear with distance, material price, trucking estimate, and total cost.

Voiceover:
> During quote creation, the sales rep selects the job site and material. QuoteBase can then show the closest matching plants with current material pricing, trucking distance, and margin information.

On-screen text:
- Job site + material first
- Compare plants by distance and price
- Faster, cleaner quoting

## Full Voiceover Script

In QuoteBase, every supplier can have one or many plants. Each plant can carry its own material price sheet, because location, material price, and trucking distance all affect the final quote.

The admin uploads the PDF under the correct plant. QuoteBase stores the original file, then starts extracting the plant address, material names, unit of measure, and prices.

Instead of trusting the PDF blindly, the admin reviews the extraction in a side-by-side screen. The PDF stays visible, and every extracted material row can be checked or corrected before saving.

Since every supplier may use a different PDF format, QuoteBase lets the admin map columns once and save that mapping as a supplier template. The next upload from the same supplier becomes much faster.

Extracted material names are matched to the master material catalog. Admins can accept suggestions, search existing materials, or create a new material when it is truly new.

Before activation, QuoteBase shows a summary of changes, including new prices and any materials needing review. Once activated, this plant price book becomes available in quote creation.

During quote creation, the sales rep selects the job site and material. QuoteBase can then show the closest matching plants with current material pricing, trucking distance, and margin information.

## HeyGen / Video Generator Prompt

Create a 60 to 75 second narrated SaaS product demo video in 16:9 landscape format.

Topic: QuoteBase plant price sheet PDF import workflow.

Tone: Professional, calm, clear, stakeholder-friendly.

Visual style:
- Modern B2B SaaS interface.
- Clean admin screens.
- White or light gray workspace.
- Tables, upload panels, review panels, and quote comparison screens.
- No cartoon style.
- No marketing landing page.

Story:
1. Show admin opening Supplier > Plant > Price Sheets.
2. Show uploading a PDF price sheet under a plant.
3. Show split-screen PDF preview and extracted editable table.
4. Show mapping PDF columns to material name, unit, price, and plant address.
5. Show saving the mapping as a supplier template.
6. Show matching extracted materials to master materials.
7. Show activation summary and activate price sheet.
8. Show quote creation where user selects customer/job site and material, then sees matching plants with distance, plant price, trucking cost, and total/margin.

Use this narration:

"In QuoteBase, every supplier can have one or many plants. Each plant can carry its own material price sheet, because location, material price, and trucking distance all affect the final quote.

The admin uploads the PDF under the correct plant. QuoteBase stores the original file, then starts extracting the plant address, material names, unit of measure, and prices.

Instead of trusting the PDF blindly, the admin reviews the extraction in a side-by-side screen. The PDF stays visible, and every extracted material row can be checked or corrected before saving.

Since every supplier may use a different PDF format, QuoteBase lets the admin map columns once and save that mapping as a supplier template. The next upload from the same supplier becomes much faster.

Extracted material names are matched to the master material catalog. Admins can accept suggestions, search existing materials, or create a new material when it is truly new.

Before activation, QuoteBase shows a summary of changes, including new prices and any materials needing review. Once activated, this plant price book becomes available in quote creation.

During quote creation, the sales rep selects the job site and material. QuoteBase can then show the closest matching plants with current material pricing, trucking distance, and margin information."

## Notes For Implementation Later

- The video is a concept walkthrough, not a recording of built functionality.
- The UI shown in the video should match the proposal saved in `docs/plant-price-sheet-pdf-import-gui-proposal.md`.
- The actual implementation should keep supplier, plant, material, pricing, and tax master data admin-controlled.
- Extracted PDF data should not become active until an admin reviews and activates it.
