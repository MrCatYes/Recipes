import { useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { PriceWithStore, RecipeWithCost } from '@epicerie/shared-types';
import { parseRecipe } from '../lib/api';
import { useStores, type StoreChain } from '../lib/store-context';

const STORE_COLORS: Record<StoreChain, string> = {
  Maxi:    '#E53935',
  IGA:     '#1565C0',
  Metro:   '#F57C00',
  Walmart: '#0071CE',
  Costco:  '#E53935',
};

export default function RecipesScreen() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [recipe, setRecipe] = useState<RecipeWithCost | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [ownedIds, setOwnedIds] = useState<Set<string>>(new Set());
  const { selectedStores } = useStores();

  async function handleParse() {
    if (!url.trim()) return;
    setLoading(true);
    setRecipe(null);
    setWarnings([]);
    setOwnedIds(new Set());
    try {
      const data = await parseRecipe(url.trim());
      setRecipe(data.recipe);
      setWarnings(data.warnings);
    } catch (e) {
      Alert.alert('Erreur', String(e));
    } finally {
      setLoading(false);
    }
  }

  function toggleOwned(id: string) {
    setOwnedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // Per-store totals (prorata + package), excluding owned ingredients
  const storeSummaries = useMemo(() => {
    if (!recipe) return [];
    const prorataByChain = new Map<string, number>();
    const packageByChain = new Map<string, number>();

    for (const ing of recipe.ingredients) {
      if (ownedIds.has(ing.id)) continue;
      for (const p of ing.costByStore) {
        if (!selectedStores.includes(p.chain as StoreChain)) continue;
        prorataByChain.set(p.chain, (prorataByChain.get(p.chain) ?? 0) + p.priceCents);
        packageByChain.set(p.chain, (packageByChain.get(p.chain) ?? 0) + p.packagePriceCents);
      }
    }

    return Array.from(prorataByChain.entries())
      .map(([chain, prorata]) => ({
        chain,
        prorataTotal: prorata,
        packageTotal: packageByChain.get(chain) ?? prorata,
      }))
      .sort((a, b) => a.prorataTotal - b.prorataTotal);
  }, [recipe, ownedIds, selectedStores]);

  const best = storeSummaries[0];

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
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
        <TouchableOpacity style={styles.button} onPress={handleParse} disabled={loading}>
          <Text style={styles.buttonText}>Calculer</Text>
        </TouchableOpacity>
      </View>

      {loading && (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color="#2E7D32" />
          <Text style={styles.loaderText}>Analyse en cours...</Text>
        </View>
      )}

      {warnings.length > 0 && (
        <View style={styles.warningBox}>
          {warnings.map((w, i) => (
            <Text key={i} style={styles.warningText}>⚠ {w}</Text>
          ))}
        </View>
      )}

      {recipe && (
        <View style={styles.recipeCard}>
          <Text style={styles.recipeTitle}>{recipe.title}</Text>
          <Text style={styles.servings}>{recipe.servings} portions</Text>

          {/* Store totals comparison */}
          {storeSummaries.length > 0 && (
            <View style={styles.storeCompare}>
              {storeSummaries.map((s, idx) => (
                <View key={s.chain} style={[styles.storeTotal, idx === 0 && styles.storeTotalBest]}>
                  <View style={[styles.storeTag, { backgroundColor: STORE_COLORS[s.chain as StoreChain] }]}>
                    <Text style={styles.storeTagText}>{s.chain}</Text>
                  </View>
                  <View style={styles.storeTotalPrices}>
                    <Text style={[styles.storeTotalProrata, idx === 0 && styles.storeTotalBestText]}>
                      {formatCents(s.prorataTotal)}
                      <Text style={styles.prorataLabel}> prorata</Text>
                    </Text>
                    <Text style={styles.storeTotalPackage}>
                      {formatCents(s.packageTotal)} achats
                    </Text>
                  </View>
                  {idx === 0 && (
                    <View style={styles.bestBadge}>
                      <Text style={styles.bestBadgeText}>✓ meilleur</Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          )}

          {best && (
            <Text style={styles.perServing}>
              {formatCents(Math.round(best.prorataTotal / recipe.servings))} / portion chez {best.chain}
            </Text>
          )}

          {ownedIds.size > 0 && (
            <TouchableOpacity onPress={() => setOwnedIds(new Set())} style={styles.clearOwned}>
              <Text style={styles.clearOwnedText}>✕ Retirer {ownedIds.size} ingrédient(s) possédé(s)</Text>
            </TouchableOpacity>
          )}

          <Text style={styles.sectionTitle}>Ingrédients</Text>
          <Text style={styles.sectionHint}>Appuie sur ✓ si tu possèdes déjà l'ingrédient</Text>

          {recipe.ingredients.map((ing) => {
            const owned = ownedIds.has(ing.id);
            const filteredPrices = ing.costByStore.filter(
              p => selectedStores.includes(p.chain as StoreChain)
            );
            return (
              <View key={ing.id} style={[styles.ingredientRow, owned && styles.ingredientOwned]}>
                {/* Owned toggle */}
                <TouchableOpacity onPress={() => toggleOwned(ing.id)} style={styles.ownedToggle}>
                  <Ionicons
                    name={owned ? 'checkmark-circle' : 'ellipse-outline'}
                    size={22}
                    color={owned ? '#2E7D32' : '#ccc'}
                  />
                </TouchableOpacity>

                <View style={styles.ingredientLeft}>
                  <Text style={[styles.ingredientText, owned && styles.ingredientTextOwned]}>
                    {ing.rawText}
                  </Text>
                  {ing.product && (
                    <Text style={styles.ingredientMatch}>{ing.product.name}</Text>
                  )}
                  {!owned && filteredPrices.length > 0 && (
                    <View style={styles.storePrices}>
                      {filteredPrices.map((p, i) => (
                        <StorePriceChip key={`${p.chain}-${i}`} price={p} />
                      ))}
                    </View>
                  )}
                  {owned && (
                    <Text style={styles.ownedLabel}>Déjà possédé — exclu du calcul</Text>
                  )}
                </View>

                {!owned && filteredPrices.length > 0 ? (
                  <Text style={styles.cheapestPrice}>
                    {formatCents(filteredPrices[0].priceCents)}
                  </Text>
                ) : !owned ? (
                  <Text style={styles.ingredientNoMatch}>—</Text>
                ) : null}
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

function StorePriceChip({ price }: { price: PriceWithStore }) {
  const color = STORE_COLORS[price.chain as StoreChain] ?? '#999';
  return (
    <View style={styles.priceChipRow}>
      <View style={[styles.priceChipDot, { backgroundColor: color }]} />
      <Text style={styles.priceChipStore}>{price.chain}</Text>
      <Text style={[
        styles.priceChipValue,
        price.isPromo ? styles.pricePromo : styles.priceRegular,
      ]}>
        {formatCents(price.priceCents)}
        {price.isPromo && ' 🔥'}
      </Text>
      <Text style={styles.priceChipPackage}>
        ({formatCents(price.packagePriceCents)} / {price.packageSize}{price.packageUnit})
      </Text>
    </View>
  );
}

function formatCents(cents: number) {
  return `${(cents / 100).toFixed(2)} $`;
}

const styles = StyleSheet.create({
  container:            { flex: 1, backgroundColor: '#f5f5f5' },
  searchRow:            { flexDirection: 'row', padding: 16, gap: 8 },
  input:                { flex: 1, borderWidth: 1, borderColor: '#ccc', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#fff', fontSize: 14 },
  button:               { backgroundColor: '#2E7D32', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10, justifyContent: 'center' },
  buttonText:           { color: '#fff', fontWeight: '600' },
  loaderContainer:      { alignItems: 'center', marginTop: 32, gap: 12 },
  loaderText:           { color: '#666', fontSize: 14 },
  warningBox:           { marginHorizontal: 16, marginBottom: 8, backgroundColor: '#FFF8E1', borderRadius: 8, padding: 12, gap: 4 },
  warningText:          { color: '#F57F17', fontSize: 13 },
  recipeCard:           { margin: 16, backgroundColor: '#fff', borderRadius: 12, padding: 16 },
  recipeTitle:          { fontSize: 20, fontWeight: '700', marginBottom: 4 },
  servings:             { color: '#666', marginBottom: 12 },

  // Store comparison
  storeCompare:         { marginBottom: 8, gap: 6 },
  storeTotal:           { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 8, backgroundColor: '#f9f9f9' },
  storeTotalBest:       { backgroundColor: '#E8F5E9' },
  storeTag:             { borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3 },
  storeTagText:         { color: '#fff', fontSize: 11, fontWeight: '700' },
  storeTotalPrices:     { flex: 1 },
  storeTotalProrata:    { fontSize: 15, color: '#555', fontWeight: '600' },
  storeTotalBestText:   { color: '#1B5E20', fontSize: 16 },
  prorataLabel:         { fontSize: 11, fontWeight: '400', color: '#888' },
  storeTotalPackage:    { fontSize: 12, color: '#999', marginTop: 1 },
  bestBadge:            { backgroundColor: '#2E7D32', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  bestBadgeText:        { color: '#fff', fontSize: 10, fontWeight: '700' },
  perServing:           { fontSize: 12, color: '#666', marginBottom: 12 },

  clearOwned:           { backgroundColor: '#FFF3E0', borderRadius: 8, padding: 8, marginBottom: 8, alignItems: 'center' },
  clearOwnedText:       { color: '#E65100', fontSize: 13, fontWeight: '600' },

  sectionTitle:         { fontSize: 16, fontWeight: '600', marginBottom: 2 },
  sectionHint:          { fontSize: 11, color: '#aaa', marginBottom: 10 },

  ingredientRow:        { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#eee', flexDirection: 'row', alignItems: 'flex-start' },
  ingredientOwned:      { opacity: 0.45 },
  ownedToggle:          { marginRight: 8, marginTop: 1 },
  ingredientLeft:       { flex: 1, marginRight: 8 },
  ingredientText:       { fontSize: 14 },
  ingredientTextOwned:  { textDecorationLine: 'line-through', color: '#999' },
  ingredientMatch:      { fontSize: 11, color: '#999', marginTop: 1 },
  ownedLabel:           { fontSize: 11, color: '#2E7D32', marginTop: 3, fontStyle: 'italic' },

  // Per-store prices
  storePrices:          { marginTop: 6, gap: 2 },
  priceChipRow:         { flexDirection: 'row', alignItems: 'center', gap: 4 },
  priceChipDot:         { width: 8, height: 8, borderRadius: 4 },
  priceChipStore:       { fontSize: 11, color: '#666', width: 44 },
  priceChipValue:       { fontSize: 12, fontWeight: '600' },
  pricePromo:           { color: '#2E7D32' },
  priceRegular:         { color: '#C62828' },
  priceChipPackage:     { fontSize: 10, color: '#999', marginLeft: 4 },

  cheapestPrice:        { fontSize: 14, color: '#2E7D32', fontWeight: '700', marginTop: 2 },
  ingredientNoMatch:    { fontSize: 14, color: '#ccc' },
});
