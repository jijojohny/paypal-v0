import { loadEnvFile } from "node:process";
import { clearNotes } from "../lib/db";
import { PayPalRequestError } from "../lib/paypal";
import { seedDemo } from "../lib/seed-demo";

loadEnvFile(".env");

async function main(): Promise<void> {
  clearNotes();
  const seeded = await seedDemo();
  for (const invoice of seeded) {
    console.log(`${invoice.key} ${invoice.id} ${invoice.lane}`);
  }
}

main().catch((error: unknown) => {
  if (!(error instanceof PayPalRequestError)) {
    console.error(error instanceof Error ? error.message : "Reset failed");
  }
  process.exitCode = 1;
});
