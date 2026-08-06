import { useEffect } from "react"
import { Outlet } from "@tanstack/react-router"
import { UpgradeSheet } from "@/components/Entitlement"

export default function RootLayout() {
  useEffect(() => {
    // Back/forward can restore a page straight from the browser's bfcache —
    // the whole JS heap (including this frozen React tree) comes back exactly
    // as it was, so none of the router's `beforeLoad` auth guards re-run. That
    // lets a logged-out session (owner or staff) reappear via the back button
    // showing whatever was on screen before logout. `pageshow`'s `persisted`
    // flag is the standard way to detect this; force a full reload so the
    // guards re-check current localStorage instead of trusting the snapshot.
    function onPageShow(e: PageTransitionEvent) {
      if (e.persisted) window.location.reload()
    }
    window.addEventListener("pageshow", onPageShow)
    return () => window.removeEventListener("pageshow", onPageShow)
  }, [])

  return (
    <>
      <Outlet />
      <UpgradeSheet />
    </>
  )
}
