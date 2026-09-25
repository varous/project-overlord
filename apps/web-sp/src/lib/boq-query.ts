/**
 * The one react-query client for the editor, plus the BOQ query key.
 *
 * web-sp did not previously use react-query; the BOQ panel is its first query.
 * A single shared client lets the panel subscribe and lets EditorShell invalidate
 * after a placement or show-item change without prop-drilling a provider through
 * the whole shell (the full shell split is a later task).
 */
import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false },
  },
});

export function boqQueryKey(projectId: string) {
  return ["boq", projectId] as const;
}

/** Refetch the BOQ after a mutation. No-op without a project (reference build). */
export function invalidateBoq(projectId: string | null | undefined): void {
  if (!projectId) return;
  void queryClient.invalidateQueries({ queryKey: boqQueryKey(projectId) });
}
