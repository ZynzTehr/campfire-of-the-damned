import { migrate } from '../src/migrate.ts'

// Usage: node --env-file=../../.env scripts/migrate.ts [ENV_VAR]
// Defaults to DATABASE_URL_UNPOOLED. Pass TEST_DATABASE_URL_UNPOOLED for the test branch.
const key = process.argv[2] ?? 'DATABASE_URL_UNPOOLED'
const url = process.env[key]
if (!url) {
  console.error(`[migrate] ${key} is not set`)
  process.exit(1)
}
const applied = await migrate(url)
console.log(applied.length ? `[migrate] ${applied.length} applied (${key})` : `[migrate] up to date (${key})`)
