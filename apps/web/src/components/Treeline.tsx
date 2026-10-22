import { useMemo } from 'react'

/** A ragged line of pines around the clearing. Generated once, deterministic. */
export function Treeline({ className, seed, height }: { className: string; seed: number; height: number }) {
  const d = useMemo(() => {
    let s = seed
    const rand = () => ((s = (s * 9301 + 49297) % 233280) / 233280)
    let path = `M0 ${height} `
    for (let x = 0; x <= 1200; ) {
      const w = 26 + rand() * 40
      const h = height * (0.35 + rand() * 0.6)
      path += `L${x.toFixed(0)} ${height} L${(x + w / 2).toFixed(0)} ${(height - h).toFixed(0)} L${(x + w).toFixed(0)} ${height} `
      x += w * (0.55 + rand() * 0.35)
    }
    return `${path}L1200 ${height} Z`
  }, [seed, height])
  return (
    <svg className={className} viewBox={`0 0 1200 ${height}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}
