import fs from "node:fs";
import path from "node:path";
import { clearNotes, upsertNote } from "./db";
import { chooseLane, dateDaysAgo, utcToday } from "./lanes";
import {
  cancelInvoice,
  createDraftInvoice,
  getInvoice,
  searchInvoices,
  sendInvoice,
  type PayPalInvoice,
} from "./paypal";

const seedPath = path.join(process.cwd(), "data", "seed.json");
const harborReply = "The shots of the storefront weren't what we agreed.";

type DemoClient = {
  key: "maya" | "northwind" | "harbor";
  givenName: string;
  surname: string;
  email: string;
  item: string;
  amount: string;
  daysAgo: number;
  nudgeCount: number;
  clientReply: string;
};

const demoClients: DemoClient[] = [
  {
    key: "maya",
    givenName: "Maya",
    surname: "Chen",
    email: "maya.chen.clerk@personal.example.com",
    item: "Brand workshop",
    amount: "1200.00",
    daysAgo: 4,
    nudgeCount: 0,
    clientReply: "",
  },
  {
    key: "northwind",
    givenName: "Northwind",
    surname: "Studio",
    email: "northwind.studio.clerk@personal.example.com",
    item: "Website retainer",
    amount: "2400.00",
    daysAgo: 18,
    nudgeCount: 1,
    clientReply: "",
  },
  {
    key: "harbor",
    givenName: "Harbor",
    surname: "Goods",
    email: "harbor.goods.clerk@personal.example.com",
    item: "Product photos",
    amount: "860.00",
    daysAgo: 9,
    nudgeCount: 0,
    clientReply: harborReply,
  },
];

const cancelStatuses = new Set(["UNPAID", "SENT", "SCHEDULED", "PARTIALLY_PAID"]);

export type SeededInvoice = {
  key: DemoClient["key"];
  id: string;
  recipientEmail: string;
  recipientViewUrl: string;
  lane: string;
};

async function invoicesForRecipient(email: string): Promise<PayPalInvoice[]> {
  const found: PayPalInvoice[] = [];
  for (let page = 1; page <= 5; page += 1) {
    const batch = await searchInvoices({
      recipientEmail: email,
      page,
      pageSize: 20,
    });
    found.push(...batch);
    if (batch.length < 20) {
      break;
    }
  }
  return found;
}

async function replaceExisting(email: string): Promise<void> {
  const existing = await invoicesForRecipient(email);
  for (const invoice of existing) {
    if (!cancelStatuses.has(invoice.status.toUpperCase())) {
      continue;
    }
    await cancelInvoice(invoice.id);
  }
}

function priorNudge(client: DemoClient, dueDate: string, paymentUrl: string): string {
  return [
    `Hi ${client.givenName} ${client.surname},`,
    "",
    `Your ${client.item.toLowerCase()} invoice for ${client.amount} USD was due on ${dueDate}. You can pay here: ${paymentUrl}`,
  ].join("\n");
}

export async function seedDemo(): Promise<SeededInvoice[]> {
  const merchantEmail = process.env.PAYPAL_MERCHANT_EMAIL;
  if (!merchantEmail) {
    throw new Error("PAYPAL_MERCHANT_EMAIL is required");
  }

  const today = utcToday();
  clearNotes();
  const seeded: SeededInvoice[] = [];

  for (const client of demoClients) {
    await replaceExisting(client.email);
    const dueDate = dateDaysAgo(client.daysAgo, today);
    const created = await createDraftInvoice({
      currencyCode: "USD",
      note: "Thank you for your business.",
      invoicerGivenName: "Clerk",
      invoicerSurname: "Demo",
      invoicerEmail: merchantEmail,
      recipientEmail: client.email,
      recipientGivenName: client.givenName,
      recipientSurname: client.surname,
      invoiceDate: dueDate,
      dueDate,
      items: [
        {
          name: client.item,
          quantity: "1",
          unitAmount: client.amount,
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

    const decision = chooseLane({
      status: invoice.status,
      clientReply: client.clientReply,
      totalAmount: Number(client.amount),
      dueDate,
      nudgeCount: client.nudgeCount,
      today,
    });
    const approvedBody =
      client.nudgeCount > 0
        ? priorNudge(client, dueDate, invoice.recipientViewUrl)
        : "";

    upsertNote({
      invoiceId: invoice.id,
      lane: decision.lane,
      reason: decision.reason,
      draftSubject: "",
      draftBody: "",
      draftStatus: approvedBody ? "approved" : "empty",
      approvedBody,
      clientReply: client.clientReply,
      nudgeCount: client.nudgeCount,
      updatedAt: new Date().toISOString(),
    });

    seeded.push({
      key: client.key,
      id: invoice.id,
      recipientEmail: client.email,
      recipientViewUrl: invoice.recipientViewUrl,
      lane: decision.lane,
    });
  }

  fs.mkdirSync(path.dirname(seedPath), { recursive: true });
  fs.writeFileSync(seedPath, `${JSON.stringify({ invoices: seeded }, null, 2)}\n`);
  return seeded;
}

export function expectedLanes(): Record<DemoClient["key"], string> {
  return {
    maya: "Nudge",
    northwind: "Second ask",
    harbor: "Needs you",
  };
}
