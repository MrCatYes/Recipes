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
import { getProductPrices } from '../lib/api';
import { useStores } from '../lib/store-context';

const CHAIN_COLORS: Record<StoreChain, string> = {
  Maxi:    '#E53935',
  IGA:     '#1565C0',
  Metro:   '#F57C00',
  Walmart: '#0071CE',
  Costco:  '#003DA5',
};

export default function CompareScreen() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<GetPricesResponse | null>(null);
  const { selectedStores } = useStores();

  async function search() {
    if (!query.trim()) return;
    setLoading(true);
    setData(null);
    try {
      setData(await getProductPrices(query.trim()));
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
          <View style={styles.productHeader}>
            <Text style={styles.productName}>{data.product.name}</Text>
            {data.product.brand && (
              <Text style={styles.productBrand}>{data.product.brand}</Text>
            )}
            {data.prices.length === 0 && (
              <Text style={styles.empty}>Aucun prix disponible pour ce produit.</Text>
            )}
          </View>
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
              // Per-unit price is only reliable when package size is parsed (>0)
              // and plausibly smaller than the package price.
              const showUnit = item.pricePerUnit > 0 && item.pricePerUnit < item.priceCents;
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
                  </View>
                  <View style={styles.priceRight}>
                    <Text style={styles.price}>{formatCents(item.priceCents)}</Text>
                    {showUnit && (
                      <Text style={styles.unitPrice}>
                        {formatCents(item.pricePerUnit)}/{data.product.defaultUnit}
                      </Text>
                    )}
                    {item.isPromo && <Text style={styles.promoBadge}>PROMO</Text>}
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
});
