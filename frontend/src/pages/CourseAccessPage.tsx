import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  progressPositionSeconds?: number | null
  progressDurationSeconds?: number | null
  progressPercent?: number | null
  completed?: boolean | null
  lastPlayedAt?: string | null
}

type CourseAccessResponse = CourseItem & {
  validUntil?: string | null
  courses?: CourseItem[] | null
}

type CourseProgress = {
  positionSeconds: number
  durationSeconds?: number | null
  progressPercent: number
  completed: boolean
  lastPlayedAt?: string | null
}

type CourseProgressPatch = {
  positionSeconds?: number | null
  durationSeconds?: number | null
  progressPercent?: number | null
  completed?: boolean | null
  lastPlayedAt?: string | null
}

type StoredCourseAccessState = {
  selectedCourseId?: string
  openedCourseIds?: string[]
  favoriteCourseIds?: string[]
  progressByCourseId?: Record<string, CourseProgress>
}

type CourseSort = 'recent' | 'title' | 'duration'

type BunnyPlayer = {
  on: (eventName: string, callback: (data?: unknown) => void) => void
  off?: (eventName: string, callback?: (data?: unknown) => void) => void
  getDuration?: (callback: (duration: unknown) => void) => void
  getCurrentTime?: (callback: (time: unknown) => void) => void
  setCurrentTime?: (time: number) => void
}

type PlayerJsConstructor = new (element: HTMLIFrameElement) => BunnyPlayer

declare global {
  interface Window {
    playerjs?: {
      Player?: PlayerJsConstructor
    }
  }
}

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
  completed: string
  favorite: string
  favorited: string
  lessonsFallback: string
  totalTime: string
  currentPosition: string
  progress: string
  watched: string
  resumeAt: (time: string) => string
  coursesLabel: string
  courseLabel: string
  needHelp: string
  contactSupport: string
  accessProvided: string
  mobileReady: string
  lifetimeHint: string
  noDescription: string
  selected: string
  type: string
  status: string
}

function normalizeSeconds(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.floor(value))
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return Math.max(0, Math.floor(parsed))
  }
  if (value && typeof value === 'object') {
    const data = value as Record<string, unknown>
    return normalizeSeconds(data.seconds ?? data.currentTime ?? data.time ?? data.duration)
  }
  return null
}

function clampPercent(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, Math.min(100, Math.round(parsed * 10) / 10))
}

function progressFrom(positionSeconds = 0, durationSeconds?: number | null, completed = false): CourseProgress {
  const position = Math.max(0, Math.floor(positionSeconds || 0))
  const duration = durationSeconds && durationSeconds > 0 ? Math.max(1, Math.floor(durationSeconds)) : null
  const percent = duration ? clampPercent((position / duration) * 100) : 0
  return {
    positionSeconds: duration ? Math.min(position, duration) : position,
    durationSeconds: duration,
    progressPercent: completed ? 100 : percent,
    completed: completed || percent >= 90,
  }
}

function mergeProgress(current: CourseProgress | undefined, patch: CourseProgressPatch): CourseProgress {
  const duration = patch.durationSeconds && patch.durationSeconds > 0
    ? Math.floor(patch.durationSeconds)
    : current?.durationSeconds ?? null
  const position = patch.positionSeconds != null
    ? Math.max(0, Math.floor(patch.positionSeconds))
    : current?.positionSeconds ?? 0
  const computed = progressFrom(position, duration, Boolean(current?.completed || patch.completed))
  return {
    ...computed,
    progressPercent: patch.progressPercent != null ? clampPercent(patch.progressPercent) : computed.progressPercent,
    completed: Boolean(current?.completed || patch.completed || computed.completed),
    lastPlayedAt: patch.lastPlayedAt || current?.lastPlayedAt || new Date().toISOString(),
  }
}

function getKnownDuration(item: CourseItem, progress?: CourseProgress): number | null {
  const candidates = [progress?.durationSeconds, item.progressDurationSeconds, item.durationSeconds]
  for (const value of candidates) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.floor(value)
  }
  return null
}

function getKnownProgress(item: CourseItem, localProgress?: CourseProgress): CourseProgress {
  const fromItem = progressFrom(
    item.progressPositionSeconds || 0,
    item.progressDurationSeconds || item.durationSeconds || null,
    Boolean(item.completed),
  )
  if (item.progressPercent != null) fromItem.progressPercent = clampPercent(item.progressPercent)
  if (item.lastPlayedAt) fromItem.lastPlayedAt = item.lastPlayedAt
  return localProgress || fromItem
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

function formatClock(seconds: number | null | undefined): string {
  const safe = Math.max(0, Math.floor(seconds || 0))
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const rest = safe % 60
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
  return `${minutes}:${String(rest).padStart(2, '0')}`
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

function readStoredState(storageKey: string): StoredCourseAccessState {
  const savedRaw = safeLocalStorageGet(storageKey)
  if (!savedRaw) return {}
  try {
    return JSON.parse(savedRaw) as StoredCourseAccessState
  } catch {
    return {}
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
  progress,
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
  progress: CourseProgress
  onSelect: () => void
  onFavorite: () => void
  copy: CourseAccessCopy
  locale: string
}) {
  const knownDuration = getKnownDuration(item, progress)
  const progressPercent = progress.completed ? 100 : clampPercent(progress.progressPercent)
  const isStarted = opened || progress.positionSeconds > 0 || progressPercent > 0
  const statusText = progress.completed ? copy.completed : isStarted ? copy.started : copy.notStarted
  const progressText = progress.positionSeconds > 0
    ? `${copy.resumeAt(formatClock(progress.positionSeconds))}${knownDuration ? ` · ${Math.round(progressPercent)}%` : ''}`
    : formatDuration(knownDuration, locale, copy)

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
          <span className={`course-access-status-dot${isStarted ? ' course-access-status-dot--started' : ''}${progress.completed ? ' course-access-status-dot--completed' : ''}`} />
          <span>{statusText}</span>
          <span aria-hidden="true">•</span>
          <span>{courseMediaLabel(item, copy)}</span>
        </span>
        <span className="course-access-progress" aria-label={`${Math.round(progressPercent)}%`}>
          <span style={{ width: `${progressPercent}%` }} />
        </span>
        <span className="course-access-card-meta">
          <span>{progressText}</span>
        </span>
      </span>
      <span className="course-access-card-arrow" aria-hidden="true">›</span>
    </button>
  )
}

const BUNNY_PLAYER_SCRIPT_ID = 'bunny-playerjs-sdk'
const BUNNY_PLAYER_SCRIPT_SRC = 'https://assets.mediadelivery.net/playerjs/player-0.1.0.min.js'

function loadBunnyPlayerScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  if (window.playerjs?.Player) return Promise.resolve()
  const existing = document.getElementById(BUNNY_PLAYER_SCRIPT_ID) as HTMLScriptElement | null
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('Bunny Player.js failed to load.')), { once: true })
    })
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.id = BUNNY_PLAYER_SCRIPT_ID
    script.src = BUNNY_PLAYER_SCRIPT_SRC
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Bunny Player.js failed to load.'))
    document.head.appendChild(script)
  })
}

function BunnyCoursePlayer({
  title,
  src,
  startSeconds,
  durationSeconds,
  onProgress,
  loadingLabel,
}: {
  title: string
  src: string
  startSeconds: number
  durationSeconds?: number | null
  onProgress: (patch: CourseProgressPatch, options?: { persist?: boolean }) => void
  loadingLabel: string
}) {
  const [scriptReady, setScriptReady] = useState(() => typeof window !== 'undefined' && Boolean(window.playerjs?.Player))
  const [scriptFailed, setScriptFailed] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const playerRef = useRef<BunnyPlayer | null>(null)
  const lastPersistAtRef = useRef(0)
  const latestPositionRef = useRef(startSeconds || 0)
  const latestDurationRef = useRef(durationSeconds || null)
  const didSeekRef = useRef(false)

  useEffect(() => {
    if (scriptReady) return
    let cancelled = false
    loadBunnyPlayerScript()
      .then(() => { if (!cancelled) setScriptReady(true) })
      .catch(() => { if (!cancelled) setScriptFailed(true) })
    return () => { cancelled = true }
  }, [scriptReady])

  useEffect(() => {
    latestPositionRef.current = startSeconds || 0
    latestDurationRef.current = durationSeconds || null
    didSeekRef.current = false
  }, [src, startSeconds, durationSeconds])

  useEffect(() => {
    let cancelled = false
    let readyHandler: ((data?: unknown) => void) | null = null
    let durationHandler: ((data?: unknown) => void) | null = null
    let timeHandler: ((data?: unknown) => void) | null = null
    let pauseHandler: ((data?: unknown) => void) | null = null
    let endedHandler: ((data?: unknown) => void) | null = null

    if (!scriptReady || !iframeRef.current || !window.playerjs?.Player) return
    const player = new window.playerjs.Player(iframeRef.current)
    playerRef.current = player

    const persistCurrent = (force = false) => {
          const position = latestPositionRef.current
          const duration = latestDurationRef.current
          if (!force && position <= 0 && !duration) return
          onProgress(
            {
              positionSeconds: position,
              durationSeconds: duration,
              completed: duration ? position >= duration * 0.9 : false,
            },
            { persist: true },
          )
        }

        const maybeSeek = () => {
          if (didSeekRef.current || !player.setCurrentTime) return
          const start = latestPositionRef.current
          if (start > 3) {
            try { player.setCurrentTime(start) } catch { /* Player might reject an early seek while loading. */ }
          }
          didSeekRef.current = true
        }

        const updateDuration = (value: unknown, persist = false) => {
          const duration = normalizeSeconds(value)
          if (!duration || duration <= 0) return
          latestDurationRef.current = duration
          onProgress({ durationSeconds: duration, positionSeconds: latestPositionRef.current }, { persist })
        }

        readyHandler = () => {
          if (player.getDuration) {
            try { player.getDuration((duration) => updateDuration(duration, true)) } catch { /* Ignore unsupported calls. */ }
          }
          maybeSeek()
        }
        durationHandler = (data) => updateDuration(data, true)
        timeHandler = (data) => {
          const seconds = normalizeSeconds(data)
          if (seconds == null) return
          latestPositionRef.current = seconds
          const duration = latestDurationRef.current
          onProgress({ positionSeconds: seconds, durationSeconds: duration }, { persist: false })
          const now = Date.now()
          if (now - lastPersistAtRef.current > 8000 && seconds > 0) {
            lastPersistAtRef.current = now
            persistCurrent(false)
          }
        }
        pauseHandler = () => persistCurrent(true)
        endedHandler = () => {
          const duration = latestDurationRef.current
          onProgress(
            {
              positionSeconds: duration || latestPositionRef.current,
              durationSeconds: duration,
              progressPercent: 100,
              completed: true,
            },
            { persist: true },
          )
        }

    player.on('ready', readyHandler)
    player.on('durationchange', durationHandler)
    player.on('timeupdate', timeHandler)
    player.on('pause', pauseHandler)
    player.on('ended', endedHandler)

    return () => {
      cancelled = true
      const player = playerRef.current
      try {
        if (player?.off) {
          if (readyHandler) player.off('ready', readyHandler)
          if (durationHandler) player.off('durationchange', durationHandler)
          if (timeHandler) player.off('timeupdate', timeHandler)
          if (pauseHandler) player.off('pause', pauseHandler)
          if (endedHandler) player.off('ended', endedHandler)
        }
      } catch {
        // Best-effort cleanup only.
      }
      playerRef.current = null
    }
  }, [onProgress, scriptReady, src])

  if (!scriptReady && !scriptFailed) {
    return <div className="course-access-media-empty">{loadingLabel}</div>
  }

  return (
    <iframe
      ref={iframeRef}
      title={title}
      src={src}
      allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
      allowFullScreen
    />
  )
}

function AudioCoursePlayer({
  src,
  startSeconds,
  durationSeconds,
  onProgress,
  loadingLabel: _loadingLabel,
}: {
  src: string
  startSeconds: number
  durationSeconds?: number | null
  loadingLabel?: string
  onProgress: (patch: CourseProgressPatch, options?: { persist?: boolean }) => void
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const lastPersistAtRef = useRef(0)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || startSeconds <= 3) return
    const applyStart = () => {
      try { audio.currentTime = startSeconds } catch { /* Ignore unsupported seek. */ }
    }
    if (audio.readyState >= 1) applyStart()
    else audio.addEventListener('loadedmetadata', applyStart, { once: true })
    return () => audio.removeEventListener('loadedmetadata', applyStart)
  }, [src, startSeconds])

  return (
    <audio
      ref={audioRef}
      controls
      src={src}
      onLoadedMetadata={(event) => {
        const duration = normalizeSeconds(event.currentTarget.duration)
        if (duration) onProgress({ durationSeconds: duration, positionSeconds: startSeconds }, { persist: true })
      }}
      onTimeUpdate={(event) => {
        const position = normalizeSeconds(event.currentTarget.currentTime) || 0
        const duration = normalizeSeconds(event.currentTarget.duration)
        onProgress({ positionSeconds: position, durationSeconds: duration }, { persist: false })
        const now = Date.now()
        if (now - lastPersistAtRef.current > 8000 && position > 0) {
          lastPersistAtRef.current = now
          onProgress({ positionSeconds: position, durationSeconds: duration }, { persist: true })
        }
      }}
      onPause={(event) => {
        onProgress({ positionSeconds: event.currentTarget.currentTime, durationSeconds: event.currentTarget.duration }, { persist: true })
      }}
      onEnded={(event) => {
        const duration = normalizeSeconds(event.currentTarget.duration)
        onProgress({ positionSeconds: duration || event.currentTarget.currentTime, durationSeconds: duration, progressPercent: 100, completed: true }, { persist: true })
      }}
    />
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
  const [progressByCourseId, setProgressByCourseId] = useState<Record<string, CourseProgress>>({})
  const [sortBy, setSortBy] = useState<CourseSort>('recent')
  const [error, setError] = useState('')
  const persistTimeoutRef = useRef<number | null>(null)
  const latestLocalStateRef = useRef<StoredCourseAccessState>({})

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
        completed: 'Zaključeno',
        favorite: 'Dodaj med priljubljene',
        favorited: 'Odstrani iz priljubljenih',
        lessonsFallback: 'Čas ni določen',
        totalTime: 'Skupni čas',
        currentPosition: 'Trenutni položaj',
        progress: 'Napredek',
        watched: 'ogledano',
        resumeAt: (time) => `Nadaljuj pri ${time}`,
        coursesLabel: 'tečajev',
        courseLabel: 'tečaj',
        needHelp: 'Potrebuješ pomoč?',
        contactSupport: 'Kontaktiraj podporo',
        accessProvided: 'Dostop je omogočen prek Calendra povezave.',
        mobileReady: 'Optimizirano za telefon',
        lifetimeHint: 'Shrani povezavo za ponovni dostop.',
        noDescription: 'Opis za ta tečaj še ni dodan.',
        selected: 'Izbrano',
        type: 'Vrsta',
        status: 'Stanje',
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
        completed: 'Completed',
        favorite: 'Add to favorites',
        favorited: 'Remove from favorites',
        lessonsFallback: 'Time not set',
        totalTime: 'Total time',
        currentPosition: 'Current position',
        progress: 'Progress',
        watched: 'watched',
        resumeAt: (time) => `Resume at ${time}`,
        coursesLabel: 'courses',
        courseLabel: 'course',
        needHelp: 'Need help?',
        contactSupport: 'Contact support',
        accessProvided: 'Your access is provided through a Calendra link.',
        mobileReady: 'Mobile optimized',
        lifetimeHint: 'Save this link for future access.',
        noDescription: 'No description has been added for this course yet.',
        selected: 'Selected',
        type: 'Type',
        status: 'Status',
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
          const saved = readStoredState(storageKey)
          const progressById: Record<string, CourseProgress> = {}
          courses.forEach((item) => {
            const savedProgress = saved.progressByCourseId?.[item.courseId]
            progressById[item.courseId] = getKnownProgress(item, savedProgress)
          })
          const savedSelected = saved.selectedCourseId && courses.some((item) => item.courseId === saved.selectedCourseId)
            ? saved.selectedCourseId
            : ''
          const mostRecentProgress = Object.entries(progressById)
            .filter(([, progress]) => progress.positionSeconds > 0 || progress.completed)
            .sort(([, a], [, b]) => new Date(b.lastPlayedAt || 0).getTime() - new Date(a.lastPlayedAt || 0).getTime())[0]
          const initialCourseId = savedSelected || mostRecentProgress?.[0] || courses[0]?.courseId || ''
          setCourseAccess(res.data)
          setSelectedCourseId(initialCourseId)
          setProgressByCourseId(progressById)
          setOpenedCourseIds(Array.isArray(saved.openedCourseIds)
            ? saved.openedCourseIds.filter((id) => courses.some((item) => item.courseId === id))
            : Object.keys(progressById).filter((id) => progressById[id].positionSeconds > 0 || progressById[id].completed))
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

  const selectedProgress = selectedCourse ? getKnownProgress(selectedCourse, progressByCourseId[selectedCourse.courseId]) : null

  const sortedCourses = useMemo(() => {
    const originalIndex = new Map(accessibleCourses.map((course, index) => [course.courseId, index]))
    return [...accessibleCourses].sort((a, b) => {
      const favoriteDelta = Number(favoriteCourseIds.includes(b.courseId)) - Number(favoriteCourseIds.includes(a.courseId))
      if (favoriteDelta !== 0) return favoriteDelta
      if (sortBy === 'title') return a.title.localeCompare(b.title, locale)
      if (sortBy === 'duration') return (getKnownDuration(a, progressByCourseId[a.courseId]) || Number.MAX_SAFE_INTEGER) - (getKnownDuration(b, progressByCourseId[b.courseId]) || Number.MAX_SAFE_INTEGER)
      const aProgress = progressByCourseId[a.courseId]
      const bProgress = progressByCourseId[b.courseId]
      const aStarted = openedCourseIds.includes(a.courseId) || (aProgress?.positionSeconds || 0) > 0
      const bStarted = openedCourseIds.includes(b.courseId) || (bProgress?.positionSeconds || 0) > 0
      if (aStarted !== bStarted) return Number(bStarted) - Number(aStarted)
      return (originalIndex.get(a.courseId) || 0) - (originalIndex.get(b.courseId) || 0)
    })
  }, [accessibleCourses, favoriteCourseIds, locale, openedCourseIds, progressByCourseId, sortBy])

  const totalDurationSeconds = useMemo(() => (
    accessibleCourses.reduce((sum, item) => sum + (getKnownDuration(item, progressByCourseId[item.courseId]) || 0), 0)
  ), [accessibleCourses, progressByCourseId])

  const lastOpenedCourse = useMemo(() => {
    const byProgress = [...accessibleCourses]
      .filter((item) => {
        const progress = progressByCourseId[item.courseId]
        return progress && (progress.positionSeconds > 0 || progress.completed)
      })
      .sort((a, b) => new Date(progressByCourseId[b.courseId]?.lastPlayedAt || 0).getTime() - new Date(progressByCourseId[a.courseId]?.lastPlayedAt || 0).getTime())[0]
    if (byProgress) return byProgress
    if (selectedCourse && openedCourseIds.includes(selectedCourse.courseId)) return selectedCourse
    const recentId = openedCourseIds.find((id) => accessibleCourses.some((item) => item.courseId === id))
    if (!recentId) return selectedCourse
    return accessibleCourses.find((item) => item.courseId === recentId) || selectedCourse
  }, [accessibleCourses, openedCourseIds, progressByCourseId, selectedCourse])

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
      return next
    })
  }, [accessibleCourses.length, selectedCourseId])

  useEffect(() => {
    latestLocalStateRef.current = { selectedCourseId, openedCourseIds, favoriteCourseIds, progressByCourseId }
    if (!selectedCourseId) return
    safeLocalStorageSet(storageKey, JSON.stringify(latestLocalStateRef.current))
  }, [favoriteCourseIds, openedCourseIds, progressByCourseId, selectedCourseId, storageKey])

  const persistProgress = useCallback((courseId: string, progress: CourseProgress) => {
    if (!token || !courseId) return
    api.post(`/course-access/${encodeURIComponent(token)}/progress`, {
      courseId,
      positionSeconds: progress.positionSeconds,
      durationSeconds: progress.durationSeconds,
      completed: progress.completed,
    })
      .then((res) => {
        const data = res.data as CourseProgressPatch
        setProgressByCourseId((current) => ({
          ...current,
          [courseId]: mergeProgress(current[courseId], data),
        }))
      })
      .catch(() => {
        // Keep local progress even if the public progress save fails temporarily.
      })
  }, [token])

  const updateCourseProgress = useCallback((courseId: string, patch: CourseProgressPatch, options?: { persist?: boolean }) => {
    if (!courseId) return
    const nextProgress = mergeProgress(latestLocalStateRef.current.progressByCourseId?.[courseId], patch)
    setProgressByCourseId((current) => ({
      ...current,
      [courseId]: mergeProgress(current[courseId], patch),
    }))
    setOpenedCourseIds((current) => [courseId, ...current.filter((id) => id !== courseId)])
    if (options?.persist) {
      if (persistTimeoutRef.current) window.clearTimeout(persistTimeoutRef.current)
      persistTimeoutRef.current = window.setTimeout(() => {
        persistProgress(courseId, nextProgress)
      }, 150)
    }
  }, [persistProgress])

  useEffect(() => () => {
    if (persistTimeoutRef.current) window.clearTimeout(persistTimeoutRef.current)
  }, [])

  const toggleFavorite = (courseId: string) => {
    setFavoriteCourseIds((current) => (
      current.includes(courseId) ? current.filter((id) => id !== courseId) : [courseId, ...current]
    ))
  }

  const accessValidityText = courseAccess?.validUntil
    ? `${copy.validUntil} ${new Date(courseAccess.validUntil).toLocaleDateString(locale === 'sl' ? 'sl-SI' : undefined)}`
    : copy.validLifetime

  const selectedDuration = selectedCourse && selectedProgress ? getKnownDuration(selectedCourse, selectedProgress) : null
  const selectedPercent = selectedProgress ? (selectedProgress.completed ? 100 : clampPercent(selectedProgress.progressPercent)) : 0
  const selectedStatusText = selectedProgress?.completed
    ? copy.completed
    : selectedProgress && selectedProgress.positionSeconds > 0
      ? copy.started
      : copy.notStarted
  const selectedProgressText = selectedProgress && selectedDuration
    ? `${formatClock(selectedProgress.positionSeconds)} / ${formatClock(selectedDuration)}`
    : selectedProgress && selectedProgress.positionSeconds > 0
      ? formatClock(selectedProgress.positionSeconds)
      : '0:00'

  const handleSelectedCourseProgress = useCallback((patch: CourseProgressPatch, options?: { persist?: boolean }) => {
    if (!selectedCourse) return
    updateCourseProgress(selectedCourse.courseId, patch, options)
  }, [selectedCourse, updateCourseProgress])

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
          ) : courseAccess && selectedCourse && selectedProgress ? (
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
                        {progressByCourseId[lastOpenedCourse.courseId]?.positionSeconds > 0 && (
                          <small>{copy.resumeAt(formatClock(progressByCourseId[lastOpenedCourse.courseId].positionSeconds))}</small>
                        )}
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
                        progress={getKnownProgress(item, progressByCourseId[item.courseId])}
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
                    <span><strong>{courseMediaLabel(selectedCourse, copy)}</strong>{copy.type}</span>
                    <span><strong>{formatDuration(selectedDuration, locale, copy)}</strong>{copy.totalTime}</span>
                    <span><strong>{selectedProgressText}</strong>{copy.currentPosition}</span>
                    <span><strong>{selectedStatusText}</strong>{copy.status}</span>
                  </div>

                  <div className="course-access-watch-progress" aria-label={copy.progress}>
                    <div>
                      <strong>{Math.round(selectedPercent)}% {copy.watched}</strong>
                      {selectedProgress.positionSeconds > 0 && <span>{copy.resumeAt(formatClock(selectedProgress.positionSeconds))}</span>}
                    </div>
                    <div className="course-access-progress course-access-progress--large"><span style={{ width: `${selectedPercent}%` }} /></div>
                  </div>

                  <div className="course-access-media-frame">
                    {selectedCourse.mediaType === 'VIDEO' ? (
                      videoEmbedUrl ? (
                        <BunnyCoursePlayer
                          key={selectedCourse.courseId}
                          title={selectedCourse.title}
                          src={videoEmbedUrl}
                          startSeconds={selectedProgress.positionSeconds}
                          durationSeconds={selectedDuration}
                          loadingLabel={locale === 'sl' ? 'Priprava predvajalnika…' : 'Preparing player…'}
                          onProgress={handleSelectedCourseProgress}
                        />
                      ) : (
                        <div className="course-access-media-empty">{copy.videoPreparing}</div>
                      )
                    ) : selectedCourse.mediaUrl ? (
                      <div className="course-access-audio-card">
                        <div className="course-access-audio-icon" aria-hidden="true">♪</div>
                        <AudioCoursePlayer
                          src={selectedCourse.mediaUrl}
                          startSeconds={selectedProgress.positionSeconds}
                          durationSeconds={selectedDuration}
                          loadingLabel={locale === 'sl' ? 'Priprava predvajalnika…' : 'Preparing player…'}
                          onProgress={handleSelectedCourseProgress}
                        />
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
