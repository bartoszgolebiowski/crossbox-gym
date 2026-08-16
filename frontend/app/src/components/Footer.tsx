import React from 'react';

export const Footer: React.FC = () => {
  return (
    <footer className="mt-auto border-t border-line bg-paper py-6 text-xs text-muted">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-success"></span>
          <span className="text-ink/70 font-medium">System Kontroli Dostępów CrossGym 24/7 Aktywny</span>
        </div>
        <p className="text-muted">&copy; {new Date().getFullYear()} CrossGym. Wszelkie prawa zastrzeżone.</p>
      </div>
    </footer>
  );
};
