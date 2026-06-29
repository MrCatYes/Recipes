import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type StoreChain = 'Maxi' | 'IGA' | 'Metro' | 'Walmart' | 'Costco' | 'SuperC';

export const ALL_STORES: StoreChain[] = ['Maxi', 'IGA', 'Metro', 'SuperC', 'Walmart', 'Costco'];

interface StoreContextValue {
  selectedStores: StoreChain[];
  toggleStore: (chain: StoreChain) => void;
  isSelected: (chain: StoreChain) => boolean;
}

const StoreContext = createContext<StoreContextValue>({
  selectedStores: ALL_STORES,
  toggleStore: () => {},
  isSelected: () => true,
});

const STORAGE_KEY = '@epicerie_stores';

export function StoreProvider({ children }: { children: ReactNode }) {
  const [selectedStores, setSelectedStores] = useState<StoreChain[]>(['Maxi', 'IGA', 'Metro', 'SuperC']);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as StoreChain[];
          if (parsed.length > 0) setSelectedStores(parsed);
        } catch { /* corrupt */ }
      }
    });
  }, []);

  const toggleStore = (chain: StoreChain) => {
    setSelectedStores(prev => {
      const next = prev.includes(chain)
        ? prev.length > 1 ? prev.filter(s => s !== chain) : prev
        : [...prev, chain];
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const isSelected = (chain: StoreChain) => selectedStores.includes(chain);

  return (
    <StoreContext.Provider value={{ selectedStores, toggleStore, isSelected }}>
      {children}
    </StoreContext.Provider>
  );
}

export const useStores = () => useContext(StoreContext);
