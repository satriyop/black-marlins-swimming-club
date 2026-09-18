import type { Dashboard, Practice } from "@/lib/swim/types";

type ScheduledTraining = NonNullable<Dashboard["nextScheduledTraining"]>;
export type DashboardPractice = Practice | ScheduledTraining;

type SelectArgs = {
  upcomingPractices: Practice[];
  nextScheduledTraining: ScheduledTraining | null;
  clubView: boolean;
  today: string;
};

export function dashboardPracticeDate(item: DashboardPractice): string {
  return "scheduleId" in item ? item.date : item.sessionDate;
}

function collectCandidates({
  upcomingPractices,
  nextScheduledTraining,
  clubView,
  today,
}: SelectArgs): DashboardPractice[] {
  const actionablePractices = clubView
    ? upcomingPractices
    : upcomingPractices.filter((practice) => practice.sessionDate >= today);
  const scheduledPractice = actionablePractices.find(
    (practice) => practice.id === nextScheduledTraining?.practiceId,
  );
  const scheduledCandidate = scheduledPractice ?? nextScheduledTraining ?? undefined;
  const candidates: DashboardPractice[] = actionablePractices.filter(
    (practice) => !nextScheduledTraining || practice.id !== nextScheduledTraining.practiceId,
  );
  if (scheduledCandidate) candidates.push(scheduledCandidate);
  return candidates;
}

function bySessionTime(left: DashboardPractice, right: DashboardPractice) {
  const leftDate = dashboardPracticeDate(left);
  const rightDate = dashboardPracticeDate(right);
  return `${leftDate}T${left.startTime ?? "00:00"}`.localeCompare(
    `${rightDate}T${right.startTime ?? "00:00"}`,
  );
}

export function selectDashboardPractice(args: SelectArgs): DashboardPractice | undefined {
  const { today } = args;
  return collectCandidates(args)
    .filter((item) => dashboardPracticeDate(item) >= today)
    .slice()
    .sort((left, right) => {
      const leftDate = dashboardPracticeDate(left);
      const rightDate = dashboardPracticeDate(right);
      const leftRank = leftDate === today ? 0 : 1;
      const rightRank = rightDate === today ? 0 : 1;
      return leftRank - rightRank || bySessionTime(left, right);
    })[0];
}

export function selectOverduePractices(args: SelectArgs): DashboardPractice[] {
  if (!args.clubView) return [];
  return collectCandidates(args)
    .filter((item) => dashboardPracticeDate(item) < args.today)
    .slice()
    .sort(bySessionTime);
}
