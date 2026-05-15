import { useState, useEffect } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"

type OutletCard = {
  id: string
  name: string
  address: string
  todayRevenue: number
  todayBillCount: number
  openOrderCount: number
  razorpayConfigured: boolean
  upiVpa?: string
}

type CreateForm = { name: string; address: string; phone: string; gstin: string; timezone: string }

const DEFAULT_CREATE: CreateForm = { name: "", address: "", phone: "", gstin: "", timezone: "Asia/Kolkata" }

export default function OwnerDashboardPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState<CreateForm>(DEFAULT_CREATE)
  const [createErr, setCreateErr] = useState("")

  // Redirect if no owner token
  useEffect(() => {
    if (!localStorage.getItem("inbill_owner_token")) navigate({ to: "/owner/login" })
  }, [navigate])

  const { data: outlets = [], isLoading, error } = useQuery({
    queryKey: ["owner-outlets"],
    queryFn: () => api.owner.outlets(),
    refetchInterval: 30_000,
  })

  const createMutation = useMutation({
    mutationFn: (body: unknown) => api.owner.createOutlet(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["owner-outlets"] })
      setShowCreate(false)
      setCreateForm(DEFAULT_CREATE)
    },
    onError: (e: Error) => setCreateErr(e.message),
  })

  const switchMutation = useMutation({
    mutationFn: (outletId: string) => api.owner.switchOutlet(outletId),
    onSuccess: (res) => {
      localStorage.setItem("inbill_token", res.token)
      navigate({ to: "/floor" })
    },
  })

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreateErr("")
    createMutation.mutate(createForm)
  }

  function logout() {
    localStorage.removeItem("inbill_owner_token")
    navigate({ to: "/owner/login" })
  }

  function fmt(n: number) {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n)
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Loading…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{(error as Error).message}</p>
          <button onClick={logout} className="text-sm text-blue-600 hover:underline">Sign out</button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Owner Dashboard</h1>
          <p className="text-sm text-gray-500">{new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowCreate(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            + Add Outlet
          </button>
          <button onClick={logout} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-100">
            Sign out
          </button>
        </div>
      </header>

      {/* Summary strip */}
      <div className="bg-white border-b border-gray-100 px-6 py-3 flex gap-8">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Total Today</p>
          <p className="text-lg font-bold text-gray-900">{fmt((outlets as OutletCard[]).reduce((s, o) => s + o.todayRevenue, 0))}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Bills</p>
          <p className="text-lg font-bold text-gray-900">{(outlets as OutletCard[]).reduce((s, o) => s + o.todayBillCount, 0)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Open Orders</p>
          <p className="text-lg font-bold text-gray-900">{(outlets as OutletCard[]).reduce((s, o) => s + o.openOrderCount, 0)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Outlets</p>
          <p className="text-lg font-bold text-gray-900">{(outlets as OutletCard[]).length}</p>
        </div>
      </div>

      {/* Outlet cards */}
      <main className="p-6">
        {(outlets as OutletCard[]).length === 0 ? (
          <div className="text-center py-20">
            <p className="text-gray-400 text-lg mb-2">No outlets yet</p>
            <p className="text-gray-400 text-sm mb-6">Add your first outlet to get started</p>
            <button
              onClick={() => setShowCreate(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-3 rounded-lg"
            >
              Add Outlet
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {(outlets as OutletCard[]).map((outlet) => (
              <div key={outlet.id} className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="font-semibold text-gray-900">{outlet.name}</h2>
                    <p className="text-xs text-gray-400 mt-0.5">{outlet.address}</p>
                  </div>
                  {outlet.openOrderCount > 0 && (
                    <span className="bg-amber-100 text-amber-700 text-xs font-medium px-2 py-0.5 rounded-full">
                      {outlet.openOrderCount} open
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500">Today's Revenue</p>
                    <p className="text-base font-bold text-gray-900 mt-0.5">{fmt(outlet.todayRevenue)}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500">Bills Today</p>
                    <p className="text-base font-bold text-gray-900 mt-0.5">{outlet.todayBillCount}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
                  {outlet.upiVpa && (
                    <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">UPI</span>
                  )}
                  {outlet.razorpayConfigured && (
                    <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">Razorpay</span>
                  )}
                  <div className="flex-1" />
                  <button
                    onClick={() => switchMutation.mutate(outlet.id)}
                    disabled={switchMutation.isPending}
                    className="text-sm text-blue-600 hover:text-blue-700 font-medium px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors"
                  >
                    Open POS →
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Create outlet modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Add Outlet</h2>
            <form onSubmit={handleCreate} className="space-y-3">
              {(["name", "address", "phone", "gstin"] as const).map((field) => (
                <div key={field}>
                  <label className="block text-sm font-medium text-gray-700 mb-1 capitalize">{field === "gstin" ? "GSTIN (optional)" : field}</label>
                  <input
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={createForm[field]}
                    onChange={(e) => setCreateForm((f) => ({ ...f, [field]: e.target.value }))}
                    required={field !== "gstin"}
                  />
                </div>
              ))}
              {createErr && <p className="text-red-600 text-sm">{createErr}</p>}
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowCreate(false)} className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm">Cancel</button>
                <button type="submit" disabled={createMutation.isPending} className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50">
                  {createMutation.isPending ? "Creating…" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
