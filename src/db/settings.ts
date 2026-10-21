import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'

export interface Settings {
  theme: 'dark' | 'light'
  dailyGoal: number
  /** ISO date. JA 2027 isn't announced yet, so this is a guess he can edit. */
  examDate: string
  examName: string
  githubRepo: string
  githubToken: string
  geminiKey: string
  geminiModel: string
  /** Correct answers in a row before a Galti question graduates. */
  graduateAfter: number
  /** Chance that practice swaps the correct option for "None of these". */
  noneOfTheseRate: number
  /** Hide printed options in photo questions until "show options" is tapped. */
  thinkFirst: boolean
  practiceSize: number
  lastBackupAt: number
  installedAt: number
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  dailyGoal: 40,
  examDate: '2027-05-23',
  examName: 'JEE Advanced 2027',
  githubRepo: 'Pencilpapermeow/kagaku-content',
  githubToken: '',
  geminiKey: '',
  geminiModel: 'gemini-2.5-flash',
  graduateAfter: 3,
  noneOfTheseRate: 0.12,
  thinkFirst: true,
  practiceSize: 20,
  lastBackupAt: 0,
  installedAt: 0,
}

export async function getSettings(): Promise<Settings> {
  const rows = await db.settings.toArray()
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS }
  for (const r of rows) if (r.key in DEFAULT_SETTINGS) out[r.key] = r.value
  return out as unknown as Settings
}

export async function getSetting<K extends keyof Settings>(key: K): Promise<Settings[K]> {
  const row = await db.settings.get(key)
  return (row?.value as Settings[K] | undefined) ?? DEFAULT_SETTINGS[key]
}

export async function setSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
  await db.settings.put({ key, value })
}

export function useSettings(): Settings {
  return useLiveQuery(getSettings, [], DEFAULT_SETTINGS)
}
