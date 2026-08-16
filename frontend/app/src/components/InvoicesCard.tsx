import React from 'react';
import { useAppSelector } from '../store';
import { selectInvoices, selectInvoicesLoading } from '../store/memberSlice';

export const InvoicesCard: React.FC = () => {
  const invoices = useAppSelector(selectInvoices);
  const invoicesLoading = useAppSelector(selectInvoicesLoading);

  return (
    <div className="bg-paper border border-line rounded-card p-6 shadow-card">
      {/* Title Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2.5 font-bold text-base text-ink">
          <span className="p-2 rounded-control bg-accent/10 text-accent border border-accent/30">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </span>
          <span>Faktury VAT i Historia Rozliczeń</span>
        </div>
        <span className="text-xs text-muted font-medium">{invoices.length} Pozycja(e)</span>
      </div>

      {/* Invoice List */}
      {invoicesLoading ? (
        <div className="flex items-center justify-center py-8 text-ink/40 gap-2">
          <svg className="w-5 h-5 animate-spin text-accent" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
          <span className="text-xs">Ładowanie faktur VAT...</span>
        </div>
      ) : invoices.length === 0 ? (
        <div className="text-center py-8 px-4 bg-line/10 rounded-control border border-line/60">
          <p className="text-sm text-ink/80 font-medium">Brak wystawionych faktur VAT.</p>
          <p className="text-xs text-muted mt-1">
            Faktury zostaną automatycznie wygenerowane po opłaceniu subskrypcji.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {invoices.map((inv) => (
            <div
              key={inv.id}
              className="bg-line/10 p-3.5 rounded-control border border-line/60 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-control bg-accent/10 flex items-center justify-center text-accent shrink-0">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                    />
                  </svg>
                </div>
                <div>
                  <div className="font-semibold text-xs text-ink font-mono">{inv.number || inv.id}</div>
                  <div className="text-[11px] text-muted flex items-center gap-2 mt-0.5">
                    <span>Data: {new Date(inv.createdAt).toLocaleDateString()}</span>
                    <span>•</span>
                    <span>VAT: {(inv.tax / 100).toFixed(2)} PLN</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2.5 w-full sm:w-auto justify-between sm:justify-end border-t sm:border-t-0 border-line/60 pt-2 sm:pt-0">
                <span className="inline-flex items-center rounded-pill border border-success/30 bg-success/10 px-2.5 py-0.5 text-xs font-semibold text-success">
                  {(inv.total / 100).toFixed(2)} PLN {inv.status === 'paid' ? 'OPŁACONA' : inv.status?.toUpperCase()}
                </span>

                {inv.pdfUrl && (
                  <a
                    href={inv.pdfUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="py-1 px-2.5 rounded-control font-medium text-xs text-ink/70 bg-paper hover:bg-line/10 border border-line transition-colors no-underline flex items-center gap-1"
                  >
                    <span>Pobierz PDF</span>
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
