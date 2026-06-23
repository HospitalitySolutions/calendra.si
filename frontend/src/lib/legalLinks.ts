export type CalendraLegalLinks = {
  privacy: string;
  terms: string;
  dpa: string;
  subprocessors: string;
  cookiePolicy: string;
  security: string;
  dataRights: string;
  accountDeletion: string;
  aiTransparency: string;
};

export const CALENDRA_WEBSITE_ORIGIN = "https://calendra.si";

export function getCalendraLegalLinks(locale?: string | null): CalendraLegalLinks {
  const isSl = String(locale || "").toLowerCase().startsWith("sl");
  return {
    privacy: `${CALENDRA_WEBSITE_ORIGIN}${isSl ? "/zasebnost" : "/en/privacy-policy"}`,
    terms: `${CALENDRA_WEBSITE_ORIGIN}${isSl ? "/pogoji-uporabe" : "/en/terms-of-service"}`,
    dpa: `${CALENDRA_WEBSITE_ORIGIN}${isSl ? "/pogodba-o-obdelavi-podatkov" : "/en/data-processing-agreement"}`,
    subprocessors: `${CALENDRA_WEBSITE_ORIGIN}${isSl ? "/podobdelovalci" : "/en/subprocessors"}`,
    cookiePolicy: `${CALENDRA_WEBSITE_ORIGIN}${isSl ? "/piskotki" : "/en/cookie-policy"}`,
    security: `${CALENDRA_WEBSITE_ORIGIN}${isSl ? "/varnost" : "/en/security"}`,
    dataRights: `${CALENDRA_WEBSITE_ORIGIN}${isSl ? "/pravice-posameznikov" : "/en/data-rights"}`,
    accountDeletion: `${CALENDRA_WEBSITE_ORIGIN}${isSl ? "/izbris-racuna" : "/en/account-deletion"}`,
    aiTransparency: `${CALENDRA_WEBSITE_ORIGIN}${isSl ? "/ai-transparentnost" : "/en/ai-transparency"}`,
  };
}
