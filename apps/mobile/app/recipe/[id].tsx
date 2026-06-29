import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Image, ActivityIndicator,
  TouchableOpacity, Linking, Alert, Share,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { RecipeWithCost } from '@epicerie/shared-types';
import { getRecipeCost, getProductSubstitutions, createShoppingList, addRecipeToList, deleteRecipe } from '../../lib/api';
import { useStores, type StoreChain } from '../../lib/store-context';
import { useFavorites } from '../../lib/favorites-context';

const STORE_COLORS: Record<StoreChain, string> = {
  Maxi: '#E53935', IGA: '#1565C0', Metro: '#F57C00', SuperC: '#C8102E', Walmart: '#0071CE', Costco: '#003DA5',
};

const DIFFICULTY_COLORS: Record<string, string> = {
  'débutant': '#2E7D32', 'confirmé': '#EF6C00', 'expert': '#C62828',
};

export default function RecipeDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { selectedStores } = useStores();
  const { isFavorite, toggleFavorite } = useFavorites();
  const [recipe, setRecipe] = useState<RecipeWithCost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [servingsMultiplier, setServingsMultiplier] = useState(1);
  const [addingToList, setAddingToList] = useState(false);

  async function handleShare() {
    if (!recipe) return;
    const cost = recipe.ingredients.reduce((sum, i) => {
      const cheapest = i.costByStore.sort((a, b) => a.priceCents - b.priceCents)[0];
      return sum + (cheapest?.priceCents ?? 0);
    }, 0);
    const msg = [
      `🍽 ${recipe.title}`,
      `👤 ${recipe.servings} portions`,
      cost > 0 ? `💰 ~${(cost / 100).toFixed(2)} $` : '',
      recipe.sourceUrl ? `\n🔗 ${recipe.sourceUrl}` : '',
      '\nPartagé via Épicerie',
    ].filter(Boolean).join('\n');
    try {
      await Share.share({ message: msg });
    } catch { /* cancelled */ }
  }

  async function handleAddToList() {
    if (!recipe) return;
    setAddingToList(true);
    try {
      const list = await createShoppingList(recipe.title);
      const targetServings = Math.round(recipe.servings * servingsMultiplier);
      const { added } = await addRecipeToList(list.id, recipe.id, targetServings);
      Alert.alert('Liste créée', `${added} ingrédient${added !== 1 ? 's' : ''} ajouté${added !== 1 ? 's' : ''} (${targetServings} portions).`);
    } catch (e) {
      Alert.alert('Erreur', String(e));
    } finally {
      setAddingToList(false);
    }
  }

  const [substitutions, setSubstitutions] = useState<
    Array<{ ingredientId: string; originalName: string; substituteName: string; savingsCents: number; reason: string }>
  >([]);

  useEffect(() => {
    if (!id) return;
    getRecipeCost(id)
      .then((r) => {
        setRecipe(r);
        // Fetch substitutions for matched ingredients
        const matched = r.ingredients.filter(i => i.productId);
        Promise.allSettled(
          matched.map(i =>
            getProductSubstitutions(i.productId!, selectedStores).then(subs =>
              subs
                .filter(s => s.savingsCents > 0)
                .map(s => ({ ingredientId: i.id, ...s }))
            )
          )
        ).then(results => {
          const all = results
            .filter((r): r is PromiseFulfilledResult<typeof substitutions> => r.status === 'fulfilled')
            .flatMap(r => r.value);
          setSubstitutions(all);
        });
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [id]);

  const adjustedServings = recipe ? Math.round(recipe.servings * servingsMultiplier) : 0;

  // Per-store totals: prorata (cost of amounts used) + package (buy full formats)
  const summaries = (() => {
    if (!recipe) return [];
    const prorata = new Map<string, number>();
    const pkg = new Map<string, number>();
    for (const ing of recipe.ingredients) {
      for (const p of ing.costByStore) {
        if (!selectedStores.includes(p.chain as StoreChain)) continue;
        prorata.set(p.chain, (prorata.get(p.chain) ?? 0) + Math.round(p.priceCents * servingsMultiplier));
        pkg.set(p.chain, (pkg.get(p.chain) ?? 0) + Math.round(p.packagePriceCents * servingsMultiplier));
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
        <TouchableOpacity onPress={() => id && toggleFavorite(id)} style={styles.back}>
          <Ionicons name={id && isFavorite(id) ? 'heart' : 'heart-outline'} size={24} color={id && isFavorite(id) ? '#FF8A80' : '#fff'} />
        </TouchableOpacity>
        <TouchableOpacity onPress={handleShare} style={styles.back}>
          <Ionicons name="share-outline" size={22} color="#fff" />
        </TouchableOpacity>
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
            {recipe.difficulty && (
              <View style={[styles.diffBadge, { backgroundColor: DIFFICULTY_COLORS[recipe.difficulty] }]}>
                <Text style={styles.diffBadgeText}>{recipe.difficulty}</Text>
              </View>
            )}
            {recipe.prepTimeMinutes != null && <Text style={styles.metaText}>prép {recipe.prepTimeMinutes} min</Text>}
            {recipe.cookTimeMinutes != null && <Text style={styles.metaText}>· cuisson {recipe.cookTimeMinutes} min</Text>}
          </View>

          {/* Servings adjuster */}
          <View style={styles.servingsRow}>
            <Text style={styles.servingsLabel}>Portions :</Text>
            <TouchableOpacity
              style={styles.servingsBtn}
              onPress={() => setServingsMultiplier(m => Math.max(0.5, m - 0.5))}
            >
              <Ionicons name="remove" size={18} color="#2E7D32" />
            </TouchableOpacity>
            <Text style={styles.servingsValue}>
              {Math.round(recipe.servings * servingsMultiplier)}
            </Text>
            <TouchableOpacity
              style={styles.servingsBtn}
              onPress={() => setServingsMultiplier(m => m + 0.5)}
            >
              <Ionicons name="add" size={18} color="#2E7D32" />
            </TouchableOpacity>
          </View>

          {/* Hero: total recipe cost */}
          {best && (
            <View style={styles.hero}>
              <Text style={styles.heroLabel}>Coût total de la recette</Text>
              <Text style={styles.heroTotal}>{formatCents(best.prorata)}</Text>
              <Text style={styles.heroSub}>
                {formatCents(Math.round(best.prorata / adjustedServings))} / portion · meilleur prix chez {best.chain}
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
            const prices = ing.costByStore
              .filter(p => selectedStores.includes(p.chain as StoreChain))
              .sort((a, b) => a.priceCents - b.priceCents);
            const cheapest = prices[0];
            const priceDiff = prices.length >= 2 ? prices[prices.length - 1].priceCents - prices[0].priceCents : 0;
            return (
              <View key={ing.id} style={styles.ingRow}>
                <View style={styles.ingLeft}>
                  <Text style={styles.ingText}>{ing.rawText}</Text>
                  {cheapest && prices.length > 1 && priceDiff > 10 && (
                    <Text style={styles.ingBestChain}>
                      Meilleur: {cheapest.chain} ({formatCents(cheapest.priceCents)})
                    </Text>
                  )}
                </View>
                {cheapest
                  ? <View style={styles.ingPriceWrap}>
                      <Text style={styles.ingPrice}>{formatCents(Math.round(cheapest.priceCents * servingsMultiplier))}</Text>
                      {cheapest.isPromo && <Text style={styles.ingPromo}>PROMO</Text>}
                    </View>
                  : <Text style={styles.ingNo}>—</Text>}
              </View>
            );
          })}

          {/* Substitution suggestions */}
          {substitutions.length > 0 && (
            <>
              <Text style={styles.section}>💡 Substituts moins chers</Text>
              {substitutions.map((s, i) => (
                <View key={i} style={styles.subRow}>
                  <View style={styles.subInfo}>
                    <Text style={styles.subOriginal}>{s.originalName}</Text>
                    <Ionicons name="arrow-forward" size={14} color="#999" />
                    <Text style={styles.subReplace}>{s.substituteName}</Text>
                  </View>
                  <View style={styles.subSaving}>
                    <Text style={styles.subSavingText}>-{formatCents(s.savingsCents)}</Text>
                  </View>
                </View>
              ))}
            </>
          )}

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

          <TouchableOpacity
            style={styles.listBtn}
            onPress={handleAddToList}
            disabled={addingToList}
          >
            {addingToList
              ? <ActivityIndicator color="#2E7D32" />
              : <>
                  <Ionicons name="cart-outline" size={18} color="#2E7D32" />
                  <Text style={styles.listBtnText}>Ajouter à la liste d'épicerie</Text>
                </>}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={() => {
              Alert.alert('Supprimer', `Supprimer "${recipe.title}" ?`, [
                { text: 'Annuler', style: 'cancel' },
                { text: 'Supprimer', style: 'destructive', onPress: async () => {
                  try {
                    await deleteRecipe(recipe.id);
                    router.back();
                  } catch (e) {
                    Alert.alert('Erreur', String(e));
                  }
                }},
              ]);
            }}
          >
            <Ionicons name="trash-outline" size={18} color="#C62828" />
            <Text style={styles.deleteBtnText}>Supprimer cette recette</Text>
          </TouchableOpacity>
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
  headerTitle:   { flex: 1, color: '#fff', fontSize: 18, fontWeight: '600' },
  error:         { color: '#C62828', padding: 16 },
  scroll:        { paddingBottom: 40 },
  image:         { width: '100%', height: 200 },
  title:         { fontSize: 22, fontWeight: '700', paddingHorizontal: 16, paddingTop: 14 },
  meta:          { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, paddingHorizontal: 16, marginTop: 4 },
  metaText:      { color: '#666', fontSize: 13 },
  diffBadge:     { borderRadius: 4, paddingHorizontal: 7, paddingVertical: 2 },
  diffBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  servingsRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 10 },
  servingsLabel: { fontSize: 14, fontWeight: '600', color: '#333' },
  servingsBtn:   { width: 32, height: 32, borderRadius: 16, borderWidth: 1.5, borderColor: '#2E7D32', alignItems: 'center', justifyContent: 'center' },
  servingsValue: { fontSize: 20, fontWeight: '700', color: '#2E7D32', minWidth: 30, textAlign: 'center' },
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
  ingLeft:       { flex: 1, marginRight: 8 },
  ingText:       { fontSize: 14 },
  ingBestChain:  { fontSize: 10, color: '#2E7D32', marginTop: 1 },
  ingPriceWrap:  { alignItems: 'flex-end', gap: 1 },
  ingPrice:      { fontSize: 14, color: '#2E7D32', fontWeight: '600' },
  ingPromo:      { fontSize: 8, color: '#FF6F00', fontWeight: '700' },
  ingNo:         { fontSize: 14, color: '#ccc' },
  stepRow:       { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 6, gap: 10 },
  stepNum:       { width: 22, height: 22, borderRadius: 11, backgroundColor: '#2E7D32', color: '#fff', textAlign: 'center', lineHeight: 22, fontSize: 12, fontWeight: '700', overflow: 'hidden' },
  stepText:      { flex: 1, fontSize: 14, lineHeight: 20, color: '#333' },
  subRow:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#FFF8E1', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#FFE082' },
  subInfo:       { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  subOriginal:   { fontSize: 13, color: '#999', textDecorationLine: 'line-through' },
  subReplace:    { fontSize: 13, color: '#E65100', fontWeight: '600' },
  subSaving:     { backgroundColor: '#2E7D32', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  subSavingText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  sourceBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#2E7D32', marginHorizontal: 16, marginTop: 16, borderRadius: 10, paddingVertical: 14 },
  sourceBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  listBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#E8F5E9', marginHorizontal: 16, marginTop: 8, marginBottom: 16, borderRadius: 10, paddingVertical: 14, borderWidth: 1.5, borderColor: '#2E7D32' },
  listBtnText:   { color: '#2E7D32', fontWeight: '600', fontSize: 15 },
  deleteBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, marginTop: 8, marginBottom: 20 },
  deleteBtnText: { color: '#C62828', fontWeight: '500', fontSize: 14 },
});
