export type EventListOrder = "program" | "latest";

/** Long course, then short course. Times from the two pools are not one list. */
const COURSE_RANK: Record<string, number> = { "50": 0, "25": 1 };

/** Bebas first, then the rest of a normal form. Not alphabetical. */
const STROKE_RANK: Record<string, number> = {
  bebas: 0,
  punggung: 1,
  dada: 2,
  kupu: 3,
  ganti: 4,
};

const KIND_RANK: Record<string, number> = { official: 0, test: 1 };

export type OrderedEvent = {
  course?: string;
  stroke: string;
  distanceM: number;
  kind?: string;
};

function rank(table: Record<string, number>, key: string | undefined): number {
  if (!key) return 9;
  return table[key] ?? 9;
}

export function compareProgramOrder(a: OrderedEvent, b: OrderedEvent): number {
  const course = rank(COURSE_RANK, a.course) - rank(COURSE_RANK, b.course);
  if (course) return course;
  const stroke = rank(STROKE_RANK, a.stroke) - rank(STROKE_RANK, b.stroke);
  if (stroke) return stroke;
  if (a.distanceM !== b.distanceM) return a.distanceM - b.distanceM;
  return rank(KIND_RANK, a.kind) - rank(KIND_RANK, b.kind);
}

/** Program order, or newest date first with program order as the tie-break. */
export function sortEvents<T extends OrderedEvent>(
  rows: readonly T[],
  order: EventListOrder,
  dateOf: (row: T) => string,
): T[] {
  return [...rows].sort((a, b) => {
    if (order === "latest") {
      const byDate = dateOf(b).localeCompare(dateOf(a));
      if (byDate) return byDate;
    }
    return compareProgramOrder(a, b);
  });
}

/** A stored choice wins. Otherwise the most finished swims, then program order, so a display sort cannot move the chart. */
export function preferredEvent<T extends OrderedEvent & { n: number }>(
  rows: readonly T[],
  key: string,
  keyOf: (row: T) => string,
): T | undefined {
  const chosen = rows.find((row) => keyOf(row) === key);
  if (chosen) return chosen;
  return [...rows].sort((a, b) => b.n - a.n || compareProgramOrder(a, b))[0];
}
