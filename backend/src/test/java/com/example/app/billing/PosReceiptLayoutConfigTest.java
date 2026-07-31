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
    }

    @Test
    void normalize_replacesUnsupportedFontSizeWithStandard() {
        PosReceiptLayoutConfig source = new PosReceiptLayoutConfig();
        source.setFontSize("extra-large");

        assertThat(PosReceiptLayoutConfig.normalize(source).getFontSize()).isEqualTo("STANDARD");
    }
}
