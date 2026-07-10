export type SettingsMap = Record<string, string>;

export type CompanyProfileForm = {
  id: string;
  name: string;
  address: string;
  postalCode: string;
  city: string;
  physicalAddressSameAsCompany: boolean;
  physicalAddress: string;
  physicalPostalCode: string;
  physicalCity: string;
  physicalCountry: string;
  vatId: string;
  email: string;
  telephone: string;
  iban: string;
  bic: string;
  bankQrPurposeCode: string;
  bankQrPurposeText: string;
  isDefault: boolean;
};

export const createCompanyProfileId = () =>
  `company-profile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const sanitizeCompanyProfile = (
  profile: Partial<CompanyProfileForm>,
  fallbackId?: string,
): CompanyProfileForm => ({
  id:
    typeof profile.id === "string" && profile.id
      ? profile.id
      : fallbackId || createCompanyProfileId(),
  name: typeof profile.name === "string" ? profile.name : "",
  address: typeof profile.address === "string" ? profile.address : "",
  postalCode: typeof profile.postalCode === "string" ? profile.postalCode : "",
  city: typeof profile.city === "string" ? profile.city : "",
  physicalAddressSameAsCompany:
    typeof profile.physicalAddressSameAsCompany === "boolean"
      ? profile.physicalAddressSameAsCompany
      : String((profile as any).physicalAddressSameAsCompany || "").toLowerCase() === "true",
  physicalAddress:
    typeof profile.physicalAddress === "string" ? profile.physicalAddress : "",
  physicalPostalCode:
    typeof profile.physicalPostalCode === "string"
      ? profile.physicalPostalCode
      : "",
  physicalCity:
    typeof profile.physicalCity === "string" ? profile.physicalCity : "",
  physicalCountry:
    typeof profile.physicalCountry === "string"
      ? profile.physicalCountry
      : "",
  vatId: typeof profile.vatId === "string" ? profile.vatId : "",
  email: typeof profile.email === "string" ? profile.email : "",
  telephone: typeof profile.telephone === "string" ? profile.telephone : "",
  iban: typeof profile.iban === "string" ? profile.iban : "",
  bic: typeof profile.bic === "string" ? profile.bic : "",
  bankQrPurposeCode:
    typeof profile.bankQrPurposeCode === "string"
      ? profile.bankQrPurposeCode
      : "OTHR",
  bankQrPurposeText:
    typeof profile.bankQrPurposeText === "string"
      ? profile.bankQrPurposeText
      : "PLACILO FOLIA",
  isDefault: Boolean(profile.isDefault),
});

export const companyProfileFromSettings = (
  settings: SettingsMap,
): CompanyProfileForm =>
  sanitizeCompanyProfile({
    id: "default-company-profile",
    name: settings.COMPANY_NAME || "",
    address: settings.COMPANY_ADDRESS || "",
    postalCode: settings.COMPANY_POSTAL_CODE || "",
    city: settings.COMPANY_CITY || "",
    physicalAddressSameAsCompany:
      settings.COMPANY_PHYSICAL_ADDRESS_SAME_AS_COMPANY === "true",
    physicalAddress: settings.COMPANY_PHYSICAL_ADDRESS || "",
    physicalPostalCode: settings.COMPANY_PHYSICAL_POSTAL_CODE || "",
    physicalCity: settings.COMPANY_PHYSICAL_CITY || "",
    physicalCountry: settings.COMPANY_PHYSICAL_COUNTRY || "",
    vatId: settings.COMPANY_VAT_ID || "",
    email: settings.COMPANY_EMAIL || "",
    telephone: settings.COMPANY_TELEPHONE || "",
    iban: settings.COMPANY_IBAN || "",
    bic: settings.COMPANY_BIC || "",
    bankQrPurposeCode: settings.BANK_QR_PURPOSE_CODE || "OTHR",
    bankQrPurposeText: settings.BANK_QR_PURPOSE_TEXT || "PLACILO FOLIA",
    isDefault: true,
  });

export const companyProfileToSettings = (
  settings: SettingsMap,
  profile: CompanyProfileForm,
  profiles: CompanyProfileForm[],
): SettingsMap => {
  const mainProfile = profiles.find((entry) => entry.isDefault) || profile;
  return {
    ...settings,
    COMPANY_NAME: mainProfile.name,
    COMPANY_ADDRESS: mainProfile.address,
    COMPANY_POSTAL_CODE: mainProfile.postalCode,
    COMPANY_CITY: mainProfile.city,
    COMPANY_PHYSICAL_ADDRESS_SAME_AS_COMPANY: mainProfile.physicalAddressSameAsCompany
      ? "true"
      : "false",
    COMPANY_PHYSICAL_ADDRESS: mainProfile.physicalAddressSameAsCompany
      ? mainProfile.address
      : mainProfile.physicalAddress,
    COMPANY_PHYSICAL_POSTAL_CODE: mainProfile.physicalAddressSameAsCompany
      ? mainProfile.postalCode
      : mainProfile.physicalPostalCode,
    COMPANY_PHYSICAL_CITY: mainProfile.physicalAddressSameAsCompany
      ? mainProfile.city
      : mainProfile.physicalCity,
    COMPANY_PHYSICAL_COUNTRY: mainProfile.physicalCountry,
    COMPANY_VAT_ID: mainProfile.vatId,
    COMPANY_EMAIL: mainProfile.email,
    COMPANY_TELEPHONE: mainProfile.telephone,
    COMPANY_IBAN: mainProfile.iban,
    COMPANY_BIC: mainProfile.bic,
    BANK_QR_PURPOSE_CODE: mainProfile.bankQrPurposeCode || "OTHR",
    BANK_QR_PURPOSE_TEXT: mainProfile.bankQrPurposeText || "PLACILO FOLIA",
    COMPANY_PROFILES: JSON.stringify(profiles),
    COMPANY_SELECTED_PROFILE_ID: profile.id,
  };
};

export const loadCompanyProfilesFromSettings = (
  settings: SettingsMap,
): CompanyProfileForm[] => {
  if (settings.COMPANY_PROFILES) {
    try {
      const parsed = JSON.parse(settings.COMPANY_PROFILES);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const profiles = parsed.map((profile, index) =>
          sanitizeCompanyProfile(
            profile,
            index === 0 ? "default-company-profile" : undefined,
          ),
        );
        return profiles.some((profile) => profile.isDefault)
          ? profiles
          : profiles.map((profile, index) => ({
              ...profile,
              isDefault: index === 0,
            }));
      }
    } catch {
      // Fall back to legacy single-profile settings below.
    }
  }
  return [companyProfileFromSettings(settings)];
};

