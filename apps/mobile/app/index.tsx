import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, FlatList, Alert, Image, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { RecipeSummary } from '@epicerie/shared-types';
import { parseRecipe, getRecipes } from '../lib/api';
import { useStores, type StoreChain } from '../lib/store-context';

const STORE_COLORS: Record<StoreChain, string> = {
  Maxi: '#E53935', IGA: '#1565C0', Metro: '#F57C00', Walmart: '#0071CE', Costco: '#003DA5',
};

type Sort = 'price' | 'promos' | 'recent';
const SORTS: Array<{ key: Sort; label: string }> = [
  { key: 'price', label: 'Prix' },
  { key: 'promos', label: 'En spécial' },
  { key: 'recent', label: 'Récent' },
];

export default function RecipesScreen() {
  const router = useRouter();
  const { selectedStores } = useStores();
  const [url, setUrl] = useState('');
  const [parsing, setParsing] = useState(false);

  const [recipes, setRecipes] = useState<RecipeSummary[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [category, setCategory] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>('price');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await getRecipes({ category: category ?? undefined, chains: selectedStores, sort });
      setRecipes(data.recipes);
      setCategories(data.categories);
    } catch {
      // keep previous
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [category, sort, selectedStores]);

  useEffect(() => { load(); }, [load]);

  async function handleParse() {
    if (!url.trim()) return;
    setParsing(true);
    try {
      const data = await parseRecipe(url.trim());
      setUrl('');
      await load();
      router.push(`/recipe/${data.recipe.id}`);
    } catch (e) {
      Alert.alert('Erreur', String(e));
    } finally {
      setParsing(false);
    }
  }

  const header = (
    <View>
      <View style={styles.searchRow}>
        <TextInput
          style={styles.input}
          placeholder="Coller l'URL d'une recette..."
          value={url}
          onChangeText={setUrl}
          autoCapitalize="none"
          keyboardType="url"
          returnKeyType="go"
          onSubmitEditing={handleParse}
        />
        <TouchableOpacity style={styles.button} onPress={handleParse} disabled={parsing}>
          {parsing ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Ajouter</Text>}
        </TouchableOpacity>
      </View>

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
            <TouchableOpacity style={[styles.chip, active && styles.chipActive]} onPress={() => setCategory(c)}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{c ?? 'Toutes'}</Text>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );

  return (
    <FlatList
      style={styles.container}
      data={recipes}
      keyExtractor={(r) => r.id}
      ListHeaderComponent={header}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      ListEmptyComponent={
        loading
          ? <ActivityIndicator style={{ marginTop: 40 }} size="large" color="#2E7D32" />
          : <Text style={styles.empty}>Aucune recette. Colle une URL pour en ajouter une.</Text>
      }
      renderItem={({ item }) => (
        <TouchableOpacity style={styles.card} activeOpacity={0.7} onPress={() => router.push(`/recipe/${item.id}`)}>
          {item.imageUrl
            ? <Image source={{ uri: item.imageUrl }} style={styles.cardImg} />
            : <View style={[styles.cardImg, styles.cardImgEmpty]}><Ionicons name="restaurant" size={24} color="#ccc" /></View>}
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
            {item.category && <Text style={styles.cardCat}>{item.category}</Text>}
            <View style={styles.cardFooter}>
              {item.cheapestStore && (
                <View style={[styles.miniTag, { backgroundColor: STORE_COLORS[item.cheapestStore] }]}>
                  <Text style={styles.miniTagText}>{item.cheapestStore}</Text>
                </View>
              )}
              {item.cheapestTotalCents != null && (
                <Text style={styles.cardPrice}>{(item.cheapestTotalCents / 100).toFixed(2)} $</Text>
              )}
              {item.promoIngredientCount > 0 && (
                <Text style={styles.cardPromo}>🔥 {item.promoIngredientCount}</Text>
              )}
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#ccc" />
        </TouchableOpacity>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container:     { flex: 1, backgroundColor: '#f5f5f5' },
  searchRow:     { flexDirection: 'row', padding: 16, gap: 8 },
  input:         { flex: 1, borderWidth: 1, borderColor: '#ccc', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#fff', fontSize: 14 },
  button:        { backgroundColor: '#2E7D32', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10, justifyContent: 'center', minWidth: 80, alignItems: 'center' },
  buttonText:    { color: '#fff', fontWeight: '600' },
  sortRow:       { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
  sortBtn:       { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, backgroundColor: '#eee' },
  sortBtnActive: { backgroundColor: '#2E7D32' },
  sortText:      { fontSize: 13, color: '#555', fontWeight: '600' },
  sortTextActive:{ color: '#fff' },
  chipScroll:    { paddingHorizontal: 16, gap: 8, paddingBottom: 10 },
  chip:          { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd' },
  chipActive:    { backgroundColor: '#E8F5E9', borderColor: '#2E7D32' },
  chipText:      { fontSize: 12, color: '#666' },
  chipTextActive:{ color: '#1B5E20', fontWeight: '600' },
  empty:         { textAlign: 'center', color: '#999', marginTop: 40, paddingHorizontal: 32 },
  card:          { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 10, borderRadius: 12, padding: 10, gap: 10 },
  cardImg:       { width: 56, height: 56, borderRadius: 8, backgroundColor: '#eee' },
  cardImgEmpty:  { alignItems: 'center', justifyContent: 'center' },
  cardBody:      { flex: 1 },
  cardTitle:     { fontSize: 14, fontWeight: '600' },
  cardCat:       { fontSize: 11, color: '#999', marginTop: 1 },
  cardFooter:    { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  miniTag:       { borderRadius: 3, paddingHorizontal: 5, paddingVertical: 1 },
  miniTagText:   { color: '#fff', fontSize: 9, fontWeight: '700' },
  cardPrice:     { fontSize: 14, fontWeight: '700', color: '#1B5E20' },
  cardPromo:     { fontSize: 12, color: '#E65100', fontWeight: '600' },
});
