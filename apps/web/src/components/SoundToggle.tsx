import { useEffect, useRef, useState } from 'react'

/**
 * Optional fire crackle, off by default (SPEC §12). Generated with Web Audio:
 * soft brown noise for the flame plus random pops for the wood. No audio files.
 */
export function SoundToggle() {
  const [on, setOn] = useState(false)
  const stop = useRef<(() => void) | null>(null)

  useEffect(() => () => stop.current?.(), [])

  const toggle = () => {
    if (on) {
      stop.current?.()
      stop.current = null
      setOn(false)
      return
    }
    const Ctx = window.AudioContext
    if (!Ctx) return
    stop.current = startCrackle(new Ctx())
    setOn(true)
  }

  return (
    <button type="button" className="sound" aria-pressed={on} onClick={toggle}>
      <span className="sound__dot" data-on={on} aria-hidden="true" />
      {on ? 'Sound on' : 'Sound off'}
    </button>
  )
}

function startCrackle(ctx: AudioContext): () => void {
  const seconds = 4
  const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  let last = 0
  for (let i = 0; i < data.length; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02 // brown noise
    data[i] = last * 3
    if (Math.random() < 0.00012) for (let j = 0; j < 120 && i + j < data.length; j++) data[i + j] += (Math.random() * 2 - 1) * (1 - j / 120) * 0.6
  }
  const src = ctx.createBufferSource()
  src.buffer = buffer
  src.loop = true
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 1400
  const gain = ctx.createGain()
  gain.gain.value = 0
  gain.gain.linearRampToValueAtTime(0.35, ctx.currentTime + 1.2)
  src.connect(filter).connect(gain).connect(ctx.destination)
  src.start()
  return () => {
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3)
    setTimeout(() => void ctx.close(), 400)
  }
}
