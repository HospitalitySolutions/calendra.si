package com.example.app.billingissuer;

import static org.assertj.core.api.Assertions.assertThat;

import com.example.app.billing.Bill;
import com.example.app.location.Location;
import org.junit.jupiter.api.Test;

class InvoiceIssuanceServiceSnapshotTest {
    @Test
    void applySnapshots_usesIssuingLocationPremiseAndDefaultsDeviceToOne() {
        LegalEntity issuer = new LegalEntity();
        issuer.setName("Test d.o.o.");

        InvoiceSeries series = new InvoiceSeries();
        series.setName("Glavna serija");
        series.setBusinessPremiseCode("OLD-SERIES-CODE");
        series.setElectronicDeviceId(null);

        Location location = new Location();
        location.setFiscalBusinessPremiseCode("MB-CENTER");

        Bill bill = new Bill();
        InvoiceIssuanceService.applySnapshots(bill, issuer, series, location);

        assertThat(bill.getFiscalBusinessPremiseSnapshot()).isEqualTo("MB-CENTER");
        assertThat(bill.getFiscalDeviceIdSnapshot()).isEqualTo("1");
    }
}
