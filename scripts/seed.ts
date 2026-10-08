import { loadEnvFile } from "node:process";
import { listNotes } from "../lib/db";
import { expectedLanes, seedDemo } from "../lib/seed-demo";
import { PayPalRequestError } from "../lib/paypal";

loadEnvFile(".env");

async function main(): Promise<void> {
  const seeded = await seedDemo();
  const expected = expectedLanes();
  const notes = new Map(listNotes().map((note) => [note.invoiceId, note]));

  for (const invoice of seeded) {
    const note = notes.get(invoice.id);
    if (!note || note.lane !== expected[invoice.key] || invoice.lane !== expected[invoice.key]) {
      throw new Error(`${invoice.key} landed in ${invoice.lane}, expected ${expected[invoice.key]}`);
    }
    console.log(`${invoice.key} ${invoice.id} ${invoice.lane}`);
  }
}

main().catch((error: unknown) => {
  if (!(error instanceof PayPalRequestError)) {
    console.error(error instanceof Error ? error.message : "Seed failed");
  }
  process.exitCode = 1;
});
