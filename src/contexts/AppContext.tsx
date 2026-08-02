import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

type ToastType = 'success' | 'error' | 'warning' | 'info';
interface Toast { id: number; msg: string; type: ToastType; }
interface AppCtx { toast: (msg: string, type?: ToastType, dur?: number) => void; }
const AppContext = createContext<AppCtx>({ toast: () => {} });

let _id = 0;
export function AppProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toast = useCallback((msg: string, type: ToastType = 'info', dur = 4000) => {
    const id = ++_id;
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), dur);
  }, []);
  return (
    <AppContext.Provider value={{ toast }}>
      {children}
      <div id="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            <i className={`hgi-stroke ${t.type === 'success' ? 'hgi-checkmark-circle-02' : t.type === 'error' ? 'hgi-cancel-circle' : t.type === 'warning' ? 'hgi-alert-02' : 'hgi-information-circle'}`} />
            <span>{t.msg}</span>
            <span className="toast-close" onClick={() => setToasts(ts => ts.filter(x => x.id !== t.id))}>×</span>
          </div>
        ))}
      </div>
    </AppContext.Provider>
  );
}
export const useToast = () => useContext(AppContext).toast;