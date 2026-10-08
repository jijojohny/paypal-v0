const tokenRefreshBufferMs = 60_000;

type CachedToken = {
  value: string;
  expiresAt: number;
};

export class PayPalRequestError extends Error {
  readonly status: number;
  readonly debugId: string | undefined;

  constructor(status: number, debugId: string | undefined) {
    super(
      `PayPal request failed status=${status} debug_id=${debugId ?? "none"}`,
    );
    this.name = "PayPalRequestError";
    this.status = status;
    this.debugId = debugId;
  }
}

export type InvoiceItem = {
  name: string;
  quantity: string;
  unitAmount: string;
};

export type InvoiceDraft = {
  currencyCode: string;
  note?: string;
  invoicerGivenName: string;
  invoicerSurname: string;
  invoicerEmail?: string;
  recipientEmail: string;
  recipientGivenName?: string;
  recipientSurname?: string;
  items: InvoiceItem[];
  invoiceDate?: string;
  dueDate?: string;
};

export type PayPalInvoice = {
  id: string;
  status: string;
  recipientViewUrl?: string;
  recipientEmail?: string;
  recipientName?: string;
  dueDate?: string;
  currencyCode?: string;
  amountValue?: string;
};

export type InvoiceSearch = {
  recipientEmail?: string;
  page?: number;
  pageSize?: number;
};

let cachedToken: CachedToken | undefined;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function apiBase(): string {
  return (
    process.env.PAYPAL_API_BASE ?? "https://api-m.sandbox.paypal.com"
  ).replace(/\/$/, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

export function invoiceIdFromCreateResponse(body: unknown): string {
  if (!isRecord(body)) {
    throw new Error("PayPal create invoice response was empty");
  }

  const id = readString(body, "id");
  if (id) {
    return id;
  }

  const href = readString(body, "href");
  const fromHref = href?.split("/").pop();
  if (fromHref) {
    return fromHref;
  }

  throw new Error("PayPal create invoice response did not include an id");
}

export function parseInvoice(body: unknown): PayPalInvoice {
  if (!isRecord(body)) {
    throw new Error("PayPal invoice response was empty");
  }

  const id = readString(body, "id");
  const status = readString(body, "status");
  if (!id || !status) {
    throw new Error("PayPal invoice response did not include an id and status");
  }

  const detail = isRecord(body.detail) ? body.detail : undefined;
  const metadata =
    detail && isRecord(detail.metadata) ? detail.metadata : undefined;
  const amount = isRecord(body.amount) ? body.amount : undefined;
  const recipients = Array.isArray(body.primary_recipients)
    ? body.primary_recipients
    : [];
  const firstRecipient = isRecord(recipients[0]) ? recipients[0] : undefined;
  const billing = firstRecipient && isRecord(firstRecipient.billing_info)
    ? firstRecipient.billing_info
    : undefined;
  const paymentTerm =
    detail && isRecord(detail.payment_term) ? detail.payment_term : undefined;
  const recipientNameRecord =
    billing && isRecord(billing.name) ? billing.name : undefined;
  const recipientName = recipientNameRecord
    ? [readString(recipientNameRecord, "given_name"), readString(recipientNameRecord, "surname")]
        .filter(Boolean)
        .join(" ")
    : undefined;

  return {
    id,
    status,
    recipientViewUrl: metadata
      ? readString(metadata, "recipient_view_url")
      : undefined,
    recipientEmail: billing ? readString(billing, "email_address") : undefined,
    recipientName: recipientName || undefined,
    dueDate: paymentTerm ? readString(paymentTerm, "due_date") : undefined,
    currencyCode: amount ? readString(amount, "currency_code") : undefined,
    amountValue: amount ? readString(amount, "value") : undefined,
  };
}

async function readErrorBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function debugIdFrom(response: Response, body: unknown): string | undefined {
  return (
    response.headers.get("paypal-debug-id") ??
    (isRecord(body) ? readString(body, "debug_id") : undefined)
  );
}

function errorNameFrom(body: unknown): string | undefined {
  return isRecord(body) ? readString(body, "name") : undefined;
}

function logPayPalFailure(status: number, debugId: string | undefined, name: string | undefined): void {
  console.error(
    `PayPal request failed status=${status} debug_id=${debugId ?? "none"} name=${name ?? "none"}`,
  );
}

async function paypalRequest(
  path: string,
  init: RequestInit,
): Promise<Response> {
  const token = await getAccessToken();
  const response = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });

  if (response.ok) {
    return response;
  }

  const body = await readErrorBody(response);
  const debugId = debugIdFrom(response, body);
  logPayPalFailure(response.status, debugId, errorNameFrom(body));
  throw new PayPalRequestError(response.status, debugId);
}

export async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now) {
    return cachedToken.value;
  }

  const clientId = requiredEnv("PAYPAL_CLIENT_ID");
  const clientSecret = requiredEnv("PAYPAL_CLIENT_SECRET");
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString(
    "base64",
  );
  const response = await fetch(`${apiBase()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  const body = await readErrorBody(response);
  if (!response.ok || !isRecord(body) || typeof body.access_token !== "string") {
    const debugId = debugIdFrom(response, body);
    logPayPalFailure(response.status, debugId, errorNameFrom(body));
    throw new PayPalRequestError(response.status, debugId);
  }

  const expiresIn = typeof body.expires_in === "number" ? body.expires_in : 0;
  cachedToken = {
    value: body.access_token,
    expiresAt: now + Math.max(0, expiresIn * 1000 - tokenRefreshBufferMs),
  };
  return body.access_token;
}

export async function createDraftInvoice(
  draft: InvoiceDraft,
): Promise<{ id: string }> {
  const response = await paypalRequest("/v2/invoicing/invoices", {
    method: "POST",
    body: JSON.stringify({
      detail: {
        currency_code: draft.currencyCode,
        ...(draft.invoiceDate ? { invoice_date: draft.invoiceDate } : {}),
        ...(draft.note ? { note: draft.note } : {}),
        ...(draft.dueDate
          ? {
              payment_term: {
                term_type: "DUE_ON_DATE_SPECIFIED",
                due_date: draft.dueDate,
              },
            }
          : {}),
      },
      invoicer: {
        name: {
          given_name: draft.invoicerGivenName,
          surname: draft.invoicerSurname,
        },
        ...(draft.invoicerEmail ? { email_address: draft.invoicerEmail } : {}),
      },
      primary_recipients: [
        {
          billing_info: {
            email_address: draft.recipientEmail,
            ...(draft.recipientGivenName && draft.recipientSurname
              ? {
                  name: {
                    given_name: draft.recipientGivenName,
                    surname: draft.recipientSurname,
                  },
                }
              : {}),
          },
        },
      ],
      items: draft.items.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        unit_amount: {
          currency_code: draft.currencyCode,
          value: item.unitAmount,
        },
      })),
    }),
  });

  return { id: invoiceIdFromCreateResponse(await response.json()) };
}

export async function sendInvoice(
  invoiceId: string,
  options: { sendToRecipient?: boolean; sendToInvoicer?: boolean } = {},
): Promise<void> {
  await paypalRequest(
    `/v2/invoicing/invoices/${encodeURIComponent(invoiceId)}/send`,
    {
      method: "POST",
      body: JSON.stringify({
        send_to_recipient: options.sendToRecipient ?? false,
        send_to_invoicer: options.sendToInvoicer ?? false,
      }),
    },
  );
}

export async function cancelInvoice(invoiceId: string): Promise<void> {
  await paypalRequest(
    `/v2/invoicing/invoices/${encodeURIComponent(invoiceId)}/cancel`,
    {
      method: "POST",
      body: JSON.stringify({
        subject: "Demo invoice replaced",
        note: "Clerk seed replaced this invoice.",
        send_to_invoicer: false,
        send_to_recipient: false,
      }),
    },
  );
}

export async function getInvoice(invoiceId: string): Promise<PayPalInvoice> {
  const response = await paypalRequest(
    `/v2/invoicing/invoices/${encodeURIComponent(invoiceId)}`,
    { method: "GET" },
  );
  return parseInvoice(await response.json());
}

export async function searchInvoices(
  search: InvoiceSearch = {},
): Promise<PayPalInvoice[]> {
  const page = search.page ?? 1;
  const pageSize = search.pageSize ?? 20;
  const response = await paypalRequest(
    `/v2/invoicing/search-invoices?page=${page}&page_size=${pageSize}&total_required=true`,
    {
      method: "POST",
      body: JSON.stringify(
        search.recipientEmail
          ? { recipient_email: search.recipientEmail }
          : {},
      ),
    },
  );
  const body: unknown = await response.json();
  if (!isRecord(body) || !Array.isArray(body.items)) {
    return [];
  }
  return body.items.map((item) => parseInvoice(item));
}
