import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from 'react-native';
import type { RecipesByPromosResponse } from '@epicerie/shared-types';

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

export default function DealsScreen() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<RecipesByPromosResponse | null>(null);

  useEffect(() => {
    fetchDeals();
  }, []);

  async function fetchDeals() {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/recipes/by-promos`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (e) {
      Alert.alert('Erreur', String(e));
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2E7D32" />
        <Text style={styles.loadingText}>Chargement des promos...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {data && (
        <Text style={styles.weekLabel}>
          Semaine du {new Date(data.weekOf).toLocaleDateString('fr-CA')}
        </Text>
      )}
      <FlatList
        data={data?.recipes ?? []}
        keyExtractor={(item) => item.recipe.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.recipeTitle}>{item.recipe.title}</Text>
            <View style={styles.meta}>
              <Text style={styles.savings}>
                Économies: {formatCents(item.savings)}
              </Text>
              {item.recipe.cheapestTotalCents != null && (
                <Text style={styles.total}>
                  Total: {formatCents(item.recipe.cheapestTotalCents)} @ {item.recipe.cheapestStore}
                </Text>
              )}
            </View>
            <View style={styles.promoTags}>
              {item.promoIngredients.slice(0, 3).map((id) => {
                const ing = item.recipe.ingredients.find((i) => i.id === id);
                return ing ? (
                  <View key={id} style={styles.promoTag}>
                    <Text style={styles.promoTagText}>{ing.rawText}</Text>
                  </View>
                ) : null;
              })}
            </View>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>Aucune suggestion pour cette semaine.</Text>
        }
      />
    </View>
  );
}

function formatCents(cents: number) {
  return `${(cents / 100).toFixed(2)} $`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, color: '#666' },
  weekLabel: { padding: 16, fontSize: 13, color: '#666', fontWeight: '600' },
  list: { padding: 16, gap: 12 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16 },
  recipeTitle: { fontSize: 17, fontWeight: '700', marginBottom: 8 },
  meta: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  savings: { color: '#2E7D32', fontWeight: '600' },
  total: { color: '#444', fontSize: 13 },
  promoTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  promoTag: {
    backgroundColor: '#FFF3E0',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  promoTagText: { fontSize: 12, color: '#E65100' },
  empty: { textAlign: 'center', color: '#999', marginTop: 48 },
});
