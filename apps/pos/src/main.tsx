import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { RouterProvider } from "@tanstack/react-router"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { router } from "./router"
import { ws } from "./lib/ws"
import { useAuthStore } from "./stores/auth"
import { bootstrapDemoSession } from "./lib/demoBootstrap"
import "./index.css"

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 10_000, retry: 1 } },
})

// No-op everywhere except the demo deployment (see demoBootstrap.ts). Skipped
// in local dev so `bun run dev` still shows the real login screens.
if (!import.meta.env.DEV) {
  await bootstrapDemoSession()
}

// Connect WS with outletId from persisted auth store (now populated if the
// demo bootstrap above just logged this visitor in)
const outletId = useAuthStore.getState().outletId ?? ""
ws.connect(outletId)

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
