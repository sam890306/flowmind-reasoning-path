import pg from 'pg'
import { SCHEMA, SCHEMA_VERSION } from './schema.js'

pg.types.setTypeParser(20, (v) => Number(v)) // bigint → number (ids and counters stay far below 2^53)

let pool
let ready

export class ConfigError extends Error {}

function getPool() {
  if (pool) return pool
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL
  if (!url) throw new ConfigError('DATABASE_URL is not set')
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url)
  pool = new pg.Pool({ connectionString: url, max: Number(process.env.PG_POOL_MAX || 3), ssl: local || /sslmode=disable/.test(url) ? undefined : { rejectUnauthorized: false } })
  return pool
}

export async function migrate() {
  const p = getPool()
  await p.query(SCHEMA)
  await p.query('update lab set schema_version = $1 where id = 1', [SCHEMA_VERSION])
  const slots = Number(process.env.LAB_SLOTS)
  if (slots > 0) await p.query('update lab set slots = $1 where id = 1', [slots])
  if (process.env.LAB_NAME) await p.query('update lab set name = $1 where id = 1', [process.env.LAB_NAME])
}

/** One cheap check per cold start; applies the schema when the database is new or behind. */
async function ensure() {
  const p = getPool()
  try {
    const r = await p.query('select schema_version from lab where id = 1')
    if (r.rows[0]?.schema_version === SCHEMA_VERSION) return
  } catch (e) {
    if (e.code !== '42P01') throw e // anything but "table does not exist"
  }
  await migrate()
}

export async function db() {
  if (!ready) ready = ensure().catch((e) => { ready = null; throw e })
  await ready
  return getPool()
}

export async function q(text, params) {
  return (await (await db()).query(text, params)).rows
}

/** Run fn inside a transaction. fn receives a query function bound to the transaction. */
export async function tx(fn) {
  const client = await (await db()).connect()
  const run = async (text, params) => (await client.query(text, params)).rows
  try {
    await client.query('begin')
    const out = await fn(run)
    await client.query('commit')
    return out
  } catch (e) {
    await client.query('rollback').catch(() => {})
    throw e
  } finally {
    client.release()
  }
}

/** Every write bumps lab.version so clients can poll cheaply with ?v=. */
export const bump = (run) => run('update lab set version = version + 1 where id = 1')

export async function closeDb() {
  if (pool) await pool.end()
  pool = null; ready = null
}
