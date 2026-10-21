// The chapter registry. Content packs tag every item with one of these chapter ids,
// so ids must never change once content exists; rename the `name` instead, or add
// the old id to `aliases` of the new chapter. Packs can add chapters too (see packs).
//
// DRAFT: built from the JEE Advanced syllabus. Uttam will send his own 97-chapter list,
// which replaces the names/order here.

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

type Row = [slug: string, unit: string, cls: ClassLevel, name: string]

const PHY: Row[] = [
  ['basic-maths', 'misc', 11, 'Basic Mathematics & Vectors'],
  ['units-measurements', 'misc', 11, 'Units, Dimensions & Errors'],
  ['motion-1d', 'mech1', 11, 'Motion in a Straight Line'],
  ['motion-2d', 'mech1', 11, 'Motion in a Plane'],
  ['laws-of-motion', 'mech1', 11, 'Laws of Motion'],
  ['friction', 'mech1', 11, 'Friction'],
  ['work-energy-power', 'mech1', 11, 'Work, Energy & Power'],
  ['circular-motion', 'mech1', 11, 'Circular Motion'],
  ['com-collisions', 'mech1', 11, 'Centre of Mass & Collisions'],
  ['rotational-motion', 'mech2', 11, 'Rotational Motion'],
  ['gravitation', 'mech2', 11, 'Gravitation'],
  ['solids', 'mech2', 11, 'Mechanical Properties of Solids'],
  ['fluids', 'mech2', 11, 'Mechanical Properties of Fluids'],
  ['oscillations', 'mech2', 11, 'Oscillations (SHM)'],
  ['waves', 'mech2', 11, 'Waves & Sound'],
  ['thermal-properties', 'thermo', 11, 'Thermal Properties of Matter'],
  ['ktg', 'thermo', 11, 'Kinetic Theory of Gases'],
  ['thermodynamics', 'thermo', 11, 'Thermodynamics'],
  ['electric-field', 'em', 12, 'Electric Charges & Fields'],
  ['potential-capacitance', 'em', 12, 'Electrostatic Potential & Capacitance'],
  ['current-electricity', 'em', 12, 'Current Electricity'],
  ['moving-charges', 'em', 12, 'Moving Charges & Magnetism'],
  ['magnetism-matter', 'em', 12, 'Magnetism & Matter'],
  ['emi', 'em', 12, 'Electromagnetic Induction'],
  ['ac', 'em', 12, 'Alternating Current'],
  ['em-waves', 'em', 12, 'Electromagnetic Waves'],
  ['ray-optics', 'optics', 12, 'Ray Optics'],
  ['wave-optics', 'optics', 12, 'Wave Optics'],
  ['dual-nature', 'modern', 12, 'Dual Nature of Radiation & Matter'],
  ['atoms', 'modern', 12, 'Atoms'],
  ['nuclei', 'modern', 12, 'Nuclei'],
  ['semiconductors', 'modern', 12, 'Semiconductor Electronics'],
  ['experimental', 'misc', 12, 'Experimental Physics'],
]

const CHEM: Row[] = [
  ['mole-concept', 'physical', 11, 'Some Basic Concepts (Mole Concept)'],
  ['atomic-structure', 'physical', 11, 'Structure of Atom'],
  ['states-of-matter', 'physical', 11, 'States of Matter'],
  ['thermochemistry', 'physical', 11, 'Thermodynamics & Thermochemistry'],
  ['chemical-equilibrium', 'physical', 11, 'Chemical Equilibrium'],
  ['ionic-equilibrium', 'physical', 11, 'Ionic Equilibrium'],
  ['redox', 'physical', 11, 'Redox Reactions'],
  ['solid-state', 'physical', 12, 'Solid State'],
  ['solutions', 'physical', 12, 'Solutions'],
  ['electrochemistry', 'physical', 12, 'Electrochemistry'],
  ['chemical-kinetics', 'physical', 12, 'Chemical Kinetics'],
  ['surface-chemistry', 'physical', 12, 'Surface Chemistry'],
  ['periodicity', 'inorganic', 11, 'Classification of Elements & Periodicity'],
  ['chemical-bonding', 'inorganic', 11, 'Chemical Bonding'],
  ['hydrogen', 'inorganic', 11, 'Hydrogen'],
  ['s-block', 'inorganic', 11, 's-Block Elements'],
  ['p-block-11', 'inorganic', 11, 'p-Block (Groups 13–14)'],
  ['p-block-12', 'inorganic', 12, 'p-Block (Groups 15–18)'],
  ['d-f-block', 'inorganic', 12, 'd- & f-Block Elements'],
  ['coordination', 'inorganic', 12, 'Coordination Compounds'],
  ['metallurgy', 'inorganic', 12, 'Metallurgy'],
  ['salt-analysis', 'inorganic', 12, 'Salt Analysis'],
  ['iupac', 'organic', 11, 'IUPAC Nomenclature'],
  ['goc', 'organic', 11, 'General Organic Chemistry'],
  ['isomerism', 'organic', 11, 'Isomerism'],
  ['hydrocarbons', 'organic', 11, 'Hydrocarbons'],
  ['haloalkanes', 'organic', 12, 'Haloalkanes & Haloarenes'],
  ['alcohols-phenols-ethers', 'organic', 12, 'Alcohols, Phenols & Ethers'],
  ['carbonyls', 'organic', 12, 'Aldehydes, Ketones & Carboxylic Acids'],
  ['amines', 'organic', 12, 'Amines'],
  ['biomolecules', 'organic', 12, 'Biomolecules'],
  ['polymers', 'organic', 12, 'Polymers'],
  ['practical-organic', 'organic', 12, 'Practical Organic Chemistry'],
]

const MATH: Row[] = [
  ['basic-maths', 'algebra', 11, 'Basic Mathematics'],
  ['sets-relations', 'algebra', 11, 'Sets & Relations'],
  ['functions', 'algebra', 12, 'Functions'],
  ['quadratic', 'algebra', 11, 'Quadratic Equations'],
  ['complex-numbers', 'algebra', 11, 'Complex Numbers'],
  ['sequences-series', 'algebra', 11, 'Sequences & Series'],
  ['pnc', 'algebra', 11, 'Permutations & Combinations'],
  ['binomial', 'algebra', 11, 'Binomial Theorem'],
  ['induction', 'algebra', 11, 'Mathematical Induction'],
  ['matrices', 'algebra', 12, 'Matrices'],
  ['determinants', 'algebra', 12, 'Determinants'],
  ['trig-ratios', 'trig', 11, 'Trigonometric Ratios & Identities'],
  ['trig-equations', 'trig', 11, 'Trigonometric Equations'],
  ['triangles', 'trig', 11, 'Properties of Triangles'],
  ['itf', 'trig', 12, 'Inverse Trigonometric Functions'],
  ['straight-lines', 'coord', 11, 'Straight Lines'],
  ['circles', 'coord', 11, 'Circles'],
  ['parabola', 'coord', 11, 'Parabola'],
  ['ellipse', 'coord', 11, 'Ellipse'],
  ['hyperbola', 'coord', 11, 'Hyperbola'],
  ['limits', 'calculus', 11, 'Limits'],
  ['continuity-differentiability', 'calculus', 12, 'Continuity & Differentiability'],
  ['differentiation', 'calculus', 12, 'Methods of Differentiation'],
  ['aod', 'calculus', 12, 'Application of Derivatives'],
  ['indefinite-integration', 'calculus', 12, 'Indefinite Integration'],
  ['definite-integration', 'calculus', 12, 'Definite Integration'],
  ['area', 'calculus', 12, 'Area Under Curves'],
  ['differential-equations', 'calculus', 12, 'Differential Equations'],
  ['vectors', 'vector', 12, 'Vector Algebra'],
  ['3d', 'vector', 12, 'Three Dimensional Geometry'],
  ['statistics', 'misc', 11, 'Statistics'],
  ['probability', 'misc', 12, 'Probability'],
]

function build(subject: SubjectId, rows: Row[]): Chapter[] {
  return rows.map(([slug, unit, cls, name]) => ({ id: `${subject}.${slug}`, subject, unit, cls, name }))
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
