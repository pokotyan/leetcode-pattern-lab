import { useCallback, useEffect, useRef, useState } from 'react'

export type Stepper = {
  index: number
  total: number
  playing: boolean
  speed: number
  atStart: boolean
  atEnd: boolean
  go: (i: number) => void
  next: () => void
  prev: () => void
  reset: () => void
  toggle: () => void
  setSpeed: (ms: number) => void
}

/** フレーム列の再生位置を管理する。総数が変わったら先頭に戻す */
export function useStepper(total: number): Stepper {
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(650)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    setIndex(0)
    setPlaying(false)
  }, [total])

  const go = useCallback(
    (i: number) => setIndex(Math.max(0, Math.min(total - 1, i))),
    [total],
  )
  const next = useCallback(() => setIndex((i) => Math.min(total - 1, i + 1)), [total])
  const prev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), [])
  const reset = useCallback(() => {
    setIndex(0)
    setPlaying(false)
  }, [])
  const toggle = useCallback(() => {
    setPlaying((p) => {
      // 末尾で再生を押したら頭から
      if (!p) setIndex((i) => (i >= total - 1 ? 0 : i))
      return !p
    })
  }, [total])

  useEffect(() => {
    if (!playing) return
    timer.current = window.setInterval(() => {
      setIndex((i) => {
        if (i >= total - 1) {
          setPlaying(false)
          return i
        }
        return i + 1
      })
    }, speed)
    return () => {
      if (timer.current) window.clearInterval(timer.current)
    }
  }, [playing, speed, total])

  return {
    index,
    total,
    playing,
    speed,
    atStart: index === 0,
    atEnd: index >= total - 1,
    go,
    next,
    prev,
    reset,
    toggle,
    setSpeed,
  }
}
