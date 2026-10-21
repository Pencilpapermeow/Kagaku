import type { PackInput } from '../content/schema'

// 1x1 transparent PNG
export const PNG_DATA_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

export function samplePack(over: Partial<PackInput> = {}): PackInput {
  return {
    format: 'kagaku-pack',
    version: 1,
    id: 'test-thermo-1',
    title: 'Thermodynamics basics',
    createdAt: '2026-10-21',
    questions: [
      {
        chapter: 'phy.thermodynamics',
        format: 'single',
        stem: 'In an isothermal process for an ideal gas, $\\Delta U$ is',
        options: [
          { id: 'A', text: 'zero' },
          { id: 'B', text: 'positive' },
          { id: 'C', text: 'negative' },
          { id: 'D', text: 'equal to $W$' },
        ],
        answer: 'A',
        distractors: [{ text: 'equal to $Q$' }, { text: 'infinite' }],
        verified: 'official',
      },
      {
        chapter: 'phy.thermodynamics',
        format: 'multiple',
        stem: 'Which are state functions?',
        options: [
          { id: 'A', text: 'Internal energy' },
          { id: 'B', text: 'Work' },
          { id: 'C', text: 'Entropy' },
          { id: 'D', text: 'Heat' },
        ],
        answer: ['A', 'C'],
      },
      {
        chapter: 'phy.thermodynamics',
        format: 'numerical',
        stem: 'Efficiency of a Carnot engine between 600 K and 300 K (as a fraction)?',
        answer: 0.5,
      },
      {
        chapter: 'phy.thermodynamics',
        format: 'single',
        stem: 'The P–V diagram shows a cyclic process. The net work done by the gas is',
        image: PNG_DATA_URI,
        options: [
          { id: 'A', text: 'positive' },
          { id: 'B', text: 'negative' },
          { id: 'C', text: 'zero' },
          { id: 'D', text: 'cannot be found' },
        ],
        answer: 'A',
        uncertain: 'direction of the cycle arrow is faint in the source',
      },
    ],
    remember: [
      {
        chapter: 'phy.thermodynamics',
        kind: 'formula',
        title: 'Work in an isothermal process',
        latex: 'W = nRT\\ln\\frac{V_2}{V_1}',
        condition: 'isothermal, ideal gas, reversible',
      },
      {
        chapter: 'phy.thermodynamics',
        kind: 'table',
        title: 'Processes',
        keyColumn: 'process',
        columns: [
          { key: 'process', label: 'Process' },
          { key: 'dU', label: '$\\Delta U$' },
          { key: 'W', label: '$W$' },
        ],
        rows: [
          { process: 'Isothermal', dU: '$0$', W: '$nRT\\ln(V_2/V_1)$' },
          { process: 'Isochoric', dU: '$nC_v\\Delta T$', W: '$0$' },
          { process: 'Isobaric', dU: '$nC_v\\Delta T$', W: '$P\\Delta V$' },
          { process: 'Adiabatic', dU: '$-W$', W: '$\\frac{P_1V_1-P_2V_2}{\\gamma-1}$' },
        ],
      },
      {
        chapter: 'chem.periodicity',
        kind: 'trend',
        title: 'Electronegativity of halogens',
        property: 'electronegativity',
        order: ['I', 'Br', 'Cl', 'F'],
      },
    ],
    ...over,
  }
}
