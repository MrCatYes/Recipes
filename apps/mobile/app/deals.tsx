import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, SectionList, FlatList, ActivityIndicator,
  RefreshControl, TouchableOpacity, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import type { FlyerItem, RecipesByPromosResponse } from '@epicerie/shared-types';
import { getFlyers, getRecipesByPromos } from '../lib/api';
import { useStores, type StoreChain } from '../lib/store-context';

type PromoRecipe = RecipesByPromosResponse['recipes'][number];

const STORE_COLORS: Record<StoreChain, string> = {
  Maxi:    '#E53935',
  IGA:     '#1565C0',
  Metro:   '#F57C00',
  Walmart: '#0071CE',
  Costco:  '#003DA5',
};

interface Section { title: string; chain: StoreChain | null; data: FlyerItem[] }

type SortMode = 'store' | 'price' | 'savings';
const SORTS: Array<{ key: SortMode; label: string }> = [
  { key: 'store',   label: 'Magasin' },
  { key: 'price',   label: 'Prix' },
  { key: 'savings', label: 'Économie' },
];

function savingsOf(i: FlyerItem): number {
  return i.regularPriceCents != null && i.regularPriceCents > i.promoPriceCents
    ? i.regularPriceCents - i.promoPriceCents : 0;
}

export default function DealsScreen() {
  const router = useRouter();
  const { selectedStores } = useStores();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems] = useState<FlyerItem[]>([]);
  const [promoRecipes, setPromoRecipes] = useState<PromoRecipe[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [sort, setSort] = useState<SortMode>('price');
  const [recipeCat, setRecipeCat] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [flyers, recipes] = await Promise.all([
        getFlyers(selectedStores),
        getRecipesByPromos(selectedStores).catch(() => ({ recipes: [] } as Partial<RecipesByPromosResponse>)),
      ]);
      setItems(flyers.items);
      setPromoRecipes(recipes.recipes ?? []);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedStores]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(); };

  // Categories present in the (store-filtered) data
  const categories = Array.from(
    new Set(items.filter(i => selectedStores.includes(i.chain)).map(i => i.category).filter(Boolean) as string[])
  ).sort();

  // Apply store + category filters
  const filtered = items.filter(
    (i) => selectedStores.includes(i.chain) && (category == null || i.category === category)
  );

  // Build sections by sort mode
  let sections: Section[];
  if (sort === 'store') {
    sections = selectedStores
      .map((chain) => ({
        title: chain as string,
        chain,
        data: filtered.filter((i) => i.chain === chain)
          .sort((a, b) => a.promoPriceCents - b.promoPriceCents),
      }))
      .filter((s) => s.data.length > 0);
  } else {
    const data = [...filtered].sort((a, b) =>
      sort === 'savings' ? savingsOf(b) - savingsOf(a) : a.promoPriceCents - b.promoPriceCents
    );
    sections = data.length ? [{ title: category ?? 'Tous les spéciaux', chain: null, data }] : [];
  }

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

  if (items.length === 0) {
    return (
      <View style={styles.center}>
        <Ionicons name="flame-outline" size={48} color="#E0E0E0" />
        <Text style={styles.title}>Aucune promo cette semaine</Text>
        <Text style={styles.hint}>Reviens après la mise à jour des circulaires.</Text>
      </View>
    );
  }

  const controls = (
    <View style={styles.controls}>
      {/* Sort */}
      <View style={styles.sortRow}>
        {SORTS.map((s) => (
          <TouchableOpacity
            key={s.key}
            style={[styles.sortBtn, sort === s.key && styles.sortBtnActive]}
            onPress={() => setSort(s.key)}
          >
            <Text style={[styles.sortText, sort === s.key && styles.sortTextActive]}>{s.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {/* Category chips */}
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={[null, ...categories]}
        keyExtractor={(c) => c ?? 'all'}
        contentContainerStyle={styles.chipScroll}
        renderItem={({ item: c }) => {
          const active = category === c;
          return (
            <TouchableOpacity
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => setCategory(c)}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{c ?? 'Tous'}</Text>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );

  return (
    <SectionList
      style={styles.container}
      sections={sections}
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      ListHeaderComponent={
        <View>
          {promoRecipes.length > 0 && (
            <View style={styles.recipesBlock}>
              <Text style={styles.blockTitle}>🍳 Recettes avantageuses</Text>
              <Text style={styles.blockSub}>Leurs ingrédients sont en spécial cette semaine</Text>
              {/* Recipe category filter */}
              {(() => {
                const recipeCats = Array.from(
                  new Set(promoRecipes.map(r => r.recipe.category).filter(Boolean) as string[])
                ).sort();
                return recipeCats.length > 1 ? (
                  <FlatList
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    data={[null, ...recipeCats]}
                    keyExtractor={(c) => c ?? 'all'}
                    contentContainerStyle={styles.chipScroll}
                    renderItem={({ item: c }) => {
                      const active = recipeCat === c;
                      return (
                        <TouchableOpacity style={[styles.chip, active && styles.chipActive]} onPress={() => setRecipeCat(c)}>
                          <Text style={[styles.chipText, active && styles.chipTextActive]}>{c ?? 'Toutes'}</Text>
                        </TouchableOpacity>
                      );
                    }}
                  />
                ) : null;
              })()}
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                data={recipeCat ? promoRecipes.filter(r => r.recipe.category === recipeCat) : promoRecipes}
                keyExtractor={(r) => r.recipe.id}
                contentContainerStyle={styles.recipeScroll}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.recipeCard}
                    activeOpacity={0.7}
                    onPress={() => router.push(`/recipe/${item.recipe.id}`)}
                  >
                    {item.recipe.imageUrl && (
                      <Image source={{ uri: item.recipe.imageUrl }} style={styles.recipeImg} resizeMode="cover" />
                    )}
                    <Text style={styles.recipeTitle} numberOfLines={2}>{item.recipe.title}</Text>
                    <View style={styles.recipeBadge}>
                      <Ionicons name="flame" size={12} color="#E65100" />
                      <Text style={styles.recipeBadgeText}>
                        {item.promoIngredients.length} en spécial
                      </Text>
                    </View>
                    {item.recipe.cheapestTotalCents != null && (
                      <Text style={styles.recipePrice}>
                        {formatCents(item.recipe.cheapestTotalCents)}
                        <Text style={styles.recipeStore}> · {item.recipe.cheapestStore}</Text>
                      </Text>
                    )}
                    <View style={styles.recipeLink}>
                      <Text style={styles.recipeLinkText}>Voir la recette</Text>
                      <Ionicons name="chevron-forward" size={13} color="#2E7D32" />
                    </View>
                  </TouchableOpacity>
                )}
              />
            </View>
          )}
          {controls}
          {sections.length === 0 && (
            <Text style={styles.emptyFilter}>Aucun spécial dans cette catégorie.</Text>
          )}
        </View>
      }
      renderSectionHeader={({ section }) => (
        <View style={styles.sectionHeader}>
          {section.chain ? (
            <View style={[styles.tag, { backgroundColor: STORE_COLORS[section.chain] }]}>
              <Text style={styles.tagText}>{section.chain}</Text>
            </View>
          ) : (
            <Text style={styles.flatTitle}>{section.title}</Text>
          )}
          <Text style={styles.sectionCount}>{section.data.length} spéciaux</Text>
        </View>
      )}
      renderItem={({ item }) => {
        const hasReg = item.regularPriceCents != null && item.regularPriceCents > item.promoPriceCents;
        const savings = hasReg ? item.regularPriceCents! - item.promoPriceCents : 0;
        return (
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <View style={styles.rowTop}>
                {sort !== 'store' && (
                  <View style={[styles.miniTag, { backgroundColor: STORE_COLORS[item.chain] }]}>
                    <Text style={styles.miniTagText}>{item.chain}</Text>
                  </View>
                )}
                <Text style={styles.rawText} numberOfLines={2}>{item.rawText}</Text>
              </View>
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
  flatTitle:     { fontSize: 15, fontWeight: '700', color: '#333' },
  sectionCount:  { color: '#888', fontSize: 12 },
  row:           { flexDirection: 'row', backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 8, borderRadius: 10, padding: 12, alignItems: 'center' },
  rowLeft:       { flex: 1, marginRight: 10 },
  rowTop:        { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rawText:       { fontSize: 13, color: '#222', flexShrink: 1 },
  matchName:     { fontSize: 11, color: '#999', marginTop: 2 },
  miniTag:       { borderRadius: 3, paddingHorizontal: 5, paddingVertical: 1 },
  miniTagText:   { color: '#fff', fontSize: 9, fontWeight: '700' },

  // Controls
  controls:      { paddingBottom: 4 },
  sortRow:       { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  sortBtn:       { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, backgroundColor: '#eee' },
  sortBtnActive: { backgroundColor: '#2E7D32' },
  sortText:      { fontSize: 13, color: '#555', fontWeight: '600' },
  sortTextActive:{ color: '#fff' },
  chipScroll:    { paddingHorizontal: 16, gap: 8, paddingBottom: 4 },
  chip:          { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd' },
  chipActive:    { backgroundColor: '#E8F5E9', borderColor: '#2E7D32' },
  chipText:      { fontSize: 12, color: '#666' },
  chipTextActive:{ color: '#1B5E20', fontWeight: '600' },
  emptyFilter:   { textAlign: 'center', color: '#999', fontSize: 13, paddingVertical: 24 },
  rowRight:      { alignItems: 'flex-end' },
  promoPrice:    { fontSize: 17, fontWeight: '700', color: '#2E7D32' },
  regPrice:      { fontSize: 12, color: '#C62828', textDecorationLine: 'line-through' },
  savings:       { fontSize: 11, color: '#E65100', fontWeight: '600' },

  recipesBlock:  { paddingTop: 16, paddingBottom: 4 },
  blockTitle:    { fontSize: 17, fontWeight: '700', paddingHorizontal: 16, color: '#1B5E20' },
  blockSub:      { fontSize: 12, color: '#888', paddingHorizontal: 16, marginTop: 2, marginBottom: 10 },
  recipeScroll:  { paddingHorizontal: 16, gap: 10 },
  recipeCard:    { width: 170, backgroundColor: '#fff', borderRadius: 12, padding: 10, gap: 6, borderWidth: 1, borderColor: '#E8F5E9' },
  recipeImg:     { width: '100%', height: 80, borderRadius: 8, backgroundColor: '#eee' },
  recipeTitle:   { fontSize: 13, fontWeight: '600', minHeight: 34 },
  recipeBadge:   { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#FFF3E0', alignSelf: 'flex-start', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  recipeBadgeText:{ fontSize: 11, color: '#E65100', fontWeight: '600' },
  recipePrice:   { fontSize: 15, fontWeight: '700', color: '#2E7D32' },
  recipeStore:   { fontSize: 11, fontWeight: '400', color: '#888' },
  recipeLink:    { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 2 },
  recipeLinkText:{ fontSize: 12, color: '#2E7D32', fontWeight: '600' },
});
