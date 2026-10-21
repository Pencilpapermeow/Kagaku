// Writes docs/pack.schema.json (JSON Schema of the pack format) from the app's zod schema.
//   npm run schema
import { writeFileSync } from 'node:fs'
import { z } from 'zod'
import { zPack } from '../../src/content/schema'

writeFileSync('docs/pack.schema.json', JSON.stringify(z.toJSONSchema(zPack, { io: 'input' }), null, 1) + '\n')
console.log('docs/pack.schema.json written')
