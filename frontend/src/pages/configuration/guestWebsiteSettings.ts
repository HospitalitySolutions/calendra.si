export type GuestPaymentMethodId =
  | "online_card"
  | "bank_transfer"
  | "paypal"
  | "gift_card";

export type GuestAppSettingsForm = {
  guestAppEnabled: boolean;
  walletEnabled: boolean;
  ordersEnabled: boolean;
  buyTabEnabled: boolean;
  entitlementsEnabled: boolean;
  inboxEnabled: boolean;
  publicDiscoverable: boolean;
  publicName: string;
  publicDescription: string;
  publicCity: string;
  tenantType: TenantConfigType;
  cardImageUrl: string;
  logoImageUrl: string;
  iconImageUrl: string;
  defaultLanguage: "sl" | "en";
  employeeSelectionStep: boolean;
  useEmployeeContact: boolean;
  acceptedPaymentMethodIds: GuestPaymentMethodId[];
  paymentDefaultMethodId: GuestPaymentMethodId;
  paymentCurrency: string;
  paymentTaxRate: string;
  paymentOnLocation: boolean;
  paymentSendInvoiceEmail: boolean;
  paymentCustomerDescription: string;
  paymentProvider: string;
  qrGuestUrl: string;
  qrSize: string;
  qrColor: string;
  qrIncludeLogo: boolean;
  qrCaption: string;
  qrExportFormat: "png" | "svg" | "pdf";
};

export type GuestBookingRulesForm = {
  cancelUntilHours: string;
  rescheduleUntilHours: string;
  lateCancelConsumesCredit: boolean;
  noShowConsumesCredit: boolean;
  sameDayBankTransferAllowed: boolean;
  bankTransferReservesSlot: boolean;
  requireOnlinePayment: boolean;
  allowBankTransferFor: string[];
  allowCardFor: string[];
  minBookingNotice: string;
  maxAdvanceDays: string;
  cancellationEnabled: boolean;
  freeCancelUntilHours: string;
  autoConfirmReservation: boolean;
  bufferBeforeMinutes: string;
  bufferAfterMinutes: string;
  paymentRequirement: "none" | "deposit" | "full";
  depositPercent: string;
  noShowPolicy: string;
  refundPolicy: string;
  policyText: string;
};

export type GuestAppSubtab = "general" | "bookingRules" | "paymentMethods" | "qrCode";

export type WebsiteWidgetSettingsForm = {
  acceptedPaymentMethodIds: GuestPaymentMethodId[];
  paymentDefaultMethodId: GuestPaymentMethodId;
  paymentOnLocation: boolean;
};

export type WebsiteBookingRulesForm = {
  paymentRequirement: GuestBookingRulesForm["paymentRequirement"];
  depositPercent: string;
};

export type GuestAppAssetField = "cardImageUrl" | "logoImageUrl" | "iconImageUrl";

export type StripeConnectMode = "sandbox" | "production";
export type StripeConnectAccountStatus = {
  mode: StripeConnectMode | string;
  accountId: string;
  connected: boolean;
  onboardingStatus: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  requirementsJson: string;
};
export type StripeConnectTenantStatus = {
  activeMode: StripeConnectMode | string;
  country: string;
  businessType: string;
  sandbox: StripeConnectAccountStatus;
  production: StripeConnectAccountStatus;
  sandboxPlatformEnabled: boolean;
  productionPlatformEnabled: boolean;
};

export const GUEST_APP_SETTINGS_KEY = "GUEST_APP_SETTINGS_JSON";
export const GUEST_BOOKING_RULES_KEY = "GUEST_BOOKING_RULES_JSON";
export const WEBSITE_WIDGET_SETTINGS_KEY = "WEBSITE_WIDGET_SETTINGS_JSON";
export const WEBSITE_BOOKING_RULES_KEY = "WEBSITE_BOOKING_RULES_JSON";

export const GUEST_PAYMENT_METHOD_OPTIONS: {
  id: GuestPaymentMethodId;
  label: string;
}[] = [
  { id: "online_card", label: "Spletno plačilo s kartico" },
  { id: "bank_transfer", label: "Bančno nakazilo" },
  { id: "paypal", label: "PayPal" },
  { id: "gift_card", label: "Darilni bon" },
];

export const DEFAULT_GUEST_PAYMENT_METHOD_IDS: GuestPaymentMethodId[] = [
  "online_card",
  "bank_transfer",
  "paypal",
  "gift_card",
];

export type TenantConfigType =
  | "salon"
  | "gym"
  | "therapy"
  | "spa"
  | "personal_training";

export const TENANT_CONFIG_TYPE_OPTIONS: Array<{
  id: TenantConfigType;
  labelEn: string;
  labelSl: string;
}> = [
  { id: "salon", labelEn: "Salon", labelSl: "Salon" },
  { id: "gym", labelEn: "Gym", labelSl: "Fitnes" },
  { id: "therapy", labelEn: "Therapy", labelSl: "Terapija" },
  { id: "spa", labelEn: "Spa", labelSl: "Spa" },
  {
    id: "personal_training",
    labelEn: "Personal Training",
    labelSl: "Osebni trening",
  },
];

export const normalizeTenantConfigType = (raw: any): TenantConfigType => {
  const value = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  return TENANT_CONFIG_TYPE_OPTIONS.some((option) => option.id === value)
    ? (value as TenantConfigType)
    : "salon";
};

export const isGuestPaymentMethodId = (value: string): value is GuestPaymentMethodId =>
  GUEST_PAYMENT_METHOD_OPTIONS.some((option) => option.id === value);
export const normalizeGuestPaymentMethods = (value: any): GuestPaymentMethodId[] => {
  if (!Array.isArray(value)) return DEFAULT_GUEST_PAYMENT_METHOD_IDS;
  const normalized = value
    .map((row) => String(row || ""))
    .filter(isGuestPaymentMethodId);
  return normalized.length > 0 ? normalized : DEFAULT_GUEST_PAYMENT_METHOD_IDS;
};

export const normalizeWebsitePaymentMethods = (value: any): GuestPaymentMethodId[] => {
  if (!Array.isArray(value)) return DEFAULT_GUEST_PAYMENT_METHOD_IDS;
  return value.map((row) => String(row || "")).filter(isGuestPaymentMethodId);
};

export const removeStripePaymentMethod = (
  ids: GuestPaymentMethodId[],
  fallback: GuestPaymentMethodId = "bank_transfer",
): GuestPaymentMethodId[] => {
  const filtered = ids.filter((id) => id !== "online_card");
  return filtered.length > 0 ? filtered : [fallback];
};

export const removeGiftCardPaymentMethod = (
  ids: GuestPaymentMethodId[],
  fallback: GuestPaymentMethodId = "bank_transfer",
): GuestPaymentMethodId[] => {
  const filtered = ids.filter((id) => id !== "gift_card");
  return filtered.length > 0 ? filtered : [fallback];
};

export const removeGiftCardProductType = (ids: string[]): string[] =>
  ids.filter((id) => String(id || "").trim().toUpperCase() !== "GIFT_CARD");

export function guestAppSubtabs(
  t: (key: string) => string,
): { id: GuestAppSubtab; label: string }[] {
  return [
    { id: "general", label: t("configGuestSubtabGeneral") },
    { id: "bookingRules", label: t("configGuestSubtabBookingRules") },
    { id: "paymentMethods", label: t("configGuestSubtabPaymentMethods") },
    { id: "qrCode", label: t("configGuestSubtabQrCode") },
  ];
}

export const GUEST_PRODUCT_TYPES = [
  "SESSION_SINGLE",
  "CLASS_TICKET",
  "PACK",
  "MEMBERSHIP",
  "GIFT_CARD",
  "COURSE",
] as const;
export const ALL_GUEST_PRODUCT_TYPES: string[] = [...GUEST_PRODUCT_TYPES];


const GUEST_PUBLIC_NAME_MAX_LENGTH = 15;
const GUEST_PUBLIC_CITY_MAX_LENGTH = 14;
const GUEST_PUBLIC_DESCRIPTION_MAX_LENGTH = 22;

const normalizePublicName = (value: string | undefined) =>
  String(value || "").slice(0, GUEST_PUBLIC_NAME_MAX_LENGTH);

const normalizePublicCity = (value: string | undefined) =>
  String(value || "").slice(0, GUEST_PUBLIC_CITY_MAX_LENGTH);

const normalizePublicDescription = (value: string | undefined) =>
  String(value || "")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, GUEST_PUBLIC_DESCRIPTION_MAX_LENGTH);

const normalizeGuestQrColor = (value: string | undefined) => {
  const v = String(value || "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v.toUpperCase() : "#2563EB";
};

export const defaultGuestAppSettings = (): GuestAppSettingsForm => ({
  guestAppEnabled: true,
  walletEnabled: true,
  ordersEnabled: true,
  buyTabEnabled: true,
  entitlementsEnabled: false,
  inboxEnabled: true,
  publicDiscoverable: false,
  publicName: "",
  publicDescription: "",
  publicCity: "",
  tenantType: "salon",
  cardImageUrl: "",
  logoImageUrl: "",
  iconImageUrl: "",
  defaultLanguage: "sl",
  employeeSelectionStep: false,
  useEmployeeContact: false,
  acceptedPaymentMethodIds: DEFAULT_GUEST_PAYMENT_METHOD_IDS,
  paymentDefaultMethodId: "online_card",
  paymentCurrency: "EUR",
  paymentTaxRate: "22",
  paymentOnLocation: true,
  paymentSendInvoiceEmail: true,
  paymentCustomerDescription:
    "Sprejemamo gotovino, kartice in spletna plačila. Hvala, ker ste izbrali naše storitve!",
  paymentProvider: "stripe",
  qrGuestUrl: "",
  qrSize: "1024 x 1024",
  qrColor: "#2563EB",
  qrIncludeLogo: true,
  qrCaption: "Rezerviraj svoj termin",
  qrExportFormat: "png",
});

export const defaultGuestBookingRules = (): GuestBookingRulesForm => ({
  cancelUntilHours: "24",
  rescheduleUntilHours: "12",
  lateCancelConsumesCredit: true,
  noShowConsumesCredit: true,
  sameDayBankTransferAllowed: false,
  bankTransferReservesSlot: false,
  requireOnlinePayment: true,
  allowBankTransferFor: ["PACK", "MEMBERSHIP", "GIFT_CARD"],
  allowCardFor: [
    "SESSION_SINGLE",
    "CLASS_TICKET",
    "PACK",
    "MEMBERSHIP",
    "GIFT_CARD",
  ],
  minBookingNotice: "2 uri",
  maxAdvanceDays: "60",
  cancellationEnabled: true,
  freeCancelUntilHours: "24",
  autoConfirmReservation: true,
  bufferBeforeMinutes: "15",
  bufferAfterMinutes: "10",
  paymentRequirement: "full",
  depositPercent: "20",
  noShowPolicy: "charge_deposit",
  refundPolicy: "auto_by_cancellation_deadline",
  policyText:
    "Rezervacijo lahko brezplačno odpoveste do navedenega roka pred terminom.\n\nPri kasnejši odpovedi ali no-show se zaračuna polog.\n\nPolog ni prenosljiv in se ne vrača.",
});

export const defaultWebsiteWidgetSettings = (): WebsiteWidgetSettingsForm => ({
  acceptedPaymentMethodIds: DEFAULT_GUEST_PAYMENT_METHOD_IDS,
  paymentDefaultMethodId: "online_card",
  paymentOnLocation: true,
});

export const defaultWebsiteBookingRules = (): WebsiteBookingRulesForm => ({
  paymentRequirement: "full",
  depositPercent: "20",
});

export const QR_QUIET_ZONE = 4;
export const QR_DATA_CODEWORDS_L: Record<number, number> = {
  1: 19,
  2: 34,
  3: 55,
  4: 80,
};
export const QR_EC_CODEWORDS_L: Record<number, number> = { 1: 7, 2: 10, 3: 15, 4: 20 };

export type QrMatrix = { size: number; modules: boolean[][] };

export const buildQrGfTables = () => {
  const exp = new Array<number>(512).fill(0);
  const log = new Array<number>(256).fill(0);
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    exp[i] = x;
    log[x] = i;
    x <<= 1;
    if ((x & 0x100) !== 0) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i += 1) exp[i] = exp[i - 255];
  return { exp, log };
};

export const QR_GF = buildQrGfTables();

export const qrGfMultiply = (a: number, b: number) => {
  if (a === 0 || b === 0) return 0;
  return QR_GF.exp[QR_GF.log[a] + QR_GF.log[b]];
};

export const qrReedSolomonGenerator = (degree: number) => {
  let result = [1];
  for (let i = 0; i < degree; i += 1) {
    const next = new Array<number>(result.length + 1).fill(0);
    for (let j = 0; j < result.length; j += 1) {
      next[j] ^= qrGfMultiply(result[j], 1);
      next[j + 1] ^= qrGfMultiply(result[j], QR_GF.exp[i]);
    }
    result = next;
  }
  return result;
};

export const qrReedSolomonRemainder = (data: number[], degree: number) => {
  const generator = qrReedSolomonGenerator(degree);
  const result = new Array<number>(degree).fill(0);
  data.forEach((dataByte) => {
    const factor = dataByte ^ result.shift()!;
    result.push(0);
    for (let i = 0; i < degree; i += 1) {
      result[i] ^= qrGfMultiply(generator[i + 1], factor);
    }
  });
  return result;
};

export const appendQrBits = (out: number[], value: number, length: number) => {
  for (let i = length - 1; i >= 0; i -= 1) out.push((value >>> i) & 1);
};

export const qrPayloadBytes = (payload: string) =>
  Array.from(new TextEncoder().encode(payload));

export const selectQrVersion = (bytesLength: number) => {
  for (let version = 1; version <= 4; version += 1) {
    const dataCodewords = QR_DATA_CODEWORDS_L[version];
    if (bytesLength <= Math.floor((dataCodewords * 8 - 12) / 8)) return version;
  }
  return null;
};

export const makeQrDataCodewords = (payload: string, version: number) => {
  const bytes = qrPayloadBytes(payload);
  const dataCodewordCount = QR_DATA_CODEWORDS_L[version];
  const capacityBits = dataCodewordCount * 8;
  const bits: number[] = [];
  appendQrBits(bits, 0b0100, 4); // byte mode
  appendQrBits(bits, bytes.length, 8);
  bytes.forEach((byte) => appendQrBits(bits, byte, 8));
  if (bits.length > capacityBits)
    throw new Error("QR payload is too long for this QR version.");
  const terminator = Math.min(4, capacityBits - bits.length);
  appendQrBits(bits, 0, terminator);
  while (bits.length % 8 !== 0) bits.push(0);
  const codewords: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let value = 0;
    for (let j = 0; j < 8; j += 1) value = (value << 1) | bits[i + j];
    codewords.push(value);
  }
  const padBytes = [0xec, 0x11];
  let padIndex = 0;
  while (codewords.length < dataCodewordCount) {
    codewords.push(padBytes[padIndex % 2]);
    padIndex += 1;
  }
  return codewords;
};

export const qrAlignmentPatternCenters: Record<number, number[]> = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
};

export const qrMaskAt = (mask: number, x: number, y: number) => {
  switch (mask) {
    case 0:
      return (x + y) % 2 === 0;
    case 1:
      return y % 2 === 0;
    case 2:
      return x % 3 === 0;
    case 3:
      return (x + y) % 3 === 0;
    case 4:
      return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
    case 5:
      return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6:
      return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    case 7:
      return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
    default:
      return false;
  }
};

export const qrFormatBits = (mask: number) => {
  const eclBits = 1; // Error correction L
  const data = (eclBits << 3) | mask;
  let rem = data << 10;
  for (let i = 14; i >= 10; i -= 1) {
    if (((rem >>> i) & 1) !== 0) rem ^= 0x537 << (i - 10);
  }
  return ((data << 10) | rem) ^ 0x5412;
};

export const makeQrMatrix = (payload: string): QrMatrix | null => {
  const trimmedPayload = payload.trim();
  if (!trimmedPayload) return null;
  const bytes = qrPayloadBytes(trimmedPayload);
  const version = selectQrVersion(bytes.length);
  if (!version) return null;
  const size = version * 4 + 17;
  const modules = Array.from({ length: size }, () =>
    new Array<boolean>(size).fill(false),
  );
  const reserved = Array.from({ length: size }, () =>
    new Array<boolean>(size).fill(false),
  );

  const setModule = (x: number, y: number, dark: boolean, reserve = true) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    modules[y][x] = dark;
    if (reserve) reserved[y][x] = true;
  };

  const reserveModule = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    reserved[y][x] = true;
  };

  const drawFinder = (left: number, top: number) => {
    for (let dy = -1; dy <= 7; dy += 1) {
      for (let dx = -1; dx <= 7; dx += 1) {
        const x = left + dx;
        const y = top + dy;
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        const inPattern = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6;
        const dark =
          inPattern &&
          (dx === 0 ||
            dx === 6 ||
            dy === 0 ||
            dy === 6 ||
            (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4));
        setModule(x, y, dark);
      }
    }
  };

  const drawAlignment = (centerX: number, centerY: number) => {
    for (let dy = -2; dy <= 2; dy += 1) {
      for (let dx = -2; dx <= 2; dx += 1) {
        const max = Math.max(Math.abs(dx), Math.abs(dy));
        setModule(centerX + dx, centerY + dy, max === 2 || max === 0);
      }
    }
  };

  drawFinder(0, 0);
  drawFinder(size - 7, 0);
  drawFinder(0, size - 7);

  for (let i = 8; i <= size - 9; i += 1) {
    const dark = i % 2 === 0;
    setModule(i, 6, dark);
    setModule(6, i, dark);
  }

  const centers = qrAlignmentPatternCenters[version];
  centers.forEach((centerY) => {
    centers.forEach((centerX) => {
      const overlapsFinder =
        (centerX === 6 && centerY === 6) ||
        (centerX === 6 && centerY === size - 7) ||
        (centerX === size - 7 && centerY === 6);
      if (!overlapsFinder) drawAlignment(centerX, centerY);
    });
  });

  for (let i = 0; i <= 8; i += 1) {
    reserveModule(8, i);
    reserveModule(i, 8);
  }
  for (let i = size - 8; i < size; i += 1) reserveModule(i, 8);
  for (let i = size - 7; i < size; i += 1) reserveModule(8, i);
  setModule(8, size - 8, true);

  const dataCodewords = makeQrDataCodewords(trimmedPayload, version);
  const ecc = qrReedSolomonRemainder(dataCodewords, QR_EC_CODEWORDS_L[version]);
  const bits: number[] = [];
  [...dataCodewords, ...ecc].forEach((codeword) =>
    appendQrBits(bits, codeword, 8),
  );

  let bitIndex = 0;
  let upward = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right -= 1;
    for (let vertical = 0; vertical < size; vertical += 1) {
      const y = upward ? size - 1 - vertical : vertical;
      for (let j = 0; j < 2; j += 1) {
        const x = right - j;
        if (reserved[y][x]) continue;
        modules[y][x] = (bits[bitIndex] || 0) === 1;
        bitIndex += 1;
      }
    }
    upward = !upward;
  }

  const mask = 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (!reserved[y][x] && qrMaskAt(mask, x, y))
        modules[y][x] = !modules[y][x];
    }
  }

  const format = qrFormatBits(mask);
  const formatBit = (i: number) => ((format >>> i) & 1) !== 0;
  for (let i = 0; i <= 5; i += 1) setModule(8, i, formatBit(i));
  setModule(8, 7, formatBit(6));
  setModule(8, 8, formatBit(7));
  setModule(7, 8, formatBit(8));
  for (let i = 9; i < 15; i += 1) setModule(14 - i, 8, formatBit(i));
  for (let i = 0; i < 8; i += 1) setModule(size - 1 - i, 8, formatBit(i));
  for (let i = 8; i < 15; i += 1) setModule(8, size - 15 + i, formatBit(i));
  setModule(8, size - 8, true);

  return { size, modules };
};

export const qrModulesToPath = (matrix: QrMatrix, quietZone = QR_QUIET_ZONE) =>
  matrix.modules
    .flatMap((row, y) =>
      row.map((dark, x) =>
        dark ? `M${x + quietZone} ${y + quietZone}h1v1h-1z` : "",
      ),
    )
    .filter(Boolean)
    .join("");

export const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export const sanitizeDownloadPart = (value: string) =>
  value
    .trim()
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "") || "tenant";

export const buildGuestQrPayloadLink = (
  configuredLink: string,
  fallbackLink: string,
  tenantCode: string,
) => {
  const safeTenantCode = (tenantCode || "2TEN").trim() || "2TEN";
  const normalizedConfigured = (configuredLink || "").trim();
  const candidate = normalizedConfigured || fallbackLink;
  const baseOrigin =
    typeof window !== "undefined" ? window.location.origin : "https://2ten.si";
  try {
    const url = new URL(candidate, baseOrigin);
    url.searchParams.set("tenantCode", safeTenantCode);
    return url.toString();
  } catch {
    return fallbackLink;
  }
};

export const parseGuestAppSettings = (
  raw: string | undefined,
): GuestAppSettingsForm => {
  if (!raw) return defaultGuestAppSettings();
  try {
    const parsed = JSON.parse(raw);
    return {
      guestAppEnabled: parsed?.guestAppEnabled !== false,
      walletEnabled: parsed?.walletEnabled !== false,
      ordersEnabled: parsed?.ordersEnabled !== false,
      buyTabEnabled: parsed?.buyTabEnabled !== false,
      entitlementsEnabled: parsed?.entitlementsEnabled === true,
      inboxEnabled: parsed?.inboxEnabled !== false,
      publicDiscoverable: parsed?.publicDiscoverable === true,
      publicName: normalizePublicName(parsed?.publicName),
      publicDescription: String(parsed?.publicDescription || ""),
      publicCity: normalizePublicCity(parsed?.publicCity),
      tenantType: normalizeTenantConfigType(parsed?.tenantType),
      cardImageUrl: String(parsed?.cardImageUrl || ""),
      logoImageUrl: String(parsed?.logoImageUrl || ""),
      iconImageUrl: String(parsed?.iconImageUrl || ""),
      defaultLanguage: parsed?.defaultLanguage === "en" ? "en" : "sl",
      employeeSelectionStep: parsed?.employeeSelectionStep === true,
      useEmployeeContact: parsed?.useEmployeeContact === true,
      acceptedPaymentMethodIds: normalizeGuestPaymentMethods(
        parsed?.acceptedPaymentMethodIds,
      ),
      paymentDefaultMethodId: isGuestPaymentMethodId(
        String(parsed?.paymentDefaultMethodId || ""),
      )
        ? parsed.paymentDefaultMethodId
        : "online_card",
      paymentCurrency: String(parsed?.paymentCurrency || "EUR"),
      paymentTaxRate: String(parsed?.paymentTaxRate ?? "22"),
      paymentOnLocation: parsed?.paymentOnLocation !== false,
      paymentSendInvoiceEmail: parsed?.paymentSendInvoiceEmail !== false,
      paymentCustomerDescription: String(
        parsed?.paymentCustomerDescription ||
          "Sprejemamo gotovino, kartice in spletna plačila. Hvala, ker ste izbrali naše storitve!",
      ),
      paymentProvider: String(parsed?.paymentProvider || "stripe"),
      qrGuestUrl: String(parsed?.qrGuestUrl || ""),
      qrSize: String(parsed?.qrSize || "1024 x 1024"),
      qrColor: normalizeGuestQrColor(parsed?.qrColor || "#2563EB"),
      qrIncludeLogo: parsed?.qrIncludeLogo !== false,
      qrCaption: String(parsed?.qrCaption || "Rezerviraj svoj termin"),
      qrExportFormat:
        parsed?.qrExportFormat === "svg" || parsed?.qrExportFormat === "pdf"
          ? parsed.qrExportFormat
          : "png",
    };
  } catch {
    return defaultGuestAppSettings();
  }
};

export const parseGuestBookingRules = (
  raw: string | undefined,
): GuestBookingRulesForm => {
  if (!raw) return defaultGuestBookingRules();
  try {
    const parsed = JSON.parse(raw);
    const normalizeAllowed = (value: any, fallback: string[]) =>
      Array.isArray(value)
        ? value.map((row) => String(row || "").trim()).filter(Boolean)
        : fallback;
    return {
      cancelUntilHours: String(parsed?.cancelUntilHours ?? 24),
      rescheduleUntilHours: String(parsed?.rescheduleUntilHours ?? 12),
      lateCancelConsumesCredit: parsed?.lateCancelConsumesCredit !== false,
      noShowConsumesCredit: parsed?.noShowConsumesCredit !== false,
      sameDayBankTransferAllowed: parsed?.sameDayBankTransferAllowed === true,
      bankTransferReservesSlot: parsed?.bankTransferReservesSlot === true,
      requireOnlinePayment: parsed?.requireOnlinePayment !== false,
      allowBankTransferFor: normalizeAllowed(parsed?.allowBankTransferFor, [
        "PACK",
        "MEMBERSHIP",
        "GIFT_CARD",
      ]),
      allowCardFor: normalizeAllowed(parsed?.allowCardFor, [
        "SESSION_SINGLE",
        "CLASS_TICKET",
        "PACK",
        "MEMBERSHIP",
        "GIFT_CARD",
      ]),
      minBookingNotice: String(parsed?.minBookingNotice || "2 uri"),
      maxAdvanceDays: String(parsed?.maxAdvanceDays ?? "60"),
      cancellationEnabled: parsed?.cancellationEnabled !== false,
      freeCancelUntilHours: String(
        parsed?.freeCancelUntilHours ?? parsed?.cancelUntilHours ?? 24,
      ),
      autoConfirmReservation: parsed?.autoConfirmReservation !== false,
      bufferBeforeMinutes: String(parsed?.bufferBeforeMinutes ?? 15),
      bufferAfterMinutes: String(parsed?.bufferAfterMinutes ?? 10),
      paymentRequirement:
        parsed?.paymentRequirement === "none" ||
        parsed?.paymentRequirement === "deposit"
          ? parsed.paymentRequirement
          : "full",
      depositPercent: String(parsed?.depositPercent ?? 20),
      noShowPolicy: String(parsed?.noShowPolicy || "charge_deposit"),
      refundPolicy: String(
        parsed?.refundPolicy || "auto_by_cancellation_deadline",
      ),
      policyText: String(
        parsed?.policyText ||
          "Rezervacijo lahko brezplačno odpoveste do navedenega roka pred terminom.\n\nPri kasnejši odpovedi ali no-show se zaračuna polog.\n\nPolog ni prenosljiv in se ne vrača.",
      ),
    };
  } catch {
    return defaultGuestBookingRules();
  }
};

export const normalizeBookingRulesForPaymentLocation = (
  rules: GuestBookingRulesForm,
  paymentOnLocation: boolean,
): GuestBookingRulesForm => {
  if (paymentOnLocation) {
    return {
      ...rules,
      paymentRequirement: "none",
      requireOnlinePayment: false,
    };
  }
  const nextRequirement =
    rules.paymentRequirement === "none" ? "full" : rules.paymentRequirement;
  return {
    ...rules,
    paymentRequirement: nextRequirement,
    requireOnlinePayment: true,
  };
};

export const parseWebsiteWidgetSettings = (
  raw: string | undefined,
): WebsiteWidgetSettingsForm => {
  if (!raw) return defaultWebsiteWidgetSettings();
  try {
    const parsed = JSON.parse(raw);
    return {
      acceptedPaymentMethodIds: normalizeWebsitePaymentMethods(
        parsed?.acceptedPaymentMethodIds,
      ),
      paymentDefaultMethodId: isGuestPaymentMethodId(
        String(parsed?.paymentDefaultMethodId || ""),
      )
        ? parsed.paymentDefaultMethodId
        : "online_card",
      paymentOnLocation: parsed?.paymentOnLocation !== false,
    };
  } catch {
    return defaultWebsiteWidgetSettings();
  }
};

export const parseWebsiteBookingRules = (
  raw: string | undefined,
): WebsiteBookingRulesForm => {
  if (!raw) return defaultWebsiteBookingRules();
  try {
    const parsed = JSON.parse(raw);
    return {
      paymentRequirement:
        parsed?.paymentRequirement === "none" ||
        parsed?.paymentRequirement === "deposit"
          ? parsed.paymentRequirement
          : "full",
      depositPercent: String(parsed?.depositPercent ?? 20),
    };
  } catch {
    return defaultWebsiteBookingRules();
  }
};

export const normalizeWebsiteSettingsForPaymentLocation = (
  settings: WebsiteWidgetSettingsForm,
): WebsiteWidgetSettingsForm => {
  if (settings.paymentOnLocation) {
    return { ...settings, acceptedPaymentMethodIds: [] };
  }

  const acceptedPaymentMethodIds = normalizeWebsitePaymentMethods(
    settings.acceptedPaymentMethodIds,
  );
  const fallbackMethodId = isGuestPaymentMethodId(
    String(settings.paymentDefaultMethodId || ""),
  )
    ? settings.paymentDefaultMethodId
    : "online_card";
  const nextAcceptedPaymentMethodIds =
    acceptedPaymentMethodIds.length > 0
      ? acceptedPaymentMethodIds
      : [fallbackMethodId];
  const paymentDefaultMethodId = nextAcceptedPaymentMethodIds.includes(
    settings.paymentDefaultMethodId,
  )
    ? settings.paymentDefaultMethodId
    : nextAcceptedPaymentMethodIds[0];

  return {
    ...settings,
    acceptedPaymentMethodIds: nextAcceptedPaymentMethodIds,
    paymentDefaultMethodId,
  };
};

export const normalizeWebsiteBookingRulesForPaymentLocation = (
  rules: WebsiteBookingRulesForm,
  paymentOnLocation: boolean,
): WebsiteBookingRulesForm => {
  if (paymentOnLocation) {
    return { ...rules, paymentRequirement: "none" };
  }

  const nextRequirement =
    rules.paymentRequirement === "none" ? "full" : rules.paymentRequirement;
  return { ...rules, paymentRequirement: nextRequirement };
};

export const serializeWebsiteWidgetSettings = (value: WebsiteWidgetSettingsForm) => {
  const normalized = normalizeWebsiteSettingsForPaymentLocation(value);
  return JSON.stringify({
    acceptedPaymentMethodIds: normalized.acceptedPaymentMethodIds,
    paymentDefaultMethodId: normalized.paymentDefaultMethodId,
    paymentOnLocation: normalized.paymentOnLocation,
  });
};

export const serializeWebsiteBookingRules = (
  value: WebsiteBookingRulesForm,
  options?: { giftCardsEnabled?: boolean },
) => {
  const walletProductTypes = [
    "SESSION_SINGLE",
    "CLASS_TICKET",
    "PACK",
    "MEMBERSHIP",
    ...(options?.giftCardsEnabled ? ["GIFT_CARD"] : []),
  ];
  return JSON.stringify({
    requireOnlinePayment: value.paymentRequirement !== "none",
    paymentRequirement: value.paymentRequirement,
    depositPercent: String(value.depositPercent || "20").trim() || "20",
    allowBankTransferFor: walletProductTypes,
    allowCardFor: walletProductTypes,
    allowPaypalFor: walletProductTypes,
  });
};

export const serializeGuestAppSettings = (value: GuestAppSettingsForm) =>
  JSON.stringify({
    guestAppEnabled: value.guestAppEnabled,
    walletEnabled: value.walletEnabled,
    ordersEnabled: value.ordersEnabled,
    buyTabEnabled: value.buyTabEnabled,
    entitlementsEnabled: value.entitlementsEnabled,
    inboxEnabled: value.inboxEnabled,
    publicDiscoverable: value.publicDiscoverable,
    publicName: normalizePublicName(value.publicName).trim(),
    publicDescription: normalizePublicDescription(value.publicDescription),
    publicCity: normalizePublicCity(value.publicCity).trim(),
    tenantType: normalizeTenantConfigType(value.tenantType),
    cardImageUrl: value.cardImageUrl.trim(),
    logoImageUrl: value.logoImageUrl.trim(),
    iconImageUrl: value.iconImageUrl.trim(),
    defaultLanguage: value.defaultLanguage,
    employeeSelectionStep: value.employeeSelectionStep,
    useEmployeeContact: value.useEmployeeContact,
    acceptedPaymentMethodIds: normalizeWebsitePaymentMethods(
      value.acceptedPaymentMethodIds,
    ),
    paymentDefaultMethodId: isGuestPaymentMethodId(
      String(value.paymentDefaultMethodId || ""),
    )
      ? value.paymentDefaultMethodId
      : "online_card",
    paymentCurrency: value.paymentCurrency.trim() || "EUR",
    paymentTaxRate: value.paymentTaxRate.trim(),
    paymentOnLocation: value.paymentOnLocation,
    paymentSendInvoiceEmail: value.paymentSendInvoiceEmail,
    paymentCustomerDescription: value.paymentCustomerDescription.trim(),
    paymentProvider: value.paymentProvider.trim() || "stripe",
    qrGuestUrl: value.qrGuestUrl.trim(),
    qrSize: value.qrSize.trim() || "1024 x 1024",
    qrColor: normalizeGuestQrColor(value.qrColor),
    qrIncludeLogo: value.qrIncludeLogo,
    qrCaption: value.qrCaption.trim(),
    qrExportFormat: value.qrExportFormat,
  });

export const serializeGuestBookingRules = (value: GuestBookingRulesForm) =>
  JSON.stringify({
    cancelUntilHours: Math.max(
      0,
      Number(value.freeCancelUntilHours || value.cancelUntilHours || 0),
    ),
    rescheduleUntilHours: Math.max(0, Number(value.rescheduleUntilHours || 0)),
    lateCancelConsumesCredit: value.lateCancelConsumesCredit,
    noShowConsumesCredit: value.noShowConsumesCredit,
    sameDayBankTransferAllowed: value.sameDayBankTransferAllowed,
    bankTransferReservesSlot: value.bankTransferReservesSlot,
    requireOnlinePayment: value.paymentRequirement !== "none",
    allowBankTransferFor: value.allowBankTransferFor,
    allowCardFor: value.allowCardFor,
    minBookingNotice: value.minBookingNotice.trim(),
    maxAdvanceDays: value.maxAdvanceDays.trim(),
    cancellationEnabled: value.cancellationEnabled,
    freeCancelUntilHours: value.freeCancelUntilHours.trim(),
    autoConfirmReservation: value.autoConfirmReservation,
    bufferBeforeMinutes: value.bufferBeforeMinutes.trim(),
    bufferAfterMinutes: value.bufferAfterMinutes.trim(),
    paymentRequirement: value.paymentRequirement,
    depositPercent: value.depositPercent.trim(),
    noShowPolicy: value.noShowPolicy,
    refundPolicy: value.refundPolicy,
    policyText: value.policyText.trim(),
  });

