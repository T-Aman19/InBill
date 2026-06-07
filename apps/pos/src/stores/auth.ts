import { create } from "zustand"
import { persist } from "zustand/middleware"

type User = { id: string; name: string; role: string }

type AuthState = {
  token: string | null
  user: User | null
  outletId: string | null
  outletName: string | null
  setupCode: string | null
  login: (token: string, user: User, outletId: string, outletName: string) => void
  setSetupCode: (code: string) => void
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
      setupCode: null,

      login: (token, user, outletId, outletName) => {
        localStorage.setItem("inbill_token", token)
        set({ token, user, outletId, outletName })
        // Reconnect WS with correct outletId now that we know it
        import("../lib/ws").then(({ ws }) => ws.connect(outletId))
      },

      setSetupCode: (code) => set({ setupCode: code }),

      logout: () => {
        localStorage.removeItem("inbill_token")
        set({ token: null, user: null, outletId: null, outletName: null })
      },

      isLoggedIn: () => !!get().token,
    }),
    { name: "inbill_auth" },
  ),
)
