import { useQuery } from "@tanstack/react-query";
import { getAccess } from "@/lib/server/fns";
import type { Hats } from "./hats";

const NO_ACCESS: Hats = { staff: null, guardianSwimmerIds: [], selfSwimmerId: null };

export function useAccess() {
  const query = useQuery({ queryKey: ["access"], queryFn: () => getAccess() });
  return { ...query, hats: query.data?.hats ?? NO_ACCESS };
}
