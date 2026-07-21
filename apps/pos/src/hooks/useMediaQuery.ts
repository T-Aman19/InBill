import { useState, useEffect } from "react"
import { MEDIA } from "@/lib/breakpoints"

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)

  useEffect(() => {
    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)
    onChange()
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [query])

  return matches
}

export const useIsMobile = () => useMediaQuery(MEDIA.mobile)
export const useIsTablet = () => useMediaQuery(MEDIA.tablet)
