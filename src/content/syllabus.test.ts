import { describe, expect, it } from 'vitest'
import { BASE_CHAPTERS, SUBJECTS } from './syllabus'
import { zChapterId } from './schema'

describe('chapter registry', () => {
  it("has Uttam's 97 chapters: 32 Physics, 35 Chemistry, 30 Maths", () => {
    expect(BASE_CHAPTERS).toHaveLength(97)
    const count = (s: string) => BASE_CHAPTERS.filter((c) => c.subject === s).length
    expect([count('phy'), count('chem'), count('math')]).toEqual([32, 35, 30])
  })
  it('ids are unique and valid, units exist', () => {
    expect(new Set(BASE_CHAPTERS.map((c) => c.id)).size).toBe(BASE_CHAPTERS.length)
    for (const c of BASE_CHAPTERS) {
      expect(zChapterId.safeParse(c.id).success, c.id).toBe(true)
      expect(SUBJECTS.find((s) => s.id === c.subject)!.units.some((u) => u.id === c.unit), c.id).toBe(true)
    }
  })
})
