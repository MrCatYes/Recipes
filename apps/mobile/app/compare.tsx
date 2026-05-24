import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Alert,
} from 'react-native';
import type { GetPricesResponse, StoreChain } from '@epicerie/shared-types';

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

const CHAIN_COLORS: Record<StoreChain, string> = {
  IGA: '#E53935',
  Metro: '#1565C0',
  Maxi: '#F57F17',
  Walmart: '#0071CE',
  Costco: '#003DA5',
};

export default function CompareScreen() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<GetPricesResponse | null>(null);

  async function search() {
    if (!query.trim()) return;
    setLoading(true);
    setData(null);
    try {
      const res = await fetch(
        `${API_BASE}/products/prices?q=${encodeURIComponent(query.trim())}`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
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

      {loading && <ActivityIndicator style={styles.loader} size="large" color="#2E7D32" />}

      {data && (
        <>
          <Text style={styles.productName}>{data.product.name}</Text>
          <FlatList
            data={data.prices}
            keyExtractor={(_, i) => String(i)}
            renderItem={({ item, index }) => (
              <View style={[styles.priceRow, index === 0 && styles.cheapestRow]}>
                <View
                  style={[styles.chainBadge, { backgroundColor: CHAIN_COLORS[item.chain] }]}
                >
                  <Text style={styles.chainText}>{item.chain}</Text>
                </View>
                <View style={styles.priceInfo}>
                  <Text style={styles.price}>{formatCents(item.priceCents)}</Text>
                  <Text style={styles.packageInfo}>
                    {item.packageSize} {item.packageUnit}
                  </Text>
                </View>
                <Text style={styles.unitPrice}>
                  {formatCents(item.pricePerUnit)}/{data.product.defaultUnit}
                </Text>
                {item.isPromo && <Text style={styles.promoBadge}>PROMO</Text>}
              </View>
            )}
          />
        </>
      )}
    </View>
  );
}

function formatCents(cents: number) {
  return `${(cents / 100).toFixed(2)} $`;
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
  productName: { fontSize: 18, fontWeight: '700', paddingHorizontal: 16, marginBottom: 8 },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 8,
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
  price: { fontSize: 18, fontWeight: '700' },
  packageInfo: { color: '#666', fontSize: 12 },
  unitPrice: { fontSize: 13, color: '#444', textAlign: 'right' },
  promoBadge: {
    backgroundColor: '#FF6F00',
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
});
