package com.example.app.email;

import com.example.app.company.Company;
import com.example.app.settings.AppSetting;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
import java.util.Locale;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;

/**
 * Renders tenant-facing notification emails with a fixed branded HTML layout.
 *
 * The design (card, header, typography, footer) is owned by the platform; template
 * authors only control the text content. Stored template bodies are sanitized down to
 * light formatting (paragraphs, bold/italic/underline, links, lists, quotes) and the
 * design's inline styles are re-applied per tag, because email clients require inline CSS.
 */
@Service
public class TenantEmailLayoutRenderer {
    /** Marker attribute emitted by senders on anchors that must render as call-to-action buttons. */
    public static final String BUTTON_ATTRIBUTE = "data-email-button";

    private static final String PARAGRAPH_STYLE = "margin:0 0 14px;color:#475569;font-size:16px;line-height:1.65";
    private static final String LINK_STYLE = "color:#1769ea;text-decoration:underline;font-weight:600";
    private static final String LIST_STYLE = "margin:0 0 14px;padding:0 0 0 24px;color:#475569;font-size:16px;line-height:1.65";
    private static final String LIST_ITEM_STYLE = "margin:0 0 6px";
    private static final String BLOCKQUOTE_STYLE =
            "margin:0 0 14px;padding:10px 16px;border-left:3px solid #d7e3f4;color:#58677e;font-size:15px;line-height:1.6";
    private static final String PRIMARY_BUTTON_STYLE =
            "display:inline-block;margin:4px 8px 12px 0;padding:13px 20px;border-radius:12px;background:#1769ea;"
                    + "color:#ffffff;text-decoration:none;font-size:15px;line-height:20px;font-weight:700";
    private static final String SECONDARY_BUTTON_STYLE =
            "display:inline-block;margin:4px 8px 12px 0;padding:12px 20px;border-radius:12px;border:1px solid #c9d8ef;"
                    + "background:#f6f9ff;color:#1769ea;text-decoration:none;font-size:15px;line-height:20px;font-weight:700";

    private static final Pattern DROP_WITH_CONTENT_PATTERN = Pattern.compile(
            "(?is)<(script|style|head|title|iframe|object|embed|svg|noscript)\\b[^>]*>.*?</\\1\\s*>"
    );
    private static final Pattern HTML_COMMENT_PATTERN = Pattern.compile("(?s)<!--.*?-->");
    private static final Pattern TAG_PATTERN = Pattern.compile("<[^>]*>");
    private static final Pattern HREF_PATTERN = Pattern.compile(
            "(?is)\\bhref\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s>]+))"
    );
    private static final Pattern BUTTON_ATTRIBUTE_PATTERN = Pattern.compile(
            "(?is)\\b" + BUTTON_ATTRIBUTE + "\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s>]+))"
    );

    private final AppSettingRepository settings;

    public TenantEmailLayoutRenderer(AppSettingRepository settings) {
        this.settings = settings;
    }

    /**
     * Sanitizes the given template body and wraps it in the branded layout.
     * Accepts either rich-text editor HTML or legacy plain-text bodies.
     */
    public String render(Company company, String bodyHtml) {
        return render(company, bodyHtml, null, null);
    }

    /**
     * Renders the standard tenant layout with an event-specific public identity.
     * This is used for location-owned events (for example waitlist offers) where
     * the recipient should see the physical branch identity instead of the generic company identity.
     */
    public String render(Company company, String bodyHtml, String publicName, String publicLogoUrl) {
        String content = sanitizeContent(bodyHtml);
        if (content.isBlank()) {
            content = "<p style=\"" + PARAGRAPH_STYLE + "\">&nbsp;</p>";
        }
        Long companyId = company == null ? null : company.getId();
        String companyName = setting(companyId, SettingKey.COMPANY_NAME)
                .orElseGet(() -> company == null || company.getName() == null ? "" : company.getName().trim());
        String displayName = publicName == null || publicName.isBlank() ? companyName : publicName.trim();
        return wrap(content, headerHtml(companyId, displayName, publicLogoUrl), footerHtml(displayName));
    }

    /**
     * Reduces template HTML to the allowed light-formatting tags and re-applies the design's
     * inline styles. Plain-text input (no markup) is escaped and converted to paragraphs.
     */
    public static String sanitizeContent(String value) {
        if (value == null || value.isBlank()) {
            return "";
        }
        String normalized = value.replace("\r\n", "\n").replace('\r', '\n').strip();
        if (normalized.isBlank()) {
            return "";
        }
        if (!containsHtmlMarkup(normalized)) {
            return plainTextToHtml(normalized);
        }

        String cleaned = DROP_WITH_CONTENT_PATTERN.matcher(normalized).replaceAll("");
        cleaned = HTML_COMMENT_PATTERN.matcher(cleaned).replaceAll("");

        Matcher matcher = TAG_PATTERN.matcher(cleaned);
        StringBuilder out = new StringBuilder(cleaned.length());
        int last = 0;
        while (matcher.find()) {
            out.append(cleaned, last, matcher.start());
            out.append(sanitizeTag(matcher.group()));
            last = matcher.end();
        }
        out.append(cleaned, last, cleaned.length());
        return out.toString().strip();
    }

    private static String sanitizeTag(String tag) {
        String inner = tag.substring(1, tag.length() - 1).strip();
        boolean closing = inner.startsWith("/");
        if (closing) {
            inner = inner.substring(1).strip();
        }
        int nameEnd = 0;
        while (nameEnd < inner.length() && (Character.isLetterOrDigit(inner.charAt(nameEnd)))) {
            nameEnd++;
        }
        String name = inner.substring(0, nameEnd).toLowerCase(Locale.ROOT);

        switch (name) {
            case "br":
                return closing ? "" : "<br>";
            case "p":
            case "div":
                return closing ? "</p>" : "<p style=\"" + PARAGRAPH_STYLE + "\">";
            case "b":
            case "strong":
                return closing ? "</strong>" : "<strong>";
            case "i":
            case "em":
                return closing ? "</em>" : "<em>";
            case "u":
                return closing ? "</u>" : "<u>";
            case "ul":
                return closing ? "</ul>" : "<ul style=\"" + LIST_STYLE + "\">";
            case "ol":
                return closing ? "</ol>" : "<ol style=\"" + LIST_STYLE + "\">";
            case "li":
                return closing ? "</li>" : "<li style=\"" + LIST_ITEM_STYLE + "\">";
            case "blockquote":
                return closing ? "</blockquote>" : "<blockquote style=\"" + BLOCKQUOTE_STYLE + "\">";
            case "h1":
            case "h2":
            case "h3":
            case "h4":
            case "h5":
            case "h6":
                // Typography belongs to the design: old heading markup degrades to a bold paragraph.
                return closing ? "</strong></p>" : "<p style=\"" + PARAGRAPH_STYLE + "\"><strong>";
            case "a":
                return closing ? "</a>" : sanitizeAnchorOpenTag(tag);
            default:
                // Unknown/disallowed tag: drop the tag, keep its text content.
                return "";
        }
    }

    private static String sanitizeAnchorOpenTag(String tag) {
        // Undo attribute entity-encoding so escapeAttribute below does not double-escape.
        String href = firstGroup(HREF_PATTERN.matcher(tag)).replace("&amp;", "&");
        if (!isSafeHref(href)) {
            // Keep the link text but drop the tag; the matching </a> becomes a stray closer
            // which email clients ignore, so emit an anchor without href instead.
            return "<a style=\"" + LINK_STYLE + "\">";
        }
        String button = firstGroup(BUTTON_ATTRIBUTE_PATTERN.matcher(tag)).toLowerCase(Locale.ROOT);
        String style = switch (button) {
            case "primary" -> PRIMARY_BUTTON_STYLE;
            case "secondary" -> SECONDARY_BUTTON_STYLE;
            default -> LINK_STYLE;
        };
        return "<a href=\"" + escapeAttribute(href) + "\" style=\"" + style + "\">";
    }

    private static String firstGroup(Matcher matcher) {
        if (!matcher.find()) {
            return "";
        }
        for (int group = 1; group <= matcher.groupCount(); group++) {
            String valueAt = matcher.group(group);
            if (valueAt != null) {
                return valueAt.strip();
            }
        }
        return "";
    }

    private static boolean isSafeHref(String href) {
        if (href == null || href.isBlank()) {
            return false;
        }
        String decoded = href.replace("&amp;", "&").strip().toLowerCase(Locale.ROOT);
        return decoded.startsWith("https://")
                || decoded.startsWith("http://")
                || decoded.startsWith("mailto:")
                || decoded.startsWith("tel:");
    }

    private static String plainTextToHtml(String text) {
        String escaped = escapeHtml(text);
        StringBuilder html = new StringBuilder(escaped.length() + 128);
        for (String paragraph : escaped.split("\\n{2,}")) {
            String line = paragraph.strip();
            if (line.isEmpty()) {
                continue;
            }
            html.append("<p style=\"").append(PARAGRAPH_STYLE).append("\">")
                    .append(line.replace("\n", "<br>"))
                    .append("</p>");
        }
        return html.toString();
    }

    private String headerHtml(Long companyId, String companyName, String publicLogoUrl) {
        String explicitLogoUrl = publicLogoUrl == null ? "" : publicLogoUrl.trim();
        String companyLogoUrl = setting(companyId, SettingKey.COMPANY_LOGO_URL).orElse("");
        String logoSrc = "";
        if (isSafeHref(explicitLogoUrl)) {
            logoSrc = explicitLogoUrl;
        } else if (isSafeHref(companyLogoUrl)) {
            logoSrc = companyLogoUrl;
        } else {
            String base64 = setting(companyId, SettingKey.COMPANY_LOGO_BASE64).orElse("");
            if (!base64.isBlank()) {
                logoSrc = base64.startsWith("data:") ? base64 : "data:image/png;base64," + base64;
            }
        }
        if (!logoSrc.isBlank()) {
            return "<img src=\"" + escapeAttribute(logoSrc) + "\" alt=\"" + escapeAttribute(companyName)
                    + "\" class=\"email-logo\" style=\"display:block;max-width:220px;max-height:56px;height:auto;border:0\">";
        }
        if (!companyName.isBlank()) {
            return "<div style=\"font-size:22px;line-height:1.3;font-weight:800;letter-spacing:-.4px;color:#0f172a\">"
                    + escapeHtml(companyName) + "</div>";
        }
        return "";
    }

    private static String footerHtml(String companyName) {
        String text = companyName.isBlank()
                ? "To sporočilo je bilo poslano prek platforme Calendra."
                : "To sporočilo vam je poslal/a " + escapeHtml(companyName) + " prek platforme Calendra.";
        return "<p style=\"margin:0;color:#9aa6b8;font-size:12px;line-height:1.6\">" + text + "</p>";
    }

    private static String wrap(String content, String headerHtml, String footerHtml) {
        return "<!doctype html><html><head><meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1.0\">"
                + "<meta name=\"color-scheme\" content=\"light\"><meta name=\"supported-color-schemes\" content=\"light\">"
                + "<style>@media only screen and (max-width:640px){.email-shell{padding:14px 8px!important}"
                + ".email-card{border-radius:18px!important}.email-content{padding:24px 20px 22px!important}"
                + ".email-header{padding:26px 20px 0!important}.email-logo{max-width:170px!important}}</style>"
                + "</head><body style=\"margin:0;padding:0;background:#f4f7fb;font-family:Arial,'Helvetica Neue',sans-serif;color:#0f172a;-webkit-font-smoothing:antialiased\">"
                + "<table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" border=\"0\" style=\"width:100%;background:#f4f7fb;border-collapse:collapse\">"
                + "<tr><td align=\"center\" class=\"email-shell\" style=\"padding:34px 16px\">"
                + "<table role=\"presentation\" width=\"640\" cellspacing=\"0\" cellpadding=\"0\" border=\"0\" class=\"email-card\" "
                + "style=\"width:100%;max-width:640px;background:#fff;border:1px solid #e3eaf4;border-radius:24px;border-collapse:separate;box-shadow:0 18px 44px rgba(15,23,42,.08);overflow:hidden;text-align:left\">"
                + (headerHtml.isBlank()
                        ? ""
                        : "<tr><td class=\"email-header\" style=\"padding:30px 34px 0\">" + headerHtml + "</td></tr>")
                + "<tr><td class=\"email-content\" style=\"padding:24px 34px 26px\">"
                + content
                + "<div style=\"height:1px;background:#e8eef6;margin:26px 0 16px\"></div>"
                + footerHtml
                + "</td></tr></table></td></tr></table></body></html>";
    }

    private Optional<String> setting(Long companyId, SettingKey key) {
        if (settings == null || companyId == null) {
            return Optional.empty();
        }
        return settings.findByCompanyIdAndKey(companyId, key)
                .map(AppSetting::getValue)
                .map(String::trim)
                .filter(value -> !value.isBlank());
    }

    private static boolean containsHtmlMarkup(String value) {
        return value != null && value.matches("(?s).*<[a-zA-Z][^>]*>.*");
    }

    private static String escapeHtml(String value) {
        if (value == null) return "";
        return value
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&#39;");
    }

    private static String escapeAttribute(String value) {
        if (value == null) return "";
        return value
                .replace("&", "&amp;")
                .replace("\"", "&quot;")
                .replace("<", "&lt;")
                .replace(">", "&gt;");
    }
}
