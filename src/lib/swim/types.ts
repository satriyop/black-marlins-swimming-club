import type { RegistrationStatus } from "./registration";
export type Club = {
  id: number;
  name: string;
  shortName: string;
  city: string;
  province: string;
  country: string;
  coachName: string;
  venue: string | null;
  motto: string | null;
};

export type Swimmer = {
  id: number;
  fullName: string;
  nickname: string | null;
  dateOfBirth: string;
  gender: "putra" | "putri";
  nationality: string;
  city: string | null;
  status: "aktif" | "cuti" | "alumni";
  joinDate: string | null;
  notes: string | null;
  age: number;
  ageYearEnd: number;
  ageGroupId: string;
  ageGroupLabel: string;
  ageGroupRange: string;
};

export type PracticeSet = {
  id: number;
  practiceId: number;
  sortOrder: number;
  block: string | null;
  reps: number;
  distanceM: number;
  stroke: string;
  intervalSec: number | null;
  description: string | null;
};

export type AttendanceStatus = "belum" | "hadir" | "izin" | "sakit" | "alfa";

export type AbsenceNotice = {
  kind: "izin" | "sakit";
  status: "active" | "withdrawn";
  reason: string | null;
  revision: number;
};

export type Attendance = {
  id: number;
  practiceId: number;
  swimmerId: number;
  swimmerName: string;
  status: AttendanceStatus;
  metersCompleted: number | null;
  notes: string | null;
  onRoll: boolean;
  notice: AbsenceNotice | null;
  correctionStatus: "pending" | "resolved" | "rejected" | null;
  correctionId: number | null;
  correctionMessage: string | null;
  correctionResolution: string | null;
  cutoffLabel: string;
  noticeEditable: boolean;
  canRequestCorrection: boolean;
};

export type PracticeStatus = "scheduled" | "in_progress" | "completed" | "cancelled";

export type Practice = {
  id: number;
  sessionDate: string;
  startTime: string | null;
  durationMin: number | null;
  location: string | null;
  kind: string;
  title: string;
  focus: string | null;
  totalMeters: number;
  notes: string | null;
  status: PracticeStatus;
  cancelReason: string | null;
  reopenReason: string | null;
  originalSessionDate: string | null;
  originalStartTime: string | null;
  originalLocation: string | null;
  revision: number;
  incompleteAck: boolean;
  seriesId: number | null;
  occurrenceDate: string | null;
  presentCount?: number;
  rosterCount?: number;
};

export type PracticeDetail = Practice & {
  sets: PracticeSet[];
  attendance: Attendance[];
  mapUrl: string | null;
};

export type Meet = {
  id: number;
  name: string;
  level: string;
  course: string;
  venue: string | null;
  city: string | null;
  startDate: string;
  endDate: string | null;
  organizer: string | null;
  status: string;
  notes: string | null;
  entryCount?: number;
};

export type MeetEntry = {
  registrationStatus?: RegistrationStatus;
  registrationReason?: string | null;
  id: number;
  meetId: number;
  swimmerId: number;
  swimmerName: string;
  stroke: string;
  distanceM: number;
  ageGroup: string | null;
  seedTimeMs: number | null;
  status: string;
  lane: number | null;
  heat: string | null;
};

export type Result = {
  id: number;
  swimmerId: number;
  swimmerName: string;
  meetId: number | null;
  meetName: string | null;
  resultDate: string;
  stroke: string;
  distanceM: number;
  course: string;
  timeMs: number | null;
  place: number | null;
  round: string | null;
  status: string;
  kind: "official" | "test";
  isPb: boolean;
  notes: string | null;
};

export type PersonalBest = {
  stroke: string;
  distanceM: number;
  course: string;
  timeMs: number;
  resultDate: string;
  meetName: string | null;
};

export type CoachFeedbackStatus = "draft" | "private" | "shared" | "retracted";

export type CoachFeedback = {
  id: number;
  swimmerId: number;
  swimmerName: string;
  practiceId: number | null;
  practiceTitle: string;
  practiceDate: string;
  focus: string | null;
  improvement: string | null;
  nextStep: string | null;
  status: CoachFeedbackStatus;
  authorName: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  canEdit: boolean;
};

export type Activity = {
  id: number;
  title: string;
  kind: string;
  activityDate: string;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  description: string | null;
};

export type Dashboard = {
  pendingAcknowledgements: { id: number; title: string }[];
  pendingAcknowledgementCount: number;
  pendingRegistrationTasks: {
    meetId: number;
    meetName: string;
    swimmerName: string | null;
    deadline: string | null;
    kind: "guardian_response" | "coach_review";
    count: number;
  }[];
  club: Club;
  swimmers: Swimmer[];
  upcomingPractices: Practice[];
  nextScheduledTraining: {
    scheduleId: number;
    practiceId: number | null;
    date: string;
    title: string;
    startTime: string | null;
    durationMin: number | null;
    location: string | null;
  } | null;
  noticePractices: Practice[];
  upcomingMeets: Meet[];
  recentResults: Result[];
  recentPbs: Result[];
  recentFeedback: CoachFeedback[];
  unreadAnnouncements: {
    id: number;
    title: string;
    important: boolean;
    createdAt: string;
  }[];
  unreadCount: number;
  stats: {
    swimmerCount: number;
    practicesThisMonth: number;
    meetsUpcoming: number;
    pbThisMonth: number;
    attendanceRate: number;
    attendanceRecorded: number;
    attendanceExpected: number;
    volumeThisMonth: number;
  };
};
