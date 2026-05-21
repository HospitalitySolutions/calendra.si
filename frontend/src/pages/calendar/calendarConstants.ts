import { Capacitor } from '@capacitor/core'
import slLocale from '@fullcalendar/core/locales/sl'
import enGbLocale from '@fullcalendar/core/locales/en-gb'

export const isNativeAndroid = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
export const WORKING_HOURS_FALLBACK_KEY = 'workingHoursFallback'
export const PERSONAL_TASK_PRESETS_KEY = 'PERSONAL_TASK_PRESETS_JSON'
export const AVAILABILITY_BLOCK_TASK = '__availability_block__'
/** Visible calendar data only; full meta/settings use CALENDAR_META_POLL_MS and focus/settings events. */
export const CALENDAR_POLL_MS = 30000
export const CALENDAR_META_POLL_MS = 180000
export const DATE_SET_CALENDAR_DEBOUNCE_MS = 300
export const FULLCALENDAR_LOCALES = [enGbLocale, slLocale]

/** FullCalendar resource id for bookings with no room (Spaces mode, ALL columns). */
export const SPACE_RESOURCE_UNASSIGNED_ID = '__unassigned'

/** FullCalendar resource id for bookings with no consultant (Bookings mode, ALL columns). */
export const CONSULTANT_RESOURCE_UNASSIGNED_ID = '__unassigned_consultant'

/** Pinch zoom: only magnify above default (1); cannot zoom out past the normal view. */
export const ANDROID_PINCH_ZOOM_MIN = 1
export const ANDROID_PINCH_ZOOM_MAX = 2.75
