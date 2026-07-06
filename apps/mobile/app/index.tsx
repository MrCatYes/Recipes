import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, FlatList, Alert, Image, RefreshControl,
  Animated, ScrollView, Modal, Pressable, KeyboardAvoidingView, Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { RecipeSummary, RecipeDifficulty } from '@epicerie/shared-types';
import { parseRecipe, getRecipes, deleteRecipe } from '../lib/api';
import { useStores, type StoreChain } from '../lib/store-context';
import { useFavorites } from '../lib/favorites-context';

const CACHE_KEY = '@epicerie_recipes_cache';

const STORE_COLORS: Record<StoreChain, string> = {
  Maxi: '#E53935', IGA: '#1565C0', Metro: '#F57C00', SuperC: '#C8102E', Walmart: '#0071CE', Costco: '#003DA5',
};

const DIFFICULTY_COLORS: Record<RecipeDifficulty, string> = {
  'débutant': '#2E7D32', 'confirmé': '#EF6C00', 'expert': '#C62828',
};
const DIFFICULTIES: RecipeDifficulty[] = ['débutant', 'confirmé', 'expert'];

const SUGGESTED_RECIPES = [
  { name: 'Pâté chinois classique', source: 'Ricardo', url: 'https://www.ricardocuisine.com/recettes/5765-pate-chinois' },
  { name: 'Soupe poulet et nouilles', source: 'Ricardo', url: 'https://www.ricardocuisine.com/recettes/5413-soupe-au-poulet-et-aux-nouilles' },
  { name: 'Sauce à spaghetti', source: 'Ricardo', url: 'https://www.ricardocuisine.com/recettes/5765-sauce-a-spaghetti' },
  { name: 'Poulet général Tao', source: 'SOS Cuisine', url: 'https://www.soscuisine.com/recettes/poulet-general-tao' },
  { name: 'Macaroni au fromage', source: 'Ricardo', url: 'https://www.ricardocuisine.com/recettes/5762-macaroni-au-fromage' },
];

function SkeletonCard() {
  const opacity = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, []);

  return (
    <View style={styles.card}>
      <Animated.View style={[styles.cardImg, { opacity, backgroundColor: '#e0e0e0' }]} />
      <View style={styles.cardBody}>
        <Animated.View style={{ opacity, backgroundColor: '#e0e0e0', height: 15, borderRadius: 4, width: '75%', marginBottom: 8 }} />
        <Animated.View style={{ opacity, backgroundColor: '#e0e0e0', height: 11, borderRadius: 4, width: '50%', marginBottom: 8 }} />
        <Animated.View style={{ opacity, backgroundColor: '#e0e0e0', height: 11, borderRadius: 4, width: '35%' }} />
      </View>
    </View>
  );
}

type Sort = 'price' | 'promos' | 'recent' | 'time' | 'favorites';
const SORTS: Array<{ key: Sort; label: string; icon: string }> = [
  { key: 'price',     label: 'Prix',       icon: 'trending-down-outline' },
  { key: 'promos',    label: 'En spécial', icon: 'flame-outline' },
  { key: 'time',      label: 'Rapide',     icon: 'time-outline' },
  { key: 'recent',    label: 'Récent',     icon: 'calendar-outline' },
  { key: 'favorites', label: 'Favoris',    icon: 'heart-outline' },
];

const DIETARY_OPTIONS = [
  { key: 'vegetarien',   label: 'Végétarien',   emoji: '🥦' },
  { key: 'vegetalien',   label: 'Végétalien',   emoji: '🌱' },
  { key: 'halal',        label: 'Halal',         emoji: '☪️' },
  { key: 'sans-gluten',  label: 'Sans gluten',   emoji: '🌾' },
  { key: 'sans-lactose', label: 'Sans lactose',  emoji: '🥛' },
];

export default function RecipesScreen() {
  const router = useRouter();
  const { selectedStores } = useStores();
  const { isFavorite, toggleFavorite } = useFavorites();

  const [url, setUrl] = useState('');
  const [parsing, setParsing] = useState(false);
  const [addModal, setAddModal] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterModal, setFilterModal] = useState(false);

  const [recipes, setRecipes] = useState<RecipeSummary[]>([]);
  const [categories, setCategories] = useState<string[]>([]);

  // Filters — "pending" lives in the sheet, applied on confirm
  const [category, setCategory] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<RecipeDifficulty | null>(null);
  const [dietaryTag, setDietaryTag] = useState<string | null>(null);
  const [pendingCategory, setPendingCategory] = useState<string | null>(null);
  const [pendingDifficulty, setPendingDifficulty] = useState<RecipeDifficulty | null>(null);
  const [pendingDietary, setPendingDietary] = useState<string | null>(null);

  const [sort, setSort] = useState<Sort>('price');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const activeFilterCount = [category, difficulty, dietaryTag].filter(Boolean).length;

  useEffect(() => {
    AsyncStorage.getItem(CACHE_KEY).then(raw => {
      if (raw) {
        try {
          const cached = JSON.parse(raw);
          if (cached.recipes?.length) {
            setRecipes(cached.recipes);
            setCategories(cached.categories ?? []);
          }
        } catch {}
      }
    });
  }, []);

  const load = useCallback(async () => {
    try {
      const data = await getRecipes({
        category: category ?? undefined,
        difficulty: difficulty ?? undefined,
        dietaryTag: dietaryTag ?? undefined,
        chains: selectedStores,
        sort: sort === 'favorites' ? 'price' : sort,
      });
      setRecipes(data.recipes);
      setCategories(data.categories);
      if (!category && !difficulty && !dietaryTag && sort === 'price') {
        AsyncStorage.setItem(CACHE_KEY, JSON.stringify(data));
      }
    } catch {
      // keep cached
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [category, difficulty, dietaryTag, sort, selectedStores]);

  useEffect(() => { load(); }, [load]);

  async function handleParse() {
    if (!url.trim()) return;
    const urls = url.trim().split(/[\n\s]+/).filter(u => u.startsWith('http'));
    if (urls.length === 0) return;
    setParsing(true);
    try {
      if (urls.length === 1) {
        const data = await parseRecipe(urls[0]);
        setUrl('');
        setAddModal(false);
        await load();
        router.push(`/recipe/${data.recipe.id}`);
      } else {
        let ok = 0, fail = 0;
        for (const u of urls) {
          try { await parseRecipe(u); ok++; } catch { fail++; }
        }
        setUrl('');
        setAddModal(false);
        await load();
        Alert.alert('Import terminé', `${ok} recette(s) ajoutée(s)${fail > 0 ? `, ${fail} échouée(s)` : ''}.`);
      }
    } catch (e) {
      Alert.alert('Erreur', String(e));
    } finally {
      setParsing(false);
    }
  }

  function openFilterSheet() {
    setPendingCategory(category);
    setPendingDifficulty(difficulty);
    setPendingDietary(dietaryTag);
    setFilterModal(true);
  }

  function applyFilters() {
    setCategory(pendingCategory);
    setDifficulty(pendingDifficulty);
    setDietaryTag(pendingDietary);
    setFilterModal(false);
  }

  function resetFilters() {
    setPendingCategory(null);
    setPendingDifficulty(null);
    setPendingDietary(null);
  }

  const displayList = (() => {
    let list = recipes;
    if (sort === 'favorites') list = list.filter(r => isFavorite(r.id));
    if (searchQuery.trim()) list = list.filter(r => r.title.toLowerCase().includes(searchQuery.toLowerCase()));
    return list;
  })();

  const header = (
    <View style={styles.header}>
      {/* Search + filter row */}
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={17} color="#aaa" />
          <TextInput
            style={styles.searchInput}
            placeholder="Chercher une recette..."
            placeholderTextColor="#bbb"
            value={searchQuery}
            onChangeText={setSearchQuery}
            clearButtonMode="while-editing"
          />
        </View>
        <TouchableOpacity
          style={[styles.filterBtn, activeFilterCount > 0 && styles.filterBtnActive]}
          onPress={openFilterSheet}
        >
          <Ionicons name="options-outline" size={18} color={activeFilterCount > 0 ? '#fff' : '#555'} />
          {activeFilterCount > 0 && (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Sort strip */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.sortScroll}
      >
        {SORTS.map((s) => (
          <TouchableOpacity
            key={s.key}
            style={[styles.sortBtn, sort === s.key && styles.sortBtnActive]}
            onPress={() => setSort(s.key)}
          >
            <Ionicons
              name={s.icon as any}
              size={13}
              color={sort === s.key ? '#fff' : '#666'}
            />
            <Text style={[styles.sortText, sort === s.key && styles.sortTextActive]}>{s.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Active filter pills */}
      {activeFilterCount > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.activePills}>
          {category && (
            <TouchableOpacity style={styles.pill} onPress={() => setCategory(null)}>
              <Text style={styles.pillText}>{category}</Text>
              <Ionicons name="close" size={12} color="#1B5E20" />
            </TouchableOpacity>
          )}
          {difficulty && (
            <TouchableOpacity style={[styles.pill, { borderColor: DIFFICULTY_COLORS[difficulty] }]} onPress={() => setDifficulty(null)}>
              <Text style={[styles.pillText, { color: DIFFICULTY_COLORS[difficulty] }]}>{difficulty}</Text>
              <Ionicons name="close" size={12} color={DIFFICULTY_COLORS[difficulty]} />
            </TouchableOpacity>
          )}
          {dietaryTag && (
            <TouchableOpacity style={styles.pill} onPress={() => setDietaryTag(null)}>
              <Text style={styles.pillText}>
                {DIETARY_OPTIONS.find(d => d.key === dietaryTag)?.emoji} {DIETARY_OPTIONS.find(d => d.key === dietaryTag)?.label}
              </Text>
              <Ionicons name="close" size={12} color="#1B5E20" />
            </TouchableOpacity>
          )}
        </ScrollView>
      )}

      {/* Count */}
      {!loading && (
        <Text style={styles.countLabel}>
          {displayList.length} recette{displayList.length !== 1 ? 's' : ''}
        </Text>
      )}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: '#f5f5f5' }}>
      <FlatList
        data={displayList}
        keyExtractor={(r) => r.id}
        ListHeaderComponent={header}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        contentContainerStyle={{ paddingBottom: 80 }}
        ListEmptyComponent={
          loading
            ? <View style={{ paddingTop: 4 }}>{Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)}</View>
            : sort === 'favorites'
            ? <View style={styles.emptyBlock}>
                <Ionicons name="heart-outline" size={52} color="#ddd" style={{ alignSelf: 'center', marginTop: 32 }} />
                <Text style={styles.emptyTitle}>Aucun favori</Text>
                <Text style={styles.emptyText}>Appuie sur le cœur d'une recette pour la sauvegarder.</Text>
              </View>
            : searchQuery.trim()
            ? <View style={styles.emptyBlock}>
                <Ionicons name="search-outline" size={52} color="#ddd" style={{ alignSelf: 'center', marginTop: 32 }} />
                <Text style={styles.emptyTitle}>Aucun résultat</Text>
                <Text style={styles.emptyText}>Aucune recette pour « {searchQuery} ».</Text>
              </View>
            : <View style={styles.emptyBlock}>
                <Ionicons name="restaurant-outline" size={52} color="#ddd" style={{ alignSelf: 'center', marginTop: 32 }} />
                <Text style={styles.emptyTitle}>Aucune recette</Text>
                <Text style={styles.emptyText}>Colle une URL pour importer une recette.</Text>
                <Text style={styles.suggestTitle}>Idées pour commencer</Text>
                {SUGGESTED_RECIPES.map((s) => (
                  <TouchableOpacity key={s.url} style={styles.suggestCard} onPress={() => { setUrl(s.url); setAddModal(true); }}>
                    <Ionicons name="add-circle-outline" size={22} color="#2E7D32" />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.suggestName}>{s.name}</Text>
                      <Text style={styles.suggestSrc}>{s.source}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color="#ccc" />
                  </TouchableOpacity>
                ))}
              </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.75}
            onPress={() => router.push(`/recipe/${item.id}`)}
            onLongPress={() => {
              Alert.alert('Supprimer', `Supprimer « ${item.title} » ?`, [
                { text: 'Annuler', style: 'cancel' },
                {
                  text: 'Supprimer', style: 'destructive',
                  onPress: async () => {
                    try {
                      await deleteRecipe(item.id);
                      setRecipes(prev => prev.filter(r => r.id !== item.id));
                    } catch (e) { Alert.alert('Erreur', String(e)); }
                  },
                },
              ]);
            }}
          >
            {/* Image */}
            {item.imageUrl
              ? <Image source={{ uri: item.imageUrl }} style={styles.cardImg} />
              : <View style={[styles.cardImg, styles.cardImgEmpty]}>
                  <Ionicons name="restaurant" size={28} color="#ddd" />
                </View>
            }

            {/* Body */}
            <View style={styles.cardBody}>
              <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>

              {/* Badges row */}
              <View style={styles.cardBadges}>
                {item.category && (
                  <View style={styles.catBadge}>
                    <Text style={styles.catBadgeText}>{item.category}</Text>
                  </View>
                )}
                {item.difficulty && (
                  <View style={[styles.diffBadge, { backgroundColor: DIFFICULTY_COLORS[item.difficulty] + '22', borderColor: DIFFICULTY_COLORS[item.difficulty] + '55' }]}>
                    <Text style={[styles.diffBadgeText, { color: DIFFICULTY_COLORS[item.difficulty] }]}>
                      {item.difficulty}
                    </Text>
                  </View>
                )}
                {item.totalTimeMinutes != null && (
                  <View style={styles.timeBadge}>
                    <Ionicons name="time-outline" size={11} color="#888" />
                    <Text style={styles.timeText}>
                      {item.totalTimeMinutes >= 60
                        ? `${Math.floor(item.totalTimeMinutes / 60)}h${item.totalTimeMinutes % 60 > 0 ? String(item.totalTimeMinutes % 60).padStart(2, '0') : ''}`
                        : `${item.totalTimeMinutes} min`}
                    </Text>
                  </View>
                )}
              </View>

              {/* Dietary emoji row */}
              {item.dietaryTags?.length > 0 && (
                <Text style={styles.dietEmoji}>
                  {item.dietaryTags.map(t =>
                    t === 'vegetarien' ? '🥦' : t === 'vegetalien' ? '🌱' : t === 'halal' ? '☪️' : t === 'sans-gluten' ? '🌾' : t === 'sans-lactose' ? '🥛' : ''
                  ).join(' ')}
                </Text>
              )}

              {/* Price row */}
              <View style={styles.cardFooter}>
                {item.cheapestStore && (
                  <View style={[styles.storeBadge, { backgroundColor: STORE_COLORS[item.cheapestStore] }]}>
                    <Text style={styles.storeBadgeText}>{item.cheapestStore}</Text>
                  </View>
                )}
                {item.cheapestTotalCents != null ? (
                  <Text style={styles.cardPrice}>
                    {(item.cheapestTotalCents / 100).toFixed(2)} $
                    {item.servings > 1 && (
                      <Text style={styles.perPortion}>  {(item.cheapestTotalCents / 100 / item.servings).toFixed(2)} $/portion</Text>
                    )}
                  </Text>
                ) : (
                  <Text style={styles.noPriceText}>Prix non calculé</Text>
                )}
                {item.promoIngredientCount > 0 && (
                  <View style={styles.promoBadge}>
                    <Ionicons name="flame" size={11} color="#E65100" />
                    <Text style={styles.promoText}>{item.promoIngredientCount}</Text>
                  </View>
                )}
              </View>
            </View>

            {/* Favorite */}
            <TouchableOpacity onPress={() => toggleFavorite(item.id)} hitSlop={10} style={styles.favBtn}>
              <Ionicons
                name={isFavorite(item.id) ? 'heart' : 'heart-outline'}
                size={22}
                color={isFavorite(item.id) ? '#E53935' : '#ddd'}
              />
            </TouchableOpacity>
          </TouchableOpacity>
        )}
      />

      {/* FAB — add recipe */}
      <TouchableOpacity style={styles.fab} onPress={() => setAddModal(true)}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      {/* Add recipe modal */}
      <Modal visible={addModal} animationType="slide" transparent onRequestClose={() => setAddModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setAddModal(false)}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ width: '100%' }}
          >
            <Pressable style={styles.addSheet} onPress={() => {}}>
              <View style={styles.sheetHandle} />
              <Text style={styles.sheetTitle}>Importer une recette</Text>
              <Text style={styles.sheetSub}>Colle l'URL d'une recette en ligne</Text>

              <TextInput
                style={styles.urlInput}
                placeholder="https://www.ricardocuisine.com/..."
                placeholderTextColor="#bbb"
                value={url}
                onChangeText={setUrl}
                autoCapitalize="none"
                keyboardType="url"
                returnKeyType="go"
                onSubmitEditing={handleParse}
                autoFocus
                multiline
              />

              <TouchableOpacity
                style={[styles.importBtn, (!url.trim() || parsing) && styles.importBtnDisabled]}
                onPress={handleParse}
                disabled={!url.trim() || parsing}
              >
                {parsing
                  ? <><ActivityIndicator color="#fff" size="small" /><Text style={styles.importBtnText}>Import en cours...</Text></>
                  : <><Ionicons name="cloud-download-outline" size={18} color="#fff" /><Text style={styles.importBtnText}>Importer</Text></>
                }
              </TouchableOpacity>

              {SUGGESTED_RECIPES.length > 0 && (
                <>
                  <Text style={styles.suggestLabel}>Suggestions</Text>
                  {SUGGESTED_RECIPES.map((s) => (
                    <TouchableOpacity key={s.url} style={styles.suggestRow} onPress={() => setUrl(s.url)}>
                      <Ionicons name="link-outline" size={16} color="#999" />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.suggestRowName}>{s.name}</Text>
                        <Text style={styles.suggestRowSrc}>{s.source}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </>
              )}
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      {/* Filter bottom sheet */}
      <Modal visible={filterModal} animationType="slide" transparent onRequestClose={() => setFilterModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setFilterModal(false)}>
          <Pressable style={styles.filterSheet} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetTitleRow}>
              <Text style={styles.sheetTitle}>Filtres</Text>
              <TouchableOpacity onPress={resetFilters}>
                <Text style={styles.resetText}>Réinitialiser</Text>
              </TouchableOpacity>
            </View>

            {/* Category */}
            <Text style={styles.filterSectionLabel}>Catégorie</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChipsRow}>
              {[null, ...categories].map((c) => (
                <TouchableOpacity
                  key={c ?? 'all'}
                  style={[styles.filterChip, pendingCategory === c && styles.filterChipActive]}
                  onPress={() => setPendingCategory(c)}
                >
                  <Text style={[styles.filterChipText, pendingCategory === c && styles.filterChipTextActive]}>
                    {c ?? 'Toutes'}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Difficulty */}
            <Text style={styles.filterSectionLabel}>Niveau</Text>
            <View style={styles.filterChipsRow}>
              {([null, ...DIFFICULTIES] as Array<RecipeDifficulty | null>).map((d) => {
                const color = d ? DIFFICULTY_COLORS[d] : '#2E7D32';
                const active = pendingDifficulty === d;
                return (
                  <TouchableOpacity
                    key={d ?? 'all'}
                    style={[styles.filterChip, active && { backgroundColor: color, borderColor: color }]}
                    onPress={() => setPendingDifficulty(d)}
                  >
                    <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                      {d ? d.charAt(0).toUpperCase() + d.slice(1) : 'Tous'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Dietary */}
            <Text style={styles.filterSectionLabel}>Régime alimentaire</Text>
            <View style={styles.filterChipsWrap}>
              {DIETARY_OPTIONS.map(({ key, label, emoji }) => (
                <TouchableOpacity
                  key={key}
                  style={[styles.filterChip, pendingDietary === key && styles.filterChipActive]}
                  onPress={() => setPendingDietary(pendingDietary === key ? null : key)}
                >
                  <Text style={[styles.filterChipText, pendingDietary === key && styles.filterChipTextActive]}>
                    {emoji} {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={styles.applyBtn} onPress={applyFilters}>
              <Text style={styles.applyBtnText}>Appliquer les filtres</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  // Header
  header:          { paddingBottom: 4 },
  searchRow:       { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  searchBox:       { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: '#eee', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  searchInput:     { flex: 1, fontSize: 15, color: '#222' },
  filterBtn:       { width: 44, height: 44, borderRadius: 12, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#eee', position: 'relative', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  filterBtnActive: { backgroundColor: '#2E7D32', borderColor: '#2E7D32' },
  filterBadge:     { position: 'absolute', top: -4, right: -4, width: 16, height: 16, borderRadius: 8, backgroundColor: '#E53935', alignItems: 'center', justifyContent: 'center' },
  filterBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },

  sortScroll:      { paddingHorizontal: 16, gap: 6, paddingBottom: 8 },
  sortBtn:         { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: '#eee' },
  sortBtnActive:   { backgroundColor: '#2E7D32', borderColor: '#2E7D32' },
  sortText:        { fontSize: 13, color: '#666', fontWeight: '500' },
  sortTextActive:  { color: '#fff', fontWeight: '600' },

  activePills:     { paddingHorizontal: 16, gap: 6, paddingBottom: 8 },
  pill:            { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, backgroundColor: '#E8F5E9', borderWidth: 1, borderColor: '#2E7D32' },
  pillText:        { fontSize: 12, color: '#1B5E20', fontWeight: '600' },

  countLabel:      { fontSize: 12, color: '#aaa', paddingHorizontal: 16, paddingBottom: 6, fontWeight: '500' },

  // Cards
  card:            { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', marginHorizontal: 12, marginBottom: 10, borderRadius: 14, padding: 10, gap: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  cardImg:         { width: 80, height: 80, borderRadius: 10, backgroundColor: '#f0f0f0' },
  cardImgEmpty:    { alignItems: 'center', justifyContent: 'center' },
  cardBody:        { flex: 1, gap: 4 },
  cardTitle:       { fontSize: 15, fontWeight: '700', color: '#1a1a1a', lineHeight: 20 },

  cardBadges:      { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5 },
  catBadge:        { backgroundColor: '#E8F5E9', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  catBadgeText:    { fontSize: 10, color: '#2E7D32', fontWeight: '700' },
  diffBadge:       { borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1 },
  diffBadgeText:   { fontSize: 10, fontWeight: '700' },
  timeBadge:       { flexDirection: 'row', alignItems: 'center', gap: 2 },
  timeText:        { fontSize: 11, color: '#888' },

  dietEmoji:       { fontSize: 13 },

  cardFooter:      { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  storeBadge:      { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  storeBadgeText:  { color: '#fff', fontSize: 9, fontWeight: '800' },
  cardPrice:       { fontSize: 15, fontWeight: '800', color: '#1B5E20' },
  perPortion:      { fontSize: 11, fontWeight: '400', color: '#999' },
  noPriceText:     { fontSize: 12, color: '#bbb' },
  promoBadge:      { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: '#FFF3E0', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  promoText:       { fontSize: 11, color: '#E65100', fontWeight: '700' },

  favBtn:          { padding: 6 },

  // FAB
  fab:             { position: 'absolute', bottom: 20, right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: '#2E7D32', alignItems: 'center', justifyContent: 'center', shadowColor: '#2E7D32', shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 8 },

  // Modals
  modalOverlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  addSheet:        { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, gap: 12 },
  filterSheet:     { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, gap: 8, maxHeight: '85%' },
  sheetHandle:     { width: 36, height: 4, borderRadius: 2, backgroundColor: '#e0e0e0', alignSelf: 'center', marginBottom: 8 },
  sheetTitleRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  sheetTitle:      { fontSize: 18, fontWeight: '700', color: '#1a1a1a' },
  sheetSub:        { fontSize: 13, color: '#999', marginTop: -4 },
  resetText:       { fontSize: 13, color: '#E53935', fontWeight: '600' },

  urlInput:        { borderWidth: 1.5, borderColor: '#e0e0e0', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: '#222', backgroundColor: '#fafafa', minHeight: 48 },
  importBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#2E7D32', borderRadius: 12, paddingVertical: 14 },
  importBtnDisabled: { backgroundColor: '#a5d6a7' },
  importBtnText:   { color: '#fff', fontWeight: '700', fontSize: 15 },

  suggestLabel:    { fontSize: 13, fontWeight: '700', color: '#999', marginTop: 4 },
  suggestRow:      { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#f5f5f5' },
  suggestRowName:  { fontSize: 14, fontWeight: '600', color: '#333' },
  suggestRowSrc:   { fontSize: 11, color: '#bbb' },

  filterSectionLabel: { fontSize: 13, fontWeight: '700', color: '#555', marginTop: 10, marginBottom: 4 },
  filterChipsRow:  { flexDirection: 'row', gap: 6, flexWrap: 'nowrap' },
  filterChipsWrap: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  filterChip:      { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: '#f5f5f5', borderWidth: 1, borderColor: '#eee' },
  filterChipActive:{ backgroundColor: '#2E7D32', borderColor: '#2E7D32' },
  filterChipText:  { fontSize: 13, color: '#555', fontWeight: '500' },
  filterChipTextActive: { color: '#fff', fontWeight: '700' },

  applyBtn:        { backgroundColor: '#2E7D32', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 12 },
  applyBtnText:    { color: '#fff', fontWeight: '700', fontSize: 15 },

  // Empty states
  emptyBlock:      { paddingHorizontal: 24, paddingTop: 12 },
  emptyTitle:      { fontSize: 18, fontWeight: '700', color: '#ccc', textAlign: 'center', marginTop: 12 },
  emptyText:       { fontSize: 14, color: '#bbb', textAlign: 'center', marginTop: 8, lineHeight: 20 },
  suggestTitle:    { fontSize: 15, fontWeight: '700', color: '#555', marginTop: 28, marginBottom: 12 },
  suggestCard:     { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#f0f0f0', shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 4, elevation: 1 },
  suggestName:     { fontSize: 14, fontWeight: '600', color: '#333' },
  suggestSrc:      { fontSize: 11, color: '#bbb', marginTop: 2 },
});
