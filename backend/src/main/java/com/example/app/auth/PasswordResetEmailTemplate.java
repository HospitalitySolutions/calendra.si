package com.example.app.auth;

import java.util.Objects;

/**
 * Shared Calendra password-reset email renderer used by both the business app and Calendra Connect.
 * The visual language intentionally mirrors the platform invoice email: light canvas, rounded white
 * card, Calendra blue accents, a compact badge, a large heading, a bordered details panel and a
 * restrained security footer.
 */
public final class PasswordResetEmailTemplate {
    private PasswordResetEmailTemplate() {}

    public enum ActionType {
        BUTTON,
        CODE
    }

    public record Model(
            String language,
            String preheader,
            String badge,
            String title,
            String greeting,
            String intro,
            String instruction,
            ActionType actionType,
            String actionLabel,
            String actionValue,
            String expiryText,
            String ignoreText,
            String detailsTitle,
            String requestTimeLabel,
            String requestTimeValue,
            String methodLabel,
            String methodValue,
            String validityLabel,
            String validityValue,
            String userLabel,
            String userValue,
            String footerText
    ) {
        public Model {
            language = blankToDefault(language, "sl");
            preheader = blankToDefault(preheader, title);
            badge = blankToDefault(badge, "Security");
            title = blankToDefault(title, "Reset your password");
            greeting = blankToDefault(greeting, "Hello,");
            intro = blankToDefault(intro, "We received a password reset request.");
            instruction = blankToDefault(instruction, "Use the option below to continue.");
            actionType = Objects.requireNonNullElse(actionType, ActionType.BUTTON);
            actionLabel = blankToDefault(actionLabel, "Reset password");
            actionValue = blankToDefault(actionValue, "#");
            expiryText = blankToDefault(expiryText, "This reset request is time-limited.");
            ignoreText = blankToDefault(ignoreText, "If you did not request this, you can ignore this email.");
            detailsTitle = blankToDefault(detailsTitle, "Request details");
            requestTimeLabel = blankToDefault(requestTimeLabel, "Request time");
            requestTimeValue = blankToDefault(requestTimeValue, "-");
            methodLabel = blankToDefault(methodLabel, "Method");
            methodValue = blankToDefault(methodValue, "-");
            validityLabel = blankToDefault(validityLabel, "Validity");
            validityValue = blankToDefault(validityValue, "-");
            userLabel = blankToDefault(userLabel, "User");
            userValue = blankToDefault(userValue, "-");
            footerText = blankToDefault(footerText, "Calendra — secure account management.");
        }
    }

    public static String renderHtml(Model model) {
        String action = model.actionType() == ActionType.CODE
                ? renderCodeAction(model)
                : renderButtonAction(model);

        return """
                <!doctype html>
                <html lang="%s">
                <head>
                  <meta charset="UTF-8">
                  <meta name="viewport" content="width=device-width, initial-scale=1.0">
                  <meta name="color-scheme" content="light">
                  <meta name="supported-color-schemes" content="light">
                  <style>
                    @media only screen and (max-width: 680px) {
                      .email-shell { width: 100%% !important; border-radius: 20px !important; }
                      .email-pad { padding: 28px 22px 24px !important; }
                      .email-title { font-size: 30px !important; line-height: 1.15 !important; }
                      .details-label { width: auto !important; }
                      .details-value { max-width: 220px !important; }
                    }
                  </style>
                </head>
                <body style="margin:0;padding:0;background:#f4f7fb;font-family:Arial,Helvetica,sans-serif;color:#17233a;-webkit-font-smoothing:antialiased;">
                  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">%s</div>
                  <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" border="0" style="width:100%%;background:#f4f7fb;border-collapse:collapse;">
                    <tr>
                      <td align="center" style="padding:32px 12px;">
                        <table role="presentation" class="email-shell" width="680" cellspacing="0" cellpadding="0" border="0" style="width:680px;max-width:680px;background:#ffffff;border:1px solid #dce5f1;border-radius:28px;border-collapse:separate;box-shadow:0 18px 50px rgba(34,73,126,0.10);overflow:hidden;">
                          <tr>
                            <td class="email-pad" style="padding:38px 40px 30px 40px;">
                              <img src="cid:calendraLogo" width="225" alt="Calendra" style="display:block;width:225px;max-width:70%%;height:auto;border:0;margin:0 0 22px 0;outline:none;text-decoration:none;">
                              <span style="display:inline-block;padding:8px 15px;border-radius:999px;background:#edf4ff;color:#1768e5;font-size:14px;font-weight:700;line-height:1;">%s</span>
                              <h1 class="email-title" style="margin:20px 0 16px 0;font-size:38px;line-height:1.15;letter-spacing:-1.1px;color:#111a2c;font-weight:800;">%s <img src="cid:passwordResetLockIcon" width="25" height="25" alt="" style="display:inline-block;width:25px;height:25px;margin-left:7px;vertical-align:-2px;border:0;"></h1>
                              <p style="margin:0 0 12px 0;font-size:17px;line-height:1.65;color:#536581;">%s</p>
                              <p style="margin:0 0 12px 0;font-size:17px;line-height:1.65;color:#536581;">%s</p>
                              <p style="margin:0 0 24px 0;font-size:17px;line-height:1.65;color:#536581;">%s</p>

                              %s

                              <p style="margin:18px 0 7px 0;font-size:14px;line-height:1.55;color:#6f7f97;">%s</p>
                              <p style="margin:0 0 26px 0;font-size:14px;line-height:1.55;color:#6f7f97;">%s</p>

                              <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" border="0" style="width:100%%;border:1px solid #dce5f1;border-radius:17px;border-collapse:separate;overflow:hidden;">
                                <tr><td colspan="3" style="padding:22px 22px 13px 22px;font-size:21px;font-weight:800;color:#111a2c;">%s</td></tr>
                                %s
                                %s
                                %s
                                %s
                              </table>

                              <div style="height:1px;background:#e2e8f1;margin:26px 0 18px 0;"></div>
                              <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" border="0" style="width:100%%;border-collapse:collapse;">
                                <tr>
                                  <td width="26" valign="middle" style="width:26px;padding:0 9px 0 0;"><img src="cid:passwordResetShieldIcon" width="20" height="20" alt="" style="display:block;width:20px;height:20px;border:0;"></td>
                                  <td valign="middle" style="font-size:13px;line-height:1.65;color:#8a99af;">%s</td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                </body>
                </html>
                """.formatted(
                escapeHtmlAttribute(model.language()),
                escapeHtml(model.preheader()),
                escapeHtml(model.badge()),
                escapeHtml(model.title()),
                escapeHtml(model.greeting()),
                escapeHtml(model.intro()),
                escapeHtml(model.instruction()),
                action,
                escapeHtml(model.expiryText()),
                escapeHtml(model.ignoreText()),
                escapeHtml(model.detailsTitle()),
                detailRow("passwordResetClockIcon", model.requestTimeLabel(), model.requestTimeValue(), false),
                detailRow("passwordResetDocumentIcon", model.methodLabel(), model.methodValue(), true),
                detailRow("passwordResetClockIcon", model.validityLabel(), model.validityValue(), true),
                detailRow("passwordResetDocumentIcon", model.userLabel(), model.userValue(), true),
                escapeHtml(model.footerText())
        );
    }

    private static String renderButtonAction(Model model) {
        return """
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:separate;margin:0;">
                  <tr>
                    <td bgcolor="#1768e5" style="border-radius:12px;box-shadow:0 8px 20px rgba(23,104,229,0.20);">
                      <a href="%s" style="display:inline-block;padding:15px 22px;border-radius:12px;background:#1768e5;color:#ffffff;text-decoration:none;font-size:16px;font-weight:800;line-height:20px;">%s</a>
                    </td>
                  </tr>
                </table>
                """.formatted(
                escapeHtmlAttribute(model.actionValue()),
                escapeHtml(model.actionLabel())
        );
    }

    private static String renderCodeAction(Model model) {
        return """
                <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" border="0" style="width:100%%;border-collapse:separate;">
                  <tr>
                    <td align="center" style="padding:18px 22px;border-radius:14px;background:#edf4ff;border:1px solid #cfe0fb;">
                      <div style="font-size:13px;line-height:18px;color:#1768e5;font-weight:800;text-transform:uppercase;letter-spacing:.4px;margin:0 0 7px 0;">%s</div>
                      <div style="font-size:34px;line-height:42px;color:#111a2c;font-weight:800;letter-spacing:8px;font-variant-numeric:tabular-nums;">%s</div>
                    </td>
                  </tr>
                </table>
                """.formatted(
                escapeHtml(model.actionLabel()),
                escapeHtml(model.actionValue())
        );
    }

    private static String detailRow(String iconCid, String label, String value, boolean topBorder) {
        String border = topBorder ? "border-top:1px solid #e4ebf4;" : "";
        return """
                <tr>
                  <td width="42" valign="middle" style="width:42px;padding:14px 0 14px 18px;%s"><img src="cid:%s" width="18" height="18" alt="" style="display:block;width:18px;height:18px;border:0;"></td>
                  <td class="details-label" valign="middle" style="padding:14px 8px 14px 10px;font-size:14px;line-height:20px;color:#5b6c85;font-weight:700;%s">%s</td>
                  <td class="details-value" align="right" valign="middle" style="padding:14px 18px 14px 10px;text-align:right;font-size:14px;line-height:20px;color:#17233a;font-weight:700;word-break:break-word;%s">%s</td>
                </tr>
                """.formatted(
                border,
                escapeHtmlAttribute(iconCid),
                border,
                escapeHtml(label),
                border,
                escapeHtml(value)
        );
    }

    private static String blankToDefault(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value;
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

    private static String escapeHtmlAttribute(String value) {
        return escapeHtml(value).replace("`", "&#96;");
    }
}
