import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, SectionList, ActivityIndicator,
  RefreshControl, TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { FlyerItem } from '@epicerie/shared-types';
import { getFlyers } from '../lib/api';
import { useStores, type StoreChain } from '../lib/store-context';

const STORE_COLORS: Record<StoreChain, string> = {
  Maxi:    '#E53935',
  IGA:     '#1565C0',
  Metro:   '#F57C00',
  Walmart: '#0071CE',
  Costco:  '#003DA5',
};

interface Section { title: StoreChain; data: FlyerItem[] }

export default function DealsScreen() {
  const { selectedStores } = useStores();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems] = useState<FlyerItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await getFlyers(selectedStores);
      setItems(data.items);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedStores]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(); };

  // Group by chain, only selected stores
  const sections: Section[] = selectedStores
    .map((chain) => ({
      title: chain,
      data: items.filter((i) => i.chain === chain),
    }))
    .filter((s) => s.data.length > 0);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2E7D32" />
        <Text style={styles.hint}>Chargement des circulaires...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Ionicons name="cloud-offline-outline" size={48} color="#E0E0E0" />
        <Text style={styles.hint}>{error}</Text>
        <TouchableOpacity style={styles.retry} onPress={() => { setLoading(true); load(); }}>
          <Text style={styles.retryText}>Réessayer</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (sections.length === 0) {
    return (
      <View style={styles.center}>
        <Ionicons name="flame-outline" size={48} color="#E0E0E0" />
        <Text style={styles.title}>Aucune promo cette semaine</Text>
        <Text style={styles.hint}>Reviens après la mise à jour des circulaires.</Text>
      </View>
    );
  }

  return (
    <SectionList
      style={styles.container}
      sections={sections}
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      renderSectionHeader={({ section }) => (
        <View style={styles.sectionHeader}>
          <View style={[styles.tag, { backgroundColor: STORE_COLORS[section.title] }]}>
            <Text style={styles.tagText}>{section.title}</Text>
          </View>
          <Text style={styles.sectionCount}>{section.data.length} spéciaux</Text>
        </View>
      )}
      renderItem={({ item }) => {
        const hasReg = item.regularPriceCents != null && item.regularPriceCents > item.promoPriceCents;
        const savings = hasReg ? item.regularPriceCents! - item.promoPriceCents : 0;
        return (
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Text style={styles.rawText} numberOfLines={2}>{item.rawText}</Text>
              {item.productName && (
                <Text style={styles.matchName}>≈ {item.productName}</Text>
              )}
            </View>
            <View style={styles.rowRight}>
              <Text style={styles.promoPrice}>{formatCents(item.promoPriceCents)}</Text>
              {hasReg && (
                <>
                  <Text style={styles.regPrice}>{formatCents(item.regularPriceCents!)}</Text>
                  <Text style={styles.savings}>-{formatCents(savings)}</Text>
                </>
              )}
            </View>
          </View>
        );
      }}
    />
  );
}

function formatCents(c: number) { return `${(c / 100).toFixed(2)} $`; }

const styles = StyleSheet.create({
  container:     { flex: 1, backgroundColor: '#f5f5f5' },
  center:        { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12, backgroundColor: '#f5f5f5' },
  title:         { fontSize: 18, fontWeight: '700', color: '#757575' },
  hint:          { fontSize: 13, color: '#9E9E9E', textAlign: 'center' },
  retry:         { marginTop: 12, backgroundColor: '#2E7D32', borderRadius: 8, paddingHorizontal: 20, paddingVertical: 10 },
  retryText:     { color: '#fff', fontWeight: '600' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#f5f5f5' },
  tag:           { borderRadius: 5, paddingHorizontal: 10, paddingVertical: 3 },
  tagText:       { color: '#fff', fontWeight: '700', fontSize: 13 },
  sectionCount:  { color: '#888', fontSize: 12 },
  row:           { flexDirection: 'row', backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 8, borderRadius: 10, padding: 12, alignItems: 'center' },
  rowLeft:       { flex: 1, marginRight: 10 },
  rawText:       { fontSize: 13, color: '#222' },
  matchName:     { fontSize: 11, color: '#999', marginTop: 2 },
  rowRight:      { alignItems: 'flex-end' },
  promoPrice:    { fontSize: 17, fontWeight: '700', color: '#2E7D32' },
  regPrice:      { fontSize: 12, color: '#C62828', textDecorationLine: 'line-through' },
  savings:       { fontSize: 11, color: '#E65100', fontWeight: '600' },
});
