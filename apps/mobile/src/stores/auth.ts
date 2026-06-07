import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { AuthUser } from "@/lib/api"

type AuthState = {
  token: string | null
  user: AuthUser | null
  outletId: string | null
  outletName: string | null
  login: (token: string, user: AuthUser, outletId: string, outletName: string) => void
  logout: () => void
  isLoggedIn: () => boolean
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      outletId: null,
      outletName: null,

      login: (token, user, outletId, outletName) => {
        localStorage.setItem("inbill_token", token)
        set({ token, user, outletId, outletName })
        import("../lib/ws").then(({ ws }) => ws.connect(outletId))
      },

      logout: () => {
        localStorage.removeItem("inbill_token")
        set({ token: null, user: null, outletId: null, outletName: null })
      },

      isLoggedIn: () => !!get().token,
    }),
    { name: "inbill_captain_auth" },
  ),
)
