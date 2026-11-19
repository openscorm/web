// Which of its states the Library's share panel shows after an upload. Kept
// apart from the component so the rule can be tested without rendering.

export interface ShareCapacity {
  tenantType: string;
  userCount: number;
  userLimit: number;
  isUsersUnlimited: boolean;
}

export interface CourseShareDetail {
  publicInvitationUrl: string;
  publicInvitationBlocked: boolean;
}

export type ShareState =
  | { kind: "pending" }
  | { kind: "link"; url: string; placesLeft: number | null }
  | { kind: "full" }
  | { kind: "off" }
  | { kind: "inactive" };

// Only Free counts places here. Every paid plan has a people limit too, but
// the line and the full state are worded for Free. A Free organization whose
// limits are waived reports isUsersUnlimited, so it gets neither.
export function shareState(detail?: CourseShareDetail, capacity?: ShareCapacity): ShareState {
  if (!detail) return { kind: "pending" };
  const counted = !!capacity && capacity.tenantType === "Trial" && !capacity.isUsersUnlimited;
  const placesLeft = counted ? Math.max(0, capacity.userLimit - capacity.userCount) : null;
  // Full comes first: with no room left, neither a link nor Accounts can add
  // anyone, so "make room" is the only true instruction.
  if (placesLeft === 0) return { kind: "full" };
  if (detail.publicInvitationBlocked) return { kind: "off" };
  if (!detail.publicInvitationUrl) return { kind: "inactive" };
  return { kind: "link", url: detail.publicInvitationUrl, placesLeft };
}
