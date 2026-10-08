import { loadEnvFile } from "node:process";
import {
  createDraftInvoice,
  getInvoice,
  PayPalRequestError,
  sendInvoice,
} from "../lib/paypal";

loadEnvFile(".env");

async function main(): Promise<void> {
  const created = await createDraftInvoice({
    currencyCode: "USD",
    note: "Clerk connectivity check",
    invoicerGivenName: "Clerk",
    invoicerSurname: "Demo",
    invoicerEmail: process.env.PAYPAL_MERCHANT_EMAIL,
    recipientEmail: "buyer.clerk.demo@personal.example.com",
    items: [
      {
        name: "Connectivity check",
        quantity: "1",
        unitAmount: "1.00",
      },
    ],
  });

  await sendInvoice(created.id, {
    sendToRecipient: false,
    sendToInvoicer: false,
  });

  const invoice = await getInvoice(created.id);
  if (!invoice.recipientViewUrl) {
    throw new Error(
      `Invoice ${invoice.id} is ${invoice.status} and has no recipient_view_url`,
    );
  }

  console.log(`invoice_id=${invoice.id}`);
  console.log(`status=${invoice.status}`);
  console.log(`recipient_view_url=${invoice.recipientViewUrl}`);
}

main().catch((error: unknown) => {
  if (!(error instanceof PayPalRequestError)) {
    console.error(error instanceof Error ? error.message : "Invoice check failed");
  }
  process.exitCode = 1;
});
