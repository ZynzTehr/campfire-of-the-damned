// Network tripwire: API tests must never reach Gemini, Neon, or anything else.
// Routes are exercised with app.request(), which never touches the network.
// Fakes are passed in through createApp(deps), so nothing here needs real fetch.
globalThis.fetch = () => {
  throw new Error('Network access in tests is not allowed. Inject a fake instead.')
}
