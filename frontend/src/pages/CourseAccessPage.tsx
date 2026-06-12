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
  const [loading, setLoading] = useState(true)
  const [courseAccess, setCourseAccess] = useState<CourseAccessResponse | null>(null)
  const [selectedCourseId, setSelectedCourseId] = useState<string>('')
  const [error, setError] = useState('')

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
          setCourseAccess(res.data)
          const first = Array.isArray(res.data.courses) && res.data.courses.length > 0 ? res.data.courses[0] : res.data
          setSelectedCourseId(first.courseId)
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
  }, [locale, token])

  const accessibleCourses = useMemo<CourseItem[]>(() => {
    if (!courseAccess) return []
    if (Array.isArray(courseAccess.courses) && courseAccess.courses.length > 0) return courseAccess.courses
    return [courseAccess]
  }, [courseAccess])

  const selectedCourse = useMemo<CourseItem | null>(() => {
    if (accessibleCourses.length === 0) return null
    return accessibleCourses.find((item) => item.courseId === selectedCourseId) || accessibleCourses[0]
  }, [accessibleCourses, selectedCourseId])

  const videoEmbedUrl = useMemo(() => {
    if (!selectedCourse || selectedCourse.mediaType !== 'VIDEO' || !selectedCourse.bunnyLibraryId || !selectedCourse.bunnyVideoId) return ''
    return `https://iframe.mediadelivery.net/embed/${encodeURIComponent(selectedCourse.bunnyLibraryId)}/${encodeURIComponent(selectedCourse.bunnyVideoId)}?autoplay=false&loop=false&muted=false&preload=true&responsive=true`
  }, [selectedCourse])

  const copy = locale === 'sl'
    ? {
        loading: 'Nalaganje tečaja…',
        openTitle: 'Dostop do tečaja',
        validLifetime: 'Doživljenjski dostop',
        validUntil: 'Dostop velja do',
        unavailable: 'Tečaj ni na voljo',
        videoPreparing: 'Video se še pripravlja ali Bunny Stream ni nastavljen.',
        audioPreparing: 'Audio datoteka se še pripravlja ali Bunny Storage ni nastavljen.',
        includedCourses: 'Vključeni tečaji',
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
      }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #eef6ff 0%, #ffffff 48%, #f8fafc 100%)', padding: '28px 16px' }}>
      <main style={{ maxWidth: 980, margin: '0 auto' }}>
        <div style={{ marginBottom: 18, color: '#0369a1', fontWeight: 800, letterSpacing: 0.2 }}>Calendra</div>
        <section style={{ background: 'rgba(255,255,255,0.94)', border: '1px solid #dbeafe', borderRadius: 28, boxShadow: '0 24px 70px rgba(15, 23, 42, 0.11)', overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 42, color: '#475569' }}>{copy.loading}</div>
          ) : error ? (
            <div style={{ padding: 42 }}>
              <h1 style={{ margin: '0 0 10px', fontSize: 28, color: '#0f172a' }}>{copy.unavailable}</h1>
              <p style={{ margin: 0, color: '#64748b' }}>{error}</p>
            </div>
          ) : courseAccess && selectedCourse ? (
            <>
              <div style={{ padding: '28px 30px 20px' }}>
                <div style={{ color: '#0284c7', fontWeight: 800, textTransform: 'uppercase', fontSize: 12, letterSpacing: 1.2 }}>{copy.openTitle}</div>
                <h1 style={{ margin: '8px 0 8px', fontSize: 34, lineHeight: 1.08, color: '#0f172a' }}>{courseAccess.title}</h1>
                {courseAccess.description && <p style={{ margin: '0 0 14px', color: '#475569', fontSize: 16 }}>{courseAccess.description}</p>}
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#eff6ff', color: '#075985', borderRadius: 999, fontWeight: 800, fontSize: 13 }}>
                  {courseAccess.validUntil ? `${copy.validUntil} ${new Date(courseAccess.validUntil).toLocaleDateString()}` : copy.validLifetime}
                </div>
              </div>
              <div style={{ padding: '0 30px 32px' }}>
                {accessibleCourses.length > 1 && (
                  <div style={{ marginBottom: 18 }}>
                    <div style={{ color: '#0f172a', fontWeight: 800, marginBottom: 10 }}>{copy.includedCourses}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                      {accessibleCourses.map((item) => (
                        <button
                          key={item.courseId}
                          type="button"
                          onClick={() => setSelectedCourseId(item.courseId)}
                          style={{
                            textAlign: 'left',
                            border: item.courseId === selectedCourse.courseId ? '2px solid #0284c7' : '1px solid #dbeafe',
                            background: item.courseId === selectedCourse.courseId ? '#eff6ff' : '#ffffff',
                            color: '#0f172a',
                            borderRadius: 16,
                            padding: '12px 14px',
                            cursor: 'pointer',
                            fontWeight: 800,
                          }}
                        >
                          <span style={{ display: 'block' }}>{item.title}</span>
                          <span style={{ display: 'block', color: '#64748b', fontSize: 12, marginTop: 4 }}>{item.mediaType === 'AUDIO' ? 'Audio' : 'Video'}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <h2 style={{ margin: '0 0 12px', color: '#0f172a' }}>{selectedCourse.title}</h2>
                {selectedCourse.description && <p style={{ margin: '0 0 14px', color: '#475569' }}>{selectedCourse.description}</p>}
                {selectedCourse.mediaType === 'VIDEO' ? (
                  videoEmbedUrl ? (
                    <div style={{ position: 'relative', paddingTop: '56.25%', borderRadius: 22, overflow: 'hidden', background: '#0f172a' }}>
                      <iframe
                        title={selectedCourse.title}
                        src={videoEmbedUrl}
                        allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
                        allowFullScreen
                        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
                      />
                    </div>
                  ) : (
                    <div style={{ padding: 24, borderRadius: 18, background: '#f8fafc', color: '#64748b' }}>{copy.videoPreparing}</div>
                  )
                ) : selectedCourse.mediaUrl ? (
                  <div style={{ padding: 24, borderRadius: 22, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                    <audio controls src={selectedCourse.mediaUrl} style={{ width: '100%' }} />
                  </div>
                ) : (
                  <div style={{ padding: 24, borderRadius: 18, background: '#f8fafc', color: '#64748b' }}>{copy.audioPreparing}</div>
                )}
              </div>
            </>
          ) : null}
        </section>
      </main>
    </div>
  )
}
