import { jsx as _jsx } from "react/jsx-runtime";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { router } from "./router";
import { ws } from "./lib/ws";
import { useAuthStore } from "./stores/auth";
import "./index.css";
const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: 10_000, retry: 1 } },
});
// Connect WS with outletId from persisted auth store
const outletId = useAuthStore.getState().outletId ?? "";
ws.connect(outletId);
createRoot(document.getElementById("root")).render(_jsx(StrictMode, { children: _jsx(QueryClientProvider, { client: queryClient, children: _jsx(RouterProvider, { router: router }) }) }));
