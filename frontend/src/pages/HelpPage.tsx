import { useMemo, useState } from 'react'
import { Card, PageHeader } from '../components/ui'
import { HELP_ENTRIES, type HelpSection } from '../helpContent'
import { useLocale } from '../locale'

const SECTION_ORDER: HelpSection[] = ['configuration', 'sessionTypes', 'calendar']

const SECTION_LABEL_KEY: Record<HelpSection, string> = {
  configuration: 'helpSectionConfiguration',
  sessionTypes: 'helpSectionSessionTypes',
  calendar: 'helpSectionCalendar',
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className={`help-page-chevron${open ? ' help-page-chevron--open' : ''}`}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

export function HelpPage() {
  const { t } = useLocale()
  const [openSection, setOpenSection] = useState<HelpSection | null>(null)
  const [openEntryId, setOpenEntryId] = useState<string | null>(null)

  const grouped = useMemo(() => {
    const next: Record<HelpSection, typeof HELP_ENTRIES> = { configuration: [], sessionTypes: [], calendar: [] }
    for (const entry of HELP_ENTRIES) {
      next[entry.section].push(entry)
    }
    return next
  }, [])

  const toggleSection = (section: HelpSection) => {
    if (openSection === section) {
      setOpenSection(null)
      setOpenEntryId(null)
    } else {
      setOpenSection(section)
      setOpenEntryId(null)
    }
  }

  const toggleEntry = (section: HelpSection, id: string) => {
    if (openSection !== section) return
    setOpenEntryId((prev) => (prev === id ? null : id))
  }

  return (
    <div className="stack gap-lg">
      <PageHeader title={t('helpPageTitle')} subtitle={t('helpPageSubtitle')} />
      {SECTION_ORDER.map((section) => {
        const entries = grouped[section]
        if (entries.length === 0) return null
        const sectionOpen = openSection === section
        return (
          <Card key={section} className="settings-card help-page-section-card">
            <button
              type="button"
              className="help-page-section-trigger"
              aria-expanded={sectionOpen}
              onClick={() => toggleSection(section)}
            >
              <span className="help-page-section-trigger-label">{t(SECTION_LABEL_KEY[section])}</span>
              <Chevron open={sectionOpen} />
            </button>
            {sectionOpen ? (
              <ul className="help-page-accordion-entries">
                {entries.map((e) => {
                  const entryOpen = openEntryId === e.id
                  return (
                    <li key={e.id} className="help-page-accordion-entry">
                      <button
                        type="button"
                        className="help-page-entry-trigger"
                        aria-expanded={entryOpen}
                        onClick={() => toggleEntry(section, e.id)}
                      >
                        <span>{t(e.titleKey)}</span>
                        <Chevron open={entryOpen} />
                      </button>
                      {entryOpen ? (
                        <p className="muted help-page-entry-body">{t(e.tooltipKey)}</p>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            ) : null}
          </Card>
        )
      })}
    </div>
  )
}
