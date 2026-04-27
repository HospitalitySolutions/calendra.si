import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
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
    *{box-sizing:border-box} html,body{margin:0;padding:0;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--text);background:radial-gradient(circle at 14% 18%,rgba(79,130,255,.11),transparent 24%),radial-gradient(circle at 82% 60%,rgba(79,130,255,.10),transparent 22%),linear-gradient(180deg,var(--bg-1),var(--bg-2));min-height:100vh} body{padding:12px}
    .app-shell{max-width:var(--maxw);margin:0 auto;background:rgba(255,255,255,.55);border:1px solid rgba(223,231,245,.92);backdrop-filter:blur(14px);border-radius:32px;box-shadow:var(--shadow);overflow:hidden}
    .topbar{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:22px 28px;border-bottom:1px solid rgba(223,231,245,.72);background:rgba(255,255,255,.35)}
    .brand{display:flex;align-items:center;gap:14px;min-width:0}.brand-logo{width:44px;height:44px;display:grid;place-items:center;border-radius:16px;background:linear-gradient(135deg,var(--primary),var(--primary-dark));color:#fff;font-weight:950;box-shadow:0 10px 24px rgba(47,109,246,.22)}
    .brand-copy{display:grid;gap:2px}.brand-copy strong{font-size:1.08rem;letter-spacing:-.03em}.brand-copy span{color:var(--muted);font-weight:700;font-size:.9rem}
    .top-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.pill{display:inline-flex;align-items:center;gap:8px;padding:9px 12px;border-radius:999px;border:1px solid var(--border);background:#fff;color:var(--muted);font-size:.88rem;font-weight:900}.pill.primary{background:var(--primary-soft);color:var(--primary);border-color:#cddcff}.pill.success{background:var(--success-soft);color:var(--success-text);border-color:#cfead8}.pill.warning{background:var(--warning-soft);color:var(--warning-text);border-color:#f2dda0}.pill.danger{background:var(--danger-soft);color:var(--danger-text);border-color:#f4c8c3}.pill.purple{background:var(--purple-soft);color:var(--purple-text);border-color:#dcd7ff}
    .content{padding:0}.admin-workspace{display:flex;gap:0;align-items:stretch;min-height:0}.admin-sidebar{width:min(260px,38vw);flex-shrink:0;border-right:1px solid rgba(223,231,245,.85);background:rgba(255,255,255,.42);padding:16px 10px;display:flex;flex-direction:column;gap:6px}.admin-sidebar-title{font-size:.72rem;font-weight:950;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);padding:4px 8px 10px}.admin-sidebar-tab{text-align:left;border:1px solid transparent;background:transparent;border-radius:14px;padding:11px 12px;font:inherit;font-weight:850;color:#40506c;cursor:pointer;line-height:1.25;transition:background .15s,border-color .15s,color .15s}.admin-sidebar-tab:hover{background:rgba(255,255,255,.62);border-color:#e6edf9}.admin-sidebar-tab.active{background:var(--primary-soft);border-color:#cddcff;color:var(--primary)}.admin-main{flex:1;min-width:0;padding:22px 28px 28px}.admin-placeholder{max-width:720px;display:grid;gap:10px;line-height:1.55;color:var(--muted)}.plan-price-head{display:grid;gap:8px;margin-bottom:18px}.plan-price-head h2{margin:0;font-size:1.45rem;letter-spacing:-.04em}.plan-price-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px}.plan-price-field{display:grid;gap:6px}.plan-price-field label{font-weight:900;font-size:.82rem;color:var(--muted)}.plan-price-field input{height:44px;border-radius:14px;border:1px solid var(--border);padding:0 12px;font:inherit;font-weight:800}
    .catalog-ladder-wrap{display:grid;gap:12px}.catalog-ladder-head{display:grid;gap:4px}.catalog-ladder-head strong{font-size:1.02rem;letter-spacing:-.03em}
    .catalog-ladder{display:grid;grid-template-columns:1fr auto 1fr auto 1fr;align-items:stretch;gap:10px 6px;max-width:960px}
    .catalog-ladder-step{border-radius:20px;padding:16px 12px;text-align:center;border:1px solid #dbe6f7;background:linear-gradient(180deg,rgba(255,255,255,.96),rgba(236,242,255,.88));display:grid;gap:6px;align-content:center}
    .catalog-ladder-step--low{min-height:76px;opacity:.9;transform:translateY(10px)}
    .catalog-ladder-step--mid{min-height:92px;border-color:#cfe0ff;box-shadow:0 10px 24px rgba(47,109,246,.08)}
    .catalog-ladder-step--high{min-height:112px;border-color:#b8cffc;box-shadow:0 16px 36px rgba(47,109,246,.14);background:linear-gradient(180deg,#fff,var(--primary-soft))}
    .catalog-ladder-rung{font-size:.7rem;font-weight:950;text-transform:uppercase;letter-spacing:.1em;color:var(--muted)}
    .catalog-ladder-name{font-size:1.18rem;font-weight:950;letter-spacing:-.04em;color:var(--text)}
    .catalog-ladder-arrow{display:grid;place-items:center;color:var(--primary);font-weight:950;font-size:1.35rem;opacity:.85}
    @media(max-width:720px){.catalog-ladder{grid-template-columns:1fr;grid-template-rows:auto auto auto auto auto}.catalog-ladder-arrow{transform:rotate(90deg);padding:4px 0}}
    .hero{display:grid;grid-template-columns:minmax(320px,.8fr) minmax(620px,1.2fr);gap:22px;align-items:start}.panel{background:var(--panel);border:1px solid rgba(223,231,245,.95);border-radius:var(--radius-xl);backdrop-filter:blur(10px);box-shadow:0 10px 28px rgba(58,89,150,.06)}.panel-pad{padding:24px}.page-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:22px;flex-wrap:wrap}.page-head.platform-admin-head{flex-direction:column;align-items:stretch;gap:16px}.page-title{display:grid;gap:8px}.eyebrow{display:inline-flex;align-self:start;padding:8px 12px;border-radius:999px;background:var(--primary-soft);color:var(--primary);font-size:.86rem;font-weight:950}.page-title h1{margin:0;font-size:clamp(2rem,3vw,3.25rem);line-height:.96;letter-spacing:-.065em}.page-title p{margin:0;max-width:820px;color:var(--muted);line-height:1.55}.search-wrap{display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap;flex-direction:column}.search-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;width:100%}.search-input{height:44px;min-width:0;flex:1 1 280px;border:1px solid var(--border);border-radius:999px;padding:0 16px;background:rgba(255,255,255,.92);outline:none;color:var(--text);font-weight:700}.search-input:disabled{opacity:.55;cursor:not-allowed}.button{border:0;border-radius:15px;padding:13px 16px;font-weight:950;cursor:pointer;transition:transform var(--transition),filter var(--transition),box-shadow var(--transition)}.button:hover{transform:translateY(-1px)}.button.primary{background:linear-gradient(90deg,var(--primary),var(--primary-dark));color:#fff;box-shadow:0 12px 28px rgba(47,109,246,.18)}.button.secondary{background:#fff;color:var(--text);border:1px solid var(--border)}.button.danger{background:var(--danger-soft);color:var(--danger-text);border:1px solid #f4c8c3}.button.small{padding:9px 12px;border-radius:12px;font-size:.85rem}.button:disabled{opacity:.55;cursor:not-allowed;transform:none}
    .tenant-card{display:grid;gap:18px;position:sticky;top:24px}.tenant-head{display:grid;gap:12px}.tenant-avatar{width:64px;height:64px;border-radius:22px;background:linear-gradient(135deg,#fff,var(--primary-soft));border:1px solid #d6e3fb;display:grid;place-items:center;color:var(--primary);font-weight:950;font-size:1.35rem}.tenant-title{display:grid;gap:4px}.tenant-title h2{margin:0;font-size:1.65rem;letter-spacing:-.05em}.tenant-title span{color:var(--muted);font-size:.92rem;font-weight:750;word-break:break-word}.status-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.stat{padding:14px;border-radius:18px;background:rgba(255,255,255,.82);border:1px solid #e5edf9;display:grid;gap:4px}.stat strong{font-size:.78rem;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)}.stat span{font-size:1rem;font-weight:950;color:var(--text);word-break:break-word}.progress{height:9px;background:#e8eef9;border-radius:999px;overflow:hidden}.progress > div{height:100%;background:linear-gradient(90deg,var(--primary),var(--primary-dark));border-radius:999px}.nav-list{display:grid;gap:8px}.nav-item{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:12px 14px;border-radius:16px;border:1px solid #e6edf9;background:rgba(255,255,255,.72);color:#40506c;font-weight:900;cursor:pointer}.nav-item.active{background:var(--primary-soft);border-color:#cddcff;color:var(--primary)}
    .main-grid{display:grid;gap:18px}.kpi-row{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}.kpi{padding:18px;border-radius:22px;border:1px solid #dbe6f7;background:linear-gradient(180deg,rgba(255,255,255,.98),rgba(239,245,255,.94));box-shadow:0 12px 26px rgba(47,109,246,.08);display:grid;gap:7px}.kpi span{color:var(--muted);font-size:.82rem;font-weight:900;text-transform:uppercase;letter-spacing:.05em}.kpi strong{font-size:1.55rem;letter-spacing:-.05em}.kpi small{color:var(--muted);font-weight:700;line-height:1.35}
    .section-card{border-radius:24px;border:1px solid #dbe6f7;background:linear-gradient(180deg,rgba(255,255,255,.98),rgba(239,245,255,.94));box-shadow:0 16px 34px rgba(47,109,246,.10);padding:18px;display:grid;gap:16px}.section-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap}.section-title{display:grid;gap:4px}.section-title strong{font-size:1.05rem;letter-spacing:-.03em}.section-title span{color:var(--muted);font-size:.9rem;line-height:1.45}.field-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.field-card{padding:14px;border-radius:18px;background:rgba(255,255,255,.9);border:1px solid #e6edf9;display:grid;gap:9px}.field-top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.field-label{display:grid;gap:3px}.field-label strong{font-size:.82rem;color:var(--muted);text-transform:uppercase;letter-spacing:.045em}.field-label span{font-weight:950;color:var(--text);line-height:1.3;word-break:break-word}.muted{color:var(--muted)}.empty-hint{padding:22px;border-radius:18px;border:1px dashed #dbe6f7;color:var(--muted);line-height:1.5}
    .search-wrap.tenant-list-wrap{width:100%;max-width:100%}.search-hits{list-style:none;margin:6px 0 0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;width:100%;max-width:100%}.search-hits > li{display:flex;min-width:0}.search-hit{padding:12px 14px;border-radius:16px;border:1px solid var(--border);background:#fff;cursor:pointer;text-align:left;font:inherit;width:100%;min-height:100%;display:grid;align-content:start;gap:4px}.search-hit:hover{border-color:#cddcff;background:var(--primary-soft)}.search-hit strong{display:block;font-size:.95rem;color:var(--text)}.search-hit .sub{font-size:.84rem;color:var(--muted);margin-top:2px}.search-err{color:var(--danger-text);font-size:.9rem;font-weight:800;margin:4px 0 0}
    .audit-log-wrap{overflow-x:auto;border-radius:18px;border:1px solid #e6edf9;background:rgba(255,255,255,.65)}.audit-log-table{width:100%;border-collapse:collapse;font-size:.88rem;min-width:520px}.audit-log-table th{text-align:left;font-weight:950;font-size:.72rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);padding:12px 14px;border-bottom:1px solid #e6edf9;background:rgba(247,250,255,.9)}.audit-log-table td{padding:12px 14px;border-bottom:1px solid #eef3fb;vertical-align:top;word-break:break-word}.audit-log-table tr:last-child td{border-bottom:0}.audit-log-cat{display:inline-block;padding:4px 10px;border-radius:999px;font-size:.78rem;font-weight:950;text-transform:uppercase;letter-spacing:.04em}.audit-log-cat--setting{background:var(--primary-soft);color:var(--primary)}.audit-log-cat--bill{background:var(--success-soft);color:var(--success-text)}.audit-log-cat--suspend{background:var(--danger-soft);color:var(--danger-text)}.audit-detail-cell{color:var(--muted);font-weight:700;font-size:.84rem;line-height:1.45;max-width:40rem}.audit-actor-cell{font-size:.84rem;font-weight:800;color:#40506c;word-break:break-all;max-width:14rem}
    .plan-history-wrap{overflow-x:auto;border-radius:18px;border:1px solid #e6edf9;background:rgba(255,255,255,.65)}.plan-history-table{width:100%;border-collapse:collapse;font-size:.88rem;min-width:680px}.plan-history-table th{text-align:left;font-weight:950;font-size:.72rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);padding:12px 14px;border-bottom:1px solid #e6edf9;background:rgba(247,250,255,.9)}.plan-history-table td{padding:12px 14px;border-bottom:1px solid #eef3fb;vertical-align:top}.plan-history-table tr:last-child td{border-bottom:0}.plan-status-pill{display:inline-flex;padding:4px 10px;border-radius:999px;font-size:.78rem;font-weight:950}.plan-status-pill--applied{background:var(--success-soft);color:var(--success-text)}.plan-status-pill--scheduled{background:var(--warning-soft);color:var(--warning-text)}
    .modal-backdrop{position:fixed;inset:0;background:rgba(23,37,61,.38);display:none;place-items:center;padding:20px;z-index:10}.modal-backdrop.visible{display:grid}.modal{max-width:560px;width:100%;border-radius:26px;background:#fff;border:1px solid #dfe7f5;box-shadow:0 28px 80px rgba(23,37,61,.28);padding:22px;display:grid;gap:16px}.modal h3{margin:0;font-size:1.55rem;letter-spacing:-.045em}.modal p{margin:0;color:var(--muted);line-height:1.5}.modal-actions{display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap}.select-row{display:grid;gap:8px}.select-row label{font-weight:900;color:#2a3a56}.select-row select,.select-row textarea,.select-row input[type=number],.select-row input[type=text]{width:100%;border:1px solid var(--border);border-radius:15px;background:#fff;color:var(--text);padding:12px 14px;font:inherit;outline:none}.select-row textarea{min-height:90px;resize:vertical}.plan-change-extras{display:grid;gap:8px;padding:12px;border-radius:14px;border:1px solid #dce7fb;background:rgba(237,244,255,.6)}.price-override-extras{display:grid;gap:14px}.price-override-panel{display:grid;gap:10px}.price-current-pill{display:inline-flex;align-items:center;gap:8px;padding:10px 14px;border-radius:14px;background:var(--primary-soft);border:1px solid #cddcff;font-weight:850;font-size:.92rem;color:var(--text)}.price-current-pill strong{font-weight:950}.checkbox-row{display:flex;align-items:flex-start;gap:10px;font-weight:800;font-size:.9rem;color:#40506c;line-height:1.35}.checkbox-row input[type=checkbox]{width:18px;height:18px;margin-top:2px;accent-color:var(--primary)}.price-preview{font-size:.88rem;font-weight:800;color:var(--muted)}
    @media(max-width:1180px){.admin-workspace{flex-direction:column}.admin-sidebar{width:100%;flex-direction:row;flex-wrap:wrap;border-right:0;border-bottom:1px solid rgba(223,231,245,.85);padding:12px 10px 14px}.admin-sidebar-title{width:100%}.hero{grid-template-columns:1fr}.tenant-card{position:static}.kpi-row{grid-template-columns:repeat(2,minmax(0,1fr))}.field-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:720px){body{padding:10px}.topbar{padding-left:16px;padding-right:16px}.admin-main{padding-left:16px;padding-right:16px;padding-top:16px}.page-head{display:grid}.search-input{min-width:0;width:100%}.kpi-row,.field-grid,.status-grid{grid-template-columns:1fr}.app-shell,.panel{border-radius:24px}}`

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

type AuditLogEntryDto = {
  occurredAt: string
  category: string
  summary: string
  detail: string
  actorEmail?: string
}

type PlatformTenancyAuditPayload = {
  actionType: string
  summary: string
  detail: string
  reason: string
}

function buildPlatformAdminAuditPayload(kind: string, root: HTMLElement): PlatformTenancyAuditPayload | null {
  const reason = root.querySelector<HTMLTextAreaElement>('#reasonText')?.value.trim() ?? ''
  const actionSelect = root.querySelector<HTMLSelectElement>('#actionSelect')
  const choice = actionSelect?.selectedOptions[0]?.textContent?.trim() ?? ''
  const idx = actionSelect?.selectedIndex ?? -1

  if (kind === 'plan') {
    const fromPlan = root.querySelector<HTMLElement>('#planChangeExtras')?.dataset.currentPlan ?? ''
    const targetPlan = root.querySelector<HTMLSelectElement>('#planTargetSelect')?.value.trim() ?? ''
    const effectiveDate = root.querySelector<HTMLElement>('#planChangeExtras')?.dataset.effectiveDate ?? ''
    const effectiveKind = choice.toLowerCase().includes('next renewal') ? 'Next renewal' : 'Immediately'
    return {
      actionType: 'CHANGE_PLAN',
      summary: choice || 'Change plan',
      detail: `From plan: ${fromPlan || '—'}\nTarget plan: ${targetPlan || '—'}\nEffective timing: ${effectiveKind}\nEffective date: ${effectiveDate || '—'}`,
      reason,
    }
  }
  if (kind === 'price') {
    const custom = root.querySelector<HTMLInputElement>('#priceCustomInput')?.value ?? ''
    const pct = root.querySelector<HTMLInputElement>('#priceDiscountPercent')?.value ?? ''
    const includeAddons = root.querySelector<HTMLInputElement>('#priceDiscountIncludeAddons')?.checked ?? false
    let detail = ''
    if (idx === 0) detail = `New plan amount (€): ${custom}`
    else if (idx === 1)
      detail = `Discount %: ${pct || '0'}; include add-ons in % discount: ${includeAddons ? 'yes' : 'no'}`
    else if (idx === 2)
      detail = 'Remove override — revert to default catalog price for this plan and billing cycle.'
    return {
      actionType: 'PRICE_OVERRIDE',
      summary: choice || 'Price override',
      detail,
      reason,
    }
  }
  if (kind === 'suspend') {
    return {
      actionType: 'SUSPEND_TENANT',
      summary: choice || 'Suspend tenant',
      detail: '',
      reason,
    }
  }
  if (kind === 'addon') {
    return {
      actionType: 'MANAGE_ADDONS',
      summary: choice || 'Manage add-ons',
      detail: '',
      reason,
    }
  }
  return null
}

function auditCategoryPillClass(category: string): string {
  const u = category.toLowerCase()
  if (u.includes('suspend')) return 'audit-log-cat audit-log-cat--suspend'
  return 'audit-log-cat audit-log-cat--setting'
}

type TenancyDetails = TenancySearchHit & {
  contactName: string
  contactPhone: string
  companyAddress: string
  companyPostalCode: string
  companyCity: string
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
    'Choose how the subscription tier should move. Options depend on the tenant’s current plan (Basic → Professional → Premium).',
    [],
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

function formatAuditTime(iso: string): string {
  const t = iso.trim()
  if (!t) return '—'
  const ms = Date.parse(t)
  if (!Number.isFinite(ms)) return t
  return new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
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

/** 0 = trial (lowest), 1 = Basic, 2 = Pro / Professional, 3 = Premium / Business (highest). */
function planPackageRank(pkg: string | undefined | null): number {
  const u = (pkg ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]/g, '_')
  if (u === 'TRIAL') return 0
  if (u === 'BASIC') return 1
  if (u === 'PRO' || u === 'PROFESSIONAL') return 2
  if (u === 'PREMIUM' || u === 'BUSINESS') return 3
  if (u === 'CUSTOM') return 2
  return 2
}

const PLAN_RANK_MIN = 0
const PLAN_RANK_MAX = 3

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildPlanChangeActionOptions(selected: TenancyDetails): string[] {
  const rank = planPackageRank(selected.packageType)
  const out: string[] = []
  if (rank < PLAN_RANK_MAX) {
    out.push('Upgrade Immediately (Upgrades the tenant plan immediately.)')
    out.push('Upgrade at next renewal (Upgrades the tenant plan at next renewal date.)')
  }
  if (rank > PLAN_RANK_MIN) {
    out.push('Downgrade Immediately (Downgrades the tenant plan immediately.)')
    out.push('Downgrade at next renewal (Downgrades the tenant plan at next renewal date.)')
  }
  if (out.length === 0) {
    out.push('No tier changes are available for this plan state.')
  }
  return out
}

const PLAN_STAGE_CODES = ['BASIC', 'PROFESSIONAL', 'PREMIUM'] as const

function currentPlanStageCode(pkg: string): (typeof PLAN_STAGE_CODES)[number] {
  const u = pkg.trim().toUpperCase()
  if (u === 'PREMIUM' || u === 'BUSINESS') return 'PREMIUM'
  if (u === 'PRO' || u === 'PROFESSIONAL' || u === 'CUSTOM') return 'PROFESSIONAL'
  return 'BASIC'
}

function computePlanEffectiveDate(actionLabel: string, selected: TenancyDetails): string {
  if (actionLabel.toLowerCase().includes('next renewal')) {
    return selected.subscriptionEnd?.trim() || ''
  }
  return new Date().toISOString()
}

function updatePlanChangePanels(root: HTMLElement, selected: TenancyDetails) {
  const backdrop = root.querySelector<HTMLElement>('#modalBackdrop')
  if (!backdrop || backdrop.dataset.modalKind !== 'plan') return
  const extras = root.querySelector<HTMLElement>('#planChangeExtras')
  const actionSelect = root.querySelector<HTMLSelectElement>('#actionSelect')
  const targetSelect = root.querySelector<HTMLSelectElement>('#planTargetSelect')
  const hint = root.querySelector<HTMLElement>('#planEffectiveDateHint')
  if (!extras || !actionSelect || !targetSelect || !hint) return
  extras.dataset.currentPlan = formatPlan(currentPlanStageCode(selected.packageType))

  const actionLabel = actionSelect.selectedOptions[0]?.textContent?.trim() ?? ''
  const curRank = planPackageRank(selected.packageType)
  let targets: string[] = []
  if (actionLabel.toLowerCase().startsWith('upgrade')) {
    targets = PLAN_STAGE_CODES.filter((code) => planPackageRank(code) > curRank).map((code) => formatPlan(code))
  } else if (actionLabel.toLowerCase().startsWith('downgrade')) {
    targets = PLAN_STAGE_CODES.filter((code) => planPackageRank(code) < curRank).map((code) => formatPlan(code))
  }
  extras.hidden = targets.length === 0
  if (targets.length === 0) {
    targetSelect.innerHTML = ''
    hint.textContent = ''
    return
  }
  const selectedValue = targetSelect.value
  targetSelect.innerHTML = targets.map((value) => `<option>${escapeHtml(value)}</option>`).join('')
  if (selectedValue && targets.includes(selectedValue)) {
    targetSelect.value = selectedValue
  }
  const effectiveIso = computePlanEffectiveDate(actionLabel, selected)
  extras.dataset.effectiveDate = effectiveIso
  const effectiveText = formatAuditTime(effectiveIso)
  hint.textContent = `Effective date: ${effectiveText || '—'}`
}

type PlanHistoryRow = {
  recordedAt: string
  action: string
  fromPlan: string
  toPlan: string
  effectiveDate: string
  status: 'Applied' | 'Scheduled'
  actor: string
}

function parsePlanHistoryRow(row: AuditLogEntryDto): PlanHistoryRow | null {
  if (!row.category.toLowerCase().includes('change plan')) return null
  const targetMatch = row.detail.match(/Target plan:\s*([^\n]+)/i)
  const effectiveMatch = row.detail.match(/Effective date:\s*([^\n]+)/i)
  const fromMatch = row.detail.match(/From plan:\s*([^\n]+)/i)
  const target = targetMatch?.[1]?.trim() || '—'
  const fromPlan = fromMatch?.[1]?.trim() || '—'
  const effectiveRaw = effectiveMatch?.[1]?.trim() || ''
  const effectiveDate = formatAuditTime(effectiveRaw)
  const ms = Date.parse(effectiveRaw)
  const status: 'Applied' | 'Scheduled' = Number.isFinite(ms) && ms > Date.now() ? 'Scheduled' : 'Applied'
  return {
    recordedAt: formatAuditTime(row.occurredAt),
    action: row.summary || 'Change plan',
    fromPlan,
    toPlan: target,
    effectiveDate: effectiveDate || '—',
    status,
    actor: row.actorEmail?.trim() || '—',
  }
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

type RegisterPriceCatalogDto = {
  plans: Record<string, number>
  addons: Record<string, number>
}

function coerceMoneyInput(raw: string, fallback: number): number {
  const n = Number.parseFloat(raw.replace(',', '.'))
  if (!Number.isFinite(n) || n < 0 || n > 100_000) return fallback
  return Math.round(n * 100) / 100
}

const DEFAULT_REGISTER_CATALOG: RegisterPriceCatalogDto = {
  plans: { basic: 18.9, pro: 34.9, business: 59.9 },
  addons: { voice: 12, billing: 8, whitelabel: 10 },
}

function packageToCatalogPlanKey(pkg: string): 'basic' | 'pro' | 'business' {
  const u = pkg.trim().toUpperCase()
  if (u === 'BASIC' || u === 'TRIAL') return 'basic'
  if (u === 'PRO' || u === 'PROFESSIONAL') return 'pro'
  if (u === 'PREMIUM' || u === 'BUSINESS') return 'business'
  if (u === 'CUSTOM') return 'pro'
  return 'basic'
}

function isYearlyBillingInterval(raw: string): boolean {
  const u = raw.trim().toUpperCase()
  return u === 'YEARLY' || u === 'ANNUAL'
}

function sumAddonCatalog(addons: Record<string, number> | undefined): number {
  if (!addons) return 0
  let s = 0
  for (const v of Object.values(addons)) {
    if (typeof v === 'number' && Number.isFinite(v)) s += v
  }
  return Math.round(s * 100) / 100
}

function roundMoney2(n: number): number {
  return Math.round(n * 100) / 100
}

function formatMoneyEUR(n: number): string {
  return roundMoney2(n).toFixed(2)
}

function mergeRegisterCatalog(fetched: RegisterPriceCatalogDto | null | undefined): RegisterPriceCatalogDto {
  const plans = { ...DEFAULT_REGISTER_CATALOG.plans }
  const addons = { ...DEFAULT_REGISTER_CATALOG.addons }
  if (fetched?.plans) Object.assign(plans, fetched.plans)
  if (fetched?.addons) Object.assign(addons, fetched.addons)
  return { plans, addons }
}

function planAmountsForTenant(selected: TenancyDetails, catalog: RegisterPriceCatalogDto) {
  const planKey = packageToCatalogPlanKey(selected.packageType)
  const monthlyRaw = catalog.plans[planKey]
  const monthly =
    typeof monthlyRaw === 'number' && Number.isFinite(monthlyRaw)
      ? monthlyRaw
      : DEFAULT_REGISTER_CATALOG.plans[planKey]
  const yearly = roundMoney2(monthly * 12)
  const billingLabel = isYearlyBillingInterval(selected.subscriptionInterval) ? ('Annual' as const) : ('Monthly' as const)
  const currentAmount = billingLabel === 'Annual' ? yearly : monthly
  return { planKey, monthly, yearly, billingLabel, currentAmount }
}

type PriceModalCtx = {
  baseAmount: number
  addonSum: number
  billingLabel: string
  planLabel: string
}

function readPriceModalCtx(root: HTMLElement): PriceModalCtx | null {
  const extras = root.querySelector<HTMLElement>('#priceOverrideExtras')
  if (!extras || extras.hidden) return null
  const b = Number.parseFloat(extras.dataset.baseAmount ?? '')
  if (!Number.isFinite(b)) return null
  const addonSum = Number.parseFloat(extras.dataset.addonSum ?? '0')
  return {
    baseAmount: b,
    addonSum: Number.isFinite(addonSum) ? addonSum : 0,
    billingLabel: extras.dataset.billingLabel ?? 'Monthly',
    planLabel: extras.dataset.planLabel ?? '',
  }
}

function updatePriceOverridePanels(root: HTMLElement) {
  const backdrop = root.querySelector<HTMLElement>('#modalBackdrop')
  if (!backdrop || backdrop.dataset.modalKind !== 'price') return
  const ctx = readPriceModalCtx(root)
  const select = root.querySelector<HTMLSelectElement>('#actionSelect')
  const customPanel = root.querySelector<HTMLElement>('#priceOverridePanelCustom')
  const discountPanel = root.querySelector<HTMLElement>('#priceOverridePanelDiscount')
  const removePanel = root.querySelector<HTMLElement>('#priceOverridePanelRemove')
  const preview = root.querySelector<HTMLElement>('#priceDiscountPreview')
  if (!select || !customPanel || !discountPanel || !removePanel) return
  const idx = select.selectedIndex
  customPanel.hidden = idx !== 0
  discountPanel.hidden = idx !== 1
  removePanel.hidden = idx !== 2
  if (!preview) return
  if (idx !== 1 || !ctx) {
    preview.textContent = ''
    return
  }
  const pctInput = root.querySelector<HTMLInputElement>('#priceDiscountPercent')
  const include = root.querySelector<HTMLInputElement>('#priceDiscountIncludeAddons')
  const pct = Number.parseFloat((pctInput?.value ?? '').replace(',', '.'))
  const pctClamped = Math.min(100, Math.max(0, Number.isFinite(pct) ? pct : 0))
  const gross = include?.checked ? ctx.baseAmount + ctx.addonSum : ctx.baseAmount
  const after = roundMoney2(gross * (1 - pctClamped / 100))
  const scope = include?.checked ? 'plan + catalog add-ons (reference total)' : 'plan base only'
  const period = ctx.billingLabel === 'Annual' ? 'year' : 'month'
  preview.textContent = `After ${pctClamped}% off (${scope}): €${formatMoneyEUR(after)} per ${period}.`
}

function applyPriceModalDOM(root: HTMLElement, selected: TenancyDetails, catalog: RegisterPriceCatalogDto) {
  const merged = mergeRegisterCatalog(catalog)
  const amounts = planAmountsForTenant(selected, merged)
  const addonSum = sumAddonCatalog(merged.addons)
  const extras = root.querySelector<HTMLElement>('#priceOverrideExtras')
  if (!extras) return
  extras.dataset.baseAmount = String(amounts.currentAmount)
  extras.dataset.addonSum = String(addonSum)
  extras.dataset.billingLabel = amounts.billingLabel
  extras.dataset.planLabel = formatPlan(selected.packageType)

  const baseStr = formatMoneyEUR(amounts.currentAmount)
  const defLine = `Current plan price for ${formatPlan(selected.packageType)} (${amounts.billingLabel} billing): €${baseStr} per ${amounts.billingLabel === 'Annual' ? 'year' : 'month'}.`
  const elCustom = root.querySelector<HTMLElement>('#priceCurrentLabelCustom')
  if (elCustom) elCustom.textContent = defLine
  const elDisc = root.querySelector<HTMLElement>('#priceCurrentLabelDiscount')
  if (elDisc) elDisc.textContent = defLine

  const remove = root.querySelector<HTMLElement>('#priceRemoveCopy')
  if (remove) {
    remove.textContent = `Removing the override resets billing to the default catalog amount for ${formatPlan(selected.packageType)} on ${amounts.billingLabel} billing: €${baseStr} per ${amounts.billingLabel === 'Annual' ? 'year' : 'month'} (same as register "Plan & add-on prices").`
  }

  const inputCustom = root.querySelector<HTMLInputElement>('#priceCustomInput')
  if (inputCustom) inputCustom.value = String(amounts.currentAmount)

  const pct = root.querySelector<HTMLInputElement>('#priceDiscountPercent')
  if (pct) pct.value = ''
  const inc = root.querySelector<HTMLInputElement>('#priceDiscountIncludeAddons')
  if (inc) inc.checked = false

  updatePriceOverridePanels(root)
}

function PlanPricesAdminPanel() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [plans, setPlans] = useState({ basic: 18.9, pro: 34.9, business: 59.9 })
  const [addons, setAddons] = useState({ voice: 12, billing: 8, whitelabel: 10 })

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      setErr(null)
      try {
        const { data } = await api.get<RegisterPriceCatalogDto>('/platform-admin/register-prices')
        if (cancelled || !data) return
        if (data.plans) {
          setPlans((prev) => ({
            basic: typeof data.plans.basic === 'number' ? data.plans.basic : prev.basic,
            pro: typeof data.plans.pro === 'number' ? data.plans.pro : prev.pro,
            business: typeof data.plans.business === 'number' ? data.plans.business : prev.business,
          }))
        }
        if (data.addons) {
          setAddons((prev) => ({
            voice: typeof data.addons.voice === 'number' ? data.addons.voice : prev.voice,
            billing: typeof data.addons.billing === 'number' ? data.addons.billing : prev.billing,
            whitelabel: typeof data.addons.whitelabel === 'number' ? data.addons.whitelabel : prev.whitelabel,
          }))
        }
      } catch {
        setErr('Could not load register catalog.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const save = async () => {
    setSaving(true)
    setErr(null)
    setOk(null)
    try {
      await api.put('/platform-admin/register-prices', { plans, addons })
      setOk('Saved. Visitors will see new amounts after they reload the register pages.')
    } catch {
      setErr('Could not save catalog.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="plan-price-head">
        <div className="eyebrow">Signup catalog</div>
        <h2>Plan &amp; add-on prices</h2>
        <p className="muted" style={{ margin: 0, fontWeight: 700, lineHeight: 1.5 }}>
          Monthly amounts in EUR for the public register flow (Basic, Pro, Business and the three optional add-ons).
          Annual billing still shows the 15% discount in the UI.
        </p>
      </div>

      <div className="catalog-ladder-wrap panel panel-pad" style={{ marginBottom: 22 }}>
        <div className="catalog-ladder-head">
          <strong>Plan tiers</strong>
          <span className="muted" style={{ fontWeight: 700 }}>
            Lowest on the left → highest on the right (matches register Basic · Pro · Business).
          </span>
        </div>
        <div className="catalog-ladder" aria-label="Plan tiers from lowest to highest">
          <div className="catalog-ladder-step catalog-ladder-step--low">
            <span className="catalog-ladder-rung">Lowest</span>
            <span className="catalog-ladder-name">Basic</span>
            <span className="muted" style={{ fontSize: '0.82rem', fontWeight: 700 }}>
              Entry paid tier
            </span>
          </div>
          <span className="catalog-ladder-arrow" aria-hidden>
            →
          </span>
          <div className="catalog-ladder-step catalog-ladder-step--mid">
            <span className="catalog-ladder-rung">Mid</span>
            <span className="catalog-ladder-name">Professional</span>
            <span className="muted" style={{ fontSize: '0.82rem', fontWeight: 700 }}>
              Pro feature set
            </span>
          </div>
          <span className="catalog-ladder-arrow" aria-hidden>
            →
          </span>
          <div className="catalog-ladder-step catalog-ladder-step--high">
            <span className="catalog-ladder-rung">Highest</span>
            <span className="catalog-ladder-name">Premium</span>
            <span className="muted" style={{ fontSize: '0.82rem', fontWeight: 700 }}>
              Business / largest tier
            </span>
          </div>
        </div>
      </div>

      {loading ? <p className="muted">Loading catalog…</p> : null}
      {err ? <p className="search-err">{err}</p> : null}
      {ok ? (
        <p style={{ margin: 0, color: 'var(--success-text)', fontWeight: 800, fontSize: '0.92rem' }}>
          {ok}
        </p>
      ) : null}
      {!loading ? (
        <>
          <h3 className="muted" style={{ margin: '18px 0 10px', fontSize: '0.95rem', fontWeight: 950 }}>
            Plans (€ / month)
          </h3>
          <div className="plan-price-grid">
            <div className="plan-price-field">
              <label htmlFor="pa-plan-basic">Basic</label>
              <input
                id="pa-plan-basic"
                type="text"
                inputMode="decimal"
                value={String(plans.basic)}
                onChange={(e) => setPlans((p) => ({ ...p, basic: coerceMoneyInput(e.target.value, p.basic) }))}
              />
            </div>
            <div className="plan-price-field">
              <label htmlFor="pa-plan-pro">Pro</label>
              <input
                id="pa-plan-pro"
                type="text"
                inputMode="decimal"
                value={String(plans.pro)}
                onChange={(e) => setPlans((p) => ({ ...p, pro: coerceMoneyInput(e.target.value, p.pro) }))}
              />
            </div>
            <div className="plan-price-field">
              <label htmlFor="pa-plan-business">Business</label>
              <input
                id="pa-plan-business"
                type="text"
                inputMode="decimal"
                value={String(plans.business)}
                onChange={(e) => setPlans((p) => ({ ...p, business: coerceMoneyInput(e.target.value, p.business) }))}
              />
            </div>
          </div>
          <h3 className="muted" style={{ margin: '22px 0 10px', fontSize: '0.95rem', fontWeight: 950 }}>
            Add-ons (€ / month)
          </h3>
          <div className="plan-price-grid">
            <div className="plan-price-field">
              <label htmlFor="pa-addon-voice">AI voice booking</label>
              <input
                id="pa-addon-voice"
                type="text"
                inputMode="decimal"
                value={String(addons.voice)}
                onChange={(e) => setAddons((a) => ({ ...a, voice: coerceMoneyInput(e.target.value, a.voice) }))}
              />
            </div>
            <div className="plan-price-field">
              <label htmlFor="pa-addon-billing">Billing &amp; invoices</label>
              <input
                id="pa-addon-billing"
                type="text"
                inputMode="decimal"
                value={String(addons.billing)}
                onChange={(e) => setAddons((a) => ({ ...a, billing: coerceMoneyInput(e.target.value, a.billing) }))}
              />
            </div>
            <div className="plan-price-field">
              <label htmlFor="pa-addon-whitelabel">Branded booking</label>
              <input
                id="pa-addon-whitelabel"
                type="text"
                inputMode="decimal"
                value={String(addons.whitelabel)}
                onChange={(e) => setAddons((a) => ({ ...a, whitelabel: coerceMoneyInput(e.target.value, a.whitelabel) }))}
              />
            </div>
          </div>
          <div style={{ marginTop: 22 }} className="top-actions">
            <button className="button primary" type="button" onClick={() => void save()} disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </>
      ) : null}
    </div>
  )
}

type AdminWorkspaceTab =
  | 'tenants'
  | 'plans'
  | 'fiscalization'
  | 'google'
  | 'apple'
  | 'zoom'
  | 'payments'
  | 'messaging'

const ADMIN_TABS: Array<{ id: AdminWorkspaceTab; label: string }> = [
  { id: 'tenants', label: 'Tenant management' },
  { id: 'plans', label: 'Plan & add-ons' },
  { id: 'fiscalization', label: 'Fiscalization' },
  { id: 'google', label: 'Google' },
  { id: 'apple', label: 'Apple' },
  { id: 'zoom', label: 'Zoom' },
  { id: 'payments', label: 'Payment providers' },
  { id: 'messaging', label: 'Messaging providers' },
]

function AdminComingSoon({ title }: { title: string }) {
  return (
    <div className="admin-placeholder panel panel-pad">
      <div className="eyebrow">Coming soon</div>
      <h2 style={{ margin: 0, fontSize: '1.45rem', letterSpacing: '-0.04em' }}>{title}</h2>
      <p style={{ margin: 0, fontWeight: 700 }}>
        This area is reserved for platform-wide configuration. Use Tenant management for live tenancy data today.
      </p>
    </div>
  )
}

export function PlatformAdminPage() {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const selectedRef = useRef<TenancyDetails | null>(null)
  const [searchInput, setSearchInput] = useState('')
  const [hits, setHits] = useState<TenancySearchHit[]>([])
  const [selected, setSelected] = useState<TenancyDetails | null>(null)
  const [listLoading, setListLoading] = useState(true)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [searchErr, setSearchErr] = useState<string | null>(null)
  const [activeNav, setActiveNav] = useState('overview')
  const [workspace, setWorkspace] = useState<AdminWorkspaceTab>('tenants')
  /** Which admin modal is open; price override UI is only mounted when this is "price". */
  const [activeModalKind, setActiveModalKind] = useState<string | null>(null)
  const [auditLog, setAuditLog] = useState<AuditLogEntryDto[]>([])
  const [auditLoading, setAuditLoading] = useState(false)
  const [auditErr, setAuditErr] = useState<string | null>(null)

  selectedRef.current = selected

  const reloadAuditForCurrentSelection = useCallback(async () => {
    const id = selectedRef.current?.id
    if (!id) return
    try {
      const { data } = await api.get<AuditLogEntryDto[]>(`/platform-admin/tenancies/${id}/audit-log`)
      if (selectedRef.current?.id !== id) return
      setAuditLog(Array.isArray(data) ? data : [])
      setAuditErr(null)
    } catch {
      if (selectedRef.current?.id !== id) return
      setAuditErr('Could not load audit log.')
      setAuditLog([])
    }
  }, [])

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

  useEffect(() => {
    if (!selected?.id) {
      setAuditLog([])
      setAuditErr(null)
      setAuditLoading(false)
      return undefined
    }
    let cancelled = false
    void (async () => {
      setAuditLoading(true)
      setAuditErr(null)
      try {
        const { data } = await api.get<AuditLogEntryDto[]>(`/platform-admin/tenancies/${selected.id}/audit-log`)
        if (!cancelled) setAuditLog(Array.isArray(data) ? data : [])
      } catch {
        if (!cancelled) {
          setAuditErr('Could not load audit log.')
          setAuditLog([])
        }
      } finally {
        if (!cancelled) setAuditLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [selected?.id])

  const onPickHit = useCallback(
    (h: TenancySearchHit) => {
      void loadDetail(h.id)
    },
    [loadDetail],
  )

  const openModal = useCallback(
    async (kind: string) => {
      const root = rootRef.current
      const modal = root?.querySelector<HTMLElement>('#modalBackdrop')
      const modalTitle = root?.querySelector<HTMLElement>('#modalTitle')
      const modalCopy = root?.querySelector<HTMLElement>('#modalCopy')
      const actionSelect = root?.querySelector<HTMLSelectElement>('#actionSelect')
      const reasonText = root?.querySelector<HTMLTextAreaElement>('#reasonText')
      const cfg = modalContent[kind] || modalContent.plan
      flushSync(() => {
        setActiveModalKind(kind)
      })
      if (modalTitle) modalTitle.textContent = cfg[0]
      if (modalCopy) modalCopy.textContent = cfg[1]
      if (actionSelect) {
        if (kind === 'plan' && selected) {
          const opts = buildPlanChangeActionOptions(selected)
          actionSelect.innerHTML = opts.map((value) => `<option>${escapeHtml(value)}</option>`).join('')
        } else {
          const list = cfg[2].length ? cfg[2] : ['Confirm']
          actionSelect.innerHTML = list.map((value) => `<option>${escapeHtml(value)}</option>`).join('')
        }
      }
      if (reasonText) reasonText.value = ''
      if (modal) modal.dataset.modalKind = kind
      if (kind === 'price' && selected && root) {
        let catalog = mergeRegisterCatalog(undefined)
        try {
          const { data } = await api.get<RegisterPriceCatalogDto>('/platform-admin/register-prices')
          catalog = mergeRegisterCatalog(data)
        } catch {
          // use merged defaults
        }
        const backdrop = root.querySelector<HTMLElement>('#modalBackdrop')
        if (backdrop?.dataset.modalKind === 'price' && selected) {
          applyPriceModalDOM(root, selected, catalog)
        }
      }
      if (kind === 'plan' && selected && root) {
        updatePlanChangePanels(root, selected)
      }
      modal?.classList.add('visible')
      modal?.setAttribute('aria-hidden', 'false')
    },
    [selected],
  )

  const closeModal = useCallback(() => {
    const root = rootRef.current
    const modal = root?.querySelector<HTMLElement>('#modalBackdrop')
    modal?.classList.remove('visible')
    modal?.setAttribute('aria-hidden', 'true')
    if (modal) modal.dataset.modalKind = ''
    flushSync(() => {
      setActiveModalKind(null)
    })
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
      const navButton = target.closest<HTMLElement>('.tenant-card .nav-item')
      if (navButton?.dataset.target) {
        setActiveNav(navButton.dataset.target)
        root.querySelectorAll('.tenant-card .nav-item').forEach((item) => item.classList.remove('active'))
        navButton.classList.add('active')
        const section = root.querySelector<HTMLElement>(`#${navButton.dataset.target}`)
        section?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        return
      }
      const modalButton = target.closest<HTMLElement>('[data-open-modal]')
      if (modalButton?.dataset.openModal) {
        void openModal(modalButton.dataset.openModal)
        return
      }
      if (target.closest('#closeModal')) {
        closeModal()
        return
      }
      if (target.closest('#confirmModal')) {
        void (async () => {
          const modalBackdrop = root.querySelector<HTMLElement>('#modalBackdrop')
          const kind = modalBackdrop?.dataset.modalKind ?? ''
          const tenantId = selectedRef.current?.id
          if (!tenantId) {
            closeModal()
            return
          }
          const payload = buildPlatformAdminAuditPayload(kind, root)
          if (!payload) {
            window.alert('This action is not recorded in the platform audit log yet.')
            closeModal()
            return
          }
          try {
            await api.post(`/platform-admin/tenancies/${tenantId}/audit-log`, payload)
            await reloadAuditForCurrentSelection()
            closeModal()
          } catch {
            window.alert('Could not save this action to the audit log. Please try again.')
          }
        })()
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

    const onModalFieldChange = (event: Event) => {
      const id = (event.target as HTMLElement | null)?.id
      if (id === 'actionSelect' || id === 'priceDiscountIncludeAddons') {
        updatePriceOverridePanels(root)
        if (selectedRef.current) updatePlanChangePanels(root, selectedRef.current)
      }
    }
    const onModalFieldInput = (event: Event) => {
      const id = (event.target as HTMLElement | null)?.id
      if (id === 'priceDiscountPercent' || id === 'priceCustomInput') updatePriceOverridePanels(root)
    }

    root.addEventListener('click', handleClick)
    root.addEventListener('change', onModalFieldChange)
    root.addEventListener('input', onModalFieldInput)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      root.removeEventListener('click', handleClick)
      root.removeEventListener('change', onModalFieldChange)
      root.removeEventListener('input', onModalFieldInput)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [logout, openModal, closeModal, reloadAuditForCurrentSelection])

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
  const planHistory = useMemo(() => auditLog.map(parsePlanHistoryRow).filter((row): row is PlanHistoryRow => !!row), [auditLog])

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
            <div className="admin-workspace">
              <aside className="admin-sidebar" aria-label="Platform admin sections">
                <div className="admin-sidebar-title">Sections</div>
                {ADMIN_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    className={`admin-sidebar-tab${workspace === tab.id ? ' active' : ''}`}
                    onClick={() => setWorkspace(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </aside>
              <div className="admin-main">
                {workspace === 'tenants' ? (
                  <>
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
                      <button
                        type="button"
                        className={`nav-item${activeNav === 'audit' ? ' active' : ''}`}
                        data-target="audit"
                      >
                        Audit log <span>›</span>
                      </button>
                      <button
                        type="button"
                        className={`nav-item${activeNav === 'plan-history' ? ' active' : ''}`}
                        data-target="plan-history"
                      >
                        Plan history <span>›</span>
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
                            <strong>Address</strong>
                            <span>{selected.companyAddress?.trim() || '—'}</span>
                          </div>
                        </div>
                        <div className="field-card">
                          <div className="field-label">
                            <strong>Postal code</strong>
                            <span>{selected.companyPostalCode?.trim() || '—'}</span>
                          </div>
                        </div>
                        <div className="field-card">
                          <div className="field-label">
                            <strong>City</strong>
                            <span>{selected.companyCity?.trim() || '—'}</span>
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

                    <section className="section-card" id="audit">
                      <div className="section-head">
                        <div className="section-title">
                          <strong>Audit log</strong>
                          <span>
                            Actions recorded from this platform admin console for this tenant (change plan, price
                            override, suspend, add-ons). Confirming a modal writes an entry here.
                          </span>
                        </div>
                      </div>
                      {auditLoading ? <p className="muted">Loading audit log…</p> : null}
                      {auditErr ? <p className="search-err">{auditErr}</p> : null}
                      {!auditLoading && !auditErr && auditLog.length === 0 ? (
                        <p className="muted" style={{ margin: 0 }}>
                          No platform admin actions recorded for this tenant yet.
                        </p>
                      ) : null}
                      {!auditLoading && !auditErr && auditLog.length > 0 ? (
                        <div className="audit-log-wrap">
                          <table className="audit-log-table">
                            <thead>
                              <tr>
                                <th scope="col">When</th>
                                <th scope="col">Type</th>
                                <th scope="col">Summary</th>
                                <th scope="col">Actor</th>
                                <th scope="col">Detail</th>
                              </tr>
                            </thead>
                            <tbody>
                              {auditLog.map((row, i) => (
                                <tr key={`${row.occurredAt}-${row.category}-${row.summary}-${i}`}>
                                  <td>{formatAuditTime(row.occurredAt)}</td>
                                  <td>
                                    <span className={auditCategoryPillClass(row.category)}>{row.category}</span>
                                  </td>
                                  <td>
                                    <code style={{ fontSize: '0.85em', wordBreak: 'break-all' }}>{row.summary}</code>
                                  </td>
                                  <td className="audit-actor-cell">{row.actorEmail?.trim() || '—'}</td>
                                  <td className="audit-detail-cell">{row.detail}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : null}
                    </section>

                    <section className="section-card" id="plan-history">
                      <div className="section-head">
                        <div className="section-title">
                          <strong>Plan history</strong>
                          <span>
                            History of tenant plan changes from Platform Admin with target plan and effective date.
                          </span>
                        </div>
                      </div>
                      {auditLoading ? <p className="muted">Loading plan history…</p> : null}
                      {!auditLoading && !auditErr && planHistory.length === 0 ? (
                        <p className="muted" style={{ margin: 0 }}>
                          No recorded plan changes for this tenant yet.
                        </p>
                      ) : null}
                      {!auditLoading && planHistory.length > 0 ? (
                        <div className="plan-history-wrap">
                          <table className="plan-history-table">
                            <thead>
                              <tr>
                                <th scope="col">Recorded</th>
                                <th scope="col">Action</th>
                                <th scope="col">From</th>
                                <th scope="col">To</th>
                                <th scope="col">Effective date</th>
                                <th scope="col">Status</th>
                                <th scope="col">Actor</th>
                              </tr>
                            </thead>
                            <tbody>
                              {planHistory.map((row, idx) => (
                                <tr key={`${row.recordedAt}-${row.toPlan}-${idx}`}>
                                  <td>{row.recordedAt}</td>
                                  <td>{row.action}</td>
                                  <td>{row.fromPlan}</td>
                                  <td>{row.toPlan}</td>
                                  <td>{row.effectiveDate}</td>
                                  <td>
                                    <span
                                      className={
                                        row.status === 'Scheduled'
                                          ? 'plan-status-pill plan-status-pill--scheduled'
                                          : 'plan-status-pill plan-status-pill--applied'
                                      }
                                    >
                                      {row.status}
                                    </span>
                                  </td>
                                  <td className="audit-actor-cell">{row.actor}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : null}
                    </section>
                  </>
                )}
              </section>
            </section>
                  </>
                ) : workspace === 'plans' ? (
                  <div className="panel panel-pad">
                    <PlanPricesAdminPanel />
                  </div>
                ) : (
                  <AdminComingSoon title={ADMIN_TABS.find((t) => t.id === workspace)?.label ?? 'Section'} />
                )}
              </div>
            </div>
          </main>
        </div>

        <div
          className="modal-backdrop"
          id="modalBackdrop"
          role="dialog"
          aria-modal="true"
          aria-hidden="true"
          data-modal-kind=""
        >
          <div className="modal">
            <h3 id="modalTitle">Admin action</h3>
            <p id="modalCopy">Admin overrides require a reason and create an immutable audit log entry.</p>
            <div className="select-row" id="modalPlanRow">
              <label htmlFor="actionSelect">Action</label>
              <select id="actionSelect">
                <option>Upgrade immediately</option>
              </select>
            </div>
            {activeModalKind === 'plan' && selected ? (
              <div id="planChangeExtras" className="plan-change-extras" hidden>
                <div className="select-row">
                  <label htmlFor="planTargetSelect">New plan</label>
                  <select id="planTargetSelect" />
                </div>
                <p id="planEffectiveDateHint" className="muted" style={{ margin: 0, fontWeight: 800 }} />
              </div>
            ) : null}
            {activeModalKind === 'price' && selected ? (
              <div id="priceOverrideExtras" className="price-override-extras">
                <div id="priceOverridePanelCustom" className="price-override-panel" hidden>
                  <div className="price-current-pill" id="priceCurrentLabelCustom" />
                  <div className="select-row">
                    <label htmlFor="priceCustomInput">New plan price (€)</label>
                    <input id="priceCustomInput" type="number" min={0} step={0.01} inputMode="decimal" />
                    <p className="muted" style={{ margin: 0, fontSize: '0.82rem', fontWeight: 700 }}>
                      Applies to this tenant&apos;s current billing cycle (monthly or annual total shown above).
                    </p>
                  </div>
                </div>
                <div id="priceOverridePanelDiscount" className="price-override-panel" hidden>
                  <div className="price-current-pill" id="priceCurrentLabelDiscount" />
                  <div className="select-row">
                    <label htmlFor="priceDiscountPercent">Discount (%)</label>
                    <input id="priceDiscountPercent" type="number" min={0} max={100} step={0.5} inputMode="decimal" />
                    <label className="checkbox-row">
                      <input id="priceDiscountIncludeAddons" type="checkbox" />
                      <span>Include add-ons in the % discount (preview uses catalog add-on prices as reference).</span>
                    </label>
                    <p id="priceDiscountPreview" className="price-preview" />
                  </div>
                </div>
                <div id="priceOverridePanelRemove" className="price-override-panel" hidden>
                  <p id="priceRemoveCopy" className="muted" style={{ margin: 0, lineHeight: 1.5 }} />
                </div>
              </div>
            ) : null}
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
