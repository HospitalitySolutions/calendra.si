export type RegisterFeatureKeyOption = {
  key: string;
  label: string;
  iconKind: string;
};

/**
 * Canonical display keys for register-plan feature rows.
 *
 * Each key intentionally maps to a distinct RegisterOptionIcon visual so the
 * Platform Admin can choose the icon by selecting the key, while the stored
 * catalog format remains backwards compatible (the API still receives `key`).
 */
export const REGISTER_FEATURE_KEY_OPTIONS: readonly RegisterFeatureKeyOption[] = [
  { key: "appointments", label: "Appointments", iconKind: "appointments" },
  { key: "staff", label: "Team members", iconKind: "staff" },
  { key: "group", label: "Group bookings", iconKind: "group" },
  { key: "resources", label: "Resource scheduling", iconKind: "resources" },
  { key: "payments", label: "Online payments", iconKind: "payments" },
  { key: "reminders", label: "Reminders", iconKind: "reminders" },
  { key: "ai", label: "AI assistant", iconKind: "ai" },
  { key: "integrations", label: "Integrations", iconKind: "integrations" },
  { key: "reporting", label: "Advanced reporting", iconKind: "reporting" },
  { key: "multilocation", label: "Multi-location", iconKind: "multilocation" },
  { key: "billing", label: "Billing & invoices", iconKind: "billing" },
  { key: "consumables", label: "Consumables", iconKind: "consumables" },
  { key: "no-show", label: "No-shows", iconKind: "no-show" },
  { key: "benefits", label: "Benefits & gift cards", iconKind: "benefits" },
  { key: "inbox", label: "Inbox", iconKind: "inbox" },
  {
    key: "custom-communication",
    label: "Custom communication",
    iconKind: "custom-communication",
  },
  { key: "custom-fields", label: "Custom fields", iconKind: "custom-fields" },
  { key: "other", label: "Other", iconKind: "other" },
];

export function normalizeRegisterFeatureKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function getRegisterFeatureKeyOption(
  rawKey: string,
): RegisterFeatureKeyOption | undefined {
  const key = normalizeRegisterFeatureKey(rawKey);
  return REGISTER_FEATURE_KEY_OPTIONS.find((option) => option.key === key);
}

export function getRegisterFeatureIconKind(rawKey: string): string {
  const normalized = normalizeRegisterFeatureKey(rawKey);
  return getRegisterFeatureKeyOption(normalized)?.iconKind || normalized;
}
