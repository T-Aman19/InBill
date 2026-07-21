// Single source of truth for responsive breakpoints. Above `tablet` the
// current fixed desktop layout is unchanged; below it, layouts collapse to
// single columns / drawers; below `mobile`, chrome collapses further.
export const BREAKPOINTS = {
  mobile: 640,
  tablet: 1024,
} as const

export const MEDIA = {
  mobile: `(max-width: ${BREAKPOINTS.mobile}px)`,
  tablet: `(max-width: ${BREAKPOINTS.tablet}px)`,
} as const
