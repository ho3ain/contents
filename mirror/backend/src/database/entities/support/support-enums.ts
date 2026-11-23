export enum SupportStatus {
  OPEN = 'open',
  IN_PROGRESS = 'in_progress',
  WAITING = 'waiting',
  RESOLVED = 'resolved',
  CLOSED = 'closed',
}

export enum SupportDestination {
  CREATOR = 'creator',
  SUPPORT = 'support',
}

export const SUPPORT_STATUSES: SupportStatus[] = Object.values(SupportStatus);
