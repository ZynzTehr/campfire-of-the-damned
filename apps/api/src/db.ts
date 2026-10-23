import pg from 'pg'

/** The subset of pg.Pool the stores use, so tests can pass a real pool for any branch. */
export type Db = Pick<pg.Pool, 'query' | 'connect'>

/**
 * One pool per process (per instance on Vercel). Use the **pooled** Neon URL here;
 * migrations use the unpooled one (scripts/migrate.ts).
 */
export function createPool(connectionString: string): pg.Pool {
  return new pg.Pool({ connectionString, max: 5, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 5_000 })
}

/** Runs fn in one transaction on one connection. Rolls back on any error. */
export async function tx<T>(db: Db, fn: (q: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await db.connect()
  try {
    await client.query('BEGIN')
    const out = await fn(client)
    await client.query('COMMIT')
    return out
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}
