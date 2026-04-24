import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import axios from 'axios'
import { api } from '../api'
import { clearAuthStoragePreservingTheme } from '../theme'

const adminConsoleStyles = `:root {
      --bg-1:#f7faff; --bg-2:#edf3ff; --panel:rgba(255,255,255,.78); --panel-strong:#fff;
      --border:#dfe7f5; --text:#17253d; --muted:#70809b; --primary:#2f6df6; --primary-dark:#1f56d7;
      --primary-soft:#eaf1ff; --success-soft:#eafaf0; --success-text:#1f8b4c; --warning-soft:#fff4d7;
      --warning-text:#8a6200; --danger-soft:#fff0ef; --danger-text:#bf4a41; --purple-soft:#f0edff;
      --purple-text:#635bff; --shadow:0 18px 45px rgba(34,78,160,.12); --shadow-soft:0 12px 28px rgba(47,109,246,.1);
      --radius-xl:30px; --radius-lg:22px; --radius-md:16px; --transition:180ms ease; --maxw:1480px;
    }
    *{box-sizing:border-box} html,body{margin:0;padding:0;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--text);background:radial-gradient(circle at 14% 18%,rgba(79,130,255,.11),transparent 24%),radial-gradient(circle at 82% 60%,rgba(79,130,255,.10),transparent 22%),linear-gradient(180deg,var(--bg-1),var(--bg-2));min-height:100vh} body{padding:28px}
    .app-shell{max-width:var(--maxw);margin:0 auto;background:rgba(255,255,255,.55);border:1px solid rgba(223,231,245,.92);backdrop-filter:blur(14px);border-radius:32px;box-shadow:var(--shadow);overflow:hidden}
    .topbar{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:22px 28px;border-bottom:1px solid rgba(223,231,245,.72);background:rgba(255,255,255,.35)}
    .brand{display:flex;align-items:center;gap:14px;min-width:0}.brand-logo{width:44px;height:44px;display:grid;place-items:center;border-radius:16px;background:linear-gradient(135deg,var(--primary),var(--primary-dark));color:#fff;font-weight:950;box-shadow:0 10px 24px rgba(47,109,246,.22)}
    .brand-copy{display:grid;gap:2px}.brand-copy strong{font-size:1.08rem;letter-spacing:-.03em}.brand-copy span{color:var(--muted);font-weight:700;font-size:.9rem}
    .top-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.pill{display:inline-flex;align-items:center;gap:8px;padding:9px 12px;border-radius:999px;border:1px solid var(--border);background:#fff;color:var(--muted);font-size:.88rem;font-weight:900}.pill.primary{background:var(--primary-soft);color:var(--primary);border-color:#cddcff}.pill.success{background:var(--success-soft);color:var(--success-text);border-color:#cfead8}.pill.warning{background:var(--warning-soft);color:var(--warning-text);border-color:#f2dda0}.pill.danger{background:var(--danger-soft);color:var(--danger-text);border-color:#f4c8c3}.pill.purple{background:var(--purple-soft);color:var(--purple-text);border-color:#dcd7ff}
    .content{padding:28px}.hero{display:grid;grid-template-columns:minmax(320px,.8fr) minmax(620px,1.2fr);gap:22px;align-items:start}.panel{background:var(--panel);border:1px solid rgba(223,231,245,.95);border-radius:var(--radius-xl);backdrop-filter:blur(10px);box-shadow:0 10px 28px rgba(58,89,150,.06)}.panel-pad{padding:24px}.page-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:22px;flex-wrap:wrap}.page-head.platform-admin-head{flex-direction:column;align-items:stretch;gap:16px}.page-title{display:grid;gap:8px}.eyebrow{display:inline-flex;align-self:start;padding:8px 12px;border-radius:999px;background:var(--primary-soft);color:var(--primary);font-size:.86rem;font-weight:950}.page-title h1{margin:0;font-size:clamp(2rem,3vw,3.25rem);line-height:.96;letter-spacing:-.065em}.page-title p{margin:0;max-width:820px;color:var(--muted);line-height:1.55}.search-wrap{display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap;flex-direction:column}.search-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;width:100%}.search-input{height:44px;min-width:0;flex:1 1 280px;border:1px solid var(--border);border-radius:999px;padding:0 16px;background:rgba(255,255,255,.92);outline:none;color:var(--text);font-weight:700}.search-input:disabled{opacity:.55;cursor:not-allowed}.button{border:0;border-radius:15px;padding:13px 16px;font-weight:950;cursor:pointer;transition:transform var(--transition),filter var(--transition),box-shadow var(--transition)}.button:hover{transform:translateY(-1px)}.button.primary{background:linear-gradient(90deg,var(--primary),var(--primary-dark));color:#fff;box-shadow:0 12px 28px rgba(47,109,246,.18)}.button.secondary{background:#fff;color:var(--text);border:1px solid var(--border)}.button.danger{background:var(--danger-soft);color:var(--danger-text);border:1px solid #f4c8c3}.button.small{padding:9px 12px;border-radius:12px;font-size:.85rem}.button:disabled{opacity:.55;cursor:not-allowed;transform:none}
    .tenant-card{display:grid;gap:18px;position:sticky;top:24px}.tenant-head{display:grid;gap:12px}.tenant-avatar{width:64px;height:64px;border-radius:22px;background:linear-gradient(135deg,#fff,var(--primary-soft));border:1px solid #d6e3fb;display:grid;place-items:center;color:var(--primary);font-weight:950;font-size:1.35rem}.tenant-title{display:grid;gap:4px}.tenant-title h2{margin:0;font-size:1.65rem;letter-spacing:-.05em}.tenant-title span{color:var(--muted);font-size:.92rem;font-weight:750;word-break:break-word}.status-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.stat{padding:14px;border-radius:18px;background:rgba(255,255,255,.82);border:1px solid #e5edf9;display:grid;gap:4px}.stat strong{font-size:.78rem;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)}.stat span{font-size:1rem;font-weight:950;color:var(--text);word-break:break-word}.progress{height:9px;background:#e8eef9;border-radius:999px;overflow:hidden}.progress > div{height:100%;background:linear-gradient(90deg,var(--primary),var(--primary-dark));border-radius:999px}.nav-list{display:grid;gap:8px}.nav-item{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:12px 14px;border-radius:16px;border:1px solid #e6edf9;background:rgba(255,255,255,.72);color:#40506c;font-weight:900;cursor:pointer}.nav-item.active{background:var(--primary-soft);border-color:#cddcff;color:var(--primary)}
    .main-grid{display:grid;gap:18px}.kpi-row{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}.kpi{padding:18px;border-radius:22px;border:1px solid #dbe6f7;background:linear-gradient(180deg,rgba(255,255,255,.98),rgba(239,245,255,.94));box-shadow:0 12px 26px rgba(47,109,246,.08);display:grid;gap:7px}.kpi span{color:var(--muted);font-size:.82rem;font-weight:900;text-transform:uppercase;letter-spacing:.05em}.kpi strong{font-size:1.55rem;letter-spacing:-.05em}.kpi small{color:var(--muted);font-weight:700;line-height:1.35}
    .section-card{border-radius:24px;border:1px solid #dbe6f7;background:linear-gradient(180deg,rgba(255,255,255,.98),rgba(239,245,255,.94));box-shadow:0 16px 34px rgba(47,109,246,.10);padding:18px;display:grid;gap:16px}.section-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap}.section-title{display:grid;gap:4px}.section-title strong{font-size:1.05rem;letter-spacing:-.03em}.section-title span{color:var(--muted);font-size:.9rem;line-height:1.45}.field-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.field-card{padding:14px;border-radius:18px;background:rgba(255,255,255,.9);border:1px solid #e6edf9;display:grid;gap:9px}.field-top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.field-label{display:grid;gap:3px}.field-label strong{font-size:.82rem;color:var(--muted);text-transform:uppercase;letter-spacing:.045em}.field-label span{font-weight:950;color:var(--text);line-height:1.3;word-break:break-word}.muted{color:var(--muted)}.empty-hint{padding:22px;border-radius:18px;border:1px dashed #dbe6f7;color:var(--muted);line-height:1.5}
    .search-wrap.tenant-list-wrap{width:100%;max-width:100%}.search-hits{list-style:none;margin:6px 0 0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;width:100%;max-width:100%}.search-hits > li{display:flex;min-width:0}.search-hit{padding:12px 14px;border-radius:16px;border:1px solid var(--border);background:#fff;cursor:pointer;text-align:left;font:inherit;width:100%;min-height:100%;display:grid;align-content:start;gap:4px}.search-hit:hover{border-color:#cddcff;background:var(--primary-soft)}.search-hit strong{display:block;font-size:.95rem;color:var(--text)}.search-hit .sub{font-size:.84rem;color:var(--muted);margin-top:2px}.search-err{color:var(--danger-text);font-size:.9rem;font-weight:800;margin:4px 0 0}
    .modal-backdrop{position:fixed;inset:0;background:rgba(23,37,61,.38);display:none;place-items:center;padding:20px;z-index:10}.modal-backdrop.visible{display:grid}.modal{max-width:560px;width:100%;border-radius:26px;background:#fff;border:1px solid #dfe7f5;box-shadow:0 28px 80px rgba(23,37,61,.28);padding:22px;display:grid;gap:16px}.modal h3{margin:0;font-size:1.55rem;letter-spacing:-.045em}.modal p{margin:0;color:var(--muted);line-height:1.5}.modal-actions{display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap}.select-row{display:grid;gap:8px}.select-row label{font-weight:900;color:#2a3a56}.select-row select,.select-row textarea{width:100%;border:1px solid var(--border);border-radius:15px;background:#fff;color:var(--text);padding:12px 14px;font:inherit;outline:none}.select-row textarea{min-height:90px;resize:vertical}
    @media(max-width:1180px){.hero{grid-template-columns:1fr}.tenant-card{position:static}.kpi-row{grid-template-columns:repeat(2,minmax(0,1fr))}.field-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:720px){body{padding:16px}.topbar,.content{padding-left:16px;padding-right:16px}.page-head{display:grid}.search-input{min-width:0;width:100%}.kpi-row,.field-grid,.status-grid{grid-template-columns:1fr}.app-shell,.panel{border-radius:24px}}`

type TenancySearchHit = {
  id: number
  tenantCode: string
  companyName: string
  contactEmail: string
  packageType: string
  subscriptionInterval: string
  signupCompletionSummary: string
}

/** Matches `PlatformAdminController.TenancyRow` JSON. */
type TenancyRow = {
  id: number
  tenantCode: string
  name: string
}

type TenancyDetails = TenancySearchHit & {
  contactName: string
  contactPhone: string
  createdAt: string
  subscriptionStart: string
  subscriptionEnd: string
  usersCreated: number
  usersPaidTotal: number | null
  spacesCreated: number
  spacesTotal: number | null
  smsSent: number
  smsQuota: number | null
  dueAmount: string
  ownerPasswordSetupPending: boolean
  vatId: string
  stripeCustomerIdPreview: string
}

const modalContent: Record<string, [string, string, string[]]> = {
  plan: [
    'Change plan',
    'User downgrades during annual validity are scheduled for renewal. Admin can override immediately with reason.',
    ['Upgrade immediately', 'Schedule downgrade at renewal', 'Admin override immediately'],
  ],
  price: [
    'Price override',
    'Only admin can change price or apply custom discount. Store previous and new value in audit log.',
    ['Apply custom price', 'Apply discount', 'Remove override'],
  ],
  suspend: [
    'Suspend tenant',
    'Suspension is admin-only. Access is blocked while billing and history remain preserved.',
    ['Suspend immediately', 'Schedule suspension', 'Cancel suspension'],
  ],
  addon: [
    'Manage add-ons',
    'Annual add-on removals are scheduled for renewal unless admin overrides with reason.',
    ['Add immediately', 'Schedule removal at renewal', 'Admin override removal now'],
  ],
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function formatInterval(raw: string): string {
  const u = raw.trim().toUpperCase()
  if (u === 'YEARLY' || u === 'ANNUAL') return 'Annual'
  if (u === 'MONTHLY') return 'Monthly'
  return raw || '—'
}

function formatPlan(pkg: string): string {
  const u = pkg.trim().toUpperCase()
  const map: Record<string, string> = {
    TRIAL: 'Trial',
    BASIC: 'Basic',
    PROFESSIONAL: 'Professional',
    PREMIUM: 'Premium',
    CUSTOM: 'Custom',
  }
  return map[u] ?? pkg
}

function progressWidth(d: TenancyDetails | null): number {
  if (!d) return 0
  if (d.ownerPasswordSetupPending) return 45
  if (!d.vatId?.trim()) return 78
  return 100
}

function tenancyRowToSearchHit(row: TenancyRow): TenancySearchHit {
  return {
    id: row.id,
    tenantCode: row.tenantCode ?? '',
    companyName: row.name ?? '',
    contactEmail: '',
    packageType: '—',
    subscriptionInterval: '—',
    signupCompletionSummary: 'Click to load plan, billing, and signup status',
  }
}

function isPlaceholderHit(h: TenancySearchHit): boolean {
  return h.packageType === '—' && h.subscriptionInterval === '—' && h.contactEmail === ''
}

export function PlatformAdminPage() {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [searchInput, setSearchInput] = useState('')
  const [hits, setHits] = useState<TenancySearchHit[]>([])
  const [selected, setSelected] = useState<TenancyDetails | null>(null)
  const [listLoading, setListLoading] = useState(true)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [searchErr, setSearchErr] = useState<string | null>(null)
  const [activeNav, setActiveNav] = useState('overview')

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout')
    } catch {
      // ignore
    }
    clearAuthStoragePreservingTheme()
    window.location.replace('/login')
  }, [])

  const loadTenanciesList = useCallback(async () => {
    setSearchErr(null)
    setListLoading(true)
    setHits([])
    try {
      const { data } = await api.get<TenancyRow[]>('/platform-admin/tenancies')
      const rows = Array.isArray(data) ? data : []
      setHits(rows.map(tenancyRowToSearchHit))
      if (!rows.length) {
        setSearchErr('No tenancies found in this environment.')
      }
    } catch (e) {
      if (axios.isAxiosError(e) && e.response?.status === 403) {
        setSearchErr('You need a super-admin session to list tenants.')
      } else {
        setSearchErr('Could not load the tenant list.')
      }
    } finally {
      setListLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadTenanciesList()
  }, [loadTenanciesList])

  const visibleHits = useMemo(() => {
    const n = searchInput.trim().toLowerCase()
    if (!n) return hits
    return hits.filter(
      (h) =>
        h.companyName.toLowerCase().includes(n) ||
        h.tenantCode.toLowerCase().includes(n) ||
        (h.contactEmail && h.contactEmail.toLowerCase().includes(n)),
    )
  }, [hits, searchInput])

  const loadDetail = useCallback(async (id: number) => {
    setLoadingDetail(true)
    setSearchErr(null)
    try {
      const { data } = await api.get<TenancyDetails>(`/platform-admin/tenancies/${id}`)
      setSelected(data)
    } catch {
      setSearchErr('Could not load tenant details.')
      setSelected(null)
    } finally {
      setLoadingDetail(false)
    }
  }, [])

  const onPickHit = useCallback(
    (h: TenancySearchHit) => {
      void loadDetail(h.id)
    },
    [loadDetail],
  )

  const openModal = useCallback((kind: string) => {
    const root = rootRef.current
    const modal = root?.querySelector<HTMLElement>('#modalBackdrop')
    const modalTitle = root?.querySelector<HTMLElement>('#modalTitle')
    const modalCopy = root?.querySelector<HTMLElement>('#modalCopy')
    const actionSelect = root?.querySelector<HTMLSelectElement>('#actionSelect')
    const reasonText = root?.querySelector<HTMLTextAreaElement>('#reasonText')
    const cfg = modalContent[kind] || modalContent.plan
    if (modalTitle) modalTitle.textContent = cfg[0]
    if (modalCopy) modalCopy.textContent = cfg[1]
    if (actionSelect) {
      actionSelect.innerHTML = cfg[2].map((value) => `<option>${value}</option>`).join('')
    }
    if (reasonText) reasonText.value = ''
    modal?.classList.add('visible')
    modal?.setAttribute('aria-hidden', 'false')
  }, [])

  const closeModal = useCallback(() => {
    const root = rootRef.current
    const modal = root?.querySelector<HTMLElement>('#modalBackdrop')
    modal?.classList.remove('visible')
    modal?.setAttribute('aria-hidden', 'true')
  }, [])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return undefined

    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      if (!target) return

      if (target.closest('[data-admin-logout]')) {
        void logout()
        return
      }
      if (target.closest('[data-admin-export]')) {
        window.alert('Export is not wired yet for the live tenant list.')
        return
      }
      const navButton = target.closest<HTMLElement>('.nav-item')
      if (navButton?.dataset.target) {
        setActiveNav(navButton.dataset.target)
        root.querySelectorAll('.nav-item').forEach((item) => item.classList.remove('active'))
        navButton.classList.add('active')
        const section = root.querySelector<HTMLElement>(`#${navButton.dataset.target}`)
        section?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        return
      }
      const modalButton = target.closest<HTMLElement>('[data-open-modal]')
      if (modalButton?.dataset.openModal) {
        openModal(modalButton.dataset.openModal)
        return
      }
      if (target.closest('#closeModal')) {
        closeModal()
        return
      }
      if (target.closest('#confirmModal')) {
        window.alert('Prototype: action would be confirmed with audit log.')
        closeModal()
        return
      }
      const modal = root.querySelector('#modalBackdrop')
      if (modal && event.target === modal) {
        closeModal()
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeModal()
    }

    root.addEventListener('click', handleClick)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      root.removeEventListener('click', handleClick)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [logout, openModal, closeModal])

  const workspaceHint = useMemo(() => {
    if (!selected?.tenantCode) return '—'
    return `${selected.tenantCode}.calendra.si`
  }, [selected])

  const kpiUsers = selected
    ? `${selected.usersCreated}${selected.usersPaidTotal != null ? ` / ${selected.usersPaidTotal}` : ''} seats`
    : '—'
  const kpiSms = selected
    ? `${selected.smsSent}${selected.smsQuota != null ? ` / ${selected.smsQuota}` : ''} SMS`
    : '—'

  return (
    <>
      <style>{adminConsoleStyles}</style>
      <div ref={rootRef}>
        <div className="app-shell">
          <header className="topbar">
            <div className="brand">
              <div className="brand-logo">C</div>
              <div className="brand-copy">
                <strong>Calendra Admin Console</strong>
                <span>Tenant management, billing, subscription and audit control</span>
              </div>
            </div>
            <div className="top-actions">
              <span className="pill success">Live data</span>
              <span className="pill primary">Admin view</span>
              <button className="button secondary small" type="button" data-admin-export>
                Export
              </button>
              <button className="button secondary small" type="button" data-admin-logout>
                Logout
              </button>
            </div>
          </header>

          <main className="content">
            <div className="page-head platform-admin-head">
              <div className="page-title">
                <div className="eyebrow">Management overview</div>
                <h1>Tenant management</h1>
                <p>
                  All workspaces load automatically. Use the field below to narrow the list by name or tenant code, then
                  pick a card to load subscription and signup status on the left.
                </p>
              </div>
              <div className="search-wrap tenant-list-wrap">
                <div className="search-row">
                  <input
                    className="search-input"
                    type="search"
                    placeholder="Filter tenants by name or code…"
                    value={searchInput}
                    disabled={listLoading}
                    onChange={(e) => setSearchInput(e.target.value)}
                    aria-label="Filter tenant list"
                  />
                </div>
                {!listLoading && hits.length > 0 ? (
                  <p className="muted" style={{ margin: 0, fontSize: '0.88rem', fontWeight: 700 }}>
                    Showing {visibleHits.length} of {hits.length} tenant{hits.length === 1 ? '' : 's'}.
                  </p>
                ) : null}
                {listLoading ? <p className="muted">Loading tenants…</p> : null}
                {searchErr ? <p className="search-err">{searchErr}</p> : null}
                {!listLoading && hits.length > 0 && visibleHits.length === 0 ? (
                  <p className="muted">No tenants match this filter.</p>
                ) : null}
                {!listLoading && visibleHits.length > 0 ? (
                  <ul className="search-hits" aria-label="Tenant list">
                    {visibleHits.map((h) => (
                      <li key={h.id}>
                        <button type="button" className="search-hit" onClick={() => onPickHit(h)}>
                          <strong>{h.companyName}</strong>
                          <div className="sub">
                            {isPlaceholderHit(h)
                              ? h.tenantCode || '—'
                              : `${h.tenantCode} · ${h.contactEmail || '—'} · ${formatPlan(h.packageType)} · ${formatInterval(h.subscriptionInterval)}`}
                          </div>
                          <div className="sub">{h.signupCompletionSummary}</div>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>

            <section className="hero">
              <aside className="panel panel-pad tenant-card">
                {loadingDetail ? <p className="muted">Loading tenant…</p> : null}
                {!loadingDetail && !selected ? (
                  <p className="muted">Select a tenant from the list to see plan, billing interval, and signup status.</p>
                ) : null}
                {!loadingDetail && selected ? (
                  <>
                    <div className="tenant-head">
                      <div className="tenant-avatar">{initials(selected.companyName)}</div>
                      <div className="tenant-title">
                        <h2>{selected.companyName || '—'}</h2>
                        <span>
                          {selected.tenantCode || '—'} · {workspaceHint}
                        </span>
                      </div>
                      <div className="top-actions">
                        <span className="pill success">Active</span>
                        {selected.packageType?.toUpperCase() === 'TRIAL' ? (
                          <span className="pill purple">Trialing</span>
                        ) : null}
                        {selected.ownerPasswordSetupPending ? (
                          <span className="pill warning">Password pending</span>
                        ) : null}
                      </div>
                    </div>

                    <div className="status-grid">
                      <div className="stat">
                        <strong>Plan</strong>
                        <span>{formatPlan(selected.packageType)}</span>
                      </div>
                      <div className="stat">
                        <strong>Billing</strong>
                        <span>{formatInterval(selected.subscriptionInterval)}</span>
                      </div>
                      <div className="stat">
                        <strong>Due (sub)</strong>
                        <span>€{selected.dueAmount}</span>
                      </div>
                      <div className="stat">
                        <strong>Renewal</strong>
                        <span>{selected.subscriptionEnd?.trim() || '—'}</span>
                      </div>
                    </div>

                    <div>
                      <div className="field-top" style={{ marginBottom: 8 }}>
                        <strong>Signup status</strong>
                        <span className="muted">{selected.signupCompletionSummary}</span>
                      </div>
                      <div className="progress">
                        <div style={{ width: `${progressWidth(selected)}%` }} />
                      </div>
                    </div>

                    <nav className="nav-list" aria-label="Admin sections">
                      <button
                        type="button"
                        className={`nav-item${activeNav === 'overview' ? ' active' : ''}`}
                        data-target="overview"
                      >
                        Overview <span>›</span>
                      </button>
                      <button
                        type="button"
                        className={`nav-item${activeNav === 'subscription' ? ' active' : ''}`}
                        data-target="subscription"
                      >
                        Subscription & add-ons <span>›</span>
                      </button>
                      <button
                        type="button"
                        className={`nav-item${activeNav === 'billing' ? ' active' : ''}`}
                        data-target="billing"
                      >
                        Billing & payments <span>›</span>
                      </button>
                    </nav>

                    <div className="top-actions">
                      <button className="button primary small" type="button" data-open-modal="plan">
                        Change plan
                      </button>
                      <button className="button secondary small" type="button" data-open-modal="price">
                        Price override
                      </button>
                      <button className="button danger small" type="button" data-open-modal="suspend">
                        Suspend
                      </button>
                    </div>
                  </>
                ) : null}
              </aside>

              <section className="main-grid">
                <div className="kpi-row">
                  <div className="kpi">
                    <span>Subscription end</span>
                    <strong>{selected?.subscriptionEnd?.trim() || '—'}</strong>
                    <small>From billing settings on the tenant.</small>
                  </div>
                  <div className="kpi">
                    <span>Due amount</span>
                    <strong>{selected ? `€${selected.dueAmount}` : '—'}</strong>
                    <small>Outstanding subscription balance string.</small>
                  </div>
                  <div className="kpi">
                    <span>SMS usage</span>
                    <strong>{kpiSms}</strong>
                    <small>Sent vs configured signup SMS quota.</small>
                  </div>
                  <div className="kpi">
                    <span>Users</span>
                    <strong>{kpiUsers}</strong>
                    <small>Existing users vs paid seat count from signup.</small>
                  </div>
                </div>

                {!selected ? (
                  <div className="empty-hint">Select a tenant from the search results to populate the overview.</div>
                ) : (
                  <>
                    <section className="section-card" id="overview">
                      <div className="section-head">
                        <div className="section-title">
                          <strong>Tenant basics and owner access</strong>
                          <span>Values loaded from the Calendra database for this tenancy.</span>
                        </div>
                      </div>
                      <div className="field-grid">
                        <div className="field-card">
                          <div className="field-label">
                            <strong>Tenant / company name</strong>
                            <span>{selected.companyName}</span>
                          </div>
                        </div>
                        <div className="field-card">
                          <div className="field-label">
                            <strong>Tenant code</strong>
                            <span>{selected.tenantCode || '—'}</span>
                          </div>
                        </div>
                        <div className="field-card">
                          <div className="field-label">
                            <strong>Owner name</strong>
                            <span>{selected.contactName || '—'}</span>
                          </div>
                        </div>
                        <div className="field-card">
                          <div className="field-label">
                            <strong>Owner email</strong>
                            <span>{selected.contactEmail || '—'}</span>
                          </div>
                        </div>
                        <div className="field-card">
                          <div className="field-label">
                            <strong>VAT ID</strong>
                            <span>{selected.vatId?.trim() || '—'}</span>
                          </div>
                        </div>
                        <div className="field-card">
                          <div className="field-label">
                            <strong>Stripe customer (recent bill)</strong>
                            <span>{selected.stripeCustomerIdPreview?.trim() || '—'}</span>
                          </div>
                        </div>
                        <div className="field-card">
                          <div className="field-label">
                            <strong>Signup status</strong>
                            <span>{selected.signupCompletionSummary}</span>
                          </div>
                        </div>
                        <div className="field-card">
                          <div className="field-label">
                            <strong>Created</strong>
                            <span>{selected.createdAt || '—'}</span>
                          </div>
                        </div>
                        <div className="field-card">
                          <div className="field-label">
                            <strong>Phone</strong>
                            <span>{selected.contactPhone?.trim() || '—'}</span>
                          </div>
                        </div>
                      </div>
                    </section>

                    <section className="section-card" id="subscription">
                      <div className="section-head">
                        <div className="section-title">
                          <strong>Subscription</strong>
                          <span>Plan and billing interval from tenant settings.</span>
                        </div>
                      </div>
                      <div className="field-grid">
                        <div className="field-card">
                          <div className="field-label">
                            <strong>Plan</strong>
                            <span>{formatPlan(selected.packageType)}</span>
                          </div>
                        </div>
                        <div className="field-card">
                          <div className="field-label">
                            <strong>Billing cycle</strong>
                            <span>{formatInterval(selected.subscriptionInterval)}</span>
                          </div>
                        </div>
                        <div className="field-card">
                          <div className="field-label">
                            <strong>Period</strong>
                            <span>
                              {selected.subscriptionStart || '—'} → {selected.subscriptionEnd || '—'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </section>

                    <section className="section-card" id="billing">
                      <div className="section-head">
                        <div className="section-title">
                          <strong>Billing snapshot</strong>
                          <span>Due balance and renewal from billing settings.</span>
                        </div>
                      </div>
                      <div className="field-grid">
                        <div className="field-card">
                          <div className="field-label">
                            <strong>Due amount</strong>
                            <span>€{selected.dueAmount}</span>
                          </div>
                        </div>
                        <div className="field-card">
                          <div className="field-label">
                            <strong>VAT on file</strong>
                            <span>{selected.vatId?.trim() || '—'}</span>
                          </div>
                        </div>
                      </div>
                    </section>
                  </>
                )}
              </section>
            </section>
          </main>
        </div>

        <div className="modal-backdrop" id="modalBackdrop" role="dialog" aria-modal="true" aria-hidden="true">
          <div className="modal">
            <h3 id="modalTitle">Admin action</h3>
            <p id="modalCopy">Admin overrides require a reason and create an immutable audit log entry.</p>
            <div className="select-row" id="modalPlanRow">
              <label htmlFor="actionSelect">Action</label>
              <select id="actionSelect">
                <option>Upgrade immediately</option>
              </select>
            </div>
            <div className="select-row">
              <label htmlFor="reasonText">Reason / internal note</label>
              <textarea id="reasonText" placeholder="Required for admin override, price changes, suspension and annual downgrade exceptions." />
            </div>
            <div className="modal-actions">
              <button className="button secondary" type="button" id="closeModal">
                Cancel
              </button>
              <button className="button primary" type="button" id="confirmModal">
                Confirm action
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
