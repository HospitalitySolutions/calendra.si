/** Single source of truth for `?` tooltip copy and the `/help` page. */

export type HelpSection = 'configuration' | 'sessionTypes' | 'calendar'

export type HelpEntry = {
  id: string
  section: HelpSection
  /** Locale key for the feature name on `/help` */
  titleKey: string
  /** Locale key for tooltip body (same as `data-tooltip` today) */
  tooltipKey: string
  /** Optional; calendar booking panel uses separate aria copy */
  ariaKey?: string
}

export const HELP_ENTRIES: HelpEntry[] = [
  {
    id: 'cfg-session-length',
    section: 'configuration',
    titleKey: 'configModulesSessionLengthLabel',
    tooltipKey: 'configModulesSessionLengthHelp',
  },
  {
    id: 'cfg-work-from',
    section: 'configuration',
    titleKey: 'configModulesWorkFromLabel',
    tooltipKey: 'configModulesWorkFromHelp',
  },
  {
    id: 'cfg-work-to',
    section: 'configuration',
    titleKey: 'configModulesWorkToLabel',
    tooltipKey: 'configModulesWorkToHelp',
  },
  {
    id: 'cfg-personal-tasks',
    section: 'configuration',
    titleKey: 'configBookingTasksTab',
    tooltipKey: 'configPersonalTasksHelp',
  },
  {
    id: 'cfg-spaces',
    section: 'configuration',
    titleKey: 'configBookingSpacesTab',
    tooltipKey: 'configSpacesHelp',
  },
  {
    id: 'cfg-types',
    section: 'sessionTypes',
    titleKey: 'tabSessionServiceTypes',
    tooltipKey: 'configTypesHelp',
  },
  {
    id: 'cfg-mod-spaces',
    section: 'configuration',
    titleKey: 'configModulesSpacesLabel',
    tooltipKey: 'configModulesSpacesHelp',
  },
  {
    id: 'cfg-mod-availability',
    section: 'configuration',
    titleKey: 'configModulesAvailabilityLabel',
    tooltipKey: 'configModulesAvailabilityHelp',
  },
  {
    id: 'cfg-mod-ai',
    section: 'configuration',
    titleKey: 'configModulesAiLabel',
    tooltipKey: 'configModulesAiHelp',
  },
  {
    id: 'cfg-mod-personal',
    section: 'configuration',
    titleKey: 'configModulesPersonalLabel',
    tooltipKey: 'configModulesPersonalHelp',
  },
  {
    id: 'cfg-mod-todos',
    section: 'configuration',
    titleKey: 'configModulesTodosLabel',
    tooltipKey: 'configModulesTodosHelp',
  },
  {
    id: 'cal-availability',
    section: 'calendar',
    titleKey: 'calendarModeAvailability',
    tooltipKey: 'calendarAvailabilityTooltip',
    ariaKey: 'calendarAvailabilityHelpAria',
  },
  {
    id: 'cal-todo',
    section: 'calendar',
    titleKey: 'formTodo',
    tooltipKey: 'formTodoSubtitle',
    ariaKey: 'calendarTodoHelpAria',
  },
  {
    id: 'cal-personal',
    section: 'calendar',
    titleKey: 'formPersonalBlock',
    tooltipKey: 'formPersonalSubtitle',
    ariaKey: 'formPersonalBlockHelpAria',
  },
  {
    id: 'cal-book',
    section: 'calendar',
    titleKey: 'formBookSession',
    tooltipKey: 'calendarBookSessionTooltip',
    ariaKey: 'formBookSessionHelpAria',
  },
]

const HELP_BY_ID: Record<string, HelpEntry> = Object.fromEntries(HELP_ENTRIES.map((e) => [e.id, e]))

export function helpTitle(t: (key: string) => string, id: string): string {
  const e = HELP_BY_ID[id]
  return e ? t(e.titleKey) : ''
}

export function helpTooltip(t: (key: string) => string, id: string): string {
  const e = HELP_BY_ID[id]
  return e ? t(e.tooltipKey) : ''
}

export function helpAria(t: (key: string) => string, id: string): string {
  const e = HELP_BY_ID[id]
  if (!e) return ''
  return e.ariaKey ? t(e.ariaKey) : t(e.tooltipKey)
}

/** Matches `renderBookingModeTitle` mode selection on the calendar. */
export function calendarBookingPanelHelpId(state: {
  hasAvailabilitySelection: boolean
  todo: boolean
  personal: boolean
}): string {
  if (state.hasAvailabilitySelection) return 'cal-availability'
  if (state.todo) return 'cal-todo'
  if (state.personal) return 'cal-personal'
  return 'cal-book'
}
