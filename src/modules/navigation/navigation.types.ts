export type NavigationBadgeKey =
  | "approvals"
  | "attendanceCorrections"
  | "documentExpiry"
  | "rosterChanges";

export interface NavigationBadgesResponse {
  badges: Partial<Record<NavigationBadgeKey, number>>;
  generated_at: string;
}
