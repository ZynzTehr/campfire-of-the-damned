import { serve } from '@hono/node-server'
import { getConnInfo } from '@hono/node-server/conninfo'
import { ConfigError, worstCaseCallUsd } from './config.ts'
import { buildApi } from './wire.ts'

// Local entry point only. On Vercel, vercel.ts serves the same app (see wire.ts).
// Fail closed (SPEC §8.3): a missing or out-of-range setting stops the server.
let built
try {
  // Socket address locally. On Vercel the platform-set x-real-ip is used instead.
  built = buildApi(process.env, { socketIp: (c) => getConnInfo(c).remote.address ?? 'unknown' })
} catch (err) {
  if (!(err instanceof ConfigError)) throw err
  console.error('[api] Refusing to start. Fix .env (see .env.example):')
  for (const p of err.problems) console.error(`  - ${p}`)
  process.exit(1)
}

const { app, config } = built
const c = config.cost
serve({ fetch: app.fetch, port: config.port, hostname: '127.0.0.1' }, (info) => {
  console.log(`[api] listening on http://127.0.0.1:${info.port} (model: ${config.geminiModel}, store: ${config.store}, AI ${c.aiEnabled ? 'on' : 'OFF'})`)
  console.log(
    `[api] caps: ${c.appRpmCap}/min ${c.appRpdCap}/day app-wide, ${c.perIpPerMinute}/min ${c.perIpPerHour}/h per IP, ` +
      `${c.maxConcurrentAiCalls} concurrent, $${c.dailyUsdCap}/day $${c.monthlyUsdCap}/month, worst case $${worstCaseCallUsd(c).toFixed(5)}/call`,
  )
})
