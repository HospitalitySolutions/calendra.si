import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { getStoredUser } from "../auth";
import type { BillingService, Location as LocationT, SessionType as SessionTypeT } from "../lib/types";
import { GuestConfigSaveIcon } from "../components/GuestConfigSaveIcon";
import { ServiceConfigDeleteButton, ServiceConfigEditButton, ServiceConfigTableFooter } from "../components/ServiceConfigTableUi";
import { EmptyState, Field } from "../components/ui";
import { useToast } from "../components/Toast";
import { currency, formatDate } from "../lib/format";
import { useLocale } from "../locale";

const SESSION_TYPES_SUBTAB_TRANSACTION = "transaction-services";

type GuestAdminProductType =
  | "CLASS_TICKET"
  | "PACK"
  | "MEMBERSHIP"
  | "GIFT_CARD"
  | "COURSE";

type VoucherRedemptionMode = "SERVICE" | "VALUE";
type VoucherServiceScope = "ALL_SERVICES" | "SELECTED_SERVICES";
type EntitlementServiceScope = "SERVICES" | "SERVICE_GROUP";

type GuestAdminProduct = {
  id: number;
  name: string;
  description?: string | null;
  promoText?: string | null;
  productType: GuestAdminProductType;
  priceGross: number;
  currency: string;
  active: boolean;
  guestVisible: boolean;
  bookable: boolean;
  usageLimit?: number | null;
  validityDays?: number | null;
  autoRenews: boolean;
  sortOrder: number;
  sessionTypeId?: number | null;
  sessionTypeName?: string | null;
  sessionTypeIds?: number[] | null;
  sessionTypeNames?: string[] | null;
  serviceGroupId?: number | null;
  serviceGroupName?: string | null;
  transactionServiceId?: number | null;
  transactionServiceCode?: string | null;
  transactionServiceDescription?: string | null;
  includedCourseIds?: number[] | null;
  voucherRedemptionMode?: VoucherRedemptionMode | null;
  voucherServiceScope?: VoucherServiceScope | null;
  voucherFaceValueGross?: number | null;
  voucherSessionTypeIds?: number[] | null;
  voucherSessionTypeNames?: string[] | null;
  availableAllLocations?: boolean;
  locationIds?: number[] | null;
  locationNames?: string[] | null;
  createdAt?: string;
  updatedAt?: string;
};

type CourseMediaType = "VIDEO" | "AUDIO";
type CourseStatus = "DRAFT" | "PROCESSING" | "ACTIVE" | "HIDDEN";

type Course = {
  id: number;
  guestProductId?: number | null;
  title: string;
  description?: string | null;
  mediaType: CourseMediaType;
  status: CourseStatus;
  priceGross: number;
  currency: string;
  active: boolean;
  guestVisible: boolean;
  sortOrder: number;
  thumbnailUrl?: string | null;
  bunnyLibraryId?: string | null;
  bunnyLibraryName?: string | null;
  bunnyVideoId?: string | null;
  bunnyStoragePath?: string | null;
  bunnyCdnUrl?: string | null;
  fileName?: string | null;
  contentType?: string | null;
};

type DirectVideoUploadSession = {
  uploadType: "TUS";
  uploadUrl: string;
  bunnyLibraryId: string;
  bunnyLibraryName?: string | null;
  bunnyVideoId: string;
  authorizationSignature: string;
  authorizationExpire: number;
  fileName: string;
  contentType: string;
  title: string;
};

type CourseFormState = {
  title: string;
  description: string;
  mediaType: CourseMediaType;
  status: CourseStatus;
  priceGross: string;
  currency: string;
  active: boolean;
  guestVisible: boolean;
  sortOrder: string;
  thumbnailUrl: string;
};

type GuestProductFormState = {
  name: string;
  description: string;
  promoText: string;
  productType: GuestAdminProductType;
  priceGross: string;
  currency: string;
  active: boolean;
  guestVisible: boolean;
  bookable: boolean;
  usageLimit: string;
  validityDays: string;
  autoRenews: boolean;
  sortOrder: string;
  sessionTypeId: string;
  sessionTypeIds: string[];
  serviceScope: EntitlementServiceScope;
  serviceGroupId: string;
  transactionServiceId: string;
  includedCourseIds: string[];
  voucherRedemptionMode: VoucherRedemptionMode;
  voucherServiceScope: VoucherServiceScope;
  voucherFaceValueGross: string;
  voucherSessionTypeIds: string[];
  availableAllLocations: boolean;
  locationIds: string[];
};

const ADMIN_GUEST_PRODUCT_TYPES: GuestAdminProductType[] = [
  "PACK",
  "MEMBERSHIP",
  "GIFT_CARD",
  "COURSE",
];

const CARD_PRODUCT_TYPE_LABELS: Record<GuestAdminProductType, string> = {
  CLASS_TICKET: "Ticket",
  PACK: "Tickets",
  MEMBERSHIP: "Membership",
  GIFT_CARD: "Voucher",
  COURSE: "Course access",
};

const defaultGuestProductForm = (): GuestProductFormState => ({
  name: "",
  description: "",
  promoText: "",
  productType: "PACK",
  priceGross: "0.00",
  currency: "EUR",
  active: true,
  guestVisible: true,
  bookable: false,
  usageLimit: "1",
  validityDays: "",
  autoRenews: false,
  sortOrder: "0",
  sessionTypeId: "",
  sessionTypeIds: [],
  serviceScope: "SERVICES",
  serviceGroupId: "",
  transactionServiceId: "",
  includedCourseIds: [],
  voucherRedemptionMode: "SERVICE",
  voucherServiceScope: "SELECTED_SERVICES",
  voucherFaceValueGross: "0.00",
  voucherSessionTypeIds: [],
  availableAllLocations: true,
  locationIds: [],
});

const defaultCourseForm = (): CourseFormState => ({
  title: "",
  description: "",
  mediaType: "VIDEO",
  status: "DRAFT",
  priceGross: "0.00",
  currency: "EUR",
  active: true,
  guestVisible: true,
  sortOrder: "0",
  thumbnailUrl: "",
});

function base64Utf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function resolveTusLocation(location: string, endpoint: string): string {
  try {
    return new URL(location, endpoint).toString();
  } catch {
    return location;
  }
}

async function uploadVideoToBunnyTus(
  file: File,
  session: DirectVideoUploadSession,
  onProgress: (progress: number) => void,
) {
  const authHeaders = {
    AuthorizationSignature: session.authorizationSignature,
    AuthorizationExpire: String(session.authorizationExpire),
    LibraryId: String(session.bunnyLibraryId),
    VideoId: session.bunnyVideoId,
  };
  const metadata = [
    `filetype ${base64Utf8(file.type || session.contentType || "video/mp4")}`,
    `title ${base64Utf8(file.name || session.title || "course-video")}`,
  ].join(",");

  const createRes = await fetch(session.uploadUrl, {
    method: "POST",
    headers: {
      "Tus-Resumable": "1.0.0",
      "Upload-Length": String(file.size),
      "Upload-Metadata": metadata,
      ...authHeaders,
    },
  });
  if (!createRes.ok) {
    throw new Error(`Bunny TUS upload could not be started (${createRes.status}).`);
  }
  const location = createRes.headers.get("Location");
  if (!location) {
    throw new Error("Bunny TUS upload did not return an upload location.");
  }

  const uploadUrl = resolveTusLocation(location, session.uploadUrl);
  const chunkSize = 8 * 1024 * 1024;
  let offset = 0;
  onProgress(0);

  while (offset < file.size) {
    const nextOffset = Math.min(offset + chunkSize, file.size);
    const chunk = file.slice(offset, nextOffset);
    const patchRes = await fetch(uploadUrl, {
      method: "PATCH",
      headers: {
        "Tus-Resumable": "1.0.0",
        "Content-Type": "application/offset+octet-stream",
        "Upload-Offset": String(offset),
        ...authHeaders,
      },
      body: chunk,
    });
    if (!patchRes.ok) {
      throw new Error(`Bunny TUS upload failed (${patchRes.status}).`);
    }
    const returnedOffset = Number(patchRes.headers.get("Upload-Offset"));
    offset =
      Number.isFinite(returnedOffset) && returnedOffset > offset
        ? returnedOffset
        : nextOffset;
    onProgress(file.size > 0 ? (offset / file.size) * 100 : 100);
  }
  onProgress(100);
}

const normalizeGuestProductFormForType = (
  current: GuestProductFormState,
  nextProductType: GuestAdminProductType,
  defaultSessionTypeId?: string,
): GuestProductFormState => {
  const currentUsage = parsePositiveIntegerInput(current.usageLimit);
  let sessionTypeIds = [...current.sessionTypeIds];
  if (nextProductType === "GIFT_CARD") {
    sessionTypeIds = [];
  } else if (
    (nextProductType === "CLASS_TICKET" ||
      nextProductType === "PACK" ||
      nextProductType === "COURSE") &&
    sessionTypeIds.length === 0
  ) {
    const fallback = current.sessionTypeId.trim() || defaultSessionTypeId || "";
    sessionTypeIds = fallback ? [fallback] : [];
  }
  const primarySessionTypeId = sessionTypeIds[0] || "";
  return {
    ...current,
    productType: nextProductType,
    usageLimit:
      nextProductType === "CLASS_TICKET" ||
      nextProductType === "MEMBERSHIP" ||
      nextProductType === "GIFT_CARD" ||
      nextProductType === "COURSE"
        ? "1"
        : nextProductType === "PACK" && currentUsage == null
          ? "1"
          : current.usageLimit,
    sessionTypeId: primarySessionTypeId,
    sessionTypeIds,
    serviceScope: nextProductType === "GIFT_CARD" ? "SERVICES" : current.serviceScope,
    serviceGroupId: nextProductType === "GIFT_CARD" ? "" : current.serviceGroupId,
    voucherSessionTypeIds:
      nextProductType === "GIFT_CARD" && current.voucherSessionTypeIds.length === 0 && defaultSessionTypeId
        ? [defaultSessionTypeId]
        : current.voucherSessionTypeIds,
    autoRenews: nextProductType === "MEMBERSHIP" ? current.autoRenews : false,
    bookable: false,
  };
};

const parsePositiveIntegerInput = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
};

function sessionUnitGrossSum(
  sessionType: SessionTypeT | undefined,
): number | null {
  const links = sessionType?.linkedServices;
  if (!links?.length) return null;
  let sum = 0;
  for (const ls of links) {
    const g = ls.unitGross;
    if (g == null || !Number.isFinite(Number(g))) return null;
    sum += Number(g);
  }
  return Math.round(sum * 100) / 100;
}

function suggestedGuestCardGross(
  productType: GuestAdminProductType,
  sessionTypeId: string,
  usageLimitStr: string,
  guestSessionTypes: SessionTypeT[],
): number | null {
  if (productType !== "PACK" && productType !== "CLASS_TICKET") return null;
  const trimmedId = sessionTypeId.trim();
  if (!trimmedId) return null;
  const st = guestSessionTypes.find((t) => String(t.id) === trimmedId);
  const unit = sessionUnitGrossSum(st);
  if (unit == null) return null;
  if (productType === "CLASS_TICKET") return Math.round(unit * 100) / 100;
  const usage = parsePositiveIntegerInput(usageLimitStr);
  if (usage == null) return null;
  return Math.round(unit * usage * 100) / 100;
}

function guestProductTypeUsesAutoPrice(
  productType: GuestAdminProductType,
  selectedServiceCount: number,
): boolean {
  return (productType === "PACK" || productType === "CLASS_TICKET") && selectedServiceCount === 1;
}

function transactionServiceLabel(service: BillingService): string {
  const description = service.description?.trim();
  return description || `#${service.id}`;
}

function guestProductTransactionServiceLabel(
  product: GuestAdminProduct,
): string {
  const description = product.transactionServiceDescription?.trim();
  return description || "—";
}

function sessionTypeDisplayLabel(sessionType: SessionTypeT | undefined): string {
  if (!sessionType) return "—";
  const description = sessionType.description?.trim();
  if (description) return description;

  const linkedDescriptions = (sessionType.linkedServices || [])
    .map((service) => service.description?.trim())
    .filter((value): value is string => Boolean(value));
  if (linkedDescriptions.length > 0) {
    return Array.from(new Set(linkedDescriptions)).join(", ");
  }

  return `#${sessionType.id}`;
}

function includedCoursesLabel(
  product: GuestAdminProduct,
  locale: string,
): string {
  const count = Array.isArray(product.includedCourseIds)
    ? product.includedCourseIds.length
    : 0;
  const serviceNames = Array.isArray(product.sessionTypeNames)
    ? product.sessionTypeNames.filter(Boolean)
    : product.sessionTypeName
      ? [product.sessionTypeName]
      : [];
  const serviceLabel = product.serviceGroupName?.trim()
    ? (locale === "sl" ? `Skupina: ${product.serviceGroupName}` : `Group: ${product.serviceGroupName}`)
    : serviceNames.length === 0
    ? (locale === "sl" ? "Vse storitve" : "All services")
    : serviceNames.length === 1
      ? serviceNames[0]
      : locale === "sl"
        ? `${serviceNames.length} izbrane storitve`
        : `${serviceNames.length} selected services`;
  if (product.productType === "COURSE") {
    const service = serviceNames.length === 0
      ? (locale === "sl" ? "Ni izbrana storitev" : "No service type selected")
      : serviceLabel;
    if (count <= 0) return service;
    return locale === "sl"
      ? `${service} · ${count} tečaj${count === 1 ? "" : "i"}`
      : `${service} · ${count} course${count === 1 ? "" : "s"}`;
  }
  if (product.productType === "MEMBERSHIP" && count > 0) {
    return locale === "sl"
      ? `${serviceLabel} · ${count} tečaj${count === 1 ? "" : "i"}`
      : `${serviceLabel} · ${count} course${count === 1 ? "" : "s"}`;
  }
  if (product.productType === "GIFT_CARD") {
    const scope = product.voucherServiceScope || "ALL_SERVICES";
    const names = Array.isArray(product.voucherSessionTypeNames)
      ? product.voucherSessionTypeNames.filter(Boolean)
      : [];
    if (scope === "ALL_SERVICES") return locale === "sl" ? "Vse storitve" : "All services";
    if (names.length === 0) return locale === "sl" ? "Izbrane storitve" : "Selected services";
    if (names.length === 1) return names[0];
    return locale === "sl" ? `${names.length} izbrane storitve` : `${names.length} selected services`;
  }
  return serviceLabel;
}

function syncGuestProductPriceFromSessionTypes(
  form: GuestProductFormState,
  sessionTypes: SessionTypeT[],
): GuestProductFormState {
  if (form.serviceScope === "SERVICE_GROUP") return form;
  if (!guestProductTypeUsesAutoPrice(form.productType, form.sessionTypeIds.length)) return form;
  const suggested = suggestedGuestCardGross(
    form.productType,
    form.sessionTypeId,
    form.usageLimit,
    sessionTypes,
  );
  return {
    ...form,
    priceGross: suggested != null ? suggested.toFixed(2) : "0.00",
  };
}

const productTypeLabel = (productType: GuestAdminProductType, locale = "en") => {
  if (locale === "sl") {
    const labels: Record<GuestAdminProductType, string> = {
      CLASS_TICKET: "Vstopnica",
      PACK: "Paket obiskov",
      MEMBERSHIP: "Članarina",
      GIFT_CARD: "Bon",
      COURSE: "Dostop do tečaja",
    };
    return labels[productType] || productType;
  }
  return CARD_PRODUCT_TYPE_LABELS[productType] || productType;
};

const productDisplayTypeLabel = (product: GuestAdminProduct, locale = "en") => {
  if (product.productType !== "GIFT_CARD") return productTypeLabel(product.productType, locale);
  const mode = product.voucherRedemptionMode || "VALUE";
  if (locale === "sl") return mode === "SERVICE" ? "Darilni bon" : "Vrednostni bon";
  return mode === "SERVICE" ? "Service gift voucher" : "Value voucher";
};

const CARD_MEMBERSHIP_ICON_TONES = [
  "blue",
  "green",
  "orange",
  "purple",
  "yellow",
  "pink",
] as const;

function CardsMembershipIcon({ index }: { index: number }) {
  const tone =
    CARD_MEMBERSHIP_ICON_TONES[index % CARD_MEMBERSHIP_ICON_TONES.length];
  return (
    <span className={`clients-name-avatar service-config-icon service-config-icon--${tone}`}>
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="4" y="3" width="14" height="18" rx="2.5" />
        <path d="M8 8h6M8 12h6M8 16h4" />
      </svg>
    </span>
  );
}

function CardsMembershipNameCell({
  product,
  index,
}: {
  product: GuestAdminProduct;
  index: number;
}) {
  return (
    <div className="clients-name-cell service-config-name-cell">
      <CardsMembershipIcon index={index} />
      <div className="clients-name-stack service-config-name-stack">
        <span className="clients-name">{product.name}</span>
        <span className="clients-id">
          {product.description?.trim()
            ? product.description
            : guestProductWalletSubtitle(product)}
        </span>
      </div>
    </div>
  );
}

function CardsMembershipSortableHeader({ children }: { children: ReactNode }) {
  return (
    <span className="service-config-sortable-header">
      {children}
      <span className="service-config-sort-icon" aria-hidden>
        ↕
      </span>
    </span>
  );
}

function CardsProductModalIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 3h12l4 6-10 12L2 9l4-6Z" />
      <path d="M2 9h20" />
      <path d="m6 3 6 18 6-18" />
    </svg>
  );
}

function CourseSelectionCheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}


function CourseSectionIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="m10 9 5 3-5 3V9z" />
    </svg>
  );
}

function CourseUploadIcon() {
  return (
    <svg
      width="30"
      height="30"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 16V7" />
      <path d="m8 11 4-4 4 4" />
      <path d="M20 16.5A4.5 4.5 0 0 0 15.5 12h-.76A6 6 0 1 0 6 17.32" />
      <path d="M6 20h12" />
    </svg>
  );
}

function formatCourseUploadSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

function guestProductWalletSubtitle(product: GuestAdminProduct): string {
  const bits: string[] = [];
  if (product.autoRenews) bits.push("Auto-renew enabled");
  if (product.productType === "COURSE") bits.push("Course access entitlement");
  else bits.push("Wallet entitlement");
  return bits.join(" · ");
}

export type CardsMembershipsSectionHandle = {
  openNew: () => void;
};

export type CardsMembershipsSectionProps = {
  sessionTypes: SessionTypeT[];
  coursesEnabled: boolean;
  giftCardsEnabled: boolean;
  searchQuery: string;
  activeFilter: "active" | "inactive";
  onFilteredCountChange?: (filteredCount: number) => void;
};

export const CardsMembershipsSection = forwardRef<
  CardsMembershipsSectionHandle,
  CardsMembershipsSectionProps
>(function CardsMembershipsSection(
  {
    sessionTypes,
    coursesEnabled,
    giftCardsEnabled,
    searchQuery,
    activeFilter,
    onFilteredCountChange,
  },
  ref,
) {
  const me = getStoredUser();
  const isAdmin = me?.role === "ADMIN" || me?.role === "SUPER_ADMIN";
  const { t, locale } = useLocale();
  const { showToast } = useToast();
  const [guestProducts, setGuestProducts] = useState<GuestAdminProduct[]>([]);
  const [transactionServices, setTransactionServices] = useState<
    BillingService[]
  >([]);
  const [locations, setLocations] = useState<LocationT[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [showCoursePickerModal, setShowCoursePickerModal] = useState(false);
  const [coursePickerQuery, setCoursePickerQuery] = useState("");
  const [pendingCourseIds, setPendingCourseIds] = useState<string[]>([]);
  const [showCourseModal, setShowCourseModal] = useState(false);
  const [editingCourseId, setEditingCourseId] = useState<number | null>(null);
  const [courseForm, setCourseForm] = useState<CourseFormState>(
    defaultCourseForm,
  );
  const [savingCourse, setSavingCourse] = useState(false);
  const [courseUploadFile, setCourseUploadFile] = useState<File | null>(null);
  const [courseUploadProgress, setCourseUploadProgress] = useState<number | null>(
    null,
  );
  const [uploadingCourseId, setUploadingCourseId] = useState<number | null>(
    null,
  );
  const [deleteOldCourseMediaOnReplace, setDeleteOldCourseMediaOnReplace] =
    useState(true);
  const [openProductMenuId, setOpenProductMenuId] = useState<number | null>(
    null,
  );
  const [activatingGuestProductId, setActivatingGuestProductId] = useState<
    number | null
  >(null);
  const [showGuestProductModal, setShowGuestProductModal] = useState(false);
  const [editingGuestProductId, setEditingGuestProductId] = useState<
    number | null
  >(null);
  const [savingGuestProduct, setSavingGuestProduct] = useState(false);
  const [guestProductForm, setGuestProductForm] =
    useState<GuestProductFormState>(defaultGuestProductForm);

  const loadGuestProducts = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const [productsRes, servicesRes, locationsRes, coursesRes] = await Promise.all([
        api.get("/guest/admin/products").catch(() => ({ data: [] })),
        api
          .get<BillingService[]>("/billing/services")
          .catch(() => ({ data: [] as BillingService[] })),
        api.get<LocationT[]>("/locations").catch(() => ({ data: [] as LocationT[] })),
        coursesEnabled
          ? api
              .get<Course[]>("/courses")
              .catch(() => ({ data: [] as Course[] }))
          : Promise.resolve({ data: [] as Course[] }),
      ]);
      setGuestProducts(
        (productsRes.data || []).filter(
          (product: GuestAdminProduct) =>
            giftCardsEnabled || product.productType !== "GIFT_CARD",
        ),
      );
      setTransactionServices(
        Array.isArray(servicesRes.data) ? servicesRes.data : [],
      );
      setLocations(Array.isArray(locationsRes.data) ? locationsRes.data.filter((location) => location.active !== false) : []);
      setCourses(Array.isArray(coursesRes.data) ? coursesRes.data : []);
    } catch {
      setGuestProducts([]);
      setTransactionServices([]);
      setLocations([]);
      setCourses([]);
    }
  }, [isAdmin, coursesEnabled, giftCardsEnabled]);

  useEffect(() => {
    void loadGuestProducts();
  }, [loadGuestProducts]);

  useEffect(() => {
    if (openProductMenuId == null) return;
    const onDocPointerDown = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null;
      if (
        el?.closest(".clients-card-menu-wrap") ||
        el?.closest(".clients-card-menu-popover")
      )
        return;
      setOpenProductMenuId(null);
    };
    document.addEventListener("mousedown", onDocPointerDown);
    return () => document.removeEventListener("mousedown", onDocPointerDown);
  }, [openProductMenuId]);

  useEffect(() => {
    if (!showGuestProductModal) return;
    if (guestProductForm.serviceScope === "SERVICE_GROUP") return;
    if (!guestProductTypeUsesAutoPrice(guestProductForm.productType, guestProductForm.sessionTypeIds.length)) return;
    setGuestProductForm((f) =>
      syncGuestProductPriceFromSessionTypes(f, sessionTypes),
    );
  }, [
    showGuestProductModal,
    guestProductForm.productType,
    guestProductForm.serviceScope,
    guestProductForm.sessionTypeId,
    guestProductForm.sessionTypeIds,
    guestProductForm.usageLimit,
    sessionTypes,
  ]);

  useEffect(() => {
    if (giftCardsEnabled || guestProductForm.productType !== "GIFT_CARD")
      return;
    setGuestProductForm((f) =>
      normalizeGuestProductFormForType(
        f,
        "PACK",
        sessionTypes[0] ? String(sessionTypes[0].id) : "",
      ),
    );
  }, [giftCardsEnabled, guestProductForm.productType, sessionTypes]);

  const activeTransactionServices = useMemo(
    () =>
      transactionServices
        .filter((service) => service.active !== false)
        .sort((a, b) =>
          transactionServiceLabel(a).localeCompare(transactionServiceLabel(b)),
        ),
    [transactionServices],
  );

  const serviceGroups = useMemo(() => {
    const groups = new Map<number, { id: number; name: string; serviceCount: number }>();
    sessionTypes.forEach((sessionType) => {
      const groupId = sessionType.serviceGroupId;
      const groupName = sessionType.serviceGroupName?.trim();
      if (groupId == null || !groupName || sessionType.serviceGroupActive === false) return;
      const current = groups.get(groupId);
      groups.set(groupId, {
        id: groupId,
        name: groupName,
        serviceCount: (current?.serviceCount ?? 0) + 1,
      });
    });
    return Array.from(groups.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [sessionTypes]);

  const availableAdminGuestProductTypes = useMemo(() => {
    let types = ADMIN_GUEST_PRODUCT_TYPES;
    if (!coursesEnabled && guestProductForm.productType !== "COURSE") {
      types = types.filter((productType) => productType !== "COURSE");
    }
    if (!giftCardsEnabled && guestProductForm.productType !== "GIFT_CARD") {
      types = types.filter((productType) => productType !== "GIFT_CARD");
    }
    return types;
  }, [coursesEnabled, giftCardsEnabled, guestProductForm.productType]);

  const openNewGuestProductModal = useCallback(() => {
    setOpenProductMenuId(null);
    setEditingGuestProductId(null);
    const base = defaultGuestProductForm();
    const firstSessionTypeId = sessionTypes[0]
      ? String(sessionTypes[0].id)
      : "";
    setGuestProductForm({
      ...base,
      sessionTypeId: firstSessionTypeId,
      sessionTypeIds: firstSessionTypeId ? [firstSessionTypeId] : [],
      serviceScope: "SERVICES",
      serviceGroupId: "",
      voucherSessionTypeIds: firstSessionTypeId ? [firstSessionTypeId] : [],
      transactionServiceId: activeTransactionServices.length === 1
        ? String(activeTransactionServices[0].id)
        : "",
    });
    setShowGuestProductModal(true);
  }, [sessionTypes, activeTransactionServices]);

  useImperativeHandle(ref, () => ({ openNew: openNewGuestProductModal }), [
    openNewGuestProductModal,
  ]);

  const openEditGuestProductModal = (product: GuestAdminProduct) => {
    if (product.productType === "GIFT_CARD" && !giftCardsEnabled) return;
    setOpenProductMenuId(null);
    setEditingGuestProductId(product.id);
    setGuestProductForm(
      normalizeGuestProductFormForType(
        {
          name: product.name,
          description: product.description || "",
          promoText: product.promoText || "",
          productType:
            product.productType === "CLASS_TICKET"
              ? "PACK"
              : product.productType,
          priceGross: Number(product.priceGross ?? 0).toFixed(2),
          currency: product.currency || "EUR",
          active: product.active,
          guestVisible: product.guestVisible,
          bookable: false,
          usageLimit:
            product.productType === "CLASS_TICKET"
              ? "1"
              : product.usageLimit == null
                ? ""
                : String(product.usageLimit),
          validityDays:
            product.validityDays == null ? "" : String(product.validityDays),
          autoRenews: product.autoRenews,
          sortOrder: String(product.sortOrder ?? 0),
          sessionTypeId:
            product.sessionTypeId == null ? "" : String(product.sessionTypeId),
          sessionTypeIds:
            Array.isArray(product.sessionTypeIds) && product.sessionTypeIds.length > 0
              ? product.sessionTypeIds.map(String)
              : product.sessionTypeId == null
                ? []
                : [String(product.sessionTypeId)],
          serviceScope: product.serviceGroupId != null ? "SERVICE_GROUP" : "SERVICES",
          serviceGroupId: product.serviceGroupId == null ? "" : String(product.serviceGroupId),
          transactionServiceId:
            product.transactionServiceId == null
              ? activeTransactionServices.length === 1
                ? String(activeTransactionServices[0].id)
                : ""
              : String(product.transactionServiceId),
          includedCourseIds: Array.isArray(product.includedCourseIds)
            ? product.includedCourseIds.map(String)
            : [],
          voucherRedemptionMode:
            product.productType === "GIFT_CARD"
              ? product.voucherRedemptionMode || "VALUE"
              : "SERVICE",
          voucherServiceScope:
            product.productType === "GIFT_CARD"
              ? product.voucherServiceScope || "ALL_SERVICES"
              : "SELECTED_SERVICES",
          voucherFaceValueGross:
            product.productType === "GIFT_CARD"
              ? Number(product.voucherFaceValueGross ?? product.priceGross ?? 0).toFixed(2)
              : "0.00",
          voucherSessionTypeIds:
            product.productType === "GIFT_CARD" && Array.isArray(product.voucherSessionTypeIds)
              ? product.voucherSessionTypeIds.map(String)
              : [],
          availableAllLocations: product.availableAllLocations !== false,
          locationIds: Array.isArray(product.locationIds) ? product.locationIds.map(String) : [],
        },
        product.productType === "CLASS_TICKET" ? "PACK" : product.productType,
      ),
    );
    setShowGuestProductModal(true);
  };

  const selectedCourses = useMemo(
    () =>
      guestProductForm.includedCourseIds
        .map((courseId) =>
          courses.find((course) => String(course.id) === String(courseId)) ??
          null,
        )
        .filter((course): course is Course => course != null),
    [courses, guestProductForm.includedCourseIds],
  );

  const editingCourse = useMemo(
    () =>
      editingCourseId == null
        ? null
        : courses.find((course) => course.id === editingCourseId) ?? null,
    [courses, editingCourseId],
  );

  const editingCourseHasMedia = Boolean(
    editingCourse?.bunnyVideoId ||
      editingCourse?.bunnyStoragePath ||
      editingCourse?.bunnyCdnUrl,
  );

  const existingCourseMediaLabel = editingCourse
    ? editingCourse.mediaType === "VIDEO"
      ? editingCourse.bunnyVideoId
        ? `Video ${editingCourse.bunnyVideoId}`
        : null
      : editingCourse.fileName ||
        editingCourse.bunnyStoragePath ||
        editingCourse.bunnyCdnUrl ||
        null
    : null;

  const availableCoursesForPicker = useMemo(() => {
    const query = coursePickerQuery.trim().toLowerCase();
    return courses
      .slice()
      .sort((a, b) => a.title.localeCompare(b.title))
      .filter((course) => {
        if (!query) return true;
        return [course.title, course.description, course.mediaType, course.status]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query));
      });
  }, [coursePickerQuery, courses]);

  const openCoursePicker = () => {
    setPendingCourseIds(guestProductForm.includedCourseIds);
    setCoursePickerQuery("");
    setShowCoursePickerModal(true);
  };

  const openNewCourseModal = () => {
    setEditingCourseId(null);
    setCourseForm(defaultCourseForm());
    setCourseUploadFile(null);
    setCourseUploadProgress(null);
    setDeleteOldCourseMediaOnReplace(true);
    setShowCourseModal(true);
  };

  const openEditCourseModal = (course: Course) => {
    setEditingCourseId(course.id);
    setCourseForm({
      title: course.title || "",
      description: course.description || "",
      mediaType: course.mediaType || "VIDEO",
      status: course.status || "DRAFT",
      priceGross: Number(course.priceGross || 0).toFixed(2),
      currency: course.currency || "EUR",
      active: course.active,
      guestVisible: course.guestVisible,
      sortOrder: String(course.sortOrder ?? 0),
      thumbnailUrl: course.thumbnailUrl || "",
    });
    setCourseUploadFile(null);
    setCourseUploadProgress(null);
    setDeleteOldCourseMediaOnReplace(true);
    setShowCourseModal(true);
  };

  const removeSelectedCourse = (courseId: number | string) => {
    setGuestProductForm((current) => ({
      ...current,
      includedCourseIds: current.includedCourseIds.filter(
        (id) => id !== String(courseId),
      ),
    }));
  };

  const uploadCourseMedia = async (
    courseId: number,
    file: File,
    deleteOldMedia: boolean,
  ) => {
    setUploadingCourseId(courseId);
    setCourseUploadProgress(0);
    try {
      if (courseForm.mediaType === "VIDEO") {
        const sessionRes = await api.post<DirectVideoUploadSession>(
          `/courses/${courseId}/media/direct-upload`,
          {
            fileName: file.name,
            contentType: file.type || "video/mp4",
            sizeBytes: file.size,
          },
          { params: { deleteOld: deleteOldMedia } },
        );
        await uploadVideoToBunnyTus(file, sessionRes.data, (progress) =>
          setCourseUploadProgress(progress),
        );
        await api.post(`/courses/${courseId}/media/direct-complete`, {
          bunnyVideoId: sessionRes.data.bunnyVideoId,
          fileName: file.name,
          contentType: file.type || sessionRes.data.contentType || "video/mp4",
        });
      } else {
        const body = new FormData();
        body.append("file", file);
        await api.post(`/courses/${courseId}/media`, body, {
          headers: { "Content-Type": "multipart/form-data" },
          params: { deleteOld: deleteOldMedia },
        });
        setCourseUploadProgress(100);
      }
    } finally {
      setUploadingCourseId(null);
      setCourseUploadProgress(null);
    }
  };

  const submitCourse = async (event: FormEvent) => {
    event.preventDefault();
    if (savingCourse) return;
    setSavingCourse(true);
    try {
      const payload = {
        title: courseForm.title.trim(),
        description: courseForm.description.trim() || null,
        mediaType: courseForm.mediaType,
        status: courseForm.status,
        priceGross: Number(courseForm.priceGross.replace(",", ".")) || 0,
        currency: courseForm.currency.trim().toUpperCase() || "EUR",
        active: courseForm.active,
        guestVisible: courseForm.guestVisible,
        sortOrder: Number.parseInt(courseForm.sortOrder, 10) || 0,
        thumbnailUrl: courseForm.thumbnailUrl.trim() || null,
      };
      const res = editingCourseId
        ? await api.put<Course>(`/courses/${editingCourseId}`, payload)
        : await api.post<Course>("/courses", payload);
      if (courseUploadFile) {
        await uploadCourseMedia(
          res.data.id,
          courseUploadFile,
          Boolean(
            editingCourseId &&
              editingCourseHasMedia &&
              deleteOldCourseMediaOnReplace,
          ),
        );
      }
      await loadGuestProducts();
      setGuestProductForm((current) => ({
        ...current,
        includedCourseIds: Array.from(
          new Set([...current.includedCourseIds, String(res.data.id)]),
        ),
      }));
      setShowCourseModal(false);
      showToast(
        "success",
        locale === "sl" ? "Tečaj je shranjen." : "Course saved.",
      );
    } catch (err: any) {
      showToast(
        "error",
        err?.response?.data?.message ||
          (locale === "sl"
            ? "Tečaja ni bilo mogoče shraniti."
            : "Could not save course."),
      );
    } finally {
      setSavingCourse(false);
    }
  };

  const submitGuestProduct = async (e: FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    const isGiftCard = guestProductForm.productType === "GIFT_CARD";
    const isCourseAccess = guestProductForm.productType === "COURSE";
    if (isCourseAccess && !coursesEnabled) {
      window.alert(
        locale === "sl"
          ? "Prodaja dostopa do tečajev je izklopljena v App nastavitvah."
          : "Course access sales are disabled in App settings.",
      );
      return;
    }
    if (isGiftCard && !giftCardsEnabled) {
      window.alert(
        locale === "sl"
          ? "Boni so izklopljeni v App nastavitvah."
          : "Vouchers are disabled in App settings.",
      );
      return;
    }
    if (
      !coursesEnabled &&
      guestProductForm.productType === "MEMBERSHIP" &&
      guestProductForm.includedCourseIds.length > 0
    ) {
      window.alert(
        locale === "sl"
          ? "Tečaji so izklopljeni v App nastavitvah, zato članarina ne more vključevati tečajev."
          : "Courses are disabled in App settings, so this membership cannot include courses.",
      );
      return;
    }
    if (guestProductForm.productType === "PACK") {
      if (guestProductForm.serviceScope === "SERVICES" && guestProductForm.sessionTypeIds.length === 0) {
        window.alert(locale === "sl" ? "Paket obiskov mora veljati za vsaj eno storitev." : "Tickets must be valid for at least one service type.");
        return;
      }
      const ticketUsageLimit = parsePositiveIntegerInput(
        guestProductForm.usageLimit,
      );
      if (ticketUsageLimit == null || ticketUsageLimit < 1) {
        window.alert(locale === "sl" ? "Paket obiskov mora imeti količino najmanj 1." : "Tickets must have a quantity of at least 1.");
        return;
      }
    }
    const isClassTicket = guestProductForm.productType === "CLASS_TICKET";
    const isMembership = guestProductForm.productType === "MEMBERSHIP";
    if (isClassTicket && guestProductForm.serviceScope === "SERVICES" && guestProductForm.sessionTypeIds.length === 0) {
      window.alert(locale === "sl" ? "Vstopnica mora veljati za vsaj eno storitev." : "The ticket must be valid for at least one service type.");
      return;
    }
    if (!isGiftCard && guestProductForm.serviceScope === "SERVICE_GROUP" && !guestProductForm.serviceGroupId) {
      window.alert(locale === "sl" ? "Izberite skupino storitev." : "Select a service group.");
      return;
    }
    const validityDays = parsePositiveIntegerInput(
      guestProductForm.validityDays,
    );
    const transactionServiceId = guestProductForm.transactionServiceId.trim()
      ? Number.parseInt(guestProductForm.transactionServiceId, 10)
      : null;
    if (isGiftCard && !validityDays) {
      window.alert(locale === "sl" ? "Bon mora imeti določeno veljavnost." : "Vouchers must have an expiry date.");
      return;
    }
    if (!transactionServiceId || transactionServiceId <= 0) {
      window.alert(locale === "sl" ? "Izberite postavko, ki bo uporabljena na računu." : "Select the invoice line item for this entitlement.");
      return;
    }
    if (
      isGiftCard &&
      guestProductForm.voucherServiceScope === "SELECTED_SERVICES" &&
      guestProductForm.voucherSessionTypeIds.length === 0
    ) {
      window.alert(
        locale === "sl"
          ? "Pri možnosti »Izbrane storitve« izberite vsaj eno storitev."
          : "Select at least one service when using the selected-services scope.",
      );
      return;
    }
    const voucherFaceValueGross = Number.parseFloat(
      guestProductForm.voucherFaceValueGross.replace(",", "."),
    );
    if (
      isGiftCard &&
      guestProductForm.voucherRedemptionMode === "VALUE" &&
      (!Number.isFinite(voucherFaceValueGross) || voucherFaceValueGross <= 0)
    ) {
      window.alert(
        locale === "sl"
          ? "Vrednostni bon mora imeti vrednost večjo od 0."
          : "A value voucher must have a value greater than 0.",
      );
      return;
    }
    if (isCourseAccess && guestProductForm.serviceScope === "SERVICES" && guestProductForm.sessionTypeIds.length === 0) {
      window.alert(
        locale === "sl"
          ? "Dostop do tečaja mora veljati za vsaj eno storitev."
          : "Course access must be valid for at least one service type.",
      );
      return;
    }
    if (isCourseAccess && guestProductForm.includedCourseIds.length === 0) {
      window.alert(
        locale === "sl"
          ? "Dostop do tečaja mora vključevati vsaj en tečaj."
          : "Course access must include at least one course.",
      );
      return;
    }
    if (!guestProductForm.availableAllLocations && guestProductForm.locationIds.length === 0) {
      window.alert(
        locale === "sl"
          ? "Izberite vsaj eno lokacijo, kjer ugodnost velja."
          : "Select at least one location where this entitlement is available.",
      );
      return;
    }
    const payload = {
      name: guestProductForm.name.trim(),
      description: guestProductForm.description.trim(),
      promoText: guestProductForm.promoText.trim() || null,
      productType: guestProductForm.productType,
      priceGross: Number.parseFloat(guestProductForm.priceGross || "0") || 0,
      currency: guestProductForm.currency.trim().toUpperCase() || "EUR",
      active: guestProductForm.active,
      guestVisible: guestProductForm.guestVisible,
      bookable: false,
      availableAllLocations: guestProductForm.availableAllLocations,
      locationIds: guestProductForm.availableAllLocations
        ? []
        : guestProductForm.locationIds.map((id) => Number.parseInt(id, 10)).filter(Number.isFinite),
      usageLimit:
        isClassTicket || isMembership || isGiftCard || isCourseAccess
          ? 1
          : parsePositiveIntegerInput(guestProductForm.usageLimit),
      validityDays,
      autoRenews:
        guestProductForm.productType === "MEMBERSHIP"
          ? guestProductForm.autoRenews
          : false,
      sortOrder: Number.parseInt(guestProductForm.sortOrder || "0", 10) || 0,
      sessionTypeId: isGiftCard || guestProductForm.serviceScope === "SERVICE_GROUP"
        ? null
        : guestProductForm.sessionTypeIds[0]
          ? Number.parseInt(guestProductForm.sessionTypeIds[0], 10)
          : null,
      sessionTypeIds: isGiftCard || guestProductForm.serviceScope === "SERVICE_GROUP"
        ? []
        : guestProductForm.sessionTypeIds
            .map((id) => Number.parseInt(id, 10))
            .filter((id) => Number.isFinite(id)),
      serviceGroupId:
        !isGiftCard && guestProductForm.serviceScope === "SERVICE_GROUP" && guestProductForm.serviceGroupId
          ? Number.parseInt(guestProductForm.serviceGroupId, 10)
          : null,
      transactionServiceId,
      voucherRedemptionMode: isGiftCard
        ? guestProductForm.voucherRedemptionMode
        : null,
      voucherServiceScope: isGiftCard
        ? guestProductForm.voucherServiceScope
        : null,
      voucherFaceValueGross:
        isGiftCard && guestProductForm.voucherRedemptionMode === "VALUE"
          ? voucherFaceValueGross
          : null,
      voucherSessionTypeIds:
        isGiftCard && guestProductForm.voucherServiceScope === "SELECTED_SERVICES"
          ? guestProductForm.voucherSessionTypeIds
              .map((id) => Number.parseInt(id, 10))
              .filter((id) => Number.isFinite(id))
          : [],
      includedCourseIds:
        coursesEnabled &&
        (guestProductForm.productType === "MEMBERSHIP" ||
          guestProductForm.productType === "COURSE")
          ? guestProductForm.includedCourseIds
              .map((id) => Number.parseInt(id, 10))
              .filter((id) => Number.isFinite(id))
          : [],
    };
    const wasEditing = editingGuestProductId != null;
    setSavingGuestProduct(true);
    try {
      if (editingGuestProductId)
        await api.put(
          `/guest/admin/products/${editingGuestProductId}`,
          payload,
        );
      else await api.post("/guest/admin/products", payload);
      setShowGuestProductModal(false);
      setEditingGuestProductId(null);
      setGuestProductForm(defaultGuestProductForm());
      await loadGuestProducts();
      showToast(
        "success",
        wasEditing
          ? locale === "sl" ? "Ugodnost je posodobljena." : "Entitlement updated."
          : locale === "sl" ? "Ugodnost je ustvarjena." : "Entitlement created.",
      );
    } catch (err: any) {
      window.alert(
        err?.response?.data?.message ||
          (locale === "sl" ? "Ugodnosti ni bilo mogoče shraniti." : "Failed to save entitlement."),
      );
    } finally {
      setSavingGuestProduct(false);
    }
  };

  const deleteGuestProduct = async (product: GuestAdminProduct) => {
    if (!isAdmin) return;
    if (
      !window.confirm(
        locale === "sl"
          ? `Izbrišem ${product.name}? Izbris je mogoč samo, če ugodnost še nikoli ni bila prodana.`
          : `Delete ${product.name}? This only works if it has never been sold.`,
      )
    )
      return;
    try {
      await api.delete(`/guest/admin/products/${product.id}`);
      if (editingGuestProductId === product.id) {
        setShowGuestProductModal(false);
        setEditingGuestProductId(null);
        setGuestProductForm(defaultGuestProductForm());
      }
      await loadGuestProducts();
      showToast("success", locale === "sl" ? "Ugodnost je izbrisana." : "Entitlement deleted.");
    } catch (err: any) {
      window.alert(
        err?.response?.data?.message || (locale === "sl" ? "Ugodnosti ni bilo mogoče izbrisati." : "Failed to delete entitlement."),
      );
    }
  };

  const toggleGuestProductActive = async (
    product: GuestAdminProduct,
    nextActive: boolean,
  ) => {
    if (!isAdmin) return;
    if (product.productType === "COURSE" && nextActive && !coursesEnabled) {
      window.alert(
        locale === "sl"
          ? "Prodaja dostopa do tečajev je izklopljena v App nastavitvah."
          : "Course access sales are disabled in App settings.",
      );
      return;
    }
    setActivatingGuestProductId(product.id);
    try {
      await api.put(`/guest/admin/products/${product.id}`, {
        name: product.name,
        description: product.description || "",
        promoText: product.promoText || null,
        productType:
          product.productType === "CLASS_TICKET" ? "PACK" : product.productType,
        priceGross: product.priceGross,
        currency: product.currency,
        active: nextActive,
        guestVisible: product.guestVisible,
        bookable: false,
        usageLimit:
          product.productType === "CLASS_TICKET" ||
          product.productType === "COURSE"
            ? 1
            : (product.usageLimit ?? null),
        validityDays:
          product.productType === "GIFT_CARD"
            ? (product.validityDays ?? 1)
            : product.productType === "COURSE"
              ? null
              : (product.validityDays ?? null),
        autoRenews:
          product.productType === "MEMBERSHIP" ? product.autoRenews : false,
        sortOrder: product.sortOrder ?? 0,
        sessionTypeId:
          product.productType === "GIFT_CARD"
            ? null
            : (Array.isArray(product.sessionTypeIds) && product.sessionTypeIds.length > 0
                ? product.sessionTypeIds[0]
                : (product.sessionTypeId ?? null)),
        sessionTypeIds:
          product.productType === "GIFT_CARD"
            ? []
            : (Array.isArray(product.sessionTypeIds) && product.sessionTypeIds.length > 0
                ? product.sessionTypeIds
                : product.sessionTypeId == null ? [] : [product.sessionTypeId]),
        transactionServiceId: product.transactionServiceId ?? null,
        voucherRedemptionMode:
          product.productType === "GIFT_CARD"
            ? (product.voucherRedemptionMode || "VALUE")
            : null,
        voucherServiceScope:
          product.productType === "GIFT_CARD"
            ? (product.voucherServiceScope || "ALL_SERVICES")
            : null,
        voucherFaceValueGross:
          product.productType === "GIFT_CARD" && (product.voucherRedemptionMode || "VALUE") === "VALUE"
            ? (product.voucherFaceValueGross ?? product.priceGross)
            : null,
        voucherSessionTypeIds:
          product.productType === "GIFT_CARD" && (product.voucherServiceScope || "ALL_SERVICES") === "SELECTED_SERVICES"
            ? (product.voucherSessionTypeIds || [])
            : [],
        includedCourseIds:
          product.productType === "MEMBERSHIP" ||
          product.productType === "COURSE"
            ? product.includedCourseIds || []
            : [],
      });
      setOpenProductMenuId(null);
      await loadGuestProducts();
      showToast(
        "success",
        `Entitlement ${nextActive ? "activated" : "archived"}.`,
      );
    } catch (err: any) {
      window.alert(
        err?.response?.data?.message || (locale === "sl" ? "Statusa ugodnosti ni bilo mogoče posodobiti." : "Failed to update card status."),
      );
    } finally {
      setActivatingGuestProductId(null);
    }
  };

  const filteredGuestProducts = useMemo(() => {
    const visibleByModule = guestProducts.filter(
      (product) =>
        (coursesEnabled || product.productType !== "COURSE") &&
        (giftCardsEnabled || product.productType !== "GIFT_CARD"),
    );
    const byStatus = visibleByModule.filter((product) =>
      activeFilter === "inactive"
        ? product.active === false
        : product.active !== false,
    );
    const q = searchQuery.trim().toLowerCase();
    if (!q) return byStatus;
    return byStatus.filter((p) => {
      const vis = p.guestVisible ? "visible" : "hidden";
      const st = p.active ? "active" : "archived";
      const validityLabel =
        p.validityDays != null ? `${p.validityDays} days` : "no expiry";
      const hay = [
        p.name,
        productDisplayTypeLabel(p, locale),
        p.sessionTypeName || "",
        ...(p.sessionTypeNames || []),
        guestProductTransactionServiceLabel(p),
        String(p.priceGross),
        currency(p.priceGross),
        vis,
        st,
        p.usageLimit != null ? String(p.usageLimit) : "unlimited",
        validityLabel,
        guestProductWalletSubtitle(p),
        String(p.id),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [
    guestProducts,
    searchQuery,
    activeFilter,
    coursesEnabled,
    giftCardsEnabled,
    locale,
  ]);

  useEffect(() => {
    onFilteredCountChange?.(filteredGuestProducts.length);
  }, [filteredGuestProducts.length, onFilteredCountChange]);

  if (!isAdmin) return null;

  const activeStatusLabel = locale === "sl" ? "Aktivna" : "Active";
  const inactiveStatusLabel = locale === "sl" ? "Neaktivna" : "Inactive";

  return (
    <>
      {guestProducts.length === 0 ? (
        <EmptyState
          title={locale === "sl" ? "Ni še ugodnosti" : "No entitlements yet"}
          text={
            locale === "sl"
              ? "Ustvarite prvo ugodnost, članarino, bon ali dostop do tečaja za denarnico gosta."
              : "Create your first entitlement, membership, voucher or course access product for the guest wallet."
          }
        />
      ) : filteredGuestProducts.length === 0 ? (
        <EmptyState
          title={t("calendarFilterSearchNoResults")}
          text={t("sessionTypesSearchNoMatchesText")}
        />
      ) : (
        <div className="clients-list-shell service-config-list-shell">
          <div className="clients-mobile-list service-config-mobile-list">
            {filteredGuestProducts.map((product, index) => (
              <article
                key={product.id}
                className="clients-mobile-card service-config-mobile-card"
                role="button"
                tabIndex={0}
                onClick={() => openEditGuestProductModal(product)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openEditGuestProductModal(product);
                  }
                }}
              >
                <div className="clients-mobile-card-head">
                  <CardsMembershipNameCell product={product} index={index} />
                  <div className="clients-card-menu-wrap">
                    <button
                      type="button"
                      className="secondary clients-card-menu-trigger service-config-menu-trigger"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenProductMenuId((previous) =>
                          previous === product.id ? null : product.id,
                        );
                      }}
                      aria-label={
                        locale === "sl"
                          ? "Dejanja ugodnosti"
                          : "Entitlement actions"
                      }
                      aria-expanded={openProductMenuId === product.id}
                    >
                      ⋮
                    </button>
                    {openProductMenuId === product.id && (
                      <div
                        className="clients-card-menu-popover"
                        role="dialog"
                        aria-label={
                          locale === "sl"
                            ? "Dejanja ugodnosti"
                            : "Entitlement actions"
                        }
                      >
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenProductMenuId(null);
                            void toggleGuestProductActive(
                              product,
                              product.active === false,
                            );
                          }}
                          disabled={activatingGuestProductId === product.id}
                        >
                          {activatingGuestProductId === product.id
                            ? locale === "sl"
                              ? "Shranjujem..."
                              : "Saving..."
                            : product.active === false
                              ? locale === "sl"
                                ? "Aktiviraj"
                                : "Activate"
                              : locale === "sl"
                                ? "Deaktiviraj"
                                : "Deactivate"}
                        </button>
                        <button
                          type="button"
                          className="danger"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenProductMenuId(null);
                            void deleteGuestProduct(product);
                          }}
                          disabled={activatingGuestProductId === product.id}
                        >
                          {locale === "sl" ? "Izbriši" : "Delete"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="clients-mobile-meta">
                  <div>
                    <span>{t("sessionTypesCardsColType")}</span>
                    <strong>{productDisplayTypeLabel(product, locale)}</strong>
                  </div>
                  <div>
                    <span>{t("sessionTypesCardsColServiceType")}</span>
                    <strong>{includedCoursesLabel(product, locale)}</strong>
                  </div>
                  <div>
                    <span>{t("sessionTypesCardsColPrice")}</span>
                    <strong>{currency(product.priceGross)}</strong>
                  </div>
                  <div>
                    <span>{t("sessionTypesCardsColStatus")}</span>
                    <strong>
                      <button
                        type="button"
                        className={`clients-status-pill clients-status-pill-btn${product.active === false ? " clients-status-pill--inactive" : ""}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          void toggleGuestProductActive(
                            product,
                            !product.active,
                          );
                        }}
                        disabled={activatingGuestProductId === product.id}
                      >
                        <span />
                        {product.active === false
                          ? inactiveStatusLabel
                          : activeStatusLabel}
                      </button>
                    </strong>
                  </div>
                </div>
              </article>
            ))}
          </div>
          <div className="simple-table-wrap clients-table-wrap clients-table-desktop session-types-table-wrap service-config-table-wrap">
            <table className="clients-table session-types-table service-config-table">
              <thead>
                <tr>
                  <th>
                    <CardsMembershipSortableHeader>
                      {locale === "sl" ? "Naziv" : "Name"}
                    </CardsMembershipSortableHeader>
                  </th>
                  <th>
                    <CardsMembershipSortableHeader>
                      {t("sessionTypesCardsColType")}
                    </CardsMembershipSortableHeader>
                  </th>
                  <th>
                    <CardsMembershipSortableHeader>
                      {t("sessionTypesCardsColServiceType")}
                    </CardsMembershipSortableHeader>
                  </th>
                  <th>
                    <CardsMembershipSortableHeader>
                      {t("sessionTypesCardsColPrice")}
                    </CardsMembershipSortableHeader>
                  </th>
                  <th>
                    <CardsMembershipSortableHeader>
                      {t("sessionTypesCardsColValidity")}
                    </CardsMembershipSortableHeader>
                  </th>
                  <th>
                    <CardsMembershipSortableHeader>
                      {t("sessionTypesCardsColStatus")}
                    </CardsMembershipSortableHeader>
                  </th>
                  <th>
                    <CardsMembershipSortableHeader>
                      {locale === "sl" ? "Ustvarjeno" : "Created"}
                    </CardsMembershipSortableHeader>
                  </th>
                  <th>{locale === "sl" ? "Dejanja" : "Actions"}</th>
                </tr>
              </thead>
              <tbody>
                {filteredGuestProducts.map((product, index) => (
                  <tr
                    key={product.id}
                    className="clients-row clients-row--clickable"
                    role="button"
                    tabIndex={0}
                    onClick={() => openEditGuestProductModal(product)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openEditGuestProductModal(product);
                      }
                    }}
                  >
                    <td>
                      <CardsMembershipNameCell
                        product={product}
                        index={index}
                      />
                    </td>
                    <td className="clients-muted service-config-category-cell">
                      {productDisplayTypeLabel(product, locale)}
                    </td>
                    <td className="clients-muted service-config-category-cell">
                      {includedCoursesLabel(product, locale)}
                    </td>
                    <td className="clients-muted service-config-price-cell">
                      {currency(product.priceGross)}
                    </td>
                    <td className="clients-muted">
                      {product.validityDays
                        ? locale === "sl"
                          ? `${product.validityDays} dni`
                          : `${product.validityDays} days`
                        : locale === "sl"
                          ? "Brez poteka"
                          : "No expiry"}
                    </td>
                    <td>
                      <button
                        type="button"
                        className={`clients-status-pill clients-status-pill-btn${product.active === false ? " clients-status-pill--inactive" : ""}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          void toggleGuestProductActive(
                            product,
                            !product.active,
                          );
                        }}
                        disabled={activatingGuestProductId === product.id}
                      >
                        <span />
                        {product.active === false
                          ? inactiveStatusLabel
                          : activeStatusLabel}
                      </button>
                    </td>
                    <td className="clients-muted">
                      {product.createdAt ? formatDate(product.createdAt) : "—"}
                    </td>
                    <td
                      className="clients-actions service-config-actions account-table-actions"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ServiceConfigEditButton
                        label={locale === "sl" ? "Uredi" : "Edit"}
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditGuestProductModal(product);
                        }}
                      />
                      <ServiceConfigDeleteButton
                        label={locale === "sl" ? "Izbriši" : "Delete"}
                        onClick={(e) => {
                          e.stopPropagation();
                          void deleteGuestProduct(product);
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ServiceConfigTableFooter
            summary={locale === "sl"
              ? `Prikazano ${filteredGuestProducts.length} od ${guestProducts.length} ugodnosti`
              : `Showing ${filteredGuestProducts.length} of ${guestProducts.length} entitlements`}
          />
        </div>
      )}

      {showGuestProductModal && (
        <div
          className="modal-backdrop booking-side-panel-backdrop cards-product-modal-backdrop"
          onClick={() => {
            if (!savingGuestProduct) {
              setShowGuestProductModal(false);
              setEditingGuestProductId(null);
            }
          }}
          role="presentation"
        >
          <div
            className="modal large-modal booking-side-panel cards-product-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="cards-product-modal-header">
              <div className="cards-product-modal-heading">
                <span className="cards-product-modal-icon">
                  <CardsProductModalIcon />
                </span>
                <div className="cards-product-modal-title">
                  <h2>
                    {editingGuestProductId
                      ? locale === "sl"
                        ? "Uredi ugodnost"
                        : "Edit entitlement"
                      : locale === "sl"
                        ? "Nova ugodnost"
                        : "New entitlement"}
                  </h2>
                  <p>
                    {editingGuestProductId
                      ? locale === "sl"
                        ? "Posodobite podrobnosti ugodnosti."
                        : "Update the details of this entitlement."
                      : locale === "sl"
                        ? "Nastavite novo ugodnost za denarnico gostov."
                        : "Configure a new guest wallet entitlement."}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="secondary booking-side-panel-close cards-product-modal-close"
                onClick={() => {
                  if (!savingGuestProduct) {
                    setShowGuestProductModal(false);
                    setEditingGuestProductId(null);
                  }
                }}
                aria-label={locale === "sl" ? "Zapri" : "Close"}
              >
                ×
              </button>
            </div>

            <form
              className="form-grid booking-side-panel-body cards-product-modal-body"
              onSubmit={submitGuestProduct}
            >
              <Field label={locale === "sl" ? "Naziv *" : "Name *"}>
                <input
                  required
                  placeholder={locale === "sl" ? "Vnesite naziv ugodnosti" : "Enter card name"}
                  value={guestProductForm.name}
                  onChange={(e) =>
                    setGuestProductForm({
                      ...guestProductForm,
                      name: e.target.value,
                    })
                  }
                />
              </Field>
              <Field
                label={
                  locale === "sl" ? "Tip ugodnosti *" : "Entitlement type *"
                }
              >
                <select
                  value={guestProductForm.productType}
                  onChange={(e) => {
                    const pt = e.target.value as GuestAdminProductType;
                    const firstSessionTypeId = sessionTypes[0]
                      ? String(sessionTypes[0].id)
                      : "";
                    setGuestProductForm((current) => {
                      const normalized = normalizeGuestProductFormForType(
                        current,
                        pt,
                        firstSessionTypeId,
                      );
                      return syncGuestProductPriceFromSessionTypes(
                        normalized,
                        sessionTypes,
                      );
                    });
                  }}
                >
                  {availableAdminGuestProductTypes.map((productType) => (
                    <option key={productType} value={productType}>
                      {productTypeLabel(productType, locale)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label={locale === "sl" ? "Lokacije *" : "Locations *"}
                hint={
                  locale === "sl"
                    ? "Določite, v katerih poslovnih prostorih je ugodnost mogoče kupiti in unovčiti."
                    : "Choose the locations where this entitlement can be purchased and redeemed."
                }
              >
                <select
                  value={guestProductForm.availableAllLocations ? "ALL" : "SELECTED"}
                  onChange={(event) =>
                    setGuestProductForm((current) => ({
                      ...current,
                      availableAllLocations: event.target.value === "ALL",
                      locationIds: event.target.value === "ALL" ? [] : current.locationIds,
                    }))
                  }
                >
                  <option value="ALL">{locale === "sl" ? "Vse lokacije" : "All locations"}</option>
                  <option value="SELECTED">{locale === "sl" ? "Izbrane lokacije" : "Selected locations"}</option>
                </select>
              </Field>
              {!guestProductForm.availableAllLocations && (
                <Field label={locale === "sl" ? "Izbrane lokacije *" : "Selected locations *"}>
                  <div className="cards-product-voucher-services">
                    {locations.map((location) => {
                      const id = String(location.id);
                      const checked = guestProductForm.locationIds.includes(id);
                      return (
                        <label
                          key={location.id}
                          className={`cards-product-voucher-service-option${checked ? " is-selected" : ""}`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) =>
                              setGuestProductForm((current) => ({
                                ...current,
                                locationIds: event.target.checked
                                  ? Array.from(new Set([...current.locationIds, id]))
                                  : current.locationIds.filter((value) => value !== id),
                              }))
                            }
                          />
                          <span>{location.name}</span>
                        </label>
                      );
                    })}
                    {locations.length === 0 && (
                      <span className="muted">
                        {locale === "sl" ? "Ni aktivnih lokacij." : "No active locations."}
                      </span>
                    )}
                  </div>
                </Field>
              )}
              {guestProductForm.productType === "GIFT_CARD" && (
                <>
                  <Field
                    label={locale === "sl" ? "Način unovčenja *" : "Redemption mode *"}
                    hint={
                      locale === "sl"
                        ? "Za storitev ustvari darilni bon; po vrednosti ustvari vrednostni bon."
                        : "Service creates a service gift voucher; value creates a monetary voucher."
                    }
                  >
                    <div className="cards-product-toggle cards-product-voucher-mode-toggle">
                      <button
                        type="button"
                        className={`cards-product-toggle-btn${guestProductForm.voucherRedemptionMode === "SERVICE" ? " active" : ""}`}
                        onClick={() =>
                          setGuestProductForm((current) => ({
                            ...current,
                            voucherRedemptionMode: "SERVICE",
                            voucherFaceValueGross: current.voucherFaceValueGross || current.priceGross,
                          }))
                        }
                      >
                        {locale === "sl" ? "Za storitev" : "Service"}
                      </button>
                      <button
                        type="button"
                        className={`cards-product-toggle-btn${guestProductForm.voucherRedemptionMode === "VALUE" ? " active" : ""}`}
                        onClick={() =>
                          setGuestProductForm((current) => ({
                            ...current,
                            voucherRedemptionMode: "VALUE",
                            voucherFaceValueGross:
                              !current.voucherFaceValueGross || Number(current.voucherFaceValueGross) <= 0
                                ? current.priceGross
                                : current.voucherFaceValueGross,
                          }))
                        }
                      >
                        {locale === "sl" ? "Po vrednosti" : "By value"}
                      </button>
                    </div>
                  </Field>
                  <Field
                    label={locale === "sl" ? "Velja za *" : "Valid for *"}
                    hint={
                      locale === "sl"
                        ? "Določite, ali se bon lahko uporabi za vse ali samo izbrane storitve."
                        : "Choose whether the voucher can be used for all or only selected services."
                    }
                  >
                    <select
                      value={guestProductForm.voucherServiceScope}
                      onChange={(e) => {
                        const scope = e.target.value as VoucherServiceScope;
                        setGuestProductForm((current) => ({
                          ...current,
                          voucherServiceScope: scope,
                          voucherSessionTypeIds:
                            scope === "SELECTED_SERVICES" && current.voucherSessionTypeIds.length === 0 && sessionTypes[0]
                              ? [String(sessionTypes[0].id)]
                              : current.voucherSessionTypeIds,
                        }));
                      }}
                    >
                      <option value="ALL_SERVICES">
                        {locale === "sl" ? "Vse storitve" : "All services"}
                      </option>
                      <option value="SELECTED_SERVICES">
                        {locale === "sl" ? "Izbrane storitve" : "Selected services"}
                      </option>
                    </select>
                  </Field>
                  {guestProductForm.voucherServiceScope === "SELECTED_SERVICES" && (
                    <Field
                      label={locale === "sl" ? "Storitve *" : "Services *"}
                      hint={
                        guestProductForm.voucherRedemptionMode === "SERVICE"
                          ? locale === "sl"
                            ? "Darilni bon se unovči enkrat za eno od izbranih storitev."
                            : "The gift voucher is redeemed once for one of the selected services."
                          : locale === "sl"
                            ? "Vrednost bona se lahko porablja samo za izbrane storitve."
                            : "The voucher balance can only be used for the selected services."
                      }
                    >
                      <div className="cards-product-voucher-services">
                        {sessionTypes.map((sessionType) => {
                          const id = String(sessionType.id);
                          const checked = guestProductForm.voucherSessionTypeIds.includes(id);
                          return (
                            <label
                              key={sessionType.id}
                              className={`cards-product-voucher-service-option${checked ? " is-selected" : ""}`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) =>
                                  setGuestProductForm((current) => ({
                                    ...current,
                                    voucherSessionTypeIds: e.target.checked
                                      ? Array.from(new Set([...current.voucherSessionTypeIds, id]))
                                      : current.voucherSessionTypeIds.filter((value) => value !== id),
                                  }))
                                }
                              />
                              <span>{sessionTypeDisplayLabel(sessionType)}</span>
                            </label>
                          );
                        })}
                        {sessionTypes.length === 0 && (
                          <span className="muted">
                            {locale === "sl" ? "Ni razpoložljivih storitev." : "No services available."}
                          </span>
                        )}
                      </div>
                    </Field>
                  )}
                </>
              )}
              {guestProductForm.productType === "COURSE" && !coursesEnabled && (
                <p className="muted cards-product-modal-note full-span">
                  {locale === "sl"
                    ? "Tečaji so izklopljeni v App nastavitvah, zato dostopa do tečajev ni mogoče prodajati."
                    : "Courses are disabled in App settings, so course access cannot be sold."}
                </p>
              )}
              <Field
                label={locale === "sl" ? "Cena (bruto) *" : "Price (gross) *"}
                hint={
                  guestProductForm.serviceScope === "SERVICES" && guestProductTypeUsesAutoPrice(guestProductForm.productType, guestProductForm.sessionTypeIds.length)
                    ? guestProductForm.productType === "PACK"
                      ? locale === "sl"
                        ? "Izračunano iz storitve (vsota bruto cen povezanih obračunskih storitev) × količina."
                        : "Calculated from the service type (sum of transaction line grosses) × quantity."
                      : locale === "sl"
                        ? "Izračunano iz storitve (vsota bruto cen povezanih obračunskih storitev) za en obisk."
                        : "Calculated from the service type (sum of transaction line grosses) for one entry."
                    : undefined
                }
              >
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  readOnly={guestProductForm.serviceScope === "SERVICES" && guestProductTypeUsesAutoPrice(
                    guestProductForm.productType,
                    guestProductForm.sessionTypeIds.length,
                  )}
                  aria-readonly={guestProductForm.serviceScope === "SERVICES" && guestProductTypeUsesAutoPrice(
                    guestProductForm.productType,
                    guestProductForm.sessionTypeIds.length,
                  )}
                  value={guestProductForm.priceGross}
                  onChange={(e) => {
                    if (
                      guestProductForm.serviceScope === "SERVICES" &&
                      guestProductTypeUsesAutoPrice(
                        guestProductForm.productType,
                        guestProductForm.sessionTypeIds.length,
                      )
                    )
                      return;
                    const nextPrice = e.target.value;
                    setGuestProductForm((current) => ({
                      ...current,
                      priceGross: nextPrice,
                      voucherFaceValueGross:
                        current.productType === "GIFT_CARD" &&
                        current.voucherRedemptionMode === "VALUE" &&
                        (current.voucherFaceValueGross === current.priceGross || Number(current.voucherFaceValueGross) <= 0)
                          ? nextPrice
                          : current.voucherFaceValueGross,
                    }));
                  }}
                />
              </Field>
              <Field label={locale === "sl" ? "Valuta *" : "Currency *"}>
                <input
                  maxLength={3}
                  value={guestProductForm.currency}
                  onChange={(e) =>
                    setGuestProductForm({
                      ...guestProductForm,
                      currency: e.target.value.toUpperCase(),
                    })
                  }
                />
              </Field>
              {guestProductForm.productType === "GIFT_CARD" && guestProductForm.voucherRedemptionMode === "VALUE" && (
                <Field
                  label={locale === "sl" ? "Vrednost bona *" : "Voucher value *"}
                  hint={
                    locale === "sl"
                      ? "Denarno dobroimetje ob izdaji bona. Privzeto je enako prodajni ceni."
                      : "Monetary balance issued with the voucher. Defaults to the selling price."
                  }
                >
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    value={guestProductForm.voucherFaceValueGross}
                    onChange={(e) =>
                      setGuestProductForm({
                        ...guestProductForm,
                        voucherFaceValueGross: e.target.value,
                      })
                    }
                  />
                </Field>
              )}
              {guestProductForm.productType !== "GIFT_CARD" && (
                <>
                  <div className="field full-span cards-product-scope-field">
                    <span className="field-label">{locale === "sl" ? "Velja za *" : "Valid for *"}</span>
                    <span className="field-hint">
                      {locale === "sl"
                        ? "Izberite, ali ugodnost velja za izbrane storitve ali za vse storitve znotraj ene skupine."
                        : "Choose whether the entitlement applies to selected services or every service in one group."}
                    </span>
                    <div className="cards-product-scope-options" role="radiogroup" aria-label={locale === "sl" ? "Velja za" : "Valid for"}>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={guestProductForm.serviceScope === "SERVICES"}
                        className={`cards-product-scope-option${guestProductForm.serviceScope === "SERVICES" ? " is-selected" : ""}`}
                        onClick={() =>
                          setGuestProductForm((current) => ({
                            ...current,
                            serviceScope: "SERVICES",
                            serviceGroupId: "",
                          }))
                        }
                      >
                        <span className="cards-product-scope-radio" aria-hidden />
                        <span className="cards-product-scope-icon" aria-hidden>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5v-9Z" />
                            <path d="m4.5 7.8 7.5 4.3 7.5-4.3M12 12.1V21" />
                          </svg>
                        </span>
                        <span className="cards-product-scope-copy">
                          <strong>{locale === "sl" ? "Storitve" : "Services"}</strong>
                          <span>{locale === "sl" ? "Velja za eno ali več izbranih storitev." : "Applies to one or more selected services."}</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={guestProductForm.serviceScope === "SERVICE_GROUP"}
                        disabled={serviceGroups.length === 0}
                        className={`cards-product-scope-option${guestProductForm.serviceScope === "SERVICE_GROUP" ? " is-selected" : ""}`}
                        onClick={() =>
                          setGuestProductForm((current) => ({
                            ...current,
                            serviceScope: "SERVICE_GROUP",
                            serviceGroupId: "",
                            sessionTypeId: "",
                            sessionTypeIds: [],
                          }))
                        }
                      >
                        <span className="cards-product-scope-radio" aria-hidden />
                        <span className="cards-product-scope-icon" aria-hidden>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="4" y="4" width="6" height="6" rx="1" />
                            <rect x="14" y="4" width="6" height="6" rx="1" />
                            <rect x="4" y="14" width="6" height="6" rx="1" />
                            <rect x="14" y="14" width="6" height="6" rx="1" />
                          </svg>
                        </span>
                        <span className="cards-product-scope-copy">
                          <strong>{locale === "sl" ? "Skupino storitev" : "Service group"}</strong>
                          <span>{locale === "sl" ? "Velja za vse storitve v izbrani skupini." : "Applies to every service in the selected group."}</span>
                        </span>
                      </button>
                    </div>
                    {serviceGroups.length === 0 && (
                      <span className="field-hint cards-product-scope-empty-hint">
                        {locale === "sl"
                          ? "Za uporabo skupine storitev najprej ustvarite skupino in ji dodelite vsaj eno storitev."
                          : "Create a service group and assign at least one service before using group scope."}
                      </span>
                    )}
                  </div>

                  {guestProductForm.serviceScope === "SERVICES" ? (
                    <Field
                      label={guestProductForm.productType === "MEMBERSHIP"
                        ? locale === "sl" ? "Storitve" : "Services"
                        : locale === "sl" ? "Storitve *" : "Services *"}
                      hint={guestProductForm.productType === "MEMBERSHIP"
                        ? locale === "sl"
                          ? "Izberite eno ali več storitev. Če ne izberete nobene, članarina velja za vse storitve."
                          : "Select one or more services. With none selected, the membership is valid for all services."
                        : guestProductForm.productType === "PACK"
                          ? locale === "sl"
                            ? "Izberite eno ali več storitev. Pri več storitvah prodajno ceno določite ročno."
                            : "Select one or more services. With multiple services, set the selling price manually."
                          : locale === "sl"
                            ? "Izberite eno ali več storitev, pri katerih je mogoče koristiti ugodnost."
                            : "Select one or more services for which this entitlement may be used."}
                    >
                      <details className="cards-product-service-dropdown">
                        <summary>
                          <span>
                            {guestProductForm.productType === "MEMBERSHIP" && guestProductForm.sessionTypeIds.length === 0
                              ? locale === "sl" ? "Vse storitve" : "All services"
                              : guestProductForm.sessionTypeIds.length === 0
                                ? locale === "sl" ? "Izberite storitve" : "Select services"
                                : guestProductForm.sessionTypeIds.length === 1
                                  ? sessionTypeDisplayLabel(sessionTypes.find((item) => String(item.id) === guestProductForm.sessionTypeIds[0]) || sessionTypes[0])
                                  : locale === "sl"
                                    ? `${guestProductForm.sessionTypeIds.length} izbrane storitve`
                                    : `${guestProductForm.sessionTypeIds.length} selected services`}
                          </span>
                          <span className="cards-product-service-dropdown-chevron" aria-hidden>⌄</span>
                        </summary>
                        <div className="cards-product-service-dropdown-menu">
                          {guestProductForm.productType === "MEMBERSHIP" && (
                            <label className={`cards-product-service-dropdown-option${guestProductForm.sessionTypeIds.length === 0 ? " is-selected" : ""}`}>
                              <input
                                type="checkbox"
                                checked={guestProductForm.sessionTypeIds.length === 0}
                                onChange={() =>
                                  setGuestProductForm((current) => ({ ...current, sessionTypeId: "", sessionTypeIds: [] }))
                                }
                              />
                              <span>{locale === "sl" ? "Vse storitve" : "All services"}</span>
                            </label>
                          )}
                          {sessionTypes.map((sessionType) => {
                            const id = String(sessionType.id);
                            const checked = guestProductForm.sessionTypeIds.includes(id);
                            return (
                              <label key={sessionType.id} className={`cards-product-service-dropdown-option${checked ? " is-selected" : ""}`}>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(event) =>
                                    setGuestProductForm((current) => {
                                      const nextIds = event.target.checked
                                        ? Array.from(new Set([...current.sessionTypeIds, id]))
                                        : current.sessionTypeIds.filter((value) => value !== id);
                                      return { ...current, sessionTypeIds: nextIds, sessionTypeId: nextIds[0] || "" };
                                    })
                                  }
                                />
                                <span>{sessionTypeDisplayLabel(sessionType)}</span>
                              </label>
                            );
                          })}
                          {sessionTypes.length === 0 && (
                            <span className="muted cards-product-service-dropdown-empty">
                              {locale === "sl" ? "Ni razpoložljivih storitev." : "No services available."}
                            </span>
                          )}
                        </div>
                      </details>
                    </Field>
                  ) : (
                    <Field
                      label={locale === "sl" ? "Skupina storitev *" : "Service group *"}
                      hint={locale === "sl"
                        ? "Ugodnost bo veljala za vse trenutne in prihodnje storitve, ki pripadajo izbrani skupini."
                        : "The entitlement applies to all current and future services assigned to the selected group."}
                    >
                      <select
                        required
                        value={guestProductForm.serviceGroupId}
                        onChange={(event) =>
                          setGuestProductForm((current) => ({ ...current, serviceGroupId: event.target.value }))
                        }
                      >
                        <option value="">{locale === "sl" ? "Izberite skupino storitev" : "Select service group"}</option>
                        {serviceGroups.map((group) => (
                          <option key={group.id} value={group.id}>
                            {group.name} · {group.serviceCount}
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}
                </>
              )}
              <Field
                label={locale === "sl" ? "Postavka na računu *" : "Invoice line item *"}
                hint={
                  locale === "sl"
                    ? "Določa obračunsko storitev, DDV in naziv postavke, ki se prikaže na računu ob nakupu ugodnosti."
                    : "Defines the transaction service, VAT and line description shown on the invoice when this entitlement is purchased."
                }
              >
                <select
                  required
                  value={guestProductForm.transactionServiceId}
                  onChange={(e) =>
                    setGuestProductForm({
                      ...guestProductForm,
                      transactionServiceId: e.target.value,
                    })
                  }
                >
                  <option value="">{locale === "sl" ? "Izberi postavko na računu" : "Select invoice line item"}</option>
                  {activeTransactionServices.map((service) => (
                    <option key={service.id} value={service.id}>
                      {transactionServiceLabel(service)}
                    </option>
                  ))}
                </select>
              </Field>
              {activeTransactionServices.length === 0 && (
                <p className="muted cards-product-modal-note">
                  {locale === "sl" ? "Pred ustvarjanjem ugodnosti ustvarite aktivno obračunsko storitev v " : "Create an active transaction service in "}
                  <Link
                    to={`/session-types?subtab=${SESSION_TYPES_SUBTAB_TRANSACTION}`}
                    className="linkish-btn"
                    style={{ display: "inline" }}
                  >
                    {locale === "sl" ? "Obračunskih storitvah" : "Transaction services"}
                  </Link>
                  {locale === "sl" ? "." : " before creating the entitlement."}
                </p>
              )}
              {guestProductForm.serviceScope === "SERVICES" && guestProductTypeUsesAutoPrice(guestProductForm.productType, guestProductForm.sessionTypeIds.length) &&
                guestProductForm.sessionTypeId.trim() !== "" &&
                sessionUnitGrossSum(
                  sessionTypes.find(
                    (t) =>
                      String(t.id) === guestProductForm.sessionTypeId.trim(),
                  ),
                ) == null && (
                  <p className="muted cards-product-modal-note">
                    {locale === "sl"
                      ? "Ta storitev nima povezanih obračunskih storitev ali pa manjkajo cene. Nastavite jih v "
                      : "This service type has no linked transaction services (or prices are missing). Configure them under "}
                    <Link
                      to={`/session-types?subtab=${SESSION_TYPES_SUBTAB_TRANSACTION}`}
                      className="linkish-btn"
                      style={{ display: "inline" }}
                    >
                      {locale === "sl" ? "Obračunskih storitvah" : "Transaction services"}
                    </Link>
                    .
                  </p>
                )}
              <Field label={locale === "sl" ? "Vrstni red" : "Sort order"}>
                <input
                  type="number"
                  step="1"
                  value={guestProductForm.sortOrder}
                  onChange={(e) =>
                    setGuestProductForm({
                      ...guestProductForm,
                      sortOrder: e.target.value,
                    })
                  }
                />
              </Field>
              {guestProductForm.productType !== "COURSE" && (
                <Field
                  label={
                    guestProductForm.productType === "GIFT_CARD"
                      ? locale === "sl" ? "Veljavnost (dni) *" : "Validity (days) *"
                      : locale === "sl" ? "Veljavnost (dni)" : "Validity (days)"
                  }
                  hint={
                    guestProductForm.productType === "GIFT_CARD"
                      ? locale === "sl" ? "Obvezno za bone." : "Required for vouchers."
                      : locale === "sl" ? "Pustite prazno za neomejeno veljavnost." : "Leave empty for no expiry."
                  }
                >
                  <input
                    type="number"
                    min="1"
                    step="1"
                    placeholder={locale === "sl" ? "Npr. 30" : "E.g. 30"}
                    required={guestProductForm.productType === "GIFT_CARD"}
                    value={guestProductForm.validityDays}
                    onChange={(e) =>
                      setGuestProductForm({
                        ...guestProductForm,
                        validityDays: e.target.value,
                      })
                    }
                  />
                </Field>
              )}
              {guestProductForm.productType === "PACK" && (
                <Field
                  label={locale === "sl" ? "Količina *" : "Quantity *"}
                  hint={locale === "sl" ? "Število obiskov v paketu. Pri eni izbrani storitvi se cena lahko izračuna samodejno; pri več storitvah prodajno ceno določite ročno." : "Number of visits in the pack. With one selected service the price can be calculated automatically; with multiple services set the selling price manually."}
                >
                  <input
                    type="number"
                    min="1"
                    step="1"
                    placeholder={locale === "sl" ? "Npr. 1 ali 10" : "E.g. 1 or 10"}
                    required={guestProductForm.productType === "PACK"}
                    value={guestProductForm.usageLimit}
                    onChange={(e) =>
                      setGuestProductForm({
                        ...guestProductForm,
                        usageLimit: e.target.value,
                      })
                    }
                  />
                </Field>
              )}
              <Field
                label={locale === "sl" ? "Opis" : "Description"}
                hint={locale === "sl" ? "Prikazano na zaslonu za nakup v mobilni denarnici gosta." : "Shown in the guest mobile wallet buy screen."}
              >
                <textarea
                  rows={3}
                  placeholder={locale === "sl" ? "Dodajte opis (neobvezno)" : "Add a description (optional)"}
                  value={guestProductForm.description}
                  onChange={(e) =>
                    setGuestProductForm({
                      ...guestProductForm,
                      description: e.target.value,
                    })
                  }
                />
              </Field>
              <Field
                label={locale === "sl" ? "Promocijsko besedilo" : "Promo text"}
                hint={locale === "sl" ? "Prikazano kot oznaka nad gumbom za nakup (npr. 'Najboljša ponudba', 'Na voljo zdaj'). Pustite prazno, da se ne prikaže." : "Shown as a badge above the Buy button (e.g. 'Best value', 'Available now'). Leave empty to hide."}
              >
                <textarea
                  rows={3}
                  maxLength={120}
                  placeholder={locale === "sl" ? "Dodajte promocijsko besedilo (neobvezno)" : "Add promo text (optional)"}
                  value={guestProductForm.promoText}
                  onChange={(e) =>
                    setGuestProductForm({
                      ...guestProductForm,
                      promoText: e.target.value,
                    })
                  }
                />
              </Field>
              <div className="field cards-product-switch-field">
                <label
                  className={`cards-product-toggle-card${guestProductForm.guestVisible ? " is-on" : ""}`}
                >
                  <span
                    className="session-type-config-switch cards-product-switch"
                    aria-hidden="true"
                  >
                    <input
                      type="checkbox"
                      checked={guestProductForm.guestVisible}
                      onChange={(e) =>
                        setGuestProductForm({
                          ...guestProductForm,
                          guestVisible: e.target.checked,
                        })
                      }
                    />
                    <span className="session-type-config-switch-track">
                      <span className="session-type-config-switch-thumb" />
                    </span>
                  </span>
                  <span className="cards-product-toggle-copy">
                    <strong>{locale === "sl" ? "Vidno v aplikaciji za goste" : "Visible in guest app"}</strong>
                    <span>{locale === "sl" ? "Prikaži to ugodnost v aplikaciji za goste." : "Show this card in the guest app."}</span>
                  </span>
                </label>
              </div>

              {guestProductForm.productType === "MEMBERSHIP" && (
                <div className="field cards-product-switch-field">
                  <label
                    className={`cards-product-toggle-card${guestProductForm.autoRenews ? " is-on" : ""}`}
                  >
                    <span
                      className="session-type-config-switch cards-product-switch"
                      aria-hidden="true"
                    >
                      <input
                        type="checkbox"
                        checked={guestProductForm.autoRenews}
                        onChange={(e) =>
                          setGuestProductForm({
                            ...guestProductForm,
                            autoRenews: e.target.checked,
                          })
                        }
                      />
                      <span className="session-type-config-switch-track">
                        <span className="session-type-config-switch-thumb" />
                      </span>
                    </span>
                    <span className="cards-product-toggle-copy">
                      <strong>{locale === "sl" ? "Samodejno podaljšanje" : "Auto-renew"}</strong>
                      <span>
                        {locale === "sl"
                          ? "Na voljo za članarine. Gost lahko nastavitev pozneje spremeni v svoji denarnici."
                          : "Available for memberships. Guests can later change this in their wallet."}
                      </span>
                    </span>
                  </label>
                </div>
              )}

              {coursesEnabled &&
                (guestProductForm.productType === "MEMBERSHIP" ||
                  guestProductForm.productType === "COURSE") && (
                  <div className="field full-span cards-product-courses-field">
                    <div className="session-type-config-unified-card session-type-config-unified-card--group cards-product-courses-panel">
                      <div className="session-type-config-unified-card-header">
                        <div className="session-type-config-section-title">
                          <span className="session-type-config-section-icon session-type-config-section-icon--group cards-product-course-section-icon" aria-hidden>
                            <CourseSectionIcon />
                          </span>
                          <div>
                            <h3>
                              {locale === "sl" ? "Tečaji" : "Courses"}
                            </h3>
                            <p>
                              {guestProductForm.productType === "COURSE"
                                ? locale === "sl"
                                  ? "Izberite tečaje, ki jih gost prejme po nakupu te ugodnosti."
                                  : "Choose the courses guests receive after buying this entitlement."
                                : locale === "sl"
                                  ? "Izberite tečaje, ki so dostopni v sklopu aktivne članarine."
                                  : "Choose the courses available while the membership is active."}
                            </p>
                          </div>
                        </div>
                        <div className="session-type-config-unified-actions">
                          <button
                            type="button"
                            className="secondary small-btn"
                            onClick={openCoursePicker}
                          >
                            + {locale === "sl" ? "Dodaj obstoječi" : "Add existing"}
                          </button>
                          <button
                            type="button"
                            className="secondary small-btn"
                            onClick={openNewCourseModal}
                          >
                            + {locale === "sl" ? "Ustvari novo" : "Create new"}
                          </button>
                        </div>
                      </div>

                      {selectedCourses.length > 0 ? (
                        <div className="cards-product-linked-courses-list">
                          {selectedCourses.map((course) => (
                            <div
                              key={course.id}
                              className="session-type-linked-card cards-product-linked-course-card"
                            >
                              <span
                                className="session-type-linked-card-icon session-type-linked-card-icon--group cards-product-linked-course-icon"
                                aria-hidden
                              >
                                <CourseSectionIcon />
                              </span>
                              <span className="session-type-linked-card-copy">
                                <strong>{course.title}</strong>
                                <span>
                                  {course.description?.trim()
                                    ? course.description
                                    : guestProductForm.productType === "COURSE"
                                      ? locale === "sl"
                                        ? "Gost dobi doživljenjski dostop po nakupu te ugodnosti."
                                        : "Guest gets lifetime access after purchase."
                                      : locale === "sl"
                                        ? "Članarina omogoča dostop do tega tečaja, dokler je aktivna."
                                        : "Membership grants access while it is active."}
                                </span>
                              </span>
                              <div className="session-type-linked-card-actions">
                                <button
                                  type="button"
                                  className="secondary slim-btn"
                                  onClick={() => openEditCourseModal(course)}
                                >
                                  {locale === "sl" ? "Uredi" : "Edit"}
                                </button>
                                <button
                                  type="button"
                                  className="danger secondary slim-btn"
                                  onClick={() => removeSelectedCourse(course.id)}
                                >
                                  {locale === "sl" ? "Odstrani" : "Remove"}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="session-type-linked-empty">
                          {courses.length === 0
                            ? locale === "sl"
                              ? "Ni še ustvarjenih tečajev. Najprej ustvarite novega."
                              : "No courses exist yet. Create your first one."
                            : locale === "sl"
                              ? "Noben tečaj še ni povezan s to ugodnostjo."
                              : "No courses are linked to this entitlement yet."}
                        </div>
                      )}

                      <span className="field-hint cards-product-course-panel-hint">
                        {guestProductForm.productType === "COURSE"
                          ? locale === "sl"
                            ? "Gost dobi doživljenjski dostop do izbranih tečajev po nakupu te ugodnosti."
                            : "Guests get lifetime access to selected courses after buying this entitlement."
                          : locale === "sl"
                            ? "Članarina omogoča dostop do izbranih tečajev, dokler je aktivna."
                            : "Guests with this membership can access selected courses while the membership is active."}
                      </span>
                    </div>
                  </div>
                )}
              <div className="form-actions full-span booking-side-panel-footer cards-product-modal-footer">
                <div className="cards-product-modal-footer-actions">
                  <button
                    type="submit"
                    className="gapp-primary-button"
                    disabled={savingGuestProduct}
                  >
                    <GuestConfigSaveIcon />
                    {savingGuestProduct
                      ? t("formSaving")
                      : editingGuestProductId
                        ? t("formSaveChanges")
                        : locale === "sl"
                          ? "Ustvari ugodnost"
                          : "Create entitlement"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
      {showCoursePickerModal && (
        <div
          className="modal-backdrop booking-side-panel-backdrop cards-product-modal-backdrop cards-product-nested-modal-backdrop"
          role="presentation"
          onMouseDown={() => setShowCoursePickerModal(false)}
        >
          <div
            className="modal large-modal booking-side-panel cards-product-modal cards-product-course-picker-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cards-course-picker-title"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="cards-product-modal-header">
              <div className="cards-product-modal-heading">
                <span className="cards-product-modal-icon" aria-hidden>
                  <CourseSectionIcon />
                </span>
                <div className="cards-product-modal-title">
                  <h2 id="cards-course-picker-title">
                    {locale === "sl" ? "Dodaj obstoječi tečaj" : "Add existing course"}
                  </h2>
                  <p>
                    {locale === "sl"
                      ? "Izberite enega ali več že ustvarjenih tečajev."
                      : "Choose one or more courses that already exist."}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="secondary booking-side-panel-close cards-product-modal-close"
                onClick={() => setShowCoursePickerModal(false)}
                aria-label={locale === "sl" ? "Zapri" : "Close"}
              >
                ×
              </button>
            </div>
            <div className="form-grid booking-side-panel-body cards-product-modal-body cards-product-course-picker-body">
              <div className="field full-span">
                <input
                  value={coursePickerQuery}
                  onChange={(e) => setCoursePickerQuery(e.target.value)}
                  placeholder={locale === "sl" ? "Išči tečaje ..." : "Search courses ..."}
                />
              </div>
              <div className="field full-span cards-product-course-picker-results">
                {availableCoursesForPicker.length === 0 ? (
                  <div className="session-type-linked-empty">
                    {locale === "sl"
                      ? "Ni najdenih tečajev."
                      : "No courses found."}
                  </div>
                ) : (
                  <div className="cards-product-course-picker-options">
                    {availableCoursesForPicker.map((course) => {
                      const selected = pendingCourseIds.includes(String(course.id));
                      return (
                        <label
                          key={course.id}
                          className={`cards-product-course-option${selected ? " is-selected" : ""}`}
                        >
                          <span className="cards-product-course-checkbox">
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={(e) =>
                                setPendingCourseIds((current) =>
                                  e.target.checked
                                    ? Array.from(
                                        new Set([...current, String(course.id)]),
                                      )
                                    : current.filter(
                                        (id) => id !== String(course.id),
                                      ),
                                )
                              }
                            />
                            <span className="cards-product-course-checkmark">
                              <CourseSelectionCheckIcon />
                            </span>
                          </span>
                          <span className="cards-product-course-copy">
                            <strong>
                              {course.title}
                              <span>({course.mediaType})</span>
                            </strong>
                            <small>
                              {course.description?.trim() ||
                                (locale === "sl"
                                  ? "Brez opisa"
                                  : "No description")}
                            </small>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            <div className="booking-side-panel-footer cards-product-modal-footer">
              <div className="cards-product-modal-footer-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setShowCoursePickerModal(false)}
                >
                  {locale === "sl" ? "Prekliči" : "Cancel"}
                </button>
                <button
                  type="button"
                  className="gapp-primary-button"
                  onClick={() => {
                    setGuestProductForm((current) => ({
                      ...current,
                      includedCourseIds: pendingCourseIds,
                    }));
                    setShowCoursePickerModal(false);
                  }}
                >
                  <GuestConfigSaveIcon />
                  {locale === "sl" ? "Dodaj izbrane" : "Add selected"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showCourseModal && (
        <div
          className="modal-backdrop booking-side-panel-backdrop session-type-config-modal-backdrop course-edit-modal-backdrop cards-product-nested-modal-backdrop"
          role="presentation"
          onMouseDown={() => {
            if (!savingCourse && uploadingCourseId == null) {
              setShowCourseModal(false);
            }
          }}
        >
          <div
            className="modal large-modal booking-side-panel session-type-config-modal course-edit-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cards-course-edit-modal-title"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="session-type-config-modal-header course-edit-modal-header">
              <div className="session-type-config-modal-heading course-edit-modal-heading">
                <span className="session-type-config-modal-icon course-edit-modal-icon" aria-hidden>
                  <CourseSectionIcon />
                </span>
                <div>
                  <h2 id="cards-course-edit-modal-title">
                    {editingCourseId
                      ? locale === "sl"
                        ? "Uredi tečaj"
                        : "Edit course"
                      : locale === "sl"
                        ? "Nov tečaj"
                        : "New course"}
                  </h2>
                </div>
              </div>
              <button
                type="button"
                className="secondary session-type-config-modal-close course-edit-modal-close"
                aria-label={locale === "sl" ? "Zapri" : "Close"}
                onClick={() => {
                  if (!savingCourse && uploadingCourseId == null) {
                    setShowCourseModal(false);
                  }
                }}
              >
                ×
              </button>
            </div>
            <form
              id="cards-product-course-form"
              className="booking-side-panel-body config-type-panel-form session-type-config-modal-body course-edit-modal-body"
              onSubmit={submitCourse}
            >
              <section className="session-type-config-section course-edit-card">
                <div className="form-grid two course-edit-grid course-edit-grid--two">
                  <Field label={locale === "sl" ? "Naslov tečaja *" : "Course title *"}>
                    <input
                      required
                      value={courseForm.title}
                      onChange={(e) =>
                        setCourseForm((current) => ({
                          ...current,
                          title: e.target.value,
                        }))
                      }
                    />
                  </Field>
                  <Field label={locale === "sl" ? "Tip medija" : "Media type"}>
                    <span className="course-edit-select-wrap">
                      <span className="course-edit-select-icon" aria-hidden>
                        <CourseSectionIcon />
                      </span>
                      <select
                        className="course-edit-select"
                        value={courseForm.mediaType}
                        onChange={(e) =>
                          setCourseForm((current) => ({
                            ...current,
                            mediaType: e.target.value as CourseMediaType,
                          }))
                        }
                      >
                        <option value="VIDEO">Video</option>
                        <option value="AUDIO">Audio</option>
                      </select>
                    </span>
                  </Field>
                </div>

                <div className="field course-edit-upload-field">
                  <span className="field-label">Bunny upload</span>
                  <label
                    className={`course-edit-upload-dropzone${courseUploadFile ? " has-file" : ""}`}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      setCourseUploadFile(e.dataTransfer.files?.[0] ?? null);
                    }}
                  >
                    <input
                      className="course-edit-file-input"
                      type="file"
                      accept={courseForm.mediaType === "AUDIO" ? "audio/*" : "video/*"}
                      onChange={(e) =>
                        setCourseUploadFile(e.target.files?.[0] ?? null)
                      }
                    />
                    <span className="course-edit-upload-icon" aria-hidden>
                      <CourseUploadIcon />
                    </span>
                    <span className="course-edit-upload-copy">
                      <strong>
                        {courseUploadFile
                          ? courseUploadFile.name
                          : locale === "sl"
                            ? "Povlecite datoteko sem ali kliknite za izbiro"
                            : "Drag a file here or click to choose"}
                      </strong>
                      <span>
                        {courseUploadFile
                          ? formatCourseUploadSize(courseUploadFile.size)
                          : courseForm.mediaType === "VIDEO"
                            ? locale === "sl"
                              ? "Podprti formati: MP4, MOV, WebM, AVI (največ 2 GB)"
                              : "Supported formats: MP4, MOV, WebM, AVI (max 2 GB)"
                            : locale === "sl"
                              ? "Podprti formati: MP3, WAV, M4A, AAC"
                              : "Supported formats: MP3, WAV, M4A, AAC"}
                      </span>
                    </span>
                    <span className="course-edit-upload-button">
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M12 3v12" />
                        <path d="m7 8 5-5 5 5" />
                        <path d="M5 21h14" />
                      </svg>
                      {locale === "sl" ? "Izberi datoteko" : "Choose file"}
                    </span>
                  </label>
                  {existingCourseMediaLabel && (
                    <div className="course-edit-upload-note">
                      <strong>
                        {locale === "sl"
                          ? "Trenutna Bunny datoteka"
                          : "Current Bunny file"}
                        :
                      </strong>{" "}
                      {existingCourseMediaLabel}
                    </div>
                  )}
                  {courseUploadFile && (
                    <div className="course-edit-upload-note">
                      {courseForm.mediaType === "VIDEO"
                        ? locale === "sl"
                          ? "Video se bo naložil neposredno v Bunny Stream."
                          : "Video will upload directly to Bunny Stream."
                        : locale === "sl"
                          ? "Audio se naloži prek zaščitenega Calendra nalaganja."
                          : "Audio uploads through protected Calendra upload."}
                    </div>
                  )}
                  {editingCourseId &&
                    courseUploadFile &&
                    editingCourseHasMedia && (
                      <label className="course-edit-replace-media-option">
                        <input
                          type="checkbox"
                          checked={deleteOldCourseMediaOnReplace}
                          onChange={(e) =>
                            setDeleteOldCourseMediaOnReplace(e.target.checked)
                          }
                        />
                        <span>
                          {locale === "sl"
                            ? "Ob zamenjavi izbriši prejšnjo Bunny datoteko"
                            : "Delete previous Bunny file when replacing media"}
                        </span>
                      </label>
                    )}
                  {editingCourseId &&
                    courseUploadFile &&
                    editingCourseHasMedia &&
                    deleteOldCourseMediaOnReplace && (
                      <div className="course-edit-upload-note">
                        {locale === "sl"
                          ? "Stari audio/video bo odstranjen iz Bunny, zato ga ne bo treba brisati ročno."
                          : "The old audio/video will be removed from Bunny so you do not need to delete it manually."}
                      </div>
                    )}
                  {courseUploadProgress != null && (
                    <div
                      className="course-edit-upload-progress"
                      aria-label={locale === "sl" ? "Napredek nalaganja" : "Upload progress"}
                    >
                      <span
                        style={{
                          width: `${Math.max(
                            0,
                            Math.min(100, courseUploadProgress),
                          )}%`,
                        }}
                      />
                      <strong>
                        {Math.max(
                          0,
                          Math.min(100, courseUploadProgress),
                        ).toFixed(0)}%
                      </strong>
                    </div>
                  )}
                </div>

                <Field label={locale === "sl" ? "Opis" : "Description"}>
                  <span className="course-edit-textarea-wrap">
                    <textarea
                      rows={5}
                      maxLength={1000}
                      placeholder={
                        locale === "sl"
                          ? "Vnesite opis tečaja ..."
                          : "Enter course description ..."
                      }
                      value={courseForm.description}
                      onChange={(e) =>
                        setCourseForm((current) => ({
                          ...current,
                          description: e.target.value,
                        }))
                      }
                    />
                    <span className="course-edit-character-count">
                      {courseForm.description.length} / 1000
                    </span>
                  </span>
                </Field>
              </section>
            </form>
            <div className="booking-side-panel-footer session-type-config-modal-footer course-edit-modal-footer">
              <button
                form="cards-product-course-form"
                type="submit"
                className="gapp-primary-button course-edit-save-button"
                disabled={savingCourse || uploadingCourseId != null}
              >
                <GuestConfigSaveIcon />
                {savingCourse || uploadingCourseId != null
                  ? courseUploadProgress != null
                    ? `${locale === "sl" ? "Nalaganje" : "Uploading"} ${courseUploadProgress.toFixed(0)}%`
                    : locale === "sl"
                      ? "Shranjevanje…"
                      : "Saving…"
                  : editingCourseId
                    ? locale === "sl"
                      ? "Shrani spremembe"
                      : "Save changes"
                    : locale === "sl"
                      ? "Ustvari tečaj"
                      : "Create course"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
});
