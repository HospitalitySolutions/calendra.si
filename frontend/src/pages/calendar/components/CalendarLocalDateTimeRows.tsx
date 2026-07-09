import { ModernTimePicker } from '../../../components/ModernTimePicker'
import { localTodayYmd, scrollIntoViewForAndroidPicker, splitLocalDateTimeParts } from '../calendarDateTime'

type AllDayDateRangeConfig = {
  startLabel: string
  endLabel: string
  onCommitRange: (startYmd: string, endYmd: string) => void
}

/** One row: time from | time to | date (date last). */
export function CalendarLocalTimespanRow({
  startValue,
  endValue,
  onCommitStart,
  onCommitEnd,
  normalize,
  labels,
  allDayToggle,
  onCommitAllDayDate,
  allDayDateRange,
}: {
  startValue: string | undefined
  endValue: string | undefined
  onCommitStart: (localIso: string) => void
  onCommitEnd: (localIso: string) => void
  normalize: (v: string) => string
  labels: { timeFrom: string; timeTo: string; date: string }
  /** When set, shows “All day” switch on the date field; when checked, time fields are hidden. */
  allDayToggle?: { checked: boolean; onToggle: () => void; label: string; captionId: string }
  /** Used when all-day is on so start/end are updated together (avoids partial updates from split commits). */
  onCommitAllDayDate?: (ymd: string) => void
  /** When set, all-day mode uses a from/to date range instead of a single date. */
  allDayDateRange?: AllDayDateRangeConfig
}) {
  const sp = splitLocalDateTimeParts(startValue)
  const ep = splitLocalDateTimeParts(endValue)
  const date = sp.date || ep.date || localTodayYmd()
  const endDate = ep.date || date
  const startTime = sp.time || '09:00'
  const endTime = ep.time || '10:00'
  const allDay = !!allDayToggle?.checked
  const showAllDayDateRange = allDay && !!allDayDateRange
  const dateRangeStart = date
  const dateRangeEnd = endDate < dateRangeStart ? dateRangeStart : endDate

  return (
    <div
      className={[
        'calendar-timespan-row',
        allDayToggle ? 'calendar-timespan-row--with-all-day' : '',
        allDay ? 'calendar-timespan-row--all-day' : '',
        showAllDayDateRange ? 'calendar-timespan-row--all-day-range' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {!allDay && (
        <>
          <div className="calendar-timespan-field">
            <div className="calendar-timespan-input-inner">
              <span className="calendar-timespan-label">{labels.timeFrom}</span>
              <ModernTimePicker
                value={startTime}
                onOpen={(trigger) => scrollIntoViewForAndroidPicker(trigger)}
                onChange={(nextValue) => {
                  if (!nextValue) return
                  onCommitStart(normalize(`${date}T${nextValue}`))
                }}
                ariaLabel={labels.timeFrom}
              />
            </div>
          </div>
          <div className="calendar-timespan-field">
            <div className="calendar-timespan-input-inner">
              <span className="calendar-timespan-label">{labels.timeTo}</span>
              <ModernTimePicker
                value={endTime}
                onOpen={(trigger) => scrollIntoViewForAndroidPicker(trigger)}
                onChange={(nextValue) => {
                  if (!nextValue) return
                  onCommitEnd(normalize(`${date}T${nextValue}`))
                }}
                ariaLabel={labels.timeTo}
              />
            </div>
          </div>
        </>
      )}
      {showAllDayDateRange ? (
        <>
          <div className="calendar-timespan-field calendar-timespan-field--date calendar-timespan-field--date-range">
            <div className="calendar-timespan-input-inner">
              <div className={['calendar-timespan-date-head', allDayToggle ? 'calendar-timespan-date-head--with-all-day' : ''].filter(Boolean).join(' ')}>
                <span className="calendar-timespan-label">{allDayDateRange.startLabel}</span>
                {allDayToggle && (
                  <div className="calendar-timespan-all-day-line" role="group" aria-label={allDayToggle.label}>
                    <label
                      className="repeats-toggle-switch online-live-repeats-switch calendar-timespan-all-day-switch"
                      title={allDayToggle.label}
                    >
                      <input
                        type="checkbox"
                        checked={allDayToggle.checked}
                        aria-labelledby={allDayToggle.captionId}
                        onChange={() => allDayToggle.onToggle()}
                      />
                      <span className="repeats-toggle-slider" />
                    </label>
                    <span id={allDayToggle.captionId} className="calendar-timespan-all-day-caption">
                      {allDayToggle.label}
                    </span>
                  </div>
                )}
              </div>
              <input
                type="date"
                value={dateRangeStart}
                onFocus={(e) => scrollIntoViewForAndroidPicker(e.currentTarget)}
                onChange={(e) => {
                  const nextStart = e.target.value
                  if (!nextStart) return
                  const nextEnd = dateRangeEnd < nextStart ? nextStart : dateRangeEnd
                  allDayDateRange.onCommitRange(nextStart, nextEnd)
                }}
                aria-label={allDayDateRange.startLabel}
              />
            </div>
          </div>
          <div className="calendar-timespan-field calendar-timespan-field--date calendar-timespan-field--date-range">
            <div className="calendar-timespan-input-inner">
              <span className="calendar-timespan-label">{allDayDateRange.endLabel}</span>
              <input
                type="date"
                value={dateRangeEnd}
                min={dateRangeStart}
                onFocus={(e) => scrollIntoViewForAndroidPicker(e.currentTarget)}
                onChange={(e) => {
                  const nextEnd = e.target.value
                  if (!nextEnd) return
                  allDayDateRange.onCommitRange(dateRangeStart, nextEnd < dateRangeStart ? dateRangeStart : nextEnd)
                }}
                aria-label={allDayDateRange.endLabel}
              />
            </div>
          </div>
        </>
      ) : (
        <div className="calendar-timespan-field calendar-timespan-field--date">
          <div className="calendar-timespan-input-inner">
            <div className={['calendar-timespan-date-head', allDayToggle ? 'calendar-timespan-date-head--with-all-day' : ''].filter(Boolean).join(' ')}>
              <span className="calendar-timespan-label">{labels.date}</span>
              {allDayToggle && (
                <div className="calendar-timespan-all-day-line" role="group" aria-label={allDayToggle.label}>
                  <label
                    className="repeats-toggle-switch online-live-repeats-switch calendar-timespan-all-day-switch"
                    title={allDayToggle.label}
                  >
                    <input
                      type="checkbox"
                      checked={allDayToggle.checked}
                      aria-labelledby={allDayToggle.captionId}
                      onChange={() => allDayToggle.onToggle()}
                    />
                    <span className="repeats-toggle-slider" />
                  </label>
                  <span id={allDayToggle.captionId} className="calendar-timespan-all-day-caption">
                    {allDayToggle.label}
                  </span>
                </div>
              )}
            </div>
            <input
              type="date"
              value={date}
              onFocus={(e) => scrollIntoViewForAndroidPicker(e.currentTarget)}
              onChange={(e) => {
                const d = e.target.value
                if (!d) return
                if (allDay && onCommitAllDayDate) {
                  onCommitAllDayDate(d)
                } else {
                  onCommitStart(normalize(`${d}T${startTime}`))
                  onCommitEnd(normalize(`${d}T${endTime}`))
                }
              }}
              aria-label={labels.date}
            />
          </div>
        </div>
      )}
    </div>
  )
}

/** Todo: one row — time from | date (date last). */
export function CalendarLocalTimeDateRow({
  value,
  onCommit,
  normalize,
  labels,
  allDayToggle,
  onCommitAllDayDate,
}: {
  value: string | undefined
  onCommit: (localIso: string) => void
  normalize: (v: string) => string
  labels: { time: string; date: string }
  allDayToggle?: { checked: boolean; onToggle: () => void; label: string; captionId: string }
  onCommitAllDayDate?: (ymd: string) => void
}) {
  const { date, time } = splitLocalDateTimeParts(value)
  const d = date || localTodayYmd()
  const tm = time || '09:00'
  const allDay = !!allDayToggle?.checked

  return (
    <div
      className={['calendar-timespan-row', 'calendar-timespan-row--two', allDayToggle ? 'calendar-timespan-row--with-all-day' : '', allDay ? 'calendar-timespan-row--all-day' : '']
        .filter(Boolean)
        .join(' ')}
    >
      {!allDay && (
        <div className="calendar-timespan-field">
          <div className="calendar-timespan-input-inner">
            <span className="calendar-timespan-label">{labels.time}</span>
            <ModernTimePicker
              value={tm}
              onOpen={(trigger) => scrollIntoViewForAndroidPicker(trigger)}
              onChange={(nextValue) => {
                if (!nextValue) return
                onCommit(normalize(`${d}T${nextValue}`))
              }}
              ariaLabel={labels.time}
            />
          </div>
        </div>
      )}
      <div className="calendar-timespan-field calendar-timespan-field--date">
        <div className="calendar-timespan-input-inner">
          <div className={['calendar-timespan-date-head', allDayToggle ? 'calendar-timespan-date-head--with-all-day' : ''].filter(Boolean).join(' ')}>
            <span className="calendar-timespan-label">{labels.date}</span>
            {allDayToggle && (
              <div className="calendar-timespan-all-day-line" role="group" aria-label={allDayToggle.label}>
                <label
                  className="repeats-toggle-switch online-live-repeats-switch calendar-timespan-all-day-switch"
                  title={allDayToggle.label}
                >
                  <input
                    type="checkbox"
                    checked={allDayToggle.checked}
                    aria-labelledby={allDayToggle.captionId}
                    onChange={() => allDayToggle.onToggle()}
                  />
                  <span className="repeats-toggle-slider" />
                </label>
                <span id={allDayToggle.captionId} className="calendar-timespan-all-day-caption">
                  {allDayToggle.label}
                </span>
              </div>
            )}
          </div>
          <input
            type="date"
            value={d}
            onFocus={(e) => scrollIntoViewForAndroidPicker(e.currentTarget)}
            onChange={(e) => {
              const next = e.target.value
              if (!next) return
              if (allDay && onCommitAllDayDate) {
                onCommitAllDayDate(next)
              } else if (allDay) {
                onCommit(normalize(`${next}T00:00:00`))
              } else {
                onCommit(normalize(`${next}T${tm}`))
              }
            }}
            aria-label={labels.date}
          />
        </div>
      </div>
    </div>
  )
}
