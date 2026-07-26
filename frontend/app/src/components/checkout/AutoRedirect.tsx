import { useEffect } from 'react';

interface AutoRedirectProps {
  to: string;
  delayMs?: number;
}

export const AutoRedirect: React.FC<AutoRedirectProps> = ({ to, delayMs = 5000 }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      window.location.href = to;
    }, delayMs);

    return () => clearTimeout(timer);
  }, [to, delayMs]);

  return null;
};
