package com.example.app.billing;

import org.springframework.stereotype.Service;

/**
 * A4 invoice PDF entry point.
 *
 * <p>The former absolute-coordinate A4 renderer has been removed. All A4
 * invoices now use {@link ModernA4InvoicePdfRenderer}, which consumes the same
 * template/settings model used by the A4 settings preview.</p>
 */
@Service
public class FolioPdfService {

    public byte[] generate(FolioPdfRequest request) {
        return generate(request, FolioLayoutConfig.defaultLayout(), null, null, request != null ? request.getLocale() : null);
    }

    public byte[] generate(FolioPdfRequest request, FolioLayoutConfig layout) {
        return generate(request, layout, null, null, request != null ? request.getLocale() : null);
    }

    public byte[] generate(FolioPdfRequest request, FolioLayoutConfig layout, byte[] logoBytes) {
        return generate(request, layout, logoBytes, null, request != null ? request.getLocale() : null);
    }

    public byte[] generate(FolioPdfRequest request, FolioLayoutConfig layout, byte[] logoBytes, byte[] signatureBytes) {
        return generate(request, layout, logoBytes, signatureBytes, request != null ? request.getLocale() : null);
    }

    public byte[] generate(
            FolioPdfRequest request,
            FolioLayoutConfig layout,
            byte[] logoBytes,
            byte[] signatureBytes,
            String locale
    ) {
        if (request == null) throw new IllegalArgumentException("FolioPdfRequest is required");
        FolioLayoutConfig normalizedLayout = FolioLayoutConfig.normalize(layout);
        return new ModernA4InvoicePdfRenderer().render(
                request,
                normalizedLayout,
                logoBytes,
                signatureBytes,
                locale
        );
    }
}
