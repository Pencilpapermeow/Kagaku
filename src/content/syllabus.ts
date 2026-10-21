// The chapter registry. Content packs tag every item with one of these chapter ids,
// so ids must never change once content exists; rename the `name` instead, or add
// the old id to `aliases` of the new chapter. Packs can add chapters too (see packs).

export type SubjectId = 'phy' | 'chem' | 'math'
export type ClassLevel = 11 | 12

export interface Subject {
  id: SubjectId
  name: string
  short: string
  units: { id: string; name: string }[]
}

export interface Chapter {
  id: string
  subject: SubjectId
  unit: string
  cls: ClassLevel
  name: string
  /** His own chapter number (1–95). */
  no?: number
  aliases?: string[]
  topics?: string[]
}

export const SUBJECTS: Subject[] = [
  {
    id: 'phy',
    name: 'Physics',
    short: 'Phy',
    units: [
      { id: 'mech1', name: 'Mechanics 1' },
      { id: 'mech2', name: 'Mechanics 2' },
      { id: 'thermo', name: 'Thermodynamics' },
      { id: 'em', name: 'Electromagnetism' },
      { id: 'optics', name: 'Optics' },
      { id: 'modern', name: 'Modern Physics' },
      { id: 'misc', name: 'Miscellaneous' },
    ],
  },
  {
    id: 'chem',
    name: 'Chemistry',
    short: 'Chem',
    units: [
      { id: 'physical', name: 'Physical' },
      { id: 'inorganic', name: 'Inorganic' },
      { id: 'organic', name: 'Organic' },
    ],
  },
  {
    id: 'math',
    name: 'Mathematics',
    short: 'Math',
    units: [
      { id: 'algebra', name: 'Algebra' },
      { id: 'trig', name: 'Trigonometry' },
      { id: 'coord', name: 'Coordinate Geometry' },
      { id: 'calculus', name: 'Calculus' },
      { id: 'vector', name: 'Vectors & 3D' },
      { id: 'misc', name: 'Statistics & Probability' },
    ],
  },
]

type Row = [slug: string, unit: string, cls: ClassLevel, name: string, opts?: { unnumbered: true }]

// Uttam's own list, in his order and numbering: Physics 1–30, Chemistry 31–65,
// Maths 66–95. "Dual nature of radiation and matter" has no number in his register
// (it sits between 27 Wave Optics and 28 Atom/Nuclei) — waiting for him to confirm.
const PHY: Row[] = [
  ['math-tools', 'misc', 11, 'Mathematical Tools'],
  ['motion-1d', 'mech1', 11, 'Motion in a Straight Line'],
  ['motion-2d', 'mech1', 11, 'Motion in a Plane'],
  ['laws-of-motion', 'mech1', 11, "Newton's Laws of Motion"],
  ['work-energy-power', 'mech1', 11, 'Work, Energy and Power'],
  ['circular-motion', 'mech1', 11, 'Circular Motion'],
  ['com-collisions', 'mech1', 11, 'Centre of Mass and System of Particles'],
  ['rotational-motion', 'mech2', 11, 'Rotational Motion'],
  ['gravitation', 'mech2', 11, 'Gravitation'],
  ['solids', 'mech2', 11, 'Mechanical Properties of Solids'],
  ['fluids', 'mech2', 11, 'Mechanical Properties of Fluids'],
  ['thermal-properties', 'thermo', 11, 'Thermal Properties of Matter'],
  ['ktg', 'thermo', 11, 'Kinetic Theory of Gases'],
  ['thermodynamics', 'thermo', 11, 'Thermodynamics'],
  ['oscillations', 'mech2', 11, 'Oscillations'],
  ['waves', 'mech2', 11, 'Waves'],
  ['electric-field', 'em', 12, 'Electric Charges and Fields'],
  ['electrostatic-potential', 'em', 12, 'Electrostatic Potential and Dipole'],
  ['current-electricity', 'em', 12, 'Current Electricity'],
  ['capacitance', 'em', 12, 'Capacitance'],
  ['moving-charges', 'em', 12, 'Moving Charges and Magnetism'],
  ['magnetism-matter', 'em', 12, 'Magnetism and Matter'],
  ['emi', 'em', 12, 'Electromagnetic Induction'],
  ['ac', 'em', 12, 'Alternating Current'],
  ['em-waves', 'em', 12, 'Electromagnetic Waves'],
  ['ray-optics', 'optics', 12, 'Ray Optics and Optical Instruments'],
  ['wave-optics', 'optics', 12, 'Wave Optics'],
  ['dual-nature', 'modern', 12, 'Dual Nature of Radiation and Matter', { unnumbered: true }],
  ['atoms-nuclei', 'modern', 12, 'Atoms and Nuclei'],
  ['semiconductors', 'modern', 12, 'Semiconductor Electronics'],
  ['units-measurements', 'misc', 11, 'Units and Measurement'],
]

const CHEM: Row[] = [
  ['mole-concept', 'physical', 11, 'Some Basic Concepts of Chemistry'],
  ['redox', 'physical', 11, 'Redox Reactions'],
  ['solutions', 'physical', 12, 'Solutions'],
  ['thermodynamics', 'physical', 11, 'Thermodynamics'],
  ['chemical-equilibrium', 'physical', 11, 'Chemical Equilibrium'],
  ['ionic-equilibrium', 'physical', 11, 'Ionic Equilibrium'],
  ['electrochemistry', 'physical', 12, 'Electrochemistry'],
  ['chemical-kinetics', 'physical', 12, 'Chemical Kinetics'],
  ['atomic-structure', 'physical', 11, 'Structure of Atom'],
  ['periodicity', 'inorganic', 11, 'Periodic Table'],
  ['chemical-bonding', 'inorganic', 11, 'Chemical Bonding'],
  ['iupac', 'organic', 11, 'IUPAC Nomenclature (basic)'],
  ['isomerism', 'organic', 11, 'Isomerism'],
  ['goc', 'organic', 11, 'General Organic Chemistry'],
  ['hydrocarbons', 'organic', 11, 'Hydrocarbons'],
  ['haloalkanes', 'organic', 12, 'Haloalkanes and Haloarenes'],
  ['alcohols-phenols-ethers', 'organic', 12, 'Alcohols, Phenols and Ethers'],
  ['carbonyls', 'organic', 12, 'Aldehydes, Ketones and Carboxylic Acids'],
  ['amines', 'organic', 12, 'Amines'],
  ['biomolecules', 'organic', 12, 'Biomolecules'],
  ['purification-analysis', 'organic', 11, 'Purification and Analysis of Organic Compounds'],
  ['coordination', 'inorganic', 12, 'Coordination Compounds'],
  ['p-block', 'inorganic', 12, 'p-Block Elements'],
  ['d-f-block', 'inorganic', 12, 'd- and f-Block Elements'],
  ['salt-analysis', 'inorganic', 12, 'Qualitative Analysis (Salt Analysis)'],
  ['metallurgy', 'inorganic', 12, 'Principles and Processes of Isolation of Metals'],
  ['hydrogen', 'inorganic', 11, 'Hydrogen and its Compounds'],
  ['s-block', 'inorganic', 11, 's-Block Elements'],
  ['states-of-matter', 'physical', 11, 'States of Matter'],
  ['solid-state', 'physical', 12, 'Solid State'],
  ['surface-chemistry', 'physical', 12, 'Surface Chemistry'],
  ['polymers', 'organic', 12, 'Polymers'],
  ['everyday-life', 'organic', 12, 'Chemistry in Everyday Life'],
  ['environmental', 'inorganic', 11, 'Environmental Chemistry'],
  ['nuclear', 'physical', 12, 'Nuclear Chemistry'],
]

const MATH: Row[] = [
  ['basic-maths', 'algebra', 11, 'Basic Maths and Sets'],
  ['quadratic', 'algebra', 11, 'Quadratic Equations'],
  ['sequences-series', 'algebra', 11, 'Sequence and Series'],
  ['trig-functions', 'trig', 11, 'Trigonometric Functions'],
  ['trig-equations', 'trig', 11, 'Trigonometric Equations'],
  ['matrices-determinants', 'algebra', 12, 'Determinants and Matrices'],
  ['relations-functions', 'algebra', 12, 'Relations and Functions'],
  ['itf', 'trig', 12, 'Inverse Trigonometric Functions'],
  ['lcd', 'calculus', 12, 'Limit, Continuity and Differentiability'],
  ['differentiation', 'calculus', 12, 'Methods of Differentiation'],
  ['aod', 'calculus', 12, 'Application of Derivatives'],
  ['indefinite-integration', 'calculus', 12, 'Indefinite Integration'],
  ['definite-integration', 'calculus', 12, 'Definite Integration'],
  ['area', 'calculus', 12, 'Application of Integrals'],
  ['differential-equations', 'calculus', 12, 'Differential Equations'],
  ['straight-lines', 'coord', 11, 'Straight Lines'],
  ['circles', 'coord', 11, 'Circles'],
  ['parabola', 'coord', 11, 'Parabola'],
  ['ellipse', 'coord', 11, 'Ellipse'],
  ['hyperbola', 'coord', 11, 'Hyperbola'],
  ['vectors', 'vector', 12, 'Vector Algebra'],
  ['3d', 'vector', 12, '3-D Geometry'],
  ['binomial', 'algebra', 11, 'Binomial Theorem'],
  ['pnc', 'algebra', 11, 'Permutations and Combinations'],
  ['probability', 'misc', 12, 'Probability'],
  ['statistics', 'misc', 11, 'Statistics'],
  ['complex-1', 'algebra', 11, 'Complex Numbers – I'],
  ['complex-2', 'algebra', 11, 'Complex Numbers – II'],
  ['triangles', 'trig', 11, 'Solution of Triangles'],
  ['number-theory', 'algebra', 11, 'Number Theory (basic)'],
]

let counter = 0
function build(subject: SubjectId, rows: Row[]): Chapter[] {
  return rows.map(([slug, unit, cls, name, opts]) => ({
    id: `${subject}.${slug}`,
    subject,
    unit,
    cls,
    name,
    no: opts?.unnumbered ? undefined : ++counter,
  }))
}

export const BASE_CHAPTERS: Chapter[] = [...build('phy', PHY), ...build('chem', CHEM), ...build('math', MATH)]

export function subjectOf(chapterId: string): SubjectId | undefined {
  const s = chapterId.split('.')[0]
  return s === 'phy' || s === 'chem' || s === 'math' ? s : undefined
}

export function getSubject(id: SubjectId): Subject {
  const s = SUBJECTS.find((x) => x.id === id)
  if (!s) throw new Error(`Unknown subject ${id}`)
  return s
}

/** Merge pack-defined chapters over the built-in list (same id = override, new id = added). */
export function mergeChapters(base: Chapter[], extra: Chapter[]): Chapter[] {
  const byId = new Map(base.map((c) => [c.id, c]))
  for (const c of extra) byId.set(c.id, { ...byId.get(c.id), ...c })
  return [...byId.values()]
}

/** Resolve an id that might be an old alias to the current chapter id. */
export function resolveChapterId(chapters: Chapter[], id: string): string | undefined {
  if (chapters.some((c) => c.id === id)) return id
  return chapters.find((c) => c.aliases?.includes(id))?.id
}
