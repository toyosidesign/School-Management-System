import { createContext, useCallback, useContext, useState } from 'react';

type Toast = { id: number; message: string; tone: 'success' | 'error' | 'info' };
const Ctx = createContext<{ toast: (message: string, tone?: Toast['tone']) => void }>(null!);
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);

  const toast = useCallback((message: string, tone: Toast['tone'] = 'success') => {
    const id = Date.now() + Math.random();
    setItems((v) => [...v, { id, message, tone }]);
    setTimeout(() => setItems((v) => v.filter((t) => t.id !== id)), 4500);
  }, []);

  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-3 bottom-24 z-[90] flex flex-col items-center gap-2 sm:bottom-6 sm:left-auto sm:right-6 sm:items-end"
        role="status"
        aria-live="polite"
      >
        {items.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto w-full max-w-sm animate-fade-up rounded-xl px-4 py-3 text-sm font-medium shadow-lg ring-1 ${
              t.tone === 'error'
                ? 'bg-red-600 text-white ring-red-700'
                : t.tone === 'info'
                ? 'bg-slate-800 text-white ring-slate-900'
                : 'bg-emerald-600 text-white ring-emerald-700'
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
