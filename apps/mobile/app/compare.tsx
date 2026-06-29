import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { GetPricesResponse, StoreChain } from '@epicerie/shared-types';
import { getProductPrices, getProductCategories, getProductHistory } from '../lib/api';
import { useStores } from '../lib/store-context';

const RECENT_KEY = '@epicerie_recent_searches';
const MAX_RECENT = 8;

const CHAIN_COLORS: Record<StoreChain, string> = {
  Maxi:    '#E53935',
  IGA:     '#1565C0',
  Metro:   '#F57C00',
  SuperC:  '#C8102E',
  Walmart: '#0071CE',
  Costco:  '#003DA5',
};

export default function CompareScreen() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<GetPricesResponse | null>(null);
  const [categories, setCategories] = useState<Array<{ category: string; count: number }>>([]);
  const [history, setHistory] = useState<{
    prices: Array<{ date: string; priceCents: number; chain: string }>;
    flyerPrices: Array<{ date: string; promoPriceCents: number; chain: string }>;
  } | null>(null);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const { selectedStores } = useStores();

  useEffect(() => {
    getProductCategories().then(setCategories).catch(() => {});
    AsyncStorage.getItem(RECENT_KEY).then(raw => {
      if (raw) try { setRecentSearches(JSON.parse(raw)); } catch {}
    });
  }, []);

  const addRecent = useCallback((term: string) => {
    setRecentSearches(prev => {
      const next = [term, ...prev.filter(s => s !== term)].slice(0, MAX_RECENT);
      AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  async function search(override?: string) {
    const term = (override ?? query).trim();
    if (!term) return;
    setLoading(true);
    setData(null);
    setHistory(null);
    try {
      const result = await getProductPrices(term);
      setData(result);
      addRecent(result.product.name);
      getProductHistory(result.product.id, 30).then(setHistory).catch(() => {});
    } catch (e) {
      Alert.alert('Erreur', String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.searchRow}>
        <TextInput
          style={styles.input}
          placeholder="Chercher un produit..."
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={search}
          returnKeyType="search"
        />
        <TouchableOpacity style={styles.button} onPress={search} disabled={loading}>
          <Text style={styles.buttonText}>Chercher</Text>
        </TouchableOpacity>
      </View>

      {/* Recent searches */}
      {!data && recentSearches.length > 0 && (
        <View style={styles.recentSection}>
          <Text style={styles.recentTitle}>Recherches récentes</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catScroll}>
            {recentSearches.map((s) => (
              <TouchableOpacity
                key={s}
                style={styles.recentChip}
                onPress={() => { setQuery(s); search(s); }}
              >
                <Ionicons name="time-outline" size={14} color="#666" />
                <Text style={styles.recentChipText}>{s}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Quick category chips */}
      {!data && categories.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catScroll}>
          {categories.map((c) => (
            <TouchableOpacity
              key={c.category}
              style={styles.catChip}
              onPress={() => { setQuery(c.category); search(c.category); }}
            >
              <Text style={styles.catChipText}>{c.category}</Text>
              <Text style={styles.catChipCount}>{c.count}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {loading && <ActivityIndicator style={styles.loader} size="large" color="#2E7D32" />}

      {data && (
        <>
          <View style={styles.productHeader}>
            <Text style={styles.productName}>{data.product.name}</Text>
            {data.product.brand && (
              <Text style={styles.productBrand}>{data.product.brand}</Text>
            )}
            {data.prices.length === 0 && (
              <Text style={styles.empty}>Aucun prix disponible pour ce produit.</Text>
            )}
          </View>

          {/* Mini price history */}
          {history && (history.prices.length > 0 || history.flyerPrices.length > 0) && (
            <View style={styles.historyCard}>
              <Text style={styles.historyTitle}>Historique (30 jours)</Text>
              <View style={styles.historyBars}>
                {(() => {
                  const allPts = [
                    ...history.prices.map(p => ({ date: p.date, cents: p.priceCents, chain: p.chain, promo: false })),
                    ...history.flyerPrices.map(p => ({ date: p.date, cents: p.promoPriceCents, chain: p.chain, promo: true })),
                  ].sort((a, b) => a.date.localeCompare(b.date));
                  if (allPts.length === 0) return null;
                  const maxC = Math.max(...allPts.map(p => p.cents));
                  const minC = Math.min(...allPts.map(p => p.cents));
                  const last10 = allPts.slice(-10);
                  return last10.map((pt, i) => {
                    const h = maxC === minC ? 30 : 10 + (pt.cents - minC) / (maxC - minC) * 30;
                    return (
                      <View key={i} style={styles.historyBarWrap}>
                        <View style={[
                          styles.historyBar,
                          { height: h, backgroundColor: pt.promo ? '#FF6F00' : (CHAIN_COLORS[pt.chain as StoreChain] ?? '#999') },
                        ]} />
                        <Text style={styles.historyBarLabel}>{formatCents(pt.cents)}</Text>
                      </View>
                    );
                  });
                })()}
              </View>
            </View>
          )}
          <FlatList
            data={data.prices.filter(p => selectedStores.includes(p.chain))}
            keyExtractor={(_, i) => String(i)}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              data.prices.length > 0
                ? <Text style={styles.empty}>Aucun magasin sélectionné. Active des magasins dans l'onglet Magasins.</Text>
                : null
            }
            renderItem={({ item, index }) => {
              const unitLabel = formatUnitPrice(item.pricePerUnit, data.product.defaultUnit);
              const freshness = formatFreshness(item.capturedAt);
              const filteredPrices = data.prices.filter(p => selectedStores.includes(p.chain));
              const mostExpensive = filteredPrices.length > 1 ? filteredPrices[filteredPrices.length - 1].priceCents : null;
              const savingsPercent = index === 0 && mostExpensive && mostExpensive > item.priceCents
                ? Math.round((1 - item.priceCents / mostExpensive) * 100)
                : null;
              return (
                <View style={[styles.priceRow, index === 0 && styles.cheapestRow]}>
                  <View style={[styles.chainBadge, { backgroundColor: CHAIN_COLORS[item.chain] }]}>
                    <Text style={styles.chainText}>{item.chain}</Text>
                  </View>
                  <View style={styles.priceInfo}>
                    <Text style={styles.storeName}>{item.storeName}</Text>
                    {item.packageSize > 1 && (
                      <Text style={styles.packageInfo}>
                        {item.packageSize} {item.packageUnit}
                      </Text>
                    )}
                    <Text style={[styles.freshnessText, freshness.stale && styles.staleText]}>
                      {freshness.label}
                    </Text>
                  </View>
                  <View style={styles.priceRight}>
                    <Text style={styles.price}>{formatCents(item.priceCents)}</Text>
                    {unitLabel && <Text style={styles.unitPrice}>{unitLabel}</Text>}
                    {item.isPromo && <Text style={styles.promoBadge}>PROMO</Text>}
                    {savingsPercent != null && savingsPercent > 0 && (
                      <Text style={styles.savingsBadge}>-{savingsPercent}%</Text>
                    )}
                  </View>
                </View>
              );
            }}
          />
        </>
      )}
    </View>
  );
}

function formatCents(cents: number) {
  return `${(cents / 100).toFixed(2)} $`;
}

function formatFreshness(capturedAt: string): { label: string; stale: boolean } {
  const diffMs = Date.now() - new Date(capturedAt).getTime();
  const days = Math.floor(diffMs / 86400_000);
  if (days <= 0) return { label: "Aujourd'hui", stale: false };
  if (days === 1) return { label: 'Hier', stale: false };
  if (days <= 7) return { label: `Il y a ${days} jours`, stale: false };
  if (days <= 14) return { label: `Il y a ${days} jours`, stale: true };
  return { label: `Il y a ${Math.floor(days / 7)} sem.`, stale: true };
}

// pricePerUnit is cents per base unit (g/ml). Sub-cent values round to 0.00,
// so for weight/volume show price per 100 g/ml (Quebec unit-pricing convention).
function formatUnitPrice(pricePerUnit: number, defaultUnit: string): string | null {
  if (pricePerUnit <= 0) return null;
  if (defaultUnit === 'unit') {
    return `${(pricePerUnit / 100).toFixed(2)} $/unité`;
  }
  const per100 = pricePerUnit * 100; // cents per 100 g/ml
  return `${(per100 / 100).toFixed(2)} $/100 ${defaultUnit}`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  searchRow: { flexDirection: 'row', padding: 16, gap: 8 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
    fontSize: 14,
  },
  button: {
    backgroundColor: '#2E7D32',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  buttonText: { color: '#fff', fontWeight: '600' },
  loader: { marginTop: 32 },
  productHeader: { paddingHorizontal: 16, paddingBottom: 8 },
  productName: { fontSize: 18, fontWeight: '700' },
  productBrand: { fontSize: 13, color: '#666', marginTop: 2 },
  empty: { color: '#999', marginTop: 12, fontSize: 14 },
  list: { padding: 16, gap: 10 },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    gap: 10,
  },
  cheapestRow: { borderWidth: 2, borderColor: '#2E7D32' },
  chainBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    minWidth: 64,
    alignItems: 'center',
  },
  chainText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  priceInfo: { flex: 1 },
  storeName: { fontSize: 13, fontWeight: '600' },
  packageInfo: { color: '#666', fontSize: 12, marginTop: 2 },
  priceRight: { alignItems: 'flex-end', gap: 2 },
  price: { fontSize: 18, fontWeight: '700' },
  unitPrice: { fontSize: 12, color: '#666' },
  promoBadge: {
    backgroundColor: '#FF6F00',
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  savingsBadge: {
    backgroundColor: '#2E7D32',
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  freshnessText: { color: '#999', fontSize: 11, marginTop: 2 },
  staleText: { color: '#E53935' },
  historyCard: { marginHorizontal: 16, marginBottom: 8, padding: 12, backgroundColor: '#fff', borderRadius: 10 },
  historyTitle: { fontSize: 13, fontWeight: '700', color: '#333', marginBottom: 8 },
  historyBars: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', height: 60 },
  historyBarWrap: { alignItems: 'center', gap: 2, flex: 1 },
  historyBar: { width: 16, borderRadius: 3 },
  historyBarLabel: { fontSize: 8, color: '#999' },
  catScroll: { paddingHorizontal: 16, paddingBottom: 8, gap: 8 },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 4,
  },
  catChipText: { fontSize: 13, fontWeight: '600', color: '#2E7D32' },
  catChipCount: { fontSize: 11, color: '#66BB6A' },
  recentSection: { paddingBottom: 4 },
  recentTitle: { fontSize: 13, fontWeight: '600', color: '#888', paddingHorizontal: 16, marginBottom: 6 },
  recentChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#fff', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: '#eee',
  },
  recentChipText: { fontSize: 13, color: '#333' },
});
