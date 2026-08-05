package com.example.app.billing;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;

class PosReceiptLayoutConfigTest {
    @Test
    void normalize_keepsValidOrderAndRestoresMissingSections() {
        PosReceiptLayoutConfig source = new PosReceiptLayoutConfig();
        source.setFontSize("large");
        source.setFooterText("  Hvala  ");
        source.setSectionOrder(List.of("items", "company", "items", "unknown"));

        PosReceiptLayoutConfig normalized = PosReceiptLayoutConfig.normalize(source);

        assertThat(normalized.getFontSize()).isEqualTo("LARGE");
        assertThat(normalized.getFooterText()).isEqualTo("Hvala");
        assertThat(normalized.getSectionOrder()).startsWith("items", "company");
        assertThat(normalized.getSectionOrder()).containsExactlyInAnyOrderElementsOf(PosReceiptLayoutConfig.DEFAULT_SECTION_ORDER);
        assertThat(normalized.getSectionOrder()).doesNotContain("payment");
        assertThat(normalized.getSectionOrder()).contains("issuedBy");
        assertThat(normalized.getReferenceTexts())
                .containsEntry("sl", PosReceiptLayoutConfig.DEFAULT_REFERENCE_TEXT_SL)
                .containsEntry("en", PosReceiptLayoutConfig.DEFAULT_REFERENCE_TEXT_EN)
                .containsEntry("sr", PosReceiptLayoutConfig.DEFAULT_REFERENCE_TEXT_SR);
    }


    @Test
    void normalize_removesSystemControlledNoVatClauseIncludingLegacyWording() {
        PosReceiptLayoutConfig source = new PosReceiptLayoutConfig();
        source.setTaxClauses(List.of(
                "DDV ni obračunan na podlagi prvega odstavka 94. člena ZDDV-1.",
                "DDV ni obračunan na podlagi točke prvega odstavka 94. člena ZDDV-1.",
                "DDV ni obračunan na podlagi 1. točke prvega odstavka 94. člena ZDDV-1.",
                "Oprostitev DDV po 42. členu ZDDV-1."
        ));

        PosReceiptLayoutConfig normalized = PosReceiptLayoutConfig.normalize(source);

        assertThat(normalized.getTaxClauses())
                .containsExactly("Oprostitev DDV po 42. členu ZDDV-1.");
    }

    @Test
    void normalize_replacesUnsupportedFontSizeWithStandard() {
        PosReceiptLayoutConfig source = new PosReceiptLayoutConfig();
        source.setFontSize("extra-large");

        assertThat(PosReceiptLayoutConfig.normalize(source).getFontSize()).isEqualTo("STANDARD");
    }
}
