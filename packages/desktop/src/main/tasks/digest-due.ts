export interface DigestDueInput {
  now: Date
  existsToday: boolean
}

const DUE_HOUR = 8

// Pure so it is unit-testable without Electron: the digest is due when it is
// past 08:00 local time and today's file does not exist yet. At most one run
// per day; a missing file before 08:00 waits for the hour.
export function isDigestDue(input: DigestDueInput): boolean {
  if (input.existsToday) return false

  return input.now.getHours() >= DUE_HOUR
}
