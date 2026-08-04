import React from 'react';

export const Footer: React.FC = () => {
  return (
    <footer className="mt-auto border-t border-slate-300 bg-white py-6 text-xs text-slate-500">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-teal-600"></span>
          <span className="text-slate-700 font-medium">CrossBox Administrator System Active</span>
        </div>
        <p className="text-slate-500">&copy; {new Date().getFullYear()} CrossBox Gym Management System.</p>
      </div>
    </footer>
  );
};
