import fs from "node:fs";
import path from "node:path";
import { connection } from "next/server";
import { listNotes, upsertNote, type Note } from "./db";
import { chooseLane, daysPastDue, utcToday, type Lane } from "./lanes";
import { getInvoice, type PayPalInvoice } from "./paypal";

export const boardLanes: Lane[] = [
  "Due soon",
  "Nudge",
  "Second ask",
  "Needs you",
  "Paid",
];

export type BoardCard = {
  id: string;
  clientName: string;
  amountLabel: string;
  overdueLabel: string;
  noteLabel: string;
  reason: string;
  lane: Lane;
};

export type BoardData = {
  columns: { lane: Lane; cards: BoardCard[] }[];
  seeded: boolean;
};

type SeedFile = {
  invoices?: { id?: string }[];
};

function seedIds(): string[] {
  const seedPath = path.join(process.cwd(), "data", "seed.json");
  if (!fs.existsSync(seedPath)) {
    return [];
  }
  const parsed = JSON.parse(fs.readFileSync(seedPath, "utf8")) as SeedFile;
  return (parsed.invoices ?? [])
    .map((invoice) => invoice.id)
    .filter((id): id is string => Boolean(id));
}

function money(value: string | undefined, currency: string | undefined): string {
  const amount = Number(value);
  if (!value || Number.isNaN(amount)) {
    return "Amount unavailable";
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
  }).format(amount);
}

function overdueLabel(dueDate: string | undefined, today: string): string {
  if (!dueDate) {
    return "No due date";
  }
  const days = daysPastDue(dueDate, today);
  if (days > 1) {
    return `${days} days overdue`;
  }
  if (days === 1) {
    return "1 day overdue";
  }
  if (days === 0) {
    return "Due today";
  }
  if (days === -1) {
    return "Due tomorrow";
  }
  return `Due in ${Math.abs(days)} days`;
}

function clientName(invoice: PayPalInvoice): string {
  return invoice.recipientName || invoice.recipientEmail || "Unknown client";
}

function rememberLane(note: Note | undefined, lane: Lane, reason: string): void {
  if (!note || (note.lane === lane && note.reason === reason)) {
    return;
  }
  upsertNote({
    ...note,
    lane,
    reason,
    updatedAt: new Date().toISOString(),
  });
}

export async function loadBoard(): Promise<BoardData> {
  await connection();
  const ids = seedIds();
  if (ids.length === 0) {
    return {
      seeded: false,
      columns: boardLanes.map((lane) => ({ lane, cards: [] })),
    };
  }

  const today = utcToday();
  const notes = new Map(listNotes().map((note) => [note.invoiceId, note]));
  const cards: BoardCard[] = [];

  for (const id of ids) {
    const invoice = await getInvoice(id);
    const note = notes.get(invoice.id);
    const dueDate = invoice.dueDate ?? today;
    const decision = chooseLane({
      status: invoice.status,
      clientReply: note?.clientReply,
      totalAmount: Number(invoice.amountValue ?? 0),
      dueDate,
      nudgeCount: note?.nudgeCount ?? 0,
      today,
    });
    rememberLane(note, decision.lane, decision.reason);
    cards.push({
      id: invoice.id,
      clientName: clientName(invoice),
      amountLabel: money(invoice.amountValue, invoice.currencyCode),
      overdueLabel: overdueLabel(invoice.dueDate, today),
      noteLabel: note?.approvedBody.trim() ? note.approvedBody : "No note yet",
      reason: decision.reason,
      lane: decision.lane,
    });
  }

  return {
    seeded: true,
    columns: boardLanes.map((lane) => ({
      lane,
      cards: cards.filter((card) => card.lane === lane),
    })),
  };
}
