package com.example.app.billing;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.util.ArrayList;
import java.util.List;

/**
 * Configurable layout for the folio PDF generator.
 * Stored as JSON in the {@code FOLIO_TEMPLATE_LAYOUT_JSON} app setting.
 * All coordinates are in PDF points (1 pt = 1/72 in, A4 = 595.28 x 841.89).
 * Y origin is the <b>top</b> of the page (converted to PDFBox bottom-origin in the renderer).
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class FolioLayoutConfig {

    private float pageWidth = 595.28f;
    private float pageHeight = 841.89f;
    private List<FieldConfig> fields = new ArrayList<>();
    private TableConfig table = new TableConfig();
    private FooterConfig footer = new FooterConfig();
    private LogoConfig logo = new LogoConfig();
    private SignatureConfig signature = new SignatureConfig();
    private QrCodeConfig paymentQr = new QrCodeConfig();
    private QrCodeConfig fiscalQr;
    private VatBreakdownTableConfig vatBreakdownTable = new VatBreakdownTableConfig();

    public FolioLayoutConfig() {}

    /* ── inner models ── */

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class LocalizedText {
        private String en = "";
        private String sl = "";

        public LocalizedText() {}
        public LocalizedText(String en, String sl) {
            this.en = en;
            this.sl = sl;
        }

        public String getEn() { return en; }
        public void setEn(String en) { this.en = en; }
        public String getSl() { return sl; }
        public void setSl(String sl) { this.sl = sl; }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class FieldConfig {
        private String key = "";
        private String group = "";
        private String label = "";
        private LocalizedText labelI18n;
        /** Optional localized prefix rendered inside the data block, left of the value. */
        private LocalizedText prefixI18n;
        /** Optional date output format for date-like data fields (e.g. folioDate). */
        private String dateFormat = "YYYY-MM-DD";
        private float x;
        private float y;
        private float width = 200;
        private float height = 16;
        private int fontSize = 10;
        private boolean bold;
        private String alignment = "left";
        private boolean visible = true;
        /** "data" = value from FolioPdfRequest by key, "custom" = literal text */
        private String type = "data";
        private String text = "";
        private LocalizedText textI18n;

        public FieldConfig() {}
        public FieldConfig(String key, String group, String label, float x, float y, float width, float height, int fontSize, boolean bold, String alignment) {
            this.key = key; this.group = group; this.label = label;
            this.x = x; this.y = y; this.width = width; this.height = height;
            this.fontSize = fontSize; this.bold = bold; this.alignment = alignment;
        }

        public String getKey() { return key; }
        public void setKey(String key) { this.key = key; }
        public String getGroup() { return group; }
        public void setGroup(String group) { this.group = group; }
        public String getLabel() { return label; }
        public void setLabel(String label) { this.label = label; }
        public LocalizedText getLabelI18n() { return labelI18n; }
        public void setLabelI18n(LocalizedText labelI18n) { this.labelI18n = labelI18n; }
        public LocalizedText getPrefixI18n() { return prefixI18n; }
        public void setPrefixI18n(LocalizedText prefixI18n) { this.prefixI18n = prefixI18n; }
        public String getDateFormat() { return dateFormat; }
        public void setDateFormat(String dateFormat) { this.dateFormat = dateFormat; }
        public float getX() { return x; }
        public void setX(float x) { this.x = x; }
        public float getY() { return y; }
        public void setY(float y) { this.y = y; }
        public float getWidth() { return width; }
        public void setWidth(float width) { this.width = width; }
        public float getHeight() { return height; }
        public void setHeight(float height) { this.height = height; }
        public int getFontSize() { return fontSize; }
        public void setFontSize(int fontSize) { this.fontSize = fontSize; }
        public boolean isBold() { return bold; }
        public void setBold(boolean bold) { this.bold = bold; }
        public String getAlignment() { return alignment; }
        public void setAlignment(String alignment) { this.alignment = alignment; }
        public boolean isVisible() { return visible; }
        public void setVisible(boolean visible) { this.visible = visible; }
        public String getType() { return type; }
        public void setType(String type) { this.type = type; }
        public String getText() { return text; }
        public void setText(String text) { this.text = text; }
        public LocalizedText getTextI18n() { return textI18n; }
        public void setTextI18n(LocalizedText textI18n) { this.textI18n = textI18n; }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class TableConfig {
        private float startX = 50;
        private float startY = 230;
        private float width = 495;
        private float rowHeight = 18;
        private float headerHeight = 20;
        private int headerFontSize = 9;
        private int bodyFontSize = 9;
        private float footerSpacing = 4;
        private List<ColumnConfig> columns = new ArrayList<>();

        public TableConfig() {}

        public float getStartX() { return startX; }
        public void setStartX(float startX) { this.startX = startX; }
        public float getStartY() { return startY; }
        public void setStartY(float startY) { this.startY = startY; }
        public float getWidth() { return width; }
        public void setWidth(float width) { this.width = width; }
        public float getRowHeight() { return rowHeight; }
        public void setRowHeight(float rowHeight) { this.rowHeight = rowHeight; }
        public float getHeaderHeight() { return headerHeight; }
        public void setHeaderHeight(float headerHeight) { this.headerHeight = headerHeight; }
        public int getHeaderFontSize() { return headerFontSize; }
        public void setHeaderFontSize(int headerFontSize) { this.headerFontSize = headerFontSize; }
        public int getBodyFontSize() { return bodyFontSize; }
        public void setBodyFontSize(int bodyFontSize) { this.bodyFontSize = bodyFontSize; }
        public float getFooterSpacing() { return footerSpacing; }
        public void setFooterSpacing(float footerSpacing) { this.footerSpacing = footerSpacing; }
        public List<ColumnConfig> getColumns() { return columns; }
        public void setColumns(List<ColumnConfig> columns) { this.columns = columns; }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class ColumnConfig {
        private String key = "";
        private String label = "";
        private LocalizedText labelI18n;
        /** Optional output format for the table date column. */
        private String dateFormat = "YYYY-MM-DD";
        private float relX;
        private float width = 100;
        private String alignment = "left";

        public ColumnConfig() {}
        public ColumnConfig(String key, String label, float relX, float width, String alignment) {
            this.key = key; this.label = label; this.relX = relX; this.width = width; this.alignment = alignment;
        }

        public String getKey() { return key; }
        public void setKey(String key) { this.key = key; }
        public String getLabel() { return label; }
        public void setLabel(String label) { this.label = label; }
        public LocalizedText getLabelI18n() { return labelI18n; }
        public void setLabelI18n(LocalizedText labelI18n) { this.labelI18n = labelI18n; }
        public String getDateFormat() { return dateFormat; }
        public void setDateFormat(String dateFormat) { this.dateFormat = dateFormat; }
        public float getRelX() { return relX; }
        public void setRelX(float relX) { this.relX = relX; }
        public float getWidth() { return width; }
        public void setWidth(float width) { this.width = width; }
        public String getAlignment() { return alignment; }
        public void setAlignment(String alignment) { this.alignment = alignment; }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class FooterConfig {
        private float gapAfterTable = 4;
        private float lineSpacing = 16;
        private List<FooterItem> items = new ArrayList<>();

        public FooterConfig() {}

        public float getGapAfterTable() { return gapAfterTable; }
        public void setGapAfterTable(float gapAfterTable) { this.gapAfterTable = gapAfterTable; }
        public float getLineSpacing() { return lineSpacing; }
        public void setLineSpacing(float lineSpacing) { this.lineSpacing = lineSpacing; }
        public List<FooterItem> getItems() { return items; }
        public void setItems(List<FooterItem> items) { this.items = items; }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class FooterItem {
        private String key = "";
        private String label = "";
        private LocalizedText labelI18n;
        private int fontSize = 10;
        private boolean bold;
        private String alignment = "left";
        private float x = -1;
        private float y = -1;
        private float width = -1;
        private float height = -1;

        public FooterItem() {}
        public FooterItem(String key, String label, int fontSize, boolean bold, String alignment) {
            this.key = key; this.label = label; this.fontSize = fontSize; this.bold = bold; this.alignment = alignment;
        }
        public FooterItem(String key, String label, int fontSize, boolean bold, String alignment, float x, float y, float width, float height) {
            this.key = key; this.label = label; this.fontSize = fontSize; this.bold = bold; this.alignment = alignment;
            this.x = x; this.y = y; this.width = width; this.height = height;
        }

        public String getKey() { return key; }
        public void setKey(String key) { this.key = key; }
        public String getLabel() { return label; }
        public void setLabel(String label) { this.label = label; }
        public LocalizedText getLabelI18n() { return labelI18n; }
        public void setLabelI18n(LocalizedText labelI18n) { this.labelI18n = labelI18n; }
        public int getFontSize() { return fontSize; }
        public void setFontSize(int fontSize) { this.fontSize = fontSize; }
        public boolean isBold() { return bold; }
        public void setBold(boolean bold) { this.bold = bold; }
        public String getAlignment() { return alignment; }
        public void setAlignment(String alignment) { this.alignment = alignment; }
        public float getX() { return x; }
        public void setX(float x) { this.x = x; }
        public float getY() { return y; }
        public void setY(float y) { this.y = y; }
        public float getWidth() { return width; }
        public void setWidth(float width) { this.width = width; }
        public float getHeight() { return height; }
        public void setHeight(float height) { this.height = height; }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class QrCodeConfig {
        private float x = 395;
        private float y = 392;
        private float width = 120;
        private float height = 120;
        private boolean visible = true;

        public QrCodeConfig() {}

        public float getX() { return x; }
        public void setX(float x) { this.x = x; }
        public float getY() { return y; }
        public void setY(float y) { this.y = y; }
        public float getWidth() { return width; }
        public void setWidth(float width) { this.width = width; }
        public float getHeight() { return height; }
        public void setHeight(float height) { this.height = height; }
        public boolean isVisible() { return visible; }
        public void setVisible(boolean visible) { this.visible = visible; }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class VatBreakdownTableConfig {
        private float x = 50;
        private float y = 322;
        private float width = 300;
        private float headerHeight = 14;
        private float rowHeight = 14;
        private int headerFontSize = 7;
        private int bodyFontSize = 7;
        private boolean visible = true;

        public VatBreakdownTableConfig() {}

        public float getX() { return x; }
        public void setX(float x) { this.x = x; }
        public float getY() { return y; }
        public void setY(float y) { this.y = y; }
        public float getWidth() { return width; }
        public void setWidth(float width) { this.width = width; }
        public float getHeaderHeight() { return headerHeight; }
        public void setHeaderHeight(float headerHeight) { this.headerHeight = headerHeight; }
        public float getRowHeight() { return rowHeight; }
        public void setRowHeight(float rowHeight) { this.rowHeight = rowHeight; }
        public int getHeaderFontSize() { return headerFontSize; }
        public void setHeaderFontSize(int headerFontSize) { this.headerFontSize = headerFontSize; }
        public int getBodyFontSize() { return bodyFontSize; }
        public void setBodyFontSize(int bodyFontSize) { this.bodyFontSize = bodyFontSize; }
        public boolean isVisible() { return visible; }
        public void setVisible(boolean visible) { this.visible = visible; }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class LogoConfig {
        private float x = 400;
        private float y = 40;
        private float width = 120;
        private float height = 60;
        private boolean visible = true;

        public LogoConfig() {}

        public float getX() { return x; }
        public void setX(float x) { this.x = x; }
        public float getY() { return y; }
        public void setY(float y) { this.y = y; }
        public float getWidth() { return width; }
        public void setWidth(float width) { this.width = width; }
        public float getHeight() { return height; }
        public void setHeight(float height) { this.height = height; }
        public boolean isVisible() { return visible; }
        public void setVisible(boolean visible) { this.visible = visible; }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class SignatureConfig {
        private float x = 50;
        private float y = 500;
        private float width = 120;
        private float height = 50;
        private boolean visible = true;

        public SignatureConfig() {}

        public float getX() { return x; }
        public void setX(float x) { this.x = x; }
        public float getY() { return y; }
        public void setY(float y) { this.y = y; }
        public float getWidth() { return width; }
        public void setWidth(float width) { this.width = width; }
        public float getHeight() { return height; }
        public void setHeight(float height) { this.height = height; }
        public boolean isVisible() { return visible; }
        public void setVisible(boolean visible) { this.visible = visible; }
    }

    /* ── factory: default layout matching the original hardcoded constants ── */

    public static FolioLayoutConfig defaultLayout() {
        var cfg = new FolioLayoutConfig();

        var fields = new ArrayList<FieldConfig>();
        // Company block
        fields.add(new FieldConfig("companyName",       "header",    "Company Name",     50, 50,  200, 17, 13, true,  "left"));
        fields.add(new FieldConfig("companyAddress",    "header",    "Company Address",  50, 67,  200, 14, 10, false, "left"));
        fields.add(new FieldConfig("companyPostalCode", "header",    "Postal Code",      50, 81,  80,  14, 10, false, "left"));
        fields.add(new FieldConfig("companyCity",       "header",    "City",            130, 81,  120, 14, 10, false, "left"));
        fields.add(new FieldConfig("companyTaxId",      "header",    "VAT ID",           50, 95,  200, 14, 10, false, "left"));
        // Document meta
        fields.add(new FieldConfig("folioNumber",       "document",  "Folio Number",        355, 50,  190, 16, 12, true,  "right"));
        fields.add(new FieldConfig("folioDate",         "document",  "Issue date and time", 355, 66,  190, 14, 10, false, "right"));
        fields.add(new FieldConfig("dateOfService",     "document",  "Date of Service",     355, 80,  190, 14, 10, false, "right"));
        fields.add(new FieldConfig("dueDate",           "document",  "Due Date",            355, 94,  190, 14, 10, false, "right"));
        // Recipient block
        fields.add(new FieldConfig("recipientName",     "recipient", "Recipient Name",   50, 125, 200, 15, 11, true,  "left"));
        fields.add(new FieldConfig("recipientAddress",  "recipient", "Recipient Addr",   50, 140, 200, 14, 10, false, "left"));
        fields.add(new FieldConfig("recipientPostalCode","recipient","Recipient Postal",  50, 154, 80,  14, 10, false, "left"));
        fields.add(new FieldConfig("recipientCity",     "recipient", "Recipient City",  130, 154, 120, 14, 10, false, "left"));
        fields.add(new FieldConfig("recipientVatId",    "recipient", "Recipient VAT ID", 50, 168, 300, 14, 10, false, "left"));
        for (var field : fields) {
            field.setLabelI18n(new LocalizedText(field.getLabel(), slFieldLabel(field.getKey(), field.getLabel())));
            if (isPrefixFieldKey(field.getKey())) {
                field.setPrefixI18n(defaultFieldPrefix(field.getKey()));
            }
            if ("folioDate".equals(field.getKey())) {
                field.setDateFormat("YYYY-MM-DD HH:mm");
            } else if ("dateOfService".equals(field.getKey()) || "dueDate".equals(field.getKey())) {
                field.setDateFormat("YYYY-MM-DD");
            }
        }
        cfg.setFields(fields);

        var table = new TableConfig();
        table.setStartX(50);
        table.setStartY(230);
        table.setWidth(495);
        table.setRowHeight(18);
        table.setHeaderHeight(20);
        table.setHeaderFontSize(9);
        table.setBodyFontSize(9);
        table.setFooterSpacing(4);
        var cols = new ArrayList<ColumnConfig>();
        cols.add(new ColumnConfig("date",        "Date",      0,   55,  "left"));
        cols.add(new ColumnConfig("description", "Description", 55,  175, "left"));
        cols.add(new ColumnConfig("qty",         "Qty",       230, 30,  "right"));
        cols.add(new ColumnConfig("gross",       "Gross",     260, 55,  "right"));
        cols.add(new ColumnConfig("taxPercent",  "Tax (%)",   315, 45,  "right"));
        cols.add(new ColumnConfig("taxAmount",   "Tax (\u20ac)",   360, 55,  "right"));
        cols.add(new ColumnConfig("total",       "Total",     415, 80,  "right"));
        for (var col : cols) {
            col.setLabelI18n(new LocalizedText(col.getLabel(), slColumnLabel(col.getKey(), col.getLabel())));
            if ("date".equals(col.getKey())) {
                col.setDateFormat("YYYY-MM-DD");
            }
        }
        table.setColumns(cols);
        cfg.setTable(table);

        var footer = new FooterConfig();
        footer.setGapAfterTable(4);
        footer.setLineSpacing(16);
        var items = new ArrayList<FooterItem>();
        items.add(new FooterItem("payment",    "Payment",     10, false, "right", 395, 340, 150, 16));
        items.add(new FooterItem("totalGross", "Total gross", 11, true,  "right", 395, 358, 150, 16));
        items.add(new FooterItem("toBePaid",   "To be paid",  11, true,  "right", 395, 376, 150, 16));
        items.add(new FooterItem("notes",      "Notes",        9, false, "left",  50,  398, 300, 16));
        items.add(new FooterItem("iban",       "IBAN",        10, false, "left",  50,  416, 300, 16));
        items.add(new FooterItem("issuedBy",   "Issued by",   10, false, "left",  50,  434, 200, 16));
        items.add(new FooterItem("fiscalZoi",  "ZOI",          8, false, "left",  50,  454, 300, 14));
        items.add(new FooterItem("fiscalEor",  "EOR",          8, false, "left",  50,  468, 300, 14));
        for (var item : items) {
            item.setLabelI18n(new LocalizedText(item.getLabel(), slFooterLabel(item.getKey(), item.getLabel())));
        }
        footer.setItems(items);
        cfg.setFooter(footer);

        cfg.setSignature(new SignatureConfig());
        cfg.setPaymentQr(new QrCodeConfig());
        var fiscalQr = new QrCodeConfig();
        fiscalQr.setX(395);
        fiscalQr.setY(520);
        fiscalQr.setWidth(95);
        fiscalQr.setHeight(95);
        fiscalQr.setVisible(true);
        cfg.setFiscalQr(fiscalQr);
        cfg.setVatBreakdownTable(new VatBreakdownTableConfig());

        return cfg;
    }

    private static boolean isDocumentMetaKey(String key) {
        return "folioNumber".equals(key)
                || "folioDate".equals(key)
                || "dateOfService".equals(key)
                || "dueDate".equals(key);
    }

    private static boolean isPrefixFieldKey(String key) {
        return isDocumentMetaKey(key) || "recipientVatId".equals(key);
    }

    private static LocalizedText defaultFieldPrefix(String key) {
        return switch (key) {
            case "folioNumber" -> new LocalizedText("Folio Number:", "Številka računa:");
            case "folioDate" -> new LocalizedText("Issue date and time:", "Datum in ura izdaje:");
            case "dateOfService" -> new LocalizedText("Date of Service:", "Datum storitve:");
            case "dueDate" -> new LocalizedText("Due Date:", "Rok plačila:");
            case "recipientVatId" -> new LocalizedText("Recipient VAT ID:", "Davčna številka prejemnika (ID za DDV):");
            default -> new LocalizedText("", "");
        };
    }

    private static String slFieldLabel(String key, String fallback) {
        return switch (key) {
            case "companyName" -> "Naziv podjetja";
            case "companyAddress" -> "Naslov podjetja";
            case "companyPostalCode" -> "Postna stevilka";
            case "companyCity" -> "Kraj";
            case "companyTaxId" -> "Davcna stevilka";
            case "folioNumber" -> "Stevilka racuna";
            case "folioDate" -> "Datum in ura izdaje";
            case "dateOfService" -> "Datum storitve";
            case "dueDate" -> "Rok placila";
            case "recipientName" -> "Naziv prejemnika";
            case "recipientAddress" -> "Naslov prejemnika";
            case "recipientPostalCode" -> "Postna stevilka prejemnika";
            case "recipientCity" -> "Kraj prejemnika";
            case "recipientVatId" -> "Davčna številka prejemnika (ID za DDV)";
            default -> fallback;
        };
    }

    private static String slColumnLabel(String key, String fallback) {
        return switch (key) {
            case "date" -> "Datum";
            case "description" -> "Opis";
            case "qty" -> "Kol";
            case "gross" -> "Bruto";
            case "taxPercent" -> "DDV (%)";
            case "taxAmount" -> "DDV (EUR)";
            case "total" -> "Skupaj";
            default -> fallback;
        };
    }

    private static String slFooterLabel(String key, String fallback) {
        return switch (key) {
            case "payment" -> "Placilo";
            case "totalGross" -> "Skupaj bruto";
            case "toBePaid" -> "Za plačilo";
            case "totalNett" -> "Skupaj neto";
            case "vat22" -> "DDV 22%";
            case "vat95" -> "DDV 9,5%";
            case "vat0" -> "DDV 0%";
            case "noVat" -> "Brez DDV";
            case "notes" -> "Opombe";
            case "iban" -> "IBAN";
            case "issuedBy" -> "Izdal";
            case "fiscalZoi" -> "ZOI";
            case "fiscalEor" -> "EOR";
            default -> fallback;
        };
    }

    /**
     * Adds newly introduced optional layout blocks to older saved JSON layouts
     * without overwriting the tenant's existing coordinates or labels.
     */
    public static FolioLayoutConfig normalize(FolioLayoutConfig cfg) {
        if (cfg == null) return defaultLayout();
        FolioLayoutConfig defaults = defaultLayout();
        if (cfg.getFields() == null) {
            cfg.setFields(defaults.getFields());
        } else {
            for (FieldConfig field : cfg.getFields()) {
                if (field == null) continue;
                if (field.getLabelI18n() == null) {
                    field.setLabelI18n(new LocalizedText(field.getLabel(), slFieldLabel(field.getKey(), field.getLabel())));
                }
                if (isPrefixFieldKey(field.getKey())) {
                    LocalizedText def = defaultFieldPrefix(field.getKey());
                    LocalizedText current = field.getPrefixI18n();
                    if (current == null) {
                        field.setPrefixI18n(def);
                    } else {
                        if (current.getEn() == null || current.getEn().isBlank()) current.setEn(def.getEn());
                        if (current.getSl() == null || current.getSl().isBlank()) current.setSl(def.getSl());
                    }
                }
                if (isDocumentMetaKey(field.getKey())) {
                    if ("folioDate".equals(field.getKey())
                            && (field.getDateFormat() == null || field.getDateFormat().isBlank() || "YYYY-MM-DD".equals(field.getDateFormat()))) {
                        field.setDateFormat("YYYY-MM-DD HH:mm");
                    }
                    if ("folioDate".equals(field.getKey()) && (field.getLabel() == null || field.getLabel().isBlank() || "Issue Date".equals(field.getLabel()))) {
                        field.setLabel("Issue date and time");
                    }
                    if ("folioDate".equals(field.getKey()) && field.getLabelI18n() != null) {
                        if (field.getLabelI18n().getEn() == null || field.getLabelI18n().getEn().isBlank() || "Issue Date".equals(field.getLabelI18n().getEn())) {
                            field.getLabelI18n().setEn("Issue date and time");
                        }
                        if (field.getLabelI18n().getSl() == null || field.getLabelI18n().getSl().isBlank() || "Datum izdaje".equals(field.getLabelI18n().getSl())) {
                            field.getLabelI18n().setSl("Datum in ura izdaje");
                        }
                    }
                }
            }
        }
        if (cfg.getTable() == null) cfg.setTable(defaults.getTable());
        if (cfg.getFooter() == null) {
            cfg.setFooter(defaults.getFooter());
        } else {
            if (cfg.getFooter().getItems() == null) {
                cfg.getFooter().setItems(defaults.getFooter().getItems());
            } else {
                addMissingFooterItem(cfg, defaults, "toBePaid");
                addMissingFooterItem(cfg, defaults, "fiscalZoi");
                addMissingFooterItem(cfg, defaults, "fiscalEor");
            }
        }
        if (cfg.getLogo() == null) cfg.setLogo(defaults.getLogo());
        if (cfg.getSignature() == null) cfg.setSignature(defaults.getSignature());
        if (cfg.getPaymentQr() == null) cfg.setPaymentQr(defaults.getPaymentQr());
        if (cfg.getFiscalQr() == null) cfg.setFiscalQr(defaults.getFiscalQr());
        if (cfg.getVatBreakdownTable() == null) cfg.setVatBreakdownTable(defaults.getVatBreakdownTable());
        return cfg;
    }

    private static void addMissingFooterItem(FolioLayoutConfig cfg, FolioLayoutConfig defaults, String key) {
        boolean exists = cfg.getFooter().getItems().stream().anyMatch(item -> item != null && key.equals(item.getKey()));
        if (exists) return;
        defaults.getFooter().getItems().stream()
                .filter(item -> item != null && key.equals(item.getKey()))
                .findFirst()
                .ifPresent(cfg.getFooter().getItems()::add);
    }

    /* ── root getters/setters ── */

    public float getPageWidth() { return pageWidth; }
    public void setPageWidth(float pageWidth) { this.pageWidth = pageWidth; }
    public float getPageHeight() { return pageHeight; }
    public void setPageHeight(float pageHeight) { this.pageHeight = pageHeight; }
    public List<FieldConfig> getFields() { return fields; }
    public void setFields(List<FieldConfig> fields) { this.fields = fields; }
    public TableConfig getTable() { return table; }
    public void setTable(TableConfig table) { this.table = table; }
    public FooterConfig getFooter() { return footer; }
    public void setFooter(FooterConfig footer) { this.footer = footer; }
    public LogoConfig getLogo() { return logo; }
    public void setLogo(LogoConfig logo) { this.logo = logo; }
    public SignatureConfig getSignature() { return signature; }
    public void setSignature(SignatureConfig signature) { this.signature = signature; }
    public QrCodeConfig getPaymentQr() { return paymentQr; }
    public void setPaymentQr(QrCodeConfig paymentQr) { this.paymentQr = paymentQr; }
    public QrCodeConfig getFiscalQr() { return fiscalQr; }
    public void setFiscalQr(QrCodeConfig fiscalQr) { this.fiscalQr = fiscalQr; }
    public VatBreakdownTableConfig getVatBreakdownTable() { return vatBreakdownTable; }
    public void setVatBreakdownTable(VatBreakdownTableConfig vatBreakdownTable) { this.vatBreakdownTable = vatBreakdownTable; }
}
