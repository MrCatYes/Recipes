import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@epicerie_price_alerts';

export interface PriceAlert {
  productId: string;
  productName: string;
  targetCents: number;
  createdAt: string;
}

interface PriceAlertsContextValue {
  alerts: PriceAlert[];
  addAlert: (alert: Omit<PriceAlert, 'createdAt'>) => void;
  removeAlert: (productId: string) => void;
  hasAlert: (productId: string) => boolean;
  getAlert: (productId: string) => PriceAlert | undefined;
}

const PriceAlertsContext = createContext<PriceAlertsContextValue>({
  alerts: [],
  addAlert: () => {},
  removeAlert: () => {},
  hasAlert: () => false,
  getAlert: () => undefined,
});

export function PriceAlertsProvider({ children }: { children: ReactNode }) {
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(raw => {
      if (raw) try { setAlerts(JSON.parse(raw)); } catch {}
    });
  }, []);

  const addAlert = useCallback((alert: Omit<PriceAlert, 'createdAt'>) => {
    setAlerts(prev => {
      const next = [...prev.filter(a => a.productId !== alert.productId), { ...alert, createdAt: new Date().toISOString() }];
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const removeAlert = useCallback((productId: string) => {
    setAlerts(prev => {
      const next = prev.filter(a => a.productId !== productId);
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const hasAlert = useCallback((productId: string) => {
    return alerts.some(a => a.productId === productId);
  }, [alerts]);

  const getAlert = useCallback((productId: string) => {
    return alerts.find(a => a.productId === productId);
  }, [alerts]);

  return (
    <PriceAlertsContext.Provider value={{ alerts, addAlert, removeAlert, hasAlert, getAlert }}>
      {children}
    </PriceAlertsContext.Provider>
  );
}

export function usePriceAlerts() {
  return useContext(PriceAlertsContext);
}
