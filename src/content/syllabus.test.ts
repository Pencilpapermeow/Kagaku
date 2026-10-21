import { describe, expect, it } from 'vitest'
import { BASE_CHAPTERS, SUBJECTS } from './syllabus'
import { zChapterId } from './schema'

describe('chapter registry', () => {
  it("follows Uttam's numbering: Physics 1–30, Chemistry 31–65, Maths 66–95", () => {
    const nos = (s: string) => BASE_CHAPTERS.filter((c) => c.subject === s && c.no).map((c) => c.no)
    const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i)
    expect(nos('phy')).toEqual(range(1, 30))
    expect(nos('chem')).toEqual(range(31, 65))
    expect(nos('math')).toEqual(range(66, 95))
    expect(BASE_CHAPTERS.find((c) => c.no === 94)?.name).toBe('Solution of Triangles')
    expect(BASE_CHAPTERS.find((c) => c.no === 95)?.name).toBe('Number Theory (basic)')
    expect(BASE_CHAPTERS.find((c) => c.no === 28)?.name).toBe('Atoms and Nuclei')
  })
  it('only "Dual nature" is waiting for a number', () => {
    expect(BASE_CHAPTERS.filter((c) => !c.no).map((c) => c.id)).toEqual(['phy.dual-nature'])
  })
  it('ids are unique and valid, units exist', () => {
    expect(new Set(BASE_CHAPTERS.map((c) => c.id)).size).toBe(BASE_CHAPTERS.length)
    for (const c of BASE_CHAPTERS) {
      expect(zChapterId.safeParse(c.id).success, c.id).toBe(true)
      expect(SUBJECTS.find((s) => s.id === c.subject)!.units.some((u) => u.id === c.unit), c.id).toBe(true)
    }
  })
})
