"use client";

import { useEffect, useState, useCallback, createContext, useContext } from "react";
import { Check, X, AlertTriangle } from "lucide-react";

type ToastType = "success" | "error" | "info";

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, type: ToastType = "success") => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, message, type }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast: addToast }}>
      {children}
      {/* Toast container */}
      <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={() => removeToast(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Animate in
    requestAnimationFrame(() => setVisible(true));
    // Auto dismiss
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onDismiss, 200);
    }, 3000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  const icon =
    toast.type === "success" ? (
      <Check className="w-4 h-4 text-green-600" />
    ) : toast.type === "error" ? (
      <X className="w-4 h-4 text-red-600" />
    ) : (
      <AlertTriangle className="w-4 h-4 text-yellow-600" />
    );

  const borderColor =
    toast.type === "success"
      ? "border-green-200"
      : toast.type === "error"
        ? "border-red-200"
        : "border-yellow-200";

  return (
    <div
      className={`pointer-events-auto flex items-center gap-3 px-4 py-3 bg-card border ${borderColor} rounded-xl shadow-lg font-sans text-[13px] text-foreground transition-all duration-200 ${
        visible ? "translate-x-0 opacity-100" : "translate-x-4 opacity-0"
      }`}
    >
      {icon}
      {toast.message}
    </div>
  );
}
