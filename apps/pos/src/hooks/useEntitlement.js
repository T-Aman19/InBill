import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { FEATURES } from "@inbill/shared";
import { api } from "@/lib/api";
const fallback = (feature) => ({
    feature,
    label: FEATURES[feature].label,
    // Optimistic while the snapshot loads — the server 402 is the real gate, so a
    // brief permissive flash can't actually grant access.
    state: "allowed",
    plan: "free",
});
export function useEntitlements() {
    const query = useQuery({
        queryKey: ["entitlements"],
        queryFn: api.entitlements.get,
        staleTime: 60_000,
    });
    const byKey = useMemo(() => {
        const m = new Map();
        for (const d of query.data?.features ?? [])
            m.set(d.feature, d);
        return m;
    }, [query.data]);
    const can = (feature) => byKey.get(feature) ?? fallback(feature);
    return { can, isLoading: query.isLoading, refetch: query.refetch };
}
/** Convenience: the decision for a single feature. */
export function useFeature(feature) {
    return useEntitlements().can(feature);
}
export const isUsable = (d) => d.state === "allowed" || d.state === "trial" || d.state === "metered";
