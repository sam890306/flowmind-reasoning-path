// `npm run db:migrate` applies the schema to DATABASE_URL. The API also does this on first use.
import { migrate, closeDb } from './db.js'

await migrate()
await closeDb()
console.log('schema applied')
