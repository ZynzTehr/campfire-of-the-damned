import type { Hono } from 'hono'
import { createVercelApp } from './wire.ts'

// Vercel entry point (vercel.json → services.api.entrypoint). Vercel runs the default-exported
// Hono app as a function; requests arrive with their full path (/api/story), matching basePath('/api').
const app: Hono = createVercelApp(process.env)
export default app
