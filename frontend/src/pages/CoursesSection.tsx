import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
  type FormEvent,
} from 'react'
import { api } from '../api'
import { EmptyState, Field } from '../components/ui'
import { useToast } from '../components/Toast'
import { currency } from '../lib/format'
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
    setShowModal(true)
  }

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
      if (uploadFile) await uploadMedia(res.data.id, uploadFile)
      setShowModal(false)
      await load()
      showToast('success', locale === 'sl' ? 'Tečaj je shranjen.' : 'Course saved.')
    } catch (err: any) {
      showToast('error', err?.response?.data?.message || (locale === 'sl' ? 'Tečaja ni bilo mogoče shraniti.' : 'Could not save course.'))
    } finally {
      setSaving(false)
    }
  }

  const uploadMedia = async (courseId: number, file: File) => {
    setUploadingId(courseId)
    setUploadProgress(0)
    try {
      if (form.mediaType === 'VIDEO') {
        const sessionRes = await api.post<DirectVideoUploadSession>(`/courses/${courseId}/media/direct-upload`, {
          fileName: file.name,
          contentType: file.type || 'video/mp4',
          sizeBytes: file.size,
        })
        await uploadVideoToBunnyTus(file, sessionRes.data, (progress) => setUploadProgress(progress))
        await api.post(`/courses/${courseId}/media/direct-complete`, {
          bunnyVideoId: sessionRes.data.bunnyVideoId,
          fileName: file.name,
          contentType: file.type || sessionRes.data.contentType || 'video/mp4',
        })
      } else {
        const body = new FormData()
        body.append('file', file)
        await api.post(`/courses/${courseId}/media`, body, { headers: { 'Content-Type': 'multipart/form-data' } })
        setUploadProgress(100)
      }
    } finally {
      setUploadingId(null)
      setUploadProgress(null)
    }
  }

  const archiveToggle = async (course: Course) => {
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

  return (
    <div className="service-config-table-wrap">
      {loading ? (
        <div className="muted" style={{ padding: 24 }}>{locale === 'sl' ? 'Nalaganje tečajev…' : 'Loading courses…'}</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title={locale === 'sl' ? 'Ni tečajev' : 'No courses'}
          text={locale === 'sl' ? 'Dodajte prvi video ali audio tečaj za prodajo v guest aplikaciji, na spletni strani in v denarnici stranke.' : 'Add your first video or audio course for guest app, website widget and client wallet sales.'}
        />
      ) : (
        <table className="services-table service-config-table">
          <thead>
            <tr>
              <th>{locale === 'sl' ? 'Tečaj' : 'Course'}</th>
              <th>{locale === 'sl' ? 'Tip' : 'Type'}</th>
              <th>{locale === 'sl' ? 'Status' : 'Status'}</th>
              <th>{locale === 'sl' ? 'Cena' : 'Price'}</th>
              <th>Bunny</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.map((course) => (
              <tr key={course.id}>
                <td>
                  <strong>{course.title}</strong>
                  <div className="muted">{course.description || (locale === 'sl' ? 'Brez opisa' : 'No description')}</div>
                </td>
                <td>{course.mediaType === 'AUDIO' ? (locale === 'sl' ? 'Audio' : 'Audio') : (locale === 'sl' ? 'Video' : 'Video')}</td>
                <td><span className="status-pill">{course.status}</span></td>
                <td><strong>{currency(course.priceGross)}</strong></td>
                <td>
                  {course.mediaType === 'VIDEO'
                    ? (course.bunnyVideoId ? `Video ${course.bunnyVideoId}` : (locale === 'sl' ? 'Ni videa' : 'No video'))
                    : (course.bunnyStoragePath || (locale === 'sl' ? 'Ni audio datoteke' : 'No audio file'))}
                </td>
                <td className="service-config-actions-cell">
                  <button type="button" className="secondary" onClick={() => openEdit(course)}>{locale === 'sl' ? 'Uredi' : 'Edit'}</button>
                  <button type="button" className="secondary" onClick={() => archiveToggle(course)}>{course.active ? (locale === 'sl' ? 'Arhiviraj' : 'Archive') : (locale === 'sl' ? 'Aktiviraj' : 'Activate')}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showModal && (
        <div className="modal-backdrop booking-side-panel-backdrop" role="presentation" onMouseDown={() => setShowModal(false)}>
          <div className="modal large-modal booking-side-panel session-type-config-modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="session-type-config-modal-header">
              <div className="session-type-config-modal-heading">
                <span className="session-type-config-modal-icon" aria-hidden>▶</span>
                <div><h2>{editingId ? (locale === 'sl' ? 'Uredi tečaj' : 'Edit course') : (locale === 'sl' ? 'Nov tečaj' : 'New course')}</h2></div>
              </div>
              <button type="button" className="secondary session-type-config-modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>
            <form className="booking-side-panel-body config-type-panel-form session-type-config-modal-body" onSubmit={submit}>
              <section className="session-type-config-section">
                <div className="form-grid two">
                  <Field label={locale === 'sl' ? 'Naslov tečaja *' : 'Course title *'}>
                    <input required value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
                  </Field>
                  <Field label={locale === 'sl' ? 'Tip medija' : 'Media type'}>
                    <select value={form.mediaType} onChange={(e) => setForm((f) => ({ ...f, mediaType: e.target.value as CourseMediaType }))}>
                      <option value="VIDEO">Video</option>
                      <option value="AUDIO">Audio</option>
                    </select>
                  </Field>
                  <Field label={locale === 'sl' ? 'Cena' : 'Price'}>
                    <input inputMode="decimal" value={form.priceGross} onChange={(e) => setForm((f) => ({ ...f, priceGross: e.target.value }))} />
                  </Field>
                  <Field label={locale === 'sl' ? 'Status' : 'Status'}>
                    <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as CourseStatus }))}>
                      <option value="DRAFT">Draft</option>
                      <option value="ACTIVE">Active</option>
                      <option value="HIDDEN">Hidden</option>
                    </select>
                  </Field>
                  <Field label={locale === 'sl' ? 'Sličica URL' : 'Thumbnail URL'}>
                    <input value={form.thumbnailUrl} onChange={(e) => setForm((f) => ({ ...f, thumbnailUrl: e.target.value }))} />
                  </Field>
                  <Field label="Bunny upload">
                    <input
                      type="file"
                      accept={form.mediaType === 'AUDIO' ? 'audio/*' : 'video/*'}
                      onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                    />
                    {uploadFile && (
                      <div className="muted" style={{ marginTop: 6 }}>
                        {form.mediaType === 'VIDEO'
                          ? (locale === 'sl' ? 'Video se bo naložil neposredno v Bunny Stream.' : 'Video will upload directly to Bunny Stream.')
                          : (locale === 'sl' ? 'Audio se naloži prek zaščitenega Calendra nalaganja.' : 'Audio uploads through protected Calendra upload.')}
                      </div>
                    )}
                    {uploadProgress != null && (
                      <div className="muted" style={{ marginTop: 6 }}>
                        {locale === 'sl' ? 'Nalaganje' : 'Uploading'}: {Math.max(0, Math.min(100, uploadProgress)).toFixed(0)}%
                      </div>
                    )}
                  </Field>
                </div>
                <Field label={locale === 'sl' ? 'Opis' : 'Description'}>
                  <textarea rows={4} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
                </Field>
                <div className="form-grid two">
                  <label className="checkbox-row"><input type="checkbox" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} /> {locale === 'sl' ? 'Aktivno' : 'Active'}</label>
                  <label className="checkbox-row"><input type="checkbox" checked={form.guestVisible} onChange={(e) => setForm((f) => ({ ...f, guestVisible: e.target.checked }))} /> {locale === 'sl' ? 'Vidno gostom' : 'Visible to guests'}</label>
                </div>
              </section>
              <div className="booking-side-panel-footer session-type-config-modal-footer">
                <button type="button" className="secondary" onClick={() => setShowModal(false)}>{locale === 'sl' ? 'Prekliči' : 'Cancel'}</button>
                <button type="submit" className="primary" disabled={saving || uploadingId != null}>{saving || uploadingId != null ? (uploadProgress != null ? `${locale === 'sl' ? 'Nalaganje' : 'Uploading'} ${uploadProgress.toFixed(0)}%` : (locale === 'sl' ? 'Shranjevanje…' : 'Saving…')) : (locale === 'sl' ? 'Shrani' : 'Save')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
})
