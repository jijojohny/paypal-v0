import { loadBoard, type BoardCard } from "@/lib/board";
import { RefreshButton } from "./refresh-button";

function Card({ card }: { card: BoardCard }) {
  return (
    <article className="rounded-lg border border-border bg-card p-4">
      <h3 className="text-base font-medium text-foreground">{card.clientName}</h3>
      <p className="mt-1 font-mono text-xs text-muted-foreground">{card.id}</p>
      <p className="mt-3 text-sm text-foreground">{card.amountLabel}</p>
      <p className="text-sm text-muted-foreground">{card.overdueLabel}</p>
      <p className="mt-3 line-clamp-3 text-sm text-foreground">{card.noteLabel}</p>
      <p className="mt-2 text-sm text-muted-foreground">{card.reason}</p>
    </article>
  );
}

export async function InvoiceBoard() {
  const board = await loadBoard();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          {board.seeded
            ? "Unpaid invoices from the PayPal sandbox."
            : "No demo invoices yet. Run npm run seed, then refresh."}
        </p>
        <RefreshButton />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        {board.columns.map((column) => (
          <section key={column.lane} aria-label={column.lane} className="flex flex-col gap-3">
            <h2 className="text-sm font-medium text-foreground">{column.lane}</h2>
            {column.cards.length === 0 ? (
              <p className="rounded-lg border border-border px-3 py-4 text-sm text-muted-foreground">
                Nothing waiting
              </p>
            ) : (
              column.cards.map((card) => <Card key={card.id} card={card} />)
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
