import React from 'react';
import sharedIcon from '../../../shared/icon.png';

interface HeaderProps {
  token: string | null;
  email: string | null;
  onLogout: () => void;
}

export const Header: React.FC<HeaderProps> = ({ token, email, onLogout }) => {
  return (
    <header className="sticky top-0 z-50 border-b border-line bg-paper/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:h-16 sm:px-6">
        {/* Brand Logo & Title */}
        <a
          href="/"
          className="flex items-center gap-2 sm:gap-3 cursor-pointer hover:opacity-90 transition-opacity"
          title="Strona główna"
        >
          <img
            src={sharedIcon}
            alt="CrossGym Logo"
            className="h-8 w-8 sm:h-9 sm:w-9 shrink-0 rounded-control object-contain bg-white/10 p-0.5 shadow-control"
          />
          <div className="flex items-center gap-2">
            <span className="whitespace-nowrap text-sm font-bold tracking-tight text-ink sm:text-base">CrossGym</span>
            <span className="hidden rounded-pill border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary sm:inline-flex">
              Portal Klubowicza
            </span>
          </div>
        </a>

        {/* User Info & Actions */}
        <div className="flex items-center gap-3">
          {token ? (
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-control bg-line/10 border border-line/60 text-xs">
                <span className="w-2 h-2 rounded-full bg-success"></span>
                <span className="text-ink/70 font-medium max-w-[180px] truncate">{email}</span>
              </div>
              <button
                onClick={onLogout}
                className="px-3 py-1.5 rounded-control text-xs font-medium text-ink/70 bg-paper hover:bg-line/10 transition-colors cursor-pointer border border-line"
              >
                Wyloguj się
              </button>
            </div>
          ) : (
            <span className="hidden text-xs text-muted sm:block">Zaloguj się, aby uzyskać dostęp do karnetu</span>
          )}
        </div>
      </div>
    </header>
  );
};
