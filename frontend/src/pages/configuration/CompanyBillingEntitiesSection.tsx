import { DesktopSelect } from "../../components/DesktopSelect";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../api";
import { useAuthenticatedUser } from "../../authUserContext";
import { useToast } from "../../components/Toast";

type LegalEntity = {
  id: number;
  name: string;
  address?: string | null;
  postalCode?: string | null;
  city?: string | null;
  country?: string | null;
  taxNumber?: string | null;
  vatId?: string | null;
  iban?: string | null;
  bic?: string | null;
  email?: string | null;
  telephone?: string | null;
  currency?: string | null;
  fiscalEnvironment?: string | null;
  softwareSupplierTaxNumber?: string | null;
  fiscalCadastralNumber?: string | null;
  fiscalBuildingNumber?: string | null;
  fiscalBuildingSectionNumber?: string | null;
  fiscalHouseNumber?: string | null;
  fiscalHouseNumberAdditional?: string | null;
  certificatePasswordConfigured: boolean;
  active: boolean;
  assignedToCurrentUnit: boolean;
  defaultForCurrentUnit: boolean;
};

type CertificateMeta = {
  uploaded: boolean;
  fileName?: string | null;
  uploadedAt?: string | null;
  expiresAt?: string | null;
};

type LocationOption = {
  id: number;
  name: string;
  active?: boolean;
  defaultLocation?: boolean;
  defaultLegalEntityId?: number | null;
};

type CompanyDraft = {
  name: string;
  address: string;
  postalCode: string;
  city: string;
  country: string;
  taxNumber: string;
  vatId: string;
  iban: string;
  bic: string;
  email: string;
  telephone: string;
  currency: string;
  fiscalEnvironment: string;
  softwareSupplierTaxNumber: string;
  fiscalCadastralNumber: string;
  fiscalBuildingNumber: string;
  fiscalBuildingSectionNumber: string;
  fiscalHouseNumber: string;
  fiscalHouseNumberAdditional: string;
  certificatePassword: string;
  active: boolean;
};

type CompanyBillingEntitiesSectionProps = {
  locale: "sl" | "en" | string;
  allowMultipleCompanies: boolean;
  fiscalEnabled: boolean;
  onChanged?: () => void | Promise<void>;
};

type DetailTab = "details" | "fiscal";
type EditSection = "details" | "fiscal";

const emptyDraft = (): CompanyDraft => ({
  name: "",
  address: "",
  postalCode: "",
  city: "",
  country: "SI",
  taxNumber: "",
  vatId: "",
  iban: "",
  bic: "",
  email: "",
  telephone: "",
  currency: "EUR",
  fiscalEnvironment: "TEST",
  softwareSupplierTaxNumber: "",
  fiscalCadastralNumber: "",
  fiscalBuildingNumber: "",
  fiscalBuildingSectionNumber: "",
  fiscalHouseNumber: "",
  fiscalHouseNumberAdditional: "",
  certificatePassword: "",
  active: true,
});

const toDraft = (company: LegalEntity): CompanyDraft => ({
  name: company.name ?? "",
  address: company.address ?? "",
  postalCode: company.postalCode ?? "",
  city: company.city ?? "",
  country: company.country ?? "SI",
  taxNumber: company.taxNumber ?? "",
  vatId: company.vatId ?? "",
  iban: company.iban ?? "",
  bic: company.bic ?? "",
  email: company.email ?? "",
  telephone: company.telephone ?? "",
  currency: company.currency ?? "EUR",
  fiscalEnvironment: company.fiscalEnvironment ?? "TEST",
  softwareSupplierTaxNumber: company.softwareSupplierTaxNumber ?? "",
  fiscalCadastralNumber: company.fiscalCadastralNumber ?? "",
  fiscalBuildingNumber: company.fiscalBuildingNumber ?? "",
  fiscalBuildingSectionNumber: company.fiscalBuildingSectionNumber ?? "",
  fiscalHouseNumber: company.fiscalHouseNumber ?? "",
  fiscalHouseNumberAdditional: company.fiscalHouseNumberAdditional ?? "",
  certificatePassword: "",
  active: company.active,
});

export function CompanyBillingEntitiesSection({
  locale,
  allowMultipleCompanies,
  fiscalEnabled,
  onChanged,
}: CompanyBillingEntitiesSectionProps) {
  const sl = locale === "sl";
  const { showToast } = useToast();
  const me = useAuthenticatedUser();
  const currentUnitId = me.activeUnitId ?? me.companyId ?? null;
  const [companies, setCompanies] = useState<LegalEntity[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedFiscalLocationId, setSelectedFiscalLocationId] =
    useState<number | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("details");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editSection, setEditSection] = useState<EditSection>("details");
  const [draft, setDraft] = useState<CompanyDraft>(emptyDraft());
  const [busy, setBusy] = useState(false);
  const [certificateMeta, setCertificateMeta] =
    useState<CertificateMeta | null>(null);
  const [certificateFile, setCertificateFile] = useState<File | null>(null);
  const [certificateBusy, setCertificateBusy] = useState(false);
  const [premiseBusy, setPremiseBusy] = useState(false);

  const selected = useMemo(
    () => companies.find((company) => company.id === selectedId) ?? null,
    [companies, selectedId],
  );
  const mappedFiscalLocations = useMemo(
    () =>
      locations.filter(
        (location) =>
          location.active !== false &&
          location.defaultLegalEntityId === selectedId,
      ),
    [locations, selectedId],
  );

  const load = useCallback(async () => {
    const [companyResponse, locationResponse] = await Promise.all([
      api.get("/billing/issuers"),
      fiscalEnabled
        ? api.get("/locations").catch(() => ({ data: [] }))
        : Promise.resolve({ data: [] }),
    ]);
    const next = (Array.isArray(companyResponse.data)
      ? companyResponse.data
      : []) as LegalEntity[];
    setCompanies(next);
    setLocations(
      (Array.isArray(locationResponse.data)
        ? locationResponse.data
        : []) as LocationOption[],
    );
    setSelectedId((current) =>
      current && next.some((company) => company.id === current)
        ? current
        : (next.find((company) => company.defaultForCurrentUnit)?.id ??
          next[0]?.id ??
          null),
    );
  }, [fiscalEnabled]);

  const loadAndNotify = async () => {
    await load();
    await onChanged?.();
  };

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setDetailTab("details");
    setEditingId(null);
    setCertificateFile(null);
  }, [selectedId]);

  useEffect(() => {
    if (!fiscalEnabled) {
      setDetailTab("details");
      if (editSection === "fiscal") setEditingId(null);
    }
  }, [editSection, fiscalEnabled]);

  useEffect(() => {
    setSelectedFiscalLocationId((current) => {
      if (
        current &&
        mappedFiscalLocations.some((location) => location.id === current)
      ) {
        return current;
      }
      return (
        mappedFiscalLocations.find((location) => location.defaultLocation)?.id ??
        mappedFiscalLocations[0]?.id ??
        null
      );
    });
  }, [mappedFiscalLocations]);

  useEffect(() => {
    if (!fiscalEnabled || !selected?.assignedToCurrentUnit) {
      setCertificateMeta(null);
      return;
    }
    let cancelled = false;
    api
      .get("/fiscal/certificate/meta", {
        params: { legalEntityId: selected.id },
      })
      .then(({ data }) => {
        if (!cancelled) {
          setCertificateMeta(data || { uploaded: false });
        }
      })
      .catch(() => {
        if (!cancelled) setCertificateMeta(null);
      });
    return () => {
      cancelled = true;
    };
  }, [fiscalEnabled, selected?.id, selected?.assignedToCurrentUnit]);

  const beginEdit = (section: EditSection, company?: LegalEntity) => {
    setEditSection(section);
    setEditingId(company?.id ?? -1);
    setDraft(company ? toDraft(company) : emptyDraft());
  };

  const saveCompany = async () => {
    if (!draft.name.trim()) {
      showToast(
        "error",
        sl ? "Vnesite naziv podjetja." : "Enter the company name.",
      );
      return;
    }
    setBusy(true);
    try {
      const payload = {
        ...draft,
        certificatePassword: draft.certificatePassword.trim() || null,
      };
      const response =
        editingId === -1
          ? await api.post("/billing/issuers", payload)
          : await api.put(`/billing/issuers/${editingId}`, payload);
      setEditingId(null);
      setSelectedId(response.data?.id ?? selectedId);
      await loadAndNotify();
      showToast(
        "success",
        sl ? "Podjetje je shranjeno." : "Company saved.",
      );
    } catch (error: any) {
      showToast(
        "error",
        error?.response?.data?.message ||
          (sl
            ? "Podjetja ni bilo mogoče shraniti."
            : "Could not save the company."),
      );
    } finally {
      setBusy(false);
    }
  };

  const deleteCompany = async (company: LegalEntity) => {
    const confirmed = window.confirm(
      sl
        ? `Ali želite izbrisati podjetje »${company.name}«? Podjetja, povezanega z lokacijo ali računom, ni mogoče izbrisati.`
        : `Delete “${company.name}”? A company linked to a location or invoice cannot be deleted.`,
    );
    if (!confirmed) return;
    setBusy(true);
    try {
      await api.delete(`/billing/issuers/${company.id}`);
      setSelectedId(null);
      await loadAndNotify();
      showToast(
        "success",
        sl ? "Podjetje je izbrisano." : "Company deleted.",
      );
    } catch (error: any) {
      showToast(
        "error",
        error?.response?.data?.message ||
          (sl
            ? "Podjetja ni mogoče izbrisati, ker je že v uporabi."
            : "The company cannot be deleted because it is already in use."),
      );
    } finally {
      setBusy(false);
    }
  };

  const makeMain = async (company: LegalEntity) => {
    setBusy(true);
    try {
      if (!currentUnitId) {
        throw new Error("No active operating unit.");
      }
      await api.post(`/billing/issuers/${company.id}/assignments`, {
        companyId: currentUnitId,
        defaultIssuer: true,
        active: true,
      });
      await loadAndNotify();
      showToast(
        "success",
        sl ? "Glavno podjetje je posodobljeno." : "Main company updated.",
      );
    } catch (error: any) {
      showToast(
        "error",
        error?.response?.data?.message ||
          (sl
            ? "Glavnega podjetja ni bilo mogoče spremeniti."
            : "Could not update the main company."),
      );
    } finally {
      setBusy(false);
    }
  };

  const uploadCertificate = async () => {
    if (!selected || !certificateFile || certificateBusy) return;
    setCertificateBusy(true);
    try {
      const formData = new FormData();
      formData.append("file", certificateFile);
      const { data } = await api.post("/fiscal/certificate", formData, {
        params: { legalEntityId: selected.id },
        headers: { "Content-Type": "multipart/form-data" },
      });
      setCertificateMeta(data || { uploaded: true });
      setCertificateFile(null);
      showToast(
        "success",
        sl ? "Fiskalno potrdilo je naloženo." : "Fiscal certificate uploaded.",
      );
    } catch (error: any) {
      showToast(
        "error",
        error?.response?.data?.message ||
          (sl
            ? "Potrdila ni bilo mogoče naložiti."
            : "Could not upload the certificate."),
      );
    } finally {
      setCertificateBusy(false);
    }
  };

  const removeCertificate = async () => {
    if (!selected || certificateBusy) return;
    setCertificateBusy(true);
    try {
      await api.delete("/fiscal/certificate", {
        params: { legalEntityId: selected.id },
      });
      setCertificateMeta({ uploaded: false });
      setCertificateFile(null);
      showToast(
        "success",
        sl ? "Fiskalno potrdilo je odstranjeno." : "Fiscal certificate removed.",
      );
    } catch (error: any) {
      showToast(
        "error",
        error?.response?.data?.message ||
          (sl
            ? "Potrdila ni bilo mogoče odstraniti."
            : "Could not remove the certificate."),
      );
    } finally {
      setCertificateBusy(false);
    }
  };

  const registerPremise = async () => {
    if (!selected || !selectedFiscalLocationId || premiseBusy) return;
    setPremiseBusy(true);
    try {
      await api.post("/fiscal/premises/register", null, {
        params: {
          legalEntityId: selected.id,
          locationId: selectedFiscalLocationId,
        },
      });
      showToast(
        "success",
        sl
          ? "Poslovni prostor je bil uspešno poslan v registracijo."
          : "The business premise was submitted for registration.",
      );
    } catch (error: any) {
      showToast(
        "error",
        error?.response?.data?.message ||
          error?.response?.data?.error ||
          (sl
            ? "Poslovnega prostora ni bilo mogoče registrirati. Preverite povezano lokacijo in davčne nastavitve."
            : "Could not register the business premise. Check the linked location and fiscal settings."),
      );
    } finally {
      setPremiseBusy(false);
    }
  };

  const detailFields: Array<[keyof CompanyDraft, string]> = [
    ["name", sl ? "Naziv podjetja" : "Company name"],
    ["vatId", sl ? "ID za DDV" : "VAT ID"],
    ["taxNumber", sl ? "Davčna številka" : "Tax number"],
    ["iban", "IBAN / TRR"],
    ["bic", "BIC"],
    ["email", sl ? "E-pošta" : "Email"],
    ["telephone", sl ? "Telefon" : "Phone"],
    ["address", sl ? "Naslov" : "Address"],
    ["postalCode", sl ? "Poštna številka" : "Postal code"],
    ["city", sl ? "Mesto" : "City"],
    ["country", sl ? "Država" : "Country"],
    ["currency", sl ? "Valuta" : "Currency"],
  ];

  const fiscalFields: Array<[keyof CompanyDraft, string]> = [
    ["taxNumber", sl ? "Davčna številka za potrjevanje" : "Fiscal tax number"],
    ["vatId", sl ? "ID za DDV" : "VAT ID"],
    [
      "softwareSupplierTaxNumber",
      sl
        ? "Davčna št. dobavitelja programske opreme"
        : "Software supplier tax number",
    ],
    ["fiscalCadastralNumber", sl ? "Katastrska občina" : "Cadastral number"],
    ["fiscalBuildingNumber", sl ? "Številka stavbe" : "Building number"],
    [
      "fiscalBuildingSectionNumber",
      sl ? "Številka dela stavbe" : "Building section number",
    ],
    ["fiscalHouseNumber", sl ? "Hišna številka" : "House number"],
    [
      "fiscalHouseNumberAdditional",
      sl ? "Dodatek hišne številke" : "House number suffix",
    ],
    [
      "certificatePassword",
      sl
        ? "Geslo certifikata (prazno = brez spremembe)"
        : "Certificate password (blank = unchanged)",
    ],
  ];

  const canAdd = allowMultipleCompanies || companies.length === 0;

  return (
    <div className="company-billing-entities">
      <style>{`
        .company-billing-entities{display:grid;gap:16px}
        .company-billing-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
        .company-billing-heading h3,.company-billing-detail h3,.company-billing-detail h4{margin:0}
        .company-billing-heading p,.company-billing-detail p{margin:5px 0 0}
        .company-billing-grid{display:grid;grid-template-columns:minmax(230px,.78fr) minmax(0,1.55fr);gap:14px}
        .company-billing-list,.company-billing-detail,.company-billing-editor{border:1px solid #e1e9f3;border-radius:16px;background:#fff;padding:15px}
        .company-billing-item{width:100%;display:flex;align-items:center;justify-content:space-between;gap:10px;text-align:left;border:1px solid transparent;background:#f7f9fc;border-radius:12px;padding:12px;margin-bottom:8px;color:inherit}
        .company-billing-item.active{border-color:#7cbcf0;background:#eef7ff}
        .company-billing-badges{display:flex;flex-wrap:wrap;gap:6px;margin-top:7px}
        .company-billing-badge{font-size:12px;padding:3px 8px;border-radius:999px;background:#eaf1f8}
        .company-billing-badge.primary{background:#dff3e8;color:#14633b}
        .company-billing-toolbar{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
        .company-billing-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap}
        .company-billing-tabs{display:flex;gap:7px;margin:16px 0 12px;border-bottom:1px solid #e5edf6}
        .company-billing-tab{border:0;background:transparent;padding:9px 10px;border-bottom:2px solid transparent;color:#5f6f86}
        .company-billing-tab.active{border-bottom-color:#2563eb;color:#0f1b3d;font-weight:700}
        .company-billing-summary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
        .company-billing-summary>div{border:1px solid #e4ebf3;border-radius:12px;background:#f9fbfd;padding:11px}
        .company-billing-summary small{display:block;color:#64748b;margin-bottom:4px}
        .company-billing-fiscal-note{padding:11px 12px;border:1px solid #cfe0ff;border-radius:12px;background:#f2f7ff;color:#3468ad;font-size:13px;line-height:1.45}
        .company-billing-certificate{display:flex;justify-content:space-between;align-items:center;gap:14px;margin-top:12px;padding:13px;border:1px solid #dfe8f2;border-radius:14px;background:#f8fbfe}
        .company-billing-certificate-actions{display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:8px}
        .company-billing-certificate-actions input{max-width:250px}
        .company-billing-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:13px}
        .company-billing-fields label{display:grid;gap:6px;font-size:13px}
        .company-billing-fields input,.company-billing-fields select{min-height:40px;border:1px solid #ccd7e5;border-radius:10px;padding:8px 10px}
        .company-billing-fields .wide{grid-column:1/-1}
        .company-billing-editor-actions{display:flex;justify-content:flex-end;gap:9px;margin-top:14px}
        .company-billing-entities .danger{color:#a12b2b;border-color:#fecaca;background:#fff7f7}
        @media(max-width: 1024px){.company-billing-grid{grid-template-columns:1fr}.company-billing-heading,.company-billing-toolbar,.company-billing-certificate{align-items:flex-start;flex-direction:column}.company-billing-actions,.company-billing-certificate-actions{justify-content:flex-start}.company-billing-summary,.company-billing-fields{grid-template-columns:1fr}.company-billing-fields .wide{grid-column:auto}}
      `}</style>

      <div className="company-billing-heading">
        <div>
          <h3>{sl ? "Podjetja za izdajo računov" : "Companies used for invoicing"}</h3>
          <p className="muted">
            {sl
              ? "Vsako podjetje lahko povežete z eno ali več lokacijami. Račun uporabi podjetje, povezano z izbrano lokacijo."
              : "Each company can be linked to one or more locations. An invoice uses the company linked to the selected location."}
          </p>
        </div>
        {canAdd ? (
          <button
            type="button"
            className="billing-primary-button"
            disabled={busy}
            onClick={() => beginEdit("details")}
          >
            {sl ? "+ Novo podjetje" : "+ New company"}
          </button>
        ) : null}
      </div>

      <div className="company-billing-grid">
        <div className="company-billing-list">
          {companies.map((company) => (
            <button
              type="button"
              key={company.id}
              className={`company-billing-item${company.id === selectedId ? " active" : ""}`}
              onClick={() => setSelectedId(company.id)}
            >
              <span>
                <strong>{company.name}</strong>
                <span className="company-billing-badges">
                  {company.defaultForCurrentUnit ? (
                    <span className="company-billing-badge primary">
                      {sl ? "Glavno" : "Main"}
                    </span>
                  ) : null}
                  {!company.active ? (
                    <span className="company-billing-badge">
                      {sl ? "Neaktivno" : "Inactive"}
                    </span>
                  ) : null}
                </span>
              </span>
              <span aria-hidden>›</span>
            </button>
          ))}
          {companies.length === 0 ? (
            <p className="muted">
              {sl ? "Dodano ni še nobeno podjetje." : "No companies have been added yet."}
            </p>
          ) : null}
        </div>

        <div className="company-billing-detail">
          {selected ? (
            <>
              <div className="company-billing-toolbar">
                <div>
                  <h3>{selected.name}</h3>
                  <p className="muted">
                    {[selected.address, selected.postalCode, selected.city]
                      .filter(Boolean)
                      .join(", ") || "—"}
                  </p>
                </div>
                <div className="company-billing-actions">
                  {detailTab === "details" ? (
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => beginEdit("details", selected)}
                    >
                      {sl ? "Uredi" : "Edit"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => beginEdit("fiscal", selected)}
                    >
                      {sl ? "Uredi davčne nastavitve" : "Edit fiscal settings"}
                    </button>
                  )}
                  {!selected.defaultForCurrentUnit && selected.active ? (
                    <button
                      type="button"
                      className="billing-primary-button"
                      disabled={busy}
                      onClick={() => void makeMain(selected)}
                    >
                      {sl ? "Nastavi kot glavno" : "Make main"}
                    </button>
                  ) : null}
                  {!selected.defaultForCurrentUnit ? (
                    <button
                      type="button"
                      className="secondary danger"
                      disabled={busy}
                      onClick={() => void deleteCompany(selected)}
                    >
                      {sl ? "Izbriši" : "Delete"}
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="company-billing-tabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={detailTab === "details"}
                  className={`company-billing-tab${detailTab === "details" ? " active" : ""}`}
                  onClick={() => setDetailTab("details")}
                >
                  {sl ? "Podatki podjetja" : "Company details"}
                </button>
                {fiscalEnabled ? (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={detailTab === "fiscal"}
                    className={`company-billing-tab${detailTab === "fiscal" ? " active" : ""}`}
                    onClick={() => setDetailTab("fiscal")}
                  >
                    {sl ? "Davčno potrjevanje" : "Fiscalization"}
                  </button>
                ) : null}
              </div>

              {detailTab === "details" ? (
                <div className="company-billing-summary">
                  <div>
                    <small>{sl ? "Davčna številka" : "Tax number"}</small>
                    <strong>{selected.vatId || selected.taxNumber || "—"}</strong>
                  </div>
                  <div>
                    <small>IBAN / TRR</small>
                    <strong>{selected.iban || "—"}</strong>
                  </div>
                  <div>
                    <small>{sl ? "Kontakt" : "Contact"}</small>
                    <strong>{selected.email || selected.telephone || "—"}</strong>
                  </div>
                  <div>
                    <small>{sl ? "Valuta" : "Currency"}</small>
                    <strong>{selected.currency || "EUR"}</strong>
                  </div>
                </div>
              ) : (
                <>
                  <div className="company-billing-summary">
                    <div>
                      <small>{sl ? "Okolje" : "Environment"}</small>
                      <strong>{selected.fiscalEnvironment || "TEST"}</strong>
                    </div>
                    <div>
                      <small>{sl ? "Davčna številka" : "Tax number"}</small>
                      <strong>{selected.taxNumber || selected.vatId || "—"}</strong>
                    </div>
                    <div>
                      <small>
                        {sl
                          ? "Dobavitelj programske opreme"
                          : "Software supplier tax number"}
                      </small>
                      <strong>{selected.softwareSupplierTaxNumber || "—"}</strong>
                    </div>
                    <div>
                      <small>{sl ? "Geslo certifikata" : "Certificate password"}</small>
                      <strong>
                        {selected.certificatePasswordConfigured
                          ? sl
                            ? "Nastavljeno"
                            : "Configured"
                          : sl
                            ? "Ni nastavljeno"
                            : "Not configured"}
                      </strong>
                    </div>
                  </div>
                  <p className="company-billing-fiscal-note">
                    {sl
                      ? "Oznaka poslovnega prostora, elektronska naprava in številčenje se določijo pri posamezni lokaciji v zavihku Poslovne enote."
                      : "The business-premise code, electronic device and numbering are configured per location in Business units."}
                  </p>
                  {certificateMeta !== null ? (
                    <div className="company-billing-certificate">
                      <div>
                        <h4>{sl ? "Fiskalno potrdilo" : "Fiscal certificate"}</h4>
                        <p className="muted">
                          {certificateMeta.uploaded
                            ? `${certificateMeta.fileName || (sl ? "Potrdilo" : "Certificate")}${
                                certificateMeta.expiresAt
                                  ? ` · ${sl ? "velja do" : "expires"} ${certificateMeta.expiresAt}`
                                  : ""
                              }`
                            : sl
                              ? "Za to podjetje potrdilo še ni naloženo."
                              : "No certificate is uploaded for this company."}
                        </p>
                      </div>
                      <div className="company-billing-certificate-actions">
                        <input
                          type="file"
                          accept=".p12,.pfx,application/x-pkcs12"
                          onChange={(event) =>
                            setCertificateFile(event.target.files?.[0] ?? null)
                          }
                        />
                        <button
                          type="button"
                          className="secondary"
                          disabled={!certificateFile || certificateBusy}
                          onClick={() => void uploadCertificate()}
                        >
                          {certificateBusy
                            ? sl
                              ? "Shranjevanje…"
                              : "Saving…"
                            : sl
                              ? "Naloži"
                              : "Upload"}
                        </button>
                        {certificateMeta.uploaded ? (
                          <button
                            type="button"
                            className="secondary danger"
                            disabled={certificateBusy}
                            onClick={() => void removeCertificate()}
                          >
                            {sl ? "Odstrani" : "Remove"}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                  <div className="company-billing-fields" style={{ marginTop: 12 }}>
                    <label className="wide">
                      <span>
                        {sl
                          ? "Lokacija / poslovni prostor"
                          : "Location / business premise"}
                      </span>
                      <DesktopSelect
                        value={selectedFiscalLocationId ?? ""}
                        onChange={(event) =>
                          setSelectedFiscalLocationId(
                            event.target.value
                              ? Number(event.target.value)
                              : null,
                          )
                        }
                      >
                        {mappedFiscalLocations.length === 0 ? (
                          <option value="">
                            {sl
                              ? "Najprej povežite lokacijo s tem podjetjem"
                              : "Link a location to this company first"}
                          </option>
                        ) : null}
                        {mappedFiscalLocations.map((location) => (
                          <option key={location.id} value={location.id}>
                            {location.name}
                            {location.defaultLocation
                              ? sl
                                ? " (glavna)"
                                : " (default)"
                              : ""}
                          </option>
                        ))}
                      </DesktopSelect>
                    </label>
                  </div>
                  <div className="company-billing-actions" style={{ marginTop: 12 }}>
                    <button
                      type="button"
                      className="secondary"
                      disabled={premiseBusy || !selectedFiscalLocationId}
                      onClick={() => void registerPremise()}
                    >
                      {premiseBusy
                        ? sl
                          ? "Registracija…"
                          : "Registering…"
                        : sl
                          ? "Registriraj poslovni prostor"
                          : "Register business premise"}
                    </button>
                  </div>
                </>
              )}
            </>
          ) : (
            <p className="muted">
              {sl ? "Izberite podjetje." : "Select a company."}
            </p>
          )}
        </div>
      </div>

      {editingId !== null ? (
        <div className="company-billing-editor">
          <div className="company-billing-toolbar">
            <div>
              <h3>
                {editingId === -1
                  ? sl
                    ? "Novo podjetje"
                    : "New company"
                  : editSection === "fiscal"
                    ? sl
                      ? `Davčno potrjevanje – ${selected?.name ?? ""}`
                      : `Fiscalization – ${selected?.name ?? ""}`
                    : sl
                      ? "Uredi podjetje"
                      : "Edit company"}
              </h3>
              {editSection === "fiscal" ? (
                <p className="muted">
                  {sl
                    ? "Nastavitve in certifikat so vezani samo na izbrano podjetje."
                    : "These settings and the certificate apply only to the selected company."}
                </p>
              ) : null}
            </div>
          </div>
          <div className="company-billing-fields">
            {(editSection === "details" ? detailFields : fiscalFields).map(
              ([key, label]) => (
                <label
                  key={key}
                  className={key === "address" ? "wide" : ""}
                >
                  <span>{label}</span>
                  <input
                    type={key === "certificatePassword" ? "password" : "text"}
                    value={String(draft[key] ?? "")}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        [key]: event.target.value,
                      })
                    }
                  />
                </label>
              ),
            )}
            {editSection === "fiscal" ? (
              <label>
                <span>{sl ? "Fiskalno okolje" : "Fiscal environment"}</span>
                <DesktopSelect
                  value={draft.fiscalEnvironment}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      fiscalEnvironment: event.target.value,
                    })
                  }
                >
                  <option value="TEST">TEST</option>
                  <option value="PROD">PROD</option>
                </DesktopSelect>
              </label>
            ) : (
              <label>
                <span>{sl ? "Aktivno" : "Active"}</span>
                <input
                  type="checkbox"
                  checked={draft.active}
                  onChange={(event) =>
                    setDraft({ ...draft, active: event.target.checked })
                  }
                />
              </label>
            )}
          </div>
          <div className="company-billing-editor-actions">
            <button
              type="button"
              className="secondary"
              onClick={() => setEditingId(null)}
            >
              {sl ? "Prekliči" : "Cancel"}
            </button>
            <button
              type="button"
              className="billing-primary-button"
              disabled={busy}
              onClick={() => void saveCompany()}
            >
              {busy ? (sl ? "Shranjevanje…" : "Saving…") : sl ? "Shrani" : "Save"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
