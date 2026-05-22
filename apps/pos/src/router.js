import { createRouter, createRoute, createRootRoute, redirect, Outlet } from "@tanstack/react-router";
import LoginPage from "@/pages/LoginPage";
import FloorPage from "@/pages/FloorPage";
import OrderPage from "@/pages/OrderPage";
import BillingPage from "@/pages/BillingPage";
import KdsPage from "@/pages/KdsPage";
import ManagerPage from "@/pages/ManagerPage";
import InventoryPage from "@/pages/InventoryPage";
import PODetailPage from "@/pages/PODetailPage";
import OwnerLoginPage from "@/pages/OwnerLoginPage";
import OwnerDashboardPage from "@/pages/OwnerDashboardPage";
import QrMenuPage from "@/pages/QrMenuPage";
import { useAuthStore } from "@/stores/auth";
const rootRoute = createRootRoute({ component: Outlet });
const loginRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/login",
    component: LoginPage,
});
function requireAuth() {
    const token = localStorage.getItem("inbill_token");
    if (!token)
        throw redirect({ to: "/login" });
}
function getRole() {
    return useAuthStore.getState().user?.role;
}
// kitchen staff may only use the KDS
function requireNotKitchen() {
    requireAuth();
    if (getRole() === "kitchen")
        throw redirect({ to: "/kds" });
}
// billing is for owner / manager / cashier
function requireBillingAccess() {
    requireAuth();
    const role = getRole();
    if (role === "kitchen" || role === "captain")
        throw redirect({ to: "/floor" });
}
// manager panel is for owner / manager only
function requireManagerAccess() {
    requireAuth();
    const role = getRole();
    if (role !== "owner" && role !== "manager")
        throw redirect({ to: "/floor" });
}
const floorRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/floor",
    beforeLoad: requireNotKitchen,
    component: FloorPage,
});
const orderRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/order/$orderId",
    beforeLoad: requireNotKitchen,
    validateSearch: (search) => ({
        tableId: search.tableId,
    }),
    component: OrderPage,
});
const billingRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/billing/$billId",
    beforeLoad: requireBillingAccess,
    component: BillingPage,
});
const kdsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/kds",
    beforeLoad: requireAuth,
    component: KdsPage,
});
const managerRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/manager",
    beforeLoad: requireManagerAccess,
    component: ManagerPage,
});
const inventoryRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/inventory",
    beforeLoad: requireManagerAccess,
    component: InventoryPage,
});
const poDetailRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/inventory/purchase-orders/$id",
    beforeLoad: requireManagerAccess,
    component: PODetailPage,
});
const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    beforeLoad: () => {
        const token = localStorage.getItem("inbill_token");
        if (!token)
            throw redirect({ to: "/login" });
        throw redirect({ to: getRole() === "kitchen" ? "/kds" : "/floor" });
    },
    component: () => null,
});
const qrMenuRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/menu/$outletId/$tableId",
    component: QrMenuPage,
});
const ownerLoginRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/owner/login",
    component: OwnerLoginPage,
});
const ownerDashboardRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/owner/dashboard",
    beforeLoad: () => {
        if (!localStorage.getItem("inbill_owner_token"))
            throw redirect({ to: "/owner/login" });
    },
    component: OwnerDashboardPage,
});
const routeTree = rootRoute.addChildren([
    indexRoute,
    loginRoute,
    floorRoute,
    orderRoute,
    billingRoute,
    kdsRoute,
    managerRoute,
    inventoryRoute,
    poDetailRoute,
    ownerLoginRoute,
    ownerDashboardRoute,
    qrMenuRoute,
]);
export const router = createRouter({ routeTree });
