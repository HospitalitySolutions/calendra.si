import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import { api } from '../api'
import { EmptyState, Field } from '../components/ui'
import { GuestConfigSaveIcon } from '../components/GuestConfigSaveIcon'
import { useToast } from '../components/Toast'
import { useLocale } from '../locale'

type CourseMediaType = 'VIDEO' | 'AUDIO'
type CourseStatus = 'DRAFT' | 'PROCESSING' | 'ACTIVE' | 'HIDDEN'

type Course = {
  id: number
  guestProductId?: number | null
  title: string
  description?: string | null
  mediaType: CourseMediaType
  status: CourseStatus
  priceGross: number
  currency: string
  active: boolean
  guestVisible: boolean
  sortOrder: number
  thumbnailUrl?: string | null
  bunnyLibraryId?: string | null
  bunnyLibraryName?: string | null
  bunnyVideoId?: string | null
  bunnyStoragePath?: string | null
  bunnyCdnUrl?: string | null
  fileName?: string | null
  contentType?: string | null
}

type DirectVideoUploadSession = {
  uploadType: 'TUS'
  uploadUrl: string
  bunnyLibraryId: string
  bunnyLibraryName?: string | null
  bunnyVideoId: string
  authorizationSignature: string
  authorizationExpire: number
  fileName: string
  contentType: string
  title: string
}

type CourseFormState = {
  title: string
  description: string
  mediaType: CourseMediaType
  status: CourseStatus
  priceGross: string
  currency: string
  active: boolean
  guestVisible: boolean
  sortOrder: string
  thumbnailUrl: string
}

const defaultCourseForm = (): CourseFormState => ({
  title: '',
  description: '',
  mediaType: 'VIDEO',
  status: 'DRAFT',
  priceGross: '0.00',
  currency: 'EUR',
  active: true,
  guestVisible: true,
  sortOrder: '0',
  thumbnailUrl: '',
})

export type CoursesSectionHandle = {
  openNew: () => void
}

export type CoursesSectionProps = {
  searchQuery: string
  activeFilter: 'active' | 'inactive'
  onFilteredCountChange?: (count: number) => void
}

function base64Utf8(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  bytes.forEach((byte) => { binary += String.fromCharCode(byte) })
  return btoa(binary)
}

function resolveTusLocation(location: string, endpoint: string): string {
  try {
    return new URL(location, endpoint).toString()
  } catch {
    return location
  }
}

async function uploadVideoToBunnyTus(file: File, session: DirectVideoUploadSession, onProgress: (progress: number) => void) {
  const authHeaders = {
    AuthorizationSignature: session.authorizationSignature,
    AuthorizationExpire: String(session.authorizationExpire),
    LibraryId: String(session.bunnyLibraryId),
    VideoId: session.bunnyVideoId,
  }
  const metadata = [
    `filetype ${base64Utf8(file.type || session.contentType || 'video/mp4')}`,
    `title ${base64Utf8(file.name || session.title || 'course-video')}`,
  ].join(',')

  const createRes = await fetch(session.uploadUrl, {
    method: 'POST',
    headers: {
      'Tus-Resumable': '1.0.0',
      'Upload-Length': String(file.size),
      'Upload-Metadata': metadata,
      ...authHeaders,
    },
  })
  if (!createRes.ok) {
    throw new Error(`Bunny TUS upload could not be started (${createRes.status}).`)
  }
  const location = createRes.headers.get('Location')
  if (!location) throw new Error('Bunny TUS upload did not return an upload location.')

  const uploadUrl = resolveTusLocation(location, session.uploadUrl)
  const chunkSize = 8 * 1024 * 1024
  let offset = 0
  onProgress(0)

  while (offset < file.size) {
    const nextOffset = Math.min(offset + chunkSize, file.size)
    const chunk = file.slice(offset, nextOffset)
    const patchRes = await fetch(uploadUrl, {
      method: 'PATCH',
      headers: {
        'Tus-Resumable': '1.0.0',
        'Content-Type': 'application/offset+octet-stream',
        'Upload-Offset': String(offset),
        ...authHeaders,
      },
      body: chunk,
    })
    if (!patchRes.ok) {
      throw new Error(`Bunny TUS upload failed (${patchRes.status}).`)
    }
    const returnedOffset = Number(patchRes.headers.get('Upload-Offset'))
    offset = Number.isFinite(returnedOffset) && returnedOffset > offset ? returnedOffset : nextOffset
    onProgress(file.size > 0 ? (offset / file.size) * 100 : 100)
  }
  onProgress(100)
}

const COURSE_ICON_TONES = ['blue', 'green', 'orange', 'purple', 'yellow', 'pink'] as const

function CourseIcon({ index }: { index: number }) {
  const tone = COURSE_ICON_TONES[index % COURSE_ICON_TONES.length]
  return (
    <span className={`service-config-icon service-config-icon--${tone}`}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        <path d="m10 8 5 3-5 3V8z" />
      </svg>
    </span>
  )
}

function CourseNameCell({ course, index, locale }: { course: Course; index: number; locale: string }) {
  return (
    <div className="service-config-name-cell">
      <CourseIcon index={index} />
      <div className="service-config-name-stack">
        <strong>{course.title}</strong>
        <span>{course.description?.trim() ? course.description : (locale === 'sl' ? 'Brez opisa' : 'No description')}</span>
      </div>
    </div>
  )
}

function CourseSortableHeader({ children }: { children: ReactNode }) {
  return (
    <span className="service-config-sortable-header">
      {children}
      <span className="service-config-sort-icon" aria-hidden>↕</span>
    </span>
  )
}

function courseMediaLabel(course: Course, locale: string) {
  return course.mediaType === 'AUDIO' ? (locale === 'sl' ? 'Audio' : 'Audio') : (locale === 'sl' ? 'Video' : 'Video')
}

function courseBunnyLabel(course: Course, locale: string) {
  if (course.mediaType === 'VIDEO') return course.bunnyVideoId ? `Video ${course.bunnyVideoId}` : (locale === 'sl' ? 'Ni videa' : 'No video')
  return course.bunnyStoragePath || (locale === 'sl' ? 'Ni audio datoteke' : 'No audio file')
}

function courseStatusLabel(course: Course, locale: string) {
  return course.active === false
    ? (locale === 'sl' ? 'Neaktivno' : 'Inactive')
    : (locale === 'sl' ? 'Aktivno' : 'Active')
}

function CourseModalIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="m10 9 5 3-5 3V9z" />
    </svg>
  )
}

function CourseUploadIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 16V7" />
      <path d="m8 11 4-4 4 4" />
      <path d="M20 16.5A4.5 4.5 0 0 0 15.5 12h-.76A6 6 0 1 0 6 17.32" />
      <path d="M6 20h12" />
    </svg>
  )
}

function formatCourseUploadSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`
}

export const CoursesSection = forwardRef<CoursesSectionHandle, CoursesSectionProps>(function CoursesSection(
  { searchQuery, activeFilter, onFilteredCountChange },
  ref,
) {
  const { locale } = useLocale()
  const { showToast } = useToast()
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState<CourseFormState>(defaultCourseForm)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadingId, setUploadingId] = useState<number | null>(null)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [openCourseMenuId, setOpenCourseMenuId] = useState<number | null>(null)
  const [deleteOldMediaOnReplace, setDeleteOldMediaOnReplace] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<Course[]>('/courses')
      setCourses(Array.isArray(res.data) ? res.data : [])
    } catch (err: any) {
      showToast('error', err?.response?.data?.message || (locale === 'sl' ? 'Tečajev ni bilo mogoče naložiti.' : 'Could not load courses.'))
    } finally {
      setLoading(false)
    }
  }, [locale, showToast])

  useEffect(() => { void load() }, [load])

  useImperativeHandle(ref, () => ({
    openNew: () => {
      setEditingId(null)
      setForm(defaultCourseForm())
      setUploadFile(null)
      setDeleteOldMediaOnReplace(true)
      setShowModal(true)
    },
  }), [])

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return courses.filter((course) => {
      const activeMatches = activeFilter === 'active' ? course.active : !course.active
      if (!activeMatches) return false
      if (!q) return true
      return [course.title, course.description, course.mediaType, course.status, course.fileName]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q))
    })
  }, [activeFilter, courses, searchQuery])

  useEffect(() => {
    onFilteredCountChange?.(filtered.length)
  }, [filtered.length, onFilteredCountChange])

  const openEdit = (course: Course) => {
    setEditingId(course.id)
    setForm({
      title: course.title || '',
      description: course.description || '',
      mediaType: course.mediaType || 'VIDEO',
      status: course.status || 'DRAFT',
      priceGross: Number(course.priceGross || 0).toFixed(2),
      currency: course.currency || 'EUR',
      active: course.active,
      guestVisible: course.guestVisible,
      sortOrder: String(course.sortOrder ?? 0),
      thumbnailUrl: course.thumbnailUrl || '',
    })
    setUploadFile(null)
    setDeleteOldMediaOnReplace(true)
    setShowModal(true)
  }

  const editingCourse = useMemo(
    () => (editingId == null ? null : courses.find((course) => course.id === editingId) ?? null),
    [courses, editingId],
  )

  const editingCourseHasMedia = Boolean(editingCourse?.bunnyVideoId || editingCourse?.bunnyStoragePath || editingCourse?.bunnyCdnUrl)

  const existingMediaLabel = editingCourse
    ? (editingCourse.mediaType === 'VIDEO'
      ? (editingCourse.bunnyVideoId ? `Video ${editingCourse.bunnyVideoId}` : null)
      : (editingCourse.fileName || editingCourse.bunnyStoragePath || editingCourse.bunnyCdnUrl || null))
    : null

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        mediaType: form.mediaType,
        status: form.status,
        priceGross: Number(form.priceGross.replace(',', '.')) || 0,
        currency: form.currency.trim().toUpperCase() || 'EUR',
        active: form.active,
        guestVisible: form.guestVisible,
        sortOrder: Number.parseInt(form.sortOrder, 10) || 0,
        thumbnailUrl: form.thumbnailUrl.trim() || null,
      }
      const res = editingId
        ? await api.put<Course>(`/courses/${editingId}`, payload)
        : await api.post<Course>('/courses', payload)
      if (uploadFile) await uploadMedia(res.data.id, uploadFile, Boolean(editingId && editingCourseHasMedia && deleteOldMediaOnReplace))
      setShowModal(false)
      await load()
      showToast('success', locale === 'sl' ? 'Tečaj je shranjen.' : 'Course saved.')
    } catch (err: any) {
      showToast('error', err?.response?.data?.message || (locale === 'sl' ? 'Tečaja ni bilo mogoče shraniti.' : 'Could not save course.'))
    } finally {
      setSaving(false)
    }
  }

  const uploadMedia = async (courseId: number, file: File, deleteOldMedia: boolean) => {
    setUploadingId(courseId)
    setUploadProgress(0)
    try {
      if (form.mediaType === 'VIDEO') {
        const sessionRes = await api.post<DirectVideoUploadSession>(`/courses/${courseId}/media/direct-upload`, {
          fileName: file.name,
          contentType: file.type || 'video/mp4',
          sizeBytes: file.size,
        }, { params: { deleteOld: deleteOldMedia } })
        await uploadVideoToBunnyTus(file, sessionRes.data, (progress) => setUploadProgress(progress))
        await api.post(`/courses/${courseId}/media/direct-complete`, {
          bunnyVideoId: sessionRes.data.bunnyVideoId,
          fileName: file.name,
          contentType: file.type || sessionRes.data.contentType || 'video/mp4',
        })
      } else {
        const body = new FormData()
        body.append('file', file)
        await api.post(`/courses/${courseId}/media`, body, {
          headers: { 'Content-Type': 'multipart/form-data' },
          params: { deleteOld: deleteOldMedia },
        })
        setUploadProgress(100)
      }
    } finally {
      setUploadingId(null)
      setUploadProgress(null)
    }
  }

  const archiveToggle = async (course: Course) => {
    setOpenCourseMenuId(null)
    const nextActive = !course.active
    try {
      await api.put(`/courses/${course.id}`, {
        title: course.title,
        description: course.description,
        mediaType: course.mediaType,
        status: course.status,
        priceGross: course.priceGross,
        currency: course.currency,
        active: nextActive,
        guestVisible: course.guestVisible,
        sortOrder: course.sortOrder,
        thumbnailUrl: course.thumbnailUrl,
      })
      await load()
    } catch (err: any) {
      showToast('error', err?.response?.data?.message || (locale === 'sl' ? 'Statusa ni bilo mogoče spremeniti.' : 'Could not update status.'))
    }
  }

  const deleteCourse = async (course: Course) => {
    setOpenCourseMenuId(null)
    if (deletingId != null) return
    const hasBunnyMedia = Boolean(course.bunnyVideoId || course.bunnyStoragePath)
    const message = hasBunnyMedia
      ? (locale === 'sl'
        ? `Izbrisati tečaj "${course.title}" in odstraniti njegovo datoteko iz Bunny? Tega ni mogoče razveljaviti.`
        : `Delete course "${course.title}" and remove its Bunny media file? This cannot be undone.`)
      : (locale === 'sl'
        ? `Izbrisati tečaj "${course.title}"? Tega ni mogoče razveljaviti.`
        : `Delete course "${course.title}"? This cannot be undone.`)
    if (!window.confirm(message)) return
    setDeletingId(course.id)
    try {
      await api.delete(`/courses/${course.id}`)
      await load()
      showToast('success', hasBunnyMedia ? (locale === 'sl' ? 'Tečaj in Bunny datoteka sta izbrisana.' : 'Course and Bunny media deleted.') : (locale === 'sl' ? 'Tečaj je izbrisan.' : 'Course deleted.'))
    } catch (err: any) {
      showToast('error', err?.response?.data?.message || (locale === 'sl' ? 'Tečaja ni bilo mogoče izbrisati.' : 'Could not delete course.'))
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="service-config-table-wrap">
      {loading ? (
        <div className="muted" style={{ padding: 24 }}>{locale === 'sl' ? 'Nalaganje tečajev…' : 'Loading courses…'}</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title={locale === 'sl' ? 'Ni tečajev' : 'No courses'}
          text={locale === 'sl' ? 'Dodajte prvi video ali audio tečaj. Prodaja se nastavi posebej v zavihku Ugodnosti.' : 'Add your first video or audio course. Selling/access is configured separately in Entitlements.'}
        />
      ) : (
        <div className="clients-list-shell service-config-list-shell">
          <div className="clients-mobile-list service-config-mobile-list">
            {filtered.map((course, index) => (
              <article
                key={course.id}
                className="clients-mobile-card service-config-mobile-card"
                role="button"
                tabIndex={0}
                onClick={() => openEdit(course)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    openEdit(course)
                  }
                }}
              >
                <div className="clients-mobile-card-head">
                  <CourseNameCell course={course} index={index} locale={locale} />
                  <div
                    className="clients-mobile-card-head-tools"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                    role="presentation"
                  >
                    <div className="clients-card-menu-wrap">
                      <button
                        type="button"
                        className="secondary clients-card-menu-trigger service-config-menu-trigger"
                        onClick={(e) => {
                          e.stopPropagation()
                          setOpenCourseMenuId((prev) => (prev === course.id ? null : course.id))
                        }}
                        aria-label="Course actions"
                        aria-expanded={openCourseMenuId === course.id}
                      >
                        ⋮
                      </button>
                      {openCourseMenuId === course.id && (
                        <div className="clients-card-menu-popover" role="dialog" aria-label="Course actions">
                          <button
                            type="button"
                            disabled={deletingId === course.id}
                            onClick={(e) => {
                              e.stopPropagation()
                              void archiveToggle(course)
                            }}
                          >
                            {course.active ? (locale === 'sl' ? 'Deaktiviraj' : 'Deactivate') : (locale === 'sl' ? 'Aktiviraj' : 'Activate')}
                          </button>
                          <button
                            type="button"
                            className="danger"
                            disabled={deletingId === course.id}
                            onClick={(e) => {
                              e.stopPropagation()
                              void deleteCourse(course)
                            }}
                          >
                            {deletingId === course.id ? (locale === 'sl' ? 'Brisanje…' : 'Deleting…') : (locale === 'sl' ? 'Izbriši' : 'Delete')}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="clients-mobile-meta">
                  <div>
                    <span>{locale === 'sl' ? 'Tip' : 'Type'}</span>
                    <strong>{courseMediaLabel(course, locale)}</strong>
                  </div>
                  <div>
                    <span>Bunny</span>
                    <strong>{courseBunnyLabel(course, locale)}</strong>
                  </div>
                  <div>
                    <span>{locale === 'sl' ? 'Status' : 'Status'}</span>
                    <strong>
                      <button
                        type="button"
                        className={`clients-status-pill clients-status-pill-btn${course.active === false ? ' clients-status-pill--inactive' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          void archiveToggle(course)
                        }}
                        disabled={deletingId === course.id}
                      >
                        <span />
                        {courseStatusLabel(course, locale)}
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
                  <th><CourseSortableHeader>{locale === 'sl' ? 'Naziv' : 'Name'}</CourseSortableHeader></th>
                  <th><CourseSortableHeader>{locale === 'sl' ? 'Tip' : 'Type'}</CourseSortableHeader></th>
                  <th><CourseSortableHeader>Bunny</CourseSortableHeader></th>
                  <th><CourseSortableHeader>{locale === 'sl' ? 'Status' : 'Status'}</CourseSortableHeader></th>
                  <th>{locale === 'sl' ? 'Dejanja' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((course, index) => (
                  <tr
                    key={course.id}
                    className="clients-row clients-row--clickable"
                    role="button"
                    tabIndex={0}
                    onClick={() => openEdit(course)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        openEdit(course)
                      }
                    }}
                  >
                    <td><CourseNameCell course={course} index={index} locale={locale} /></td>
                    <td className="clients-muted service-config-category-cell">{courseMediaLabel(course, locale)}</td>
                    <td className="clients-muted service-config-category-cell">{courseBunnyLabel(course, locale)}</td>
                    <td>
                      <button
                        type="button"
                        className={`clients-status-pill clients-status-pill-btn${course.active === false ? ' clients-status-pill--inactive' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          void archiveToggle(course)
                        }}
                        disabled={deletingId === course.id}
                      >
                        <span />
                        {courseStatusLabel(course, locale)}
                      </button>
                    </td>
                    <td className="clients-actions service-config-actions account-table-actions" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        disabled={deletingId === course.id}
                        onClick={(e) => {
                          e.stopPropagation()
                          void archiveToggle(course)
                        }}
                      >
                        {course.active ? (locale === 'sl' ? 'Deaktiviraj' : 'Deactivate') : (locale === 'sl' ? 'Aktiviraj' : 'Activate')}
                      </button>
                      <button
                        type="button"
                        className="account-table-action-danger"
                        disabled={deletingId === course.id}
                        onClick={(e) => {
                          e.stopPropagation()
                          void deleteCourse(course)
                        }}
                      >
                        {deletingId === course.id ? (locale === 'sl' ? 'Brisanje…' : 'Deleting…') : (locale === 'sl' ? 'Izbriši' : 'Delete')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showModal && (
        <div
          className="modal-backdrop booking-side-panel-backdrop session-type-config-modal-backdrop course-edit-modal-backdrop"
          role="presentation"
          onMouseDown={() => setShowModal(false)}
        >
          <div
            className="modal large-modal booking-side-panel session-type-config-modal course-edit-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="course-edit-modal-title"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="session-type-config-modal-header course-edit-modal-header">
              <div className="session-type-config-modal-heading course-edit-modal-heading">
                <span className="session-type-config-modal-icon course-edit-modal-icon" aria-hidden><CourseModalIcon /></span>
                <div>
                  <h2 id="course-edit-modal-title">
                    {editingId ? (locale === 'sl' ? 'Uredi tečaj' : 'Edit course') : (locale === 'sl' ? 'Nov tečaj' : 'New course')}
                  </h2>
                </div>
              </div>
              <button
                type="button"
                className="secondary session-type-config-modal-close course-edit-modal-close"
                aria-label={locale === 'sl' ? 'Zapri' : 'Close'}
                onClick={() => setShowModal(false)}
              >
                ×
              </button>
            </div>
            <form
              id="course-edit-form"
              className="booking-side-panel-body config-type-panel-form session-type-config-modal-body course-edit-modal-body"
              onSubmit={submit}
            >
              <section className="session-type-config-section course-edit-card">
                <div className="form-grid two course-edit-grid course-edit-grid--two">
                  <Field label={locale === 'sl' ? 'Naslov tečaja *' : 'Course title *'}>
                    <input
                      required
                      value={form.title}
                      onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    />
                  </Field>
                  <Field label={locale === 'sl' ? 'Tip medija' : 'Media type'}>
                    <span className="course-edit-select-wrap">
                      <span className="course-edit-select-icon" aria-hidden><CourseModalIcon /></span>
                      <select
                        className="course-edit-select"
                        value={form.mediaType}
                        onChange={(e) => setForm((f) => ({ ...f, mediaType: e.target.value as CourseMediaType }))}
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
                    className={`course-edit-upload-dropzone${uploadFile ? ' has-file' : ''}`}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault()
                      setUploadFile(e.dataTransfer.files?.[0] ?? null)
                    }}
                  >
                    <input
                      className="course-edit-file-input"
                      type="file"
                      accept={form.mediaType === 'AUDIO' ? 'audio/*' : 'video/*'}
                      onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                    />
                    <span className="course-edit-upload-icon" aria-hidden><CourseUploadIcon /></span>
                    <span className="course-edit-upload-copy">
                      <strong>
                        {uploadFile
                          ? uploadFile.name
                          : (locale === 'sl' ? 'Povlecite datoteko sem ali kliknite za izbiro' : 'Drag a file here or click to choose')}
                      </strong>
                      <span>
                        {uploadFile
                          ? formatCourseUploadSize(uploadFile.size)
                          : (form.mediaType === 'VIDEO'
                            ? (locale === 'sl' ? 'Podprti formati: MP4, MOV, WebM, AVI (največ 2 GB)' : 'Supported formats: MP4, MOV, WebM, AVI (max 2 GB)')
                            : (locale === 'sl' ? 'Podprti formati: MP3, WAV, M4A, AAC' : 'Supported formats: MP3, WAV, M4A, AAC'))}
                      </span>
                    </span>
                    <span className="course-edit-upload-button">
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M12 3v12" />
                        <path d="m7 8 5-5 5 5" />
                        <path d="M5 21h14" />
                      </svg>
                      {locale === 'sl' ? 'Izberi datoteko' : 'Choose file'}
                    </span>
                  </label>
                  {existingMediaLabel && (
                    <div className="course-edit-upload-note">
                      <strong>{locale === 'sl' ? 'Trenutna Bunny datoteka' : 'Current Bunny file'}:</strong> {existingMediaLabel}
                    </div>
                  )}
                  {uploadFile && (
                    <div className="course-edit-upload-note">
                      {form.mediaType === 'VIDEO'
                        ? (locale === 'sl' ? 'Video se bo naložil neposredno v Bunny Stream.' : 'Video will upload directly to Bunny Stream.')
                        : (locale === 'sl' ? 'Audio se naloži prek zaščitenega Calendra nalaganja.' : 'Audio uploads through protected Calendra upload.')}
                    </div>
                  )}
                  {editingId && uploadFile && editingCourseHasMedia && (
                    <label className="course-edit-replace-media-option">
                      <input
                        type="checkbox"
                        checked={deleteOldMediaOnReplace}
                        onChange={(e) => setDeleteOldMediaOnReplace(e.target.checked)}
                      />
                      <span>
                        {locale === 'sl'
                          ? 'Ob zamenjavi izbriši prejšnjo Bunny datoteko'
                          : 'Delete previous Bunny file when replacing media'}
                      </span>
                    </label>
                  )}
                  {editingId && uploadFile && editingCourseHasMedia && deleteOldMediaOnReplace && (
                    <div className="course-edit-upload-note">
                      {locale === 'sl'
                        ? 'Stari audio/video bo odstranjen iz Bunny, zato ga ne bo treba brisati ročno.'
                        : 'The old audio/video will be removed from Bunny so you do not need to delete it manually.'}
                    </div>
                  )}
                  {uploadProgress != null && (
                    <div className="course-edit-upload-progress" aria-label={locale === 'sl' ? 'Napredek nalaganja' : 'Upload progress'}>
                      <span style={{ width: `${Math.max(0, Math.min(100, uploadProgress))}%` }} />
                      <strong>{Math.max(0, Math.min(100, uploadProgress)).toFixed(0)}%</strong>
                    </div>
                  )}
                </div>

                <Field label={locale === 'sl' ? 'Opis' : 'Description'}>
                  <span className="course-edit-textarea-wrap">
                    <textarea
                      rows={5}
                      maxLength={1000}
                      placeholder={locale === 'sl' ? 'Vnesite opis tečaja ...' : 'Enter course description ...'}
                      value={form.description}
                      onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    />
                    <span className="course-edit-character-count">{form.description.length} / 1000</span>
                  </span>
                </Field>

              </section>
            </form>
            <div className="booking-side-panel-footer session-type-config-modal-footer course-edit-modal-footer">
              <button
                form="course-edit-form"
                type="submit"
                className="gapp-primary-button course-edit-save-button"
                disabled={saving || uploadingId != null}
              >
                <GuestConfigSaveIcon />
                {saving || uploadingId != null ? (uploadProgress != null ? `${locale === 'sl' ? 'Nalaganje' : 'Uploading'} ${uploadProgress.toFixed(0)}%` : (locale === 'sl' ? 'Shranjevanje…' : 'Saving…')) : (editingId ? (locale === 'sl' ? 'Shrani spremembe' : 'Save changes') : (locale === 'sl' ? 'Ustvari tečaj' : 'Create course'))}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
})
