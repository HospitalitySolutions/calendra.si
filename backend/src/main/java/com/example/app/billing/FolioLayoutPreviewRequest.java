package com.example.app.billing;

/**
 * Request body used by the A4 layout editor to render the currently edited
 * layout without first persisting it. The generated preview therefore uses
 * exactly the same renderer, logo, signature and invoice data path as a real
 * issued A4 invoice.
 */
public record FolioLayoutPreviewRequest(
        FolioLayoutConfig layout,
        FolioPdfRequest invoice
) {}
