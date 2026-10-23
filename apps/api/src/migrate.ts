import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import pg from 'pg'

const DIR = join(import.meta.dirname, '..', 'migrations')

/**
 * Applies migrations/*.sql in name order, each once, recorded in schema_migrations.
 * Use the **unpooled** URL: migrations need a real session (SPEC §15, Neon docs).
 * A transaction-level advisory lock stops two runners applying the same file.
 */
export async function migrate(connectionString: string, log: (line: string) => void = console.log): Promise<string[]> {
  const client = new pg.Client({ connectionString })
  await client.connect()
  const applied: string[] = []
  try {
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())')
    for (const name of readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()) {
      await client.query('BEGIN')
      try {
        await client.query("SELECT pg_advisory_xact_lock(hashtext('cotd:migrate'))")
        const done = await client.query('SELECT 1 FROM schema_migrations WHERE name = $1', [name])
        if (done.rowCount) {
          await client.query('COMMIT')
          continue
        }
        await client.query(readFileSync(join(DIR, name), 'utf8'))
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name])
        await client.query('COMMIT')
        applied.push(name)
        log(`[migrate] applied ${name}`)
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {})
        throw err
      }
    }
  } finally {
    await client.end()
  }
  return applied
}
