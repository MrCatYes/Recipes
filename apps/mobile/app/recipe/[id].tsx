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

  // Per-store totals: prorata (cost of amounts used) + package (buy full formats)
  const summaries = (() => {
    if (!recipe) return [];
    const prorata = new Map<string, number>();
    const pkg = new Map<string, number>();
    for (const ing of recipe.ingredients) {
      for (const p of ing.costByStore) {
        if (!selectedStores.includes(p.chain as StoreChain)) continue;
        prorata.set(p.chain, (prorata.get(p.chain) ?? 0) + p.priceCents);
        pkg.set(p.chain, (pkg.get(p.chain) ?? 0) + p.packagePriceCents);
      }
    }
    return Array.from(prorata.entries())
      .map(([chain, pro]) => ({ chain, prorata: pro, pkg: pkg.get(chain) ?? pro }))
      .sort((a, b) => a.prorata - b.prorata);
  })();
  const best = summaries[0];

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

          {/* Hero: total recipe cost */}
          {best && (
            <View style={styles.hero}>
              <Text style={styles.heroLabel}>Coût total de la recette</Text>
              <Text style={styles.heroTotal}>{formatCents(best.prorata)}</Text>
              <Text style={styles.heroSub}>
                {formatCents(Math.round(best.prorata / recipe.servings))} / portion · meilleur prix chez {best.chain}
              </Text>
              <Text style={styles.heroPkg}>
                ≈ {formatCents(best.pkg)} si tu achètes les formats complets
              </Text>
            </View>
          )}

          {/* Per-store comparison */}
          {summaries.length > 1 && (
            <View style={styles.totals}>
              {summaries.map((s, idx) => (
                <View key={s.chain} style={[styles.totalRow, idx === 0 && styles.totalBest]}>
                  <View style={[styles.tag, { backgroundColor: STORE_COLORS[s.chain as StoreChain] }]}>
                    <Text style={styles.tagText}>{s.chain}</Text>
                  </View>
                  <Text style={[styles.totalPrice, idx === 0 && styles.totalPriceBest]}>
                    {formatCents(s.prorata)}
                  </Text>
                  <Text style={styles.totalPkg}>formats {formatCents(s.pkg)}</Text>
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
  hero:          { backgroundColor: '#E8F5E9', margin: 16, borderRadius: 12, padding: 16, alignItems: 'center' },
  heroLabel:     { fontSize: 13, color: '#2E7D32', fontWeight: '600' },
  heroTotal:     { fontSize: 34, fontWeight: '800', color: '#1B5E20', marginTop: 2 },
  heroSub:       { fontSize: 13, color: '#388E3C', marginTop: 2 },
  heroPkg:       { fontSize: 12, color: '#888', marginTop: 6 },
  totals:        { marginHorizontal: 16, marginBottom: 8, gap: 6 },
  totalRow:      { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 8, backgroundColor: '#fff' },
  totalBest:     { backgroundColor: '#E8F5E9' },
  tag:           { borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3 },
  tagText:       { color: '#fff', fontSize: 11, fontWeight: '700' },
  totalPrice:    { fontSize: 15, fontWeight: '700', color: '#1B5E20', flex: 1 },
  totalPriceBest:{ fontSize: 17 },
  totalPkg:      { fontSize: 11, color: '#999' },
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
