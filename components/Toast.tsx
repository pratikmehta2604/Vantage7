import React, { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { Check, X, AlertTriangle, Info, Copy } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
    id: number;
    message: string;
    type: ToastType;
    duration?: number;
}

interface ToastContextType {
    showToast: (message: string, type?: ToastType, duration?: number) => void;
}

const ToastContext = createContext<ToastContextType>({ showToast: () => { } });

export const useToast = () => useContext(ToastContext);

let toastCounter = 0;

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const showToast = useCallback((message: string, type: ToastType = 'success', duration: number = 3000) => {
        const id = ++toastCounter;
        setToasts(prev => [...prev, { id, message, type, duration }]);
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, duration);
    }, []);

    const removeToast = (id: number) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    };

    const getIcon = (type: ToastType) => {
        switch (type) {
            case 'success': return <Check className="w-4 h-4" />;
            case 'error': return <X className="w-4 h-4" />;
            case 'warning': return <AlertTriangle className="w-4 h-4" />;
            case 'info': return <Info className="w-4 h-4" />;
        }
    };

    const getStyles = (type: ToastType) => {
        switch (type) {
            case 'success': return 'bg-emerald-900/90 border-emerald-500/50 text-emerald-200';
            case 'error': return 'bg-red-900/90 border-red-500/50 text-red-200';
            case 'warning': return 'bg-amber-900/90 border-amber-500/50 text-amber-200';
            case 'info': return 'bg-blue-900/90 border-blue-500/50 text-blue-200';
        }
    };

    const getIconBg = (type: ToastType) => {
        switch (type) {
            case 'success': return 'bg-emerald-500/20 text-emerald-400';
            case 'error': return 'bg-red-500/20 text-red-400';
            case 'warning': return 'bg-amber-500/20 text-amber-400';
            case 'info': return 'bg-blue-500/20 text-blue-400';
        }
    };

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            {/* Toast Container */}
            <div className="fixed bottom-6 right-6 z-[100] flex flex-col-reverse gap-3 pointer-events-none">
                {toasts.map((toast) => (
                    <div
                        key={toast.id}
                        className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl border backdrop-blur-md shadow-2xl animate-fade-in-up min-w-[280px] max-w-[400px] ${getStyles(toast.type)}`}
                    >
                        <div className={`p-1.5 rounded-lg flex-shrink-0 ${getIconBg(toast.type)}`}>
                            {getIcon(toast.type)}
                        </div>
                        <p className="text-sm font-medium flex-1">{toast.message}</p>
                        <button
                            onClick={() => removeToast(toast.id)}
                            className="text-slate-400 hover:text-white transition-colors flex-shrink-0 p-1"
                        >
                            <X className="w-3 h-3" />
                        </button>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
};
