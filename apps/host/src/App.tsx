import { useState } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import LoginPage from "./pages/LoginPage"
import HostPage from "./pages/HostPage"

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 10_000 } },
})

export default function App() {
  const [authed, setAuthed] = useState(!!localStorage.getItem("inbill_host_token"))

  function handleLogin() {
    setAuthed(true)
  }

  function handleLogout() {
    localStorage.removeItem("inbill_host_token")
    localStorage.removeItem("inbill_host_outlet_id")
    localStorage.removeItem("inbill_host_outlet_name")
    setAuthed(false)
  }

  if (!authed) return <LoginPage onLogin={handleLogin} />

  return (
    <QueryClientProvider client={queryClient}>
      <HostPage onLogout={handleLogout} />
    </QueryClientProvider>
  )
}
