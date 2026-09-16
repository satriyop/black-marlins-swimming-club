import type { Dashboard, Practice } from "@/lib/swim/types";

type ScheduledTraining = NonNullable<Dashboard["nextScheduledTraining"]>;

export function selectDashboardPractice({
  upcomingPractices,
  nextScheduledTraining,
  clubView,
  today,
}: {
  upcomingPractices: Practice[];
  nextScheduledTraining: ScheduledTraining | null;
  clubView: boolean;
  today: string;
}): Practice | ScheduledTraining | undefined {
  const actionablePractices = clubView
    ? upcomingPractices
    : upcomingPractices.filter((practice) => practice.sessionDate >= today);
  const scheduledPractice = actionablePractices.find(
    (practice) => practice.id === nextScheduledTraining?.practiceId,
  );
  const scheduledCandidate = scheduledPractice ?? nextScheduledTraining ?? undefined;
  const candidates: Array<Practice | ScheduledTraining> = actionablePractices.filter(
    (practice) => !nextScheduledTraining || practice.id !== nextScheduledTraining.practiceId,
  );
  if (scheduledCandidate) candidates.push(scheduledCandidate);
  return candidates.slice().sort((left, right) => {
    const leftDate = "scheduleId" in left ? left.date : left.sessionDate;
    const rightDate = "scheduleId" in right ? right.date : right.sessionDate;
    const priority = (date: string) => (date === today ? 0 : date < today ? 1 : 2);
    return (
      priority(leftDate) - priority(rightDate) ||
      `${leftDate}T${left.startTime ?? "00:00"}`.localeCompare(
        `${rightDate}T${right.startTime ?? "00:00"}`,
      )
    );
  })[0];
}
