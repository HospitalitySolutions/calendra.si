import { useEffect, useMemo, useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { api } from '../api'
import { useLocale } from '../locale'

type CourseItem = {
  courseId: string
  title: string
  description?: string | null
  mediaType: 'VIDEO' | 'AUDIO'
  thumbnailUrl?: string | null
  bunnyLibraryId?: string | null
  bunnyVideoId?: string | null
  mediaUrl?: string | null
  durationSeconds?: number | null
}

type CourseAccessResponse = CourseItem & {
  validUntil?: string | null
  courses?: CourseItem[] | null
}

type CourseSort = 'recent' | 'title' | 'duration'

type CourseAccessCopy = {
  loading: string
  openTitle: string
  validLifetime: string
  validUntil: string
  unavailable: string
  videoPreparing: string
  audioPreparing: string
  includedCourses: string
  chooseCourse: string
  chooseCourseHint: string
  multipleCourseTitle: (count: number) => string
  singleCourseTitle: string
  continueLearning: string
  resume: string
  currentCourse: string
  otherCourses: string
  allCourses: string
  courseOverview: string
  sortBy: string
  recentlyAdded: string
  titleAsc: string
  durationSort: string
  video: string
  audio: string
  started: string
  notStarted: string
  favorite: string
  favorited: string
  lessonsFallback: string
  totalTime: string
  coursesLabel: string
  courseLabel: string
  needHelp: string
  contactSupport: string
  accessProvided: string
  mobileReady: string
  lifetimeHint: string
  noDescription: string
  selected: string
}

function formatDuration(seconds: number | null | undefined, locale: string, copy?: CourseAccessCopy): string {
  if (!seconds || seconds <= 0) return copy?.lessonsFallback ?? (locale === 'sl' ? 'Čas ni določen' : 'Time not set')
  const minutes = Math.max(1, Math.round(seconds / 60))
  if (minutes < 60) return locale === 'sl' ? `${minutes} min` : `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (rest === 0) return locale === 'sl' ? `${hours} h` : `${hours}h`
  return locale === 'sl' ? `${hours} h ${rest} min` : `${hours}h ${rest}m`
}

function safeLocalStorageGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeLocalStorageSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Ignore storage errors on locked-down browsers/private mode.
  }
}

function courseMediaLabel(item: CourseItem, copy: CourseAccessCopy): string {
  return item.mediaType === 'AUDIO' ? copy.audio : copy.video
}

function CourseThumbnail({ item, index }: { item: CourseItem; index: number }) {
  if (item.thumbnailUrl) {
    return <img src={item.thumbnailUrl} alt="" loading="lazy" />
  }
  return (
    <div className="course-access-thumb-fallback" aria-hidden="true">
      <span>{item.mediaType === 'AUDIO' ? '♪' : '▶'}</span>
      <small>{String(index + 1).padStart(2, '0')}</small>
    </div>
  )
}

function CourseCard({
  item,
  index,
  active,
  opened,
  favorite,
  onSelect,
  onFavorite,
  copy,
  locale,
}: {
  item: CourseItem
  index: number
  active: boolean
  opened: boolean
  favorite: boolean
  onSelect: () => void
  onFavorite: () => void
  copy: CourseAccessCopy
  locale: string
}) {
  return (
    <button
      type="button"
      className={`course-access-card${active ? ' course-access-card--active' : ''}`}
      onClick={onSelect}
      aria-current={active ? 'true' : undefined}
    >
      <span className="course-access-card-thumb"><CourseThumbnail item={item} index={index} /></span>
      <span className="course-access-card-body">
        <span className="course-access-card-title-row">
          <span className="course-access-card-title">{item.title}</span>
          <span
            role="button"
            tabIndex={0}
            className={`course-access-favorite${favorite ? ' course-access-favorite--active' : ''}`}
            aria-label={favorite ? copy.favorited : copy.favorite}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              onFavorite()
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                event.stopPropagation()
                onFavorite()
              }
            }}
          >
            ★
          </span>
        </span>
        <span className="course-access-card-status-row">
          <span className={`course-access-status-dot${opened ? ' course-access-status-dot--started' : ''}`} />
          <span>{opened ? copy.started : copy.notStarted}</span>
          <span aria-hidden="true">•</span>
          <span>{courseMediaLabel(item, copy)}</span>
        </span>
        <span className="course-access-progress" aria-hidden="true">
          <span style={{ width: opened ? '35%' : '0%' }} />
        </span>
        <span className="course-access-card-meta">
          <span>{formatDuration(item.durationSeconds, locale, copy)}</span>
        </span>
      </span>
      <span className="course-access-card-arrow" aria-hidden="true">›</span>
    </button>
  )
}

export function CourseAccessPage() {
  const params = useParams()
  const location = useLocation()
  const { locale } = useLocale()

  const token = useMemo(() => {
    const routeToken = params.token || params.accessToken
    if (routeToken) return routeToken
    const match = location.pathname.match(/\/course-access\/([^/?#]+)/)
    return match ? decodeURIComponent(match[1]) : ''
  }, [location.pathname, params.accessToken, params.token])
  const storageKey = useMemo(() => `calendra-course-access:${token || 'anonymous'}`, [token])
  const [loading, setLoading] = useState(true)
  const [courseAccess, setCourseAccess] = useState<CourseAccessResponse | null>(null)
  const [selectedCourseId, setSelectedCourseId] = useState<string>('')
  const [openedCourseIds, setOpenedCourseIds] = useState<string[]>([])
  const [favoriteCourseIds, setFavoriteCourseIds] = useState<string[]>([])
  const [sortBy, setSortBy] = useState<CourseSort>('recent')
  const [error, setError] = useState('')

  const copy: CourseAccessCopy = locale === 'sl'
    ? {
        loading: 'Nalaganje tečaja…',
        openTitle: 'Dostop do tečaja',
        validLifetime: 'Doživljenjski dostop',
        validUntil: 'Dostop velja do',
        unavailable: 'Tečaj ni na voljo',
        videoPreparing: 'Video se še pripravlja ali Bunny Stream ni nastavljen.',
        audioPreparing: 'Audio datoteka se še pripravlja ali Bunny Storage ni nastavljen.',
        includedCourses: 'Vključeni tečaji',
        chooseCourse: 'Izberi tečaj',
        chooseCourseHint: 'Izberi tečaj za začetek ali nadaljuj tam, kjer si nazadnje končal_a.',
        multipleCourseTitle: (count) => `Dostop ima ${count} tečaje`,
        singleCourseTitle: 'Dostop do tečaja',
        continueLearning: 'Nadaljuj z učenjem',
        resume: 'Nadaljuj',
        currentCourse: 'Trenutni tečaj',
        otherCourses: 'Ostali tečaji',
        allCourses: 'Vsi tečaji',
        courseOverview: 'Pregled tečaja',
        sortBy: 'Razvrsti',
        recentlyAdded: 'Nazadnje dodano',
        titleAsc: 'Naslov A–Ž',
        durationSort: 'Najkrajši najprej',
        video: 'Video',
        audio: 'Audio',
        started: 'Začeto',
        notStarted: 'Ni začeto',
        favorite: 'Dodaj med priljubljene',
        favorited: 'Odstrani iz priljubljenih',
        lessonsFallback: 'Čas ni določen',
        totalTime: 'Skupni čas',
        coursesLabel: 'tečajev',
        courseLabel: 'tečaj',
        needHelp: 'Potrebuješ pomoč?',
        contactSupport: 'Kontaktiraj podporo',
        accessProvided: 'Dostop je omogočen prek Calendra povezave.',
        mobileReady: 'Optimizirano za telefon',
        lifetimeHint: 'Shrani povezavo za ponovni dostop.',
        noDescription: 'Opis za ta tečaj še ni dodan.',
        selected: 'Izbrano',
      }
    : {
        loading: 'Loading course…',
        openTitle: 'Course access',
        validLifetime: 'Lifetime access',
        validUntil: 'Access valid until',
        unavailable: 'Course unavailable',
        videoPreparing: 'The video is still processing or Bunny Stream is not configured.',
        audioPreparing: 'The audio file is still processing or Bunny Storage is not configured.',
        includedCourses: 'Included courses',
        chooseCourse: 'Choose a course',
        chooseCourseHint: 'Choose a course to get started or resume where you left off.',
        multipleCourseTitle: (count) => `You have access to ${count} courses`,
        singleCourseTitle: 'Course access',
        continueLearning: 'Continue learning',
        resume: 'Resume',
        currentCourse: 'Current course',
        otherCourses: 'Other courses',
        allCourses: 'All courses',
        courseOverview: 'Course overview',
        sortBy: 'Sort by',
        recentlyAdded: 'Recently added',
        titleAsc: 'Title A–Z',
        durationSort: 'Shortest first',
        video: 'Video',
        audio: 'Audio',
        started: 'Started',
        notStarted: 'Not started',
        favorite: 'Add to favorites',
        favorited: 'Remove from favorites',
        lessonsFallback: 'Time not set',
        totalTime: 'Total time',
        coursesLabel: 'courses',
        courseLabel: 'course',
        needHelp: 'Need help?',
        contactSupport: 'Contact support',
        accessProvided: 'Your access is provided through a Calendra link.',
        mobileReady: 'Mobile optimized',
        lifetimeHint: 'Save this link for future access.',
        noDescription: 'No description has been added for this course yet.',
        selected: 'Selected',
      }

  useEffect(() => {
    if (!token) {
      setError(locale === 'sl' ? 'Povezava za dostop ni veljavna.' : 'The access link is not valid.')
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    api.get<CourseAccessResponse>(`/course-access/${encodeURIComponent(token)}`)
      .then((res) => {
        if (!cancelled) {
          const courses = Array.isArray(res.data.courses) && res.data.courses.length > 0 ? res.data.courses : [res.data]
          const savedRaw = safeLocalStorageGet(storageKey)
          let saved: { selectedCourseId?: string; openedCourseIds?: string[]; favoriteCourseIds?: string[] } = {}
          if (savedRaw) {
            try {
              saved = JSON.parse(savedRaw) as typeof saved
            } catch {
              saved = {}
            }
          }
          const savedSelected = saved.selectedCourseId && courses.some((item) => item.courseId === saved.selectedCourseId)
            ? saved.selectedCourseId
            : ''
          const first = savedSelected ? courses.find((item) => item.courseId === savedSelected) : courses[0]
          setCourseAccess(res.data)
          setSelectedCourseId(first?.courseId || '')
          setOpenedCourseIds(Array.isArray(saved.openedCourseIds) ? saved.openedCourseIds.filter((id) => courses.some((item) => item.courseId === id)) : [])
          setFavoriteCourseIds(Array.isArray(saved.favoriteCourseIds) ? saved.favoriteCourseIds.filter((id) => courses.some((item) => item.courseId === id)) : [])
          setError('')
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err?.response?.data?.message || (locale === 'sl' ? 'Dostop do tečaja ni več aktiven.' : 'Course access is no longer active.'))
          setCourseAccess(null)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [locale, storageKey, token])

  const accessibleCourses = useMemo<CourseItem[]>(() => {
    if (!courseAccess) return []
    if (Array.isArray(courseAccess.courses) && courseAccess.courses.length > 0) return courseAccess.courses
    return [courseAccess]
  }, [courseAccess])

  const selectedCourse = useMemo<CourseItem | null>(() => {
    if (accessibleCourses.length === 0) return null
    return accessibleCourses.find((item) => item.courseId === selectedCourseId) || accessibleCourses[0]
  }, [accessibleCourses, selectedCourseId])

  const sortedCourses = useMemo(() => {
    const originalIndex = new Map(accessibleCourses.map((course, index) => [course.courseId, index]))
    return [...accessibleCourses].sort((a, b) => {
      const favoriteDelta = Number(favoriteCourseIds.includes(b.courseId)) - Number(favoriteCourseIds.includes(a.courseId))
      if (favoriteDelta !== 0) return favoriteDelta
      if (sortBy === 'title') return a.title.localeCompare(b.title, locale)
      if (sortBy === 'duration') return (a.durationSeconds || Number.MAX_SAFE_INTEGER) - (b.durationSeconds || Number.MAX_SAFE_INTEGER)
      const aOpened = openedCourseIds.includes(a.courseId)
      const bOpened = openedCourseIds.includes(b.courseId)
      if (aOpened !== bOpened) return Number(bOpened) - Number(aOpened)
      return (originalIndex.get(a.courseId) || 0) - (originalIndex.get(b.courseId) || 0)
    })
  }, [accessibleCourses, favoriteCourseIds, locale, openedCourseIds, sortBy])

  const totalDurationSeconds = useMemo(() => (
    accessibleCourses.reduce((sum, item) => sum + (item.durationSeconds || 0), 0)
  ), [accessibleCourses])

  const lastOpenedCourse = useMemo(() => {
    if (selectedCourse && openedCourseIds.includes(selectedCourse.courseId)) return selectedCourse
    const recentId = openedCourseIds.find((id) => accessibleCourses.some((item) => item.courseId === id))
    if (!recentId) return selectedCourse
    return accessibleCourses.find((item) => item.courseId === recentId) || selectedCourse
  }, [accessibleCourses, openedCourseIds, selectedCourse])

  const selectedCourseIndex = useMemo(() => (
    selectedCourse ? accessibleCourses.findIndex((item) => item.courseId === selectedCourse.courseId) : 0
  ), [accessibleCourses, selectedCourse])

  const videoEmbedUrl = useMemo(() => {
    if (!selectedCourse || selectedCourse.mediaType !== 'VIDEO' || !selectedCourse.bunnyLibraryId || !selectedCourse.bunnyVideoId) return ''
    return `https://iframe.mediadelivery.net/embed/${encodeURIComponent(selectedCourse.bunnyLibraryId)}/${encodeURIComponent(selectedCourse.bunnyVideoId)}?autoplay=false&loop=false&muted=false&preload=true&responsive=true`
  }, [selectedCourse])

  useEffect(() => {
    if (!selectedCourseId || accessibleCourses.length === 0) return
    setOpenedCourseIds((current) => {
      const next = [selectedCourseId, ...current.filter((id) => id !== selectedCourseId)]
      safeLocalStorageSet(storageKey, JSON.stringify({ selectedCourseId, openedCourseIds: next, favoriteCourseIds }))
      return next
    })
  }, [accessibleCourses.length, favoriteCourseIds, selectedCourseId, storageKey])

  useEffect(() => {
    if (!selectedCourseId) return
    safeLocalStorageSet(storageKey, JSON.stringify({ selectedCourseId, openedCourseIds, favoriteCourseIds }))
  }, [favoriteCourseIds, openedCourseIds, selectedCourseId, storageKey])

  const toggleFavorite = (courseId: string) => {
    setFavoriteCourseIds((current) => (
      current.includes(courseId) ? current.filter((id) => id !== courseId) : [courseId, ...current]
    ))
  }

  const accessValidityText = courseAccess?.validUntil
    ? `${copy.validUntil} ${new Date(courseAccess.validUntil).toLocaleDateString(locale === 'sl' ? 'sl-SI' : undefined)}`
    : copy.validLifetime

  return (
    <div className="course-access-page">
      <main className="course-access-layout">
        <div className="course-access-brand">Calendra</div>
        <section className="course-access-shell">
          {loading ? (
            <div className="course-access-state">{copy.loading}</div>
          ) : error ? (
            <div className="course-access-state course-access-state--error">
              <h1>{copy.unavailable}</h1>
              <p>{error}</p>
            </div>
          ) : courseAccess && selectedCourse ? (
            <>
              <header className="course-access-hero">
                <div>
                  <div className="course-access-eyebrow"><span aria-hidden="true">▣</span>{copy.openTitle}</div>
                  <h1>{accessibleCourses.length > 1 ? copy.multipleCourseTitle(accessibleCourses.length) : copy.singleCourseTitle}</h1>
                  <p>{courseAccess.description || copy.chooseCourseHint}</p>
                </div>
                <div className="course-access-pill-grid" aria-label={copy.courseOverview}>
                  <span><strong>{accessibleCourses.length}</strong>{accessibleCourses.length === 1 ? copy.courseLabel : copy.coursesLabel}</span>
                  <span><strong>{formatDuration(totalDurationSeconds, locale, copy)}</strong>{copy.totalTime}</span>
                  <span><strong>{courseAccess.validUntil ? new Date(courseAccess.validUntil).toLocaleDateString(locale === 'sl' ? 'sl-SI' : undefined) : '∞'}</strong>{courseAccess.validUntil ? copy.validUntil : copy.validLifetime}</span>
                </div>
              </header>

              <div className="course-access-content-grid">
                <aside className="course-access-sidebar" aria-label={copy.includedCourses}>
                  {accessibleCourses.length > 1 && lastOpenedCourse && (
                    <div className="course-access-resume">
                      <div>
                        <span>{copy.continueLearning}</span>
                        <strong>{lastOpenedCourse.title}</strong>
                      </div>
                      <button type="button" onClick={() => setSelectedCourseId(lastOpenedCourse.courseId)}>{copy.resume}</button>
                    </div>
                  )}

                  <div className="course-access-list-head">
                    <div>
                      <h2>{accessibleCourses.length > 1 ? copy.includedCourses : copy.currentCourse}</h2>
                      <p>{accessibleCourses.length > 1 ? copy.chooseCourseHint : accessValidityText}</p>
                    </div>
                    {accessibleCourses.length > 1 && (
                      <label>
                        <span>{copy.sortBy}</span>
                        <select value={sortBy} onChange={(event) => setSortBy(event.target.value as CourseSort)}>
                          <option value="recent">{copy.recentlyAdded}</option>
                          <option value="title">{copy.titleAsc}</option>
                          <option value="duration">{copy.durationSort}</option>
                        </select>
                      </label>
                    )}
                  </div>

                  <div className="course-access-card-list">
                    {sortedCourses.map((item) => (
                      <CourseCard
                        key={item.courseId}
                        item={item}
                        index={Math.max(0, accessibleCourses.findIndex((course) => course.courseId === item.courseId))}
                        active={item.courseId === selectedCourse.courseId}
                        opened={openedCourseIds.includes(item.courseId)}
                        favorite={favoriteCourseIds.includes(item.courseId)}
                        onSelect={() => setSelectedCourseId(item.courseId)}
                        onFavorite={() => toggleFavorite(item.courseId)}
                        copy={copy}
                        locale={locale}
                      />
                    ))}
                  </div>

                  <div className="course-access-help-card">
                    <span aria-hidden="true">?</span>
                    <div>
                      <strong>{copy.needHelp}</strong>
                      <a href="mailto:support@calendra.si">{copy.contactSupport}</a>
                    </div>
                  </div>
                </aside>

                <article className="course-access-player-panel">
                  <div className="course-access-player-head">
                    <div className="course-access-selected-thumb">
                      <CourseThumbnail item={selectedCourse} index={Math.max(0, selectedCourseIndex)} />
                    </div>
                    <div>
                      <div className="course-access-selected-label">{copy.selected} · {courseMediaLabel(selectedCourse, copy)}</div>
                      <h2>{selectedCourse.title}</h2>
                      <p>{selectedCourse.description || copy.noDescription}</p>
                    </div>
                  </div>

                  <div className="course-access-stat-row" aria-label={copy.courseOverview}>
                    <span><strong>{courseMediaLabel(selectedCourse, copy)}</strong>{locale === 'sl' ? 'Vrsta' : 'Type'}</span>
                    <span><strong>{formatDuration(selectedCourse.durationSeconds, locale, copy)}</strong>{copy.totalTime}</span>
                    <span><strong>{openedCourseIds.includes(selectedCourse.courseId) ? copy.started : copy.notStarted}</strong>{locale === 'sl' ? 'Stanje' : 'Status'}</span>
                  </div>

                  <div className="course-access-media-frame">
                    {selectedCourse.mediaType === 'VIDEO' ? (
                      videoEmbedUrl ? (
                        <iframe
                          title={selectedCourse.title}
                          src={videoEmbedUrl}
                          allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
                          allowFullScreen
                        />
                      ) : (
                        <div className="course-access-media-empty">{copy.videoPreparing}</div>
                      )
                    ) : selectedCourse.mediaUrl ? (
                      <div className="course-access-audio-card">
                        <div className="course-access-audio-icon" aria-hidden="true">♪</div>
                        <audio controls src={selectedCourse.mediaUrl} />
                      </div>
                    ) : (
                      <div className="course-access-media-empty">{copy.audioPreparing}</div>
                    )}
                  </div>

                  {accessibleCourses.length > 1 && (
                    <div className="course-access-next-grid">
                      <div>
                        <strong>{copy.courseOverview}</strong>
                        <p>{copy.accessProvided} {copy.lifetimeHint}</p>
                      </div>
                      <div>
                        <strong>{copy.mobileReady}</strong>
                        <p>{accessValidityText}</p>
                      </div>
                    </div>
                  )}
                </article>
              </div>
            </>
          ) : null}
        </section>
      </main>
    </div>
  )
}
