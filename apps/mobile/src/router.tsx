import { createRouter, createRoute, createRootRoute, redirect, Outlet } from "@tanstack/react-router"
import LoginPage from "@/pages/LoginPage"
import FloorPage from "@/pages/FloorPage"
import OrderPage from "@/pages/OrderPage"
import { useAuthStore } from "@/stores/auth"

const rootRoute = createRootRoute({ component: Outlet })

function requireAuth() {
  if (!localStorage.getItem("inbill_token")) throw redirect({ to: "/login" })
}

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => {
    const token = localStorage.getItem("inbill_token")
    if (!token) throw redirect({ to: "/login" })
    const role = useAuthStore.getState().user?.role
    throw redirect({ to: role === "kitchen" ? "/login" : "/floor" })
  },
  component: () => null,
})

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: LoginPage,
})

const floorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/floor",
  beforeLoad: requireAuth,
  component: FloorPage,
})

const orderRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/order/$orderId",
  beforeLoad: requireAuth,
  validateSearch: (search: Record<string, unknown>) => ({
    tableId:    search["tableId"]    as string | undefined,
    customerId: search["customerId"] as string | undefined,
  }),
  component: OrderPage,
})

const routeTree = rootRoute.addChildren([indexRoute, loginRoute, floorRoute, orderRoute])

export const router = createRouter({ routeTree, basepath: "/mobile" })

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}
