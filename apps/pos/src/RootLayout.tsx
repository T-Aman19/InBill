import { Outlet } from "@tanstack/react-router"
import { UpgradeSheet } from "@/components/Entitlement"

export default function RootLayout() {
  return (
    <>
      <Outlet />
      <UpgradeSheet />
    </>
  )
}
