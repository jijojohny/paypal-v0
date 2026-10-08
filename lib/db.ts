import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export type DraftStatus = "empty" | "ready" | "approved";

export type Note = {
  invoiceId: string;
  lane: string;
  reason: string;
  draftSubject: string;
  draftBody: string;
  draftStatus: DraftStatus;
  approvedBody: string;
  clientReply: string;
  nudgeCount: number;
  updatedAt: string;
};

type NoteRecord = {
  invoice_id: string;
  lane: string;
  reason: string;
  draft_subject: string;
  draft_body: string;
  draft_status: DraftStatus;
  approved_body: string;
  client_reply: string;
  nudge_count: number;
  updated_at: string;
};

const databasePath = path.join(process.cwd(), "data", "clerk.sqlite");

let database: DatabaseSync | undefined;

function db(): DatabaseSync {
  if (database) {
    return database;
  }

  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  database = new DatabaseSync(databasePath);
  database.exec(`
    CREATE TABLE IF NOT EXISTS notes (
      invoice_id TEXT PRIMARY KEY,
      lane TEXT NOT NULL,
      reason TEXT NOT NULL,
      draft_subject TEXT NOT NULL DEFAULT '',
      draft_body TEXT NOT NULL DEFAULT '',
      draft_status TEXT NOT NULL,
      approved_body TEXT NOT NULL DEFAULT '',
      client_reply TEXT NOT NULL DEFAULT '',
      nudge_count INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  return database;
}

function toNote(row: NoteRecord): Note {
  return {
    invoiceId: row.invoice_id,
    lane: row.lane,
    reason: row.reason,
    draftSubject: row.draft_subject,
    draftBody: row.draft_body,
    draftStatus: row.draft_status,
    approvedBody: row.approved_body,
    clientReply: row.client_reply,
    nudgeCount: row.nudge_count,
    updatedAt: row.updated_at,
  };
}

export function clearNotes(): void {
  db().prepare("DELETE FROM notes").run();
}

export function upsertNote(note: Note): void {
  db()
    .prepare(
      `INSERT INTO notes (
        invoice_id, lane, reason, draft_subject, draft_body, draft_status,
        approved_body, client_reply, nudge_count, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(invoice_id) DO UPDATE SET
        lane = excluded.lane,
        reason = excluded.reason,
        draft_subject = excluded.draft_subject,
        draft_body = excluded.draft_body,
        draft_status = excluded.draft_status,
        approved_body = excluded.approved_body,
        client_reply = excluded.client_reply,
        nudge_count = excluded.nudge_count,
        updated_at = excluded.updated_at`,
    )
    .run(
      note.invoiceId,
      note.lane,
      note.reason,
      note.draftSubject,
      note.draftBody,
      note.draftStatus,
      note.approvedBody,
      note.clientReply,
      note.nudgeCount,
      note.updatedAt,
    );
}

export function listNotes(): Note[] {
  const rows = db().prepare("SELECT * FROM notes ORDER BY invoice_id").all() as NoteRecord[];
  return rows.map(toNote);
}
