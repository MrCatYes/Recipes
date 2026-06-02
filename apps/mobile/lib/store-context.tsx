import { createContext, useContext, useState, type ReactNode } from 'react';

export type StoreChain = 'Maxi' | 'IGA' | 'Metro' | 'Walmart' | 'Costco';

export const ALL_STORES: StoreChain[] = ['Maxi', 'IGA', 'Metro', 'Walmart', 'Costco'];

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

export function StoreProvider({ children }: { children: ReactNode }) {
  const [selectedStores, setSelectedStores] = useState<StoreChain[]>(['Maxi', 'IGA', 'Metro']);

  const toggleStore = (chain: StoreChain) => {
    setSelectedStores(prev =>
      prev.includes(chain)
        ? prev.length > 1 ? prev.filter(s => s !== chain) : prev // keep at least 1
        : [...prev, chain]
    );
  };

  const isSelected = (chain: StoreChain) => selectedStores.includes(chain);

  return (
    <StoreContext.Provider value={{ selectedStores, toggleStore, isSelected }}>
      {children}
    </StoreContext.Provider>
  );
}

export const useStores = () => useContext(StoreContext);
