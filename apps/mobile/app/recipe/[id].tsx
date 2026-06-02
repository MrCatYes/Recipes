import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Image, ActivityIndicator,
  TouchableOpacity, Linking,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { RecipeWithCost } from '@epicerie/shared-types';
import { getRecipeCost } from '../../lib/api';
import { useStores, type StoreChain } from '../../lib/store-context';

const STORE_COLORS: Record<StoreChain, string> = {
  Maxi: '#E53935', IGA: '#1565C0', Metro: '#F57C00', Walmart: '#0071CE', Costco: '#003DA5',
};

export default function RecipeDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { selectedStores } = useStores();
  const [recipe, setRecipe] = useState<RecipeWithCost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    getRecipeCost(id)
      .then(setRecipe)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [id]);

  const totals = recipe
    ? Object.entries(recipe.totalCostByStore)
        .filter(([c]) => selectedStores.includes(c as StoreChain))
        .sort((a, b) => a[1] - b[1])
    : [];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back}>
          <Ionicons name="chevron-back" size={26} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>Recette</Text>
      </View>

      {loading && <ActivityIndicator style={{ marginTop: 40 }} size="large" color="#2E7D32" />}
      {error && <Text style={styles.error}>{error}</Text>}

      {recipe && (
        <ScrollView contentContainerStyle={styles.scroll}>
          {recipe.imageUrl && (
            <Image source={{ uri: recipe.imageUrl }} style={styles.image} resizeMode="cover" />
          )}
          <Text style={styles.title}>{recipe.title}</Text>
          <View style={styles.meta}>
            <Text style={styles.metaText}>{recipe.servings} portions</Text>
            {recipe.prepTimeMinutes != null && <Text style={styles.metaText}>· prép {recipe.prepTimeMinutes} min</Text>}
            {recipe.cookTimeMinutes != null && <Text style={styles.metaText}>· cuisson {recipe.cookTimeMinutes} min</Text>}
          </View>

          {/* Store totals */}
          {totals.length > 0 && (
            <View style={styles.totals}>
              {totals.map(([chain, total], idx) => (
                <View key={chain} style={[styles.totalRow, idx === 0 && styles.totalBest]}>
                  <View style={[styles.tag, { backgroundColor: STORE_COLORS[chain as StoreChain] }]}>
                    <Text style={styles.tagText}>{chain}</Text>
                  </View>
                  <Text style={[styles.totalPrice, idx === 0 && styles.totalPriceBest]}>
                    {formatCents(total)}
                  </Text>
                  {idx === 0 && <Text style={styles.bestLabel}>meilleur · {formatCents(Math.round(total / recipe.servings))}/portion</Text>}
                </View>
              ))}
            </View>
          )}

          {/* Ingredients */}
          <Text style={styles.section}>Ingrédients</Text>
          {recipe.ingredients.map((ing) => {
            const prices = ing.costByStore.filter(p => selectedStores.includes(p.chain as StoreChain));
            return (
              <View key={ing.id} style={styles.ingRow}>
                <Text style={styles.ingText}>{ing.rawText}</Text>
                {prices.length > 0
                  ? <Text style={styles.ingPrice}>{formatCents(prices[0].priceCents)}</Text>
                  : <Text style={styles.ingNo}>—</Text>}
              </View>
            );
          })}

          {/* Instructions */}
          {recipe.instructions.length > 0 && (
            <>
              <Text style={styles.section}>Préparation</Text>
              {recipe.instructions.map((step, i) => (
                <View key={i} style={styles.stepRow}>
                  <Text style={styles.stepNum}>{i + 1}</Text>
                  <Text style={styles.stepText}>{step}</Text>
                </View>
              ))}
            </>
          )}

          {recipe.sourceUrl && (
            <TouchableOpacity
              style={styles.sourceBtn}
              onPress={() => Linking.openURL(recipe.sourceUrl!)}
            >
              <Ionicons name="open-outline" size={18} color="#fff" />
              <Text style={styles.sourceBtnText}>Voir la recette originale</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function formatCents(c: number) { return `${(c / 100).toFixed(2)} $`; }

const styles = StyleSheet.create({
  container:     { flex: 1, backgroundColor: '#f5f5f5' },
  header:        { flexDirection: 'row', alignItems: 'center', backgroundColor: '#2E7D32', paddingTop: 48, paddingBottom: 12, paddingHorizontal: 8, gap: 4 },
  back:          { padding: 4 },
  headerTitle:   { color: '#fff', fontSize: 18, fontWeight: '600' },
  error:         { color: '#C62828', padding: 16 },
  scroll:        { paddingBottom: 40 },
  image:         { width: '100%', height: 200 },
  title:         { fontSize: 22, fontWeight: '700', paddingHorizontal: 16, paddingTop: 14 },
  meta:          { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 16, marginTop: 4 },
  metaText:      { color: '#666', fontSize: 13 },
  totals:        { margin: 16, gap: 6 },
  totalRow:      { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 8, backgroundColor: '#fff' },
  totalBest:     { backgroundColor: '#E8F5E9' },
  tag:           { borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3 },
  tagText:       { color: '#fff', fontSize: 11, fontWeight: '700' },
  totalPrice:    { fontSize: 15, fontWeight: '600', color: '#555' },
  totalPriceBest:{ fontSize: 17, color: '#1B5E20' },
  bestLabel:     { fontSize: 11, color: '#2E7D32', fontWeight: '600', flex: 1 },
  section:       { fontSize: 16, fontWeight: '700', paddingHorizontal: 16, marginTop: 14, marginBottom: 6 },
  ingRow:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#eee' },
  ingText:       { flex: 1, fontSize: 14, marginRight: 8 },
  ingPrice:      { fontSize: 14, color: '#2E7D32', fontWeight: '600' },
  ingNo:         { fontSize: 14, color: '#ccc' },
  stepRow:       { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 6, gap: 10 },
  stepNum:       { width: 22, height: 22, borderRadius: 11, backgroundColor: '#2E7D32', color: '#fff', textAlign: 'center', lineHeight: 22, fontSize: 12, fontWeight: '700', overflow: 'hidden' },
  stepText:      { flex: 1, fontSize: 14, lineHeight: 20, color: '#333' },
  sourceBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#2E7D32', margin: 16, borderRadius: 10, paddingVertical: 14 },
  sourceBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
});
