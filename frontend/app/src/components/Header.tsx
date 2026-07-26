import React from 'react';

interface HeaderProps {
  token: string | null;
  email: string | null;
  onLogout: () => void;
}

export const Header: React.FC<HeaderProps> = ({ token, email, onLogout }) => {
  return (
    <header className="sticky top-0 z-50 border-b border-stone-300 bg-[#fffdf8]/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:h-16 sm:px-6">
        {/* Brand Logo & Title */}
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-rose-800 text-xs font-bold tracking-wider text-white shadow-sm sm:h-9 sm:w-9 sm:text-sm">
            CB
          </div>
          <div className="flex items-center gap-2">
            <span className="whitespace-nowrap text-sm font-bold tracking-tight text-stone-900 sm:text-base">CrossBox Gym</span>
            <span className="hidden rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-800 sm:inline-flex">
              Member Portal
            </span>
          </div>
        </div>

        {/* User Info & Actions */}
        <div className="flex items-center gap-3">
          {token ? (
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-md bg-stone-100 border border-stone-200 text-xs">
                <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
                <span className="text-stone-700 font-medium max-w-[180px] truncate">{email}</span>
              </div>
              <button
                onClick={onLogout}
                className="px-3 py-1.5 rounded-md text-xs font-medium text-stone-700 bg-white hover:bg-stone-100 transition-colors cursor-pointer border border-stone-300"
              >
                Sign Out
              </button>
            </div>
          ) : (
            <span className="hidden text-xs text-stone-500 sm:block">Sign in to access your pass</span>
          )}
        </div>
      </div>
    </header>
  );
};
