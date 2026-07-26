import React from 'react';

interface CheckoutResultLayoutProps {
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  message: string;
  countdownLabel: string;
}

export const CheckoutResultLayout: React.FC<CheckoutResultLayoutProps> = ({
  icon,
  eyebrow,
  title,
  message,
  countdownLabel,
}) => {
  const [seconds, setSeconds] = React.useState(5);

  React.useEffect(() => {
    if (seconds <= 0) return;

    const timer = setInterval(() => {
      setSeconds((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [seconds]);

  return (
    <div className="min-h-screen bg-canvas px-4 flex items-center justify-center text-ink">
      <section className="max-w-md w-full rounded-lg border border-line bg-paper p-10 shadow-xl shadow-ink/5 text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
          {icon}
        </div>

        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-700">{eyebrow}</p>
        <h1 className="mt-3 font-[family-name:var(--font-heading)] text-3xl font-bold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-muted">{message}</p>

        <div className="mt-7 border-t border-line pt-5">
          <p className="text-xs text-muted">
            {countdownLabel}{' '}
            <strong className="tabular-nums text-ink">{seconds}</strong> seconds.
          </p>
          <a
            href="/"
            className="mt-4 inline-block text-sm font-semibold text-primary hover:underline"
          >
            Go to dashboard now
          </a>
        </div>
      </section>
    </div>
  );
};
