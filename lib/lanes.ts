export type Lane = "Paid" | "Needs you" | "Due soon" | "Nudge" | "Second ask";

export type LaneInput = {
  status: string;
  clientReply?: string;
  totalAmount: number;
  dueDate: string;
  nudgeCount: number;
  today?: string;
};

export function utcToday(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function dateDaysAgo(days: number, today = utcToday()): string {
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

export function daysPastDue(dueDate: string, today: string): number {
  const due = Date.parse(`${dueDate}T00:00:00Z`);
  const current = Date.parse(`${today}T00:00:00Z`);
  return Math.round((current - due) / 86_400_000);
}

export function chooseLane(input: LaneInput): { lane: Lane; reason: string } {
  const status = input.status.toUpperCase();
  const today = input.today ?? utcToday();

  if (status === "PAID" || status === "MARKED_AS_PAID") {
    return { lane: "Paid", reason: "PayPal marked this invoice paid." };
  }

  if (input.clientReply?.trim()) {
    return { lane: "Needs you", reason: "The client disputed the work." };
  }

  if (input.totalAmount >= 5000 || status === "PARTIALLY_PAID") {
    return {
      lane: "Needs you",
      reason: "This invoice needs a person to decide.",
    };
  }

  const late = daysPastDue(input.dueDate, today);
  if (late < 3) {
    return { lane: "Due soon", reason: "Not late enough to chase." };
  }

  if (late <= 10 && input.nudgeCount === 0) {
    return {
      lane: "Nudge",
      reason: `${late} days past due and no note sent yet.`,
    };
  }

  if (late > 10 && input.nudgeCount === 1) {
    return {
      lane: "Second ask",
      reason: `${late} days past due after one nudge.`,
    };
  }

  return { lane: "Needs you", reason: "No automatic chase fits this invoice." };
}
