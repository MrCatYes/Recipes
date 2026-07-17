import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Image, ActivityIndicator,
  TouchableOpacity, Linking, Alert, Share, Modal, Pressable,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { RecipeWithCost } from '@epicerie/shared-types';
import { getRecipeCost, getRecipeSubstitutions, createShoppingList, addRecipeToList, getShoppingLists, deleteRecipe, rematchRecipe } from '../../lib/api';
import { useStores, type StoreChain } from '../../lib/store-context';
import { useFavorites } from '../../lib/favorites-context';
import { getFoodEmoji } from '../../lib/food-emoji';
import { getMacros, computeIngredientMacros, type Macros } from '../../lib/nutrition';

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
  const [pantry, setPantry] = useState<Set<string>>(new Set());
  const [macroModal, setMacroModal] = useState<{ name: string; macros: Macros; perRecipe: Macros | null } | null>(null);

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
    const targetServings = Math.round(recipe.servings * servingsMultiplier);

    let lists: Array<{ id: string; name: string }> = [];
    try {
      const res = await getShoppingLists();
      lists = res.lists;
    } catch { /* ignore, fall through to create */ }

    const doAdd = async (listId: string) => {
      setAddingToList(true);
      try {
        const { added } = await addRecipeToList(listId, recipe.id, targetServings);
        Alert.alert('Ajouté', `${added} ingrédient${added !== 1 ? 's' : ''} ajouté${added !== 1 ? 's' : ''} (${targetServings} portions).`);
      } catch (e) {
        Alert.alert('Erreur', String(e));
      } finally {
        setAddingToList(false);
      }
    };

    if (lists.length === 0) {
      const list = await createShoppingList(recipe.title).catch(() => null);
      if (list) doAdd(list.id);
      return;
    }

    const options = lists.map(l => l.name);
    options.push('+ Nouvelle liste');
    Alert.alert('Ajouter à une liste', 'Choisir une liste d\'achats :', options.map((o, i) => ({
      text: o,
      onPress: async () => {
        if (i === options.length - 1) {
          const list = await createShoppingList(recipe.title).catch(() => null);
          if (list) doAdd(list.id);
        } else {
          doAdd(lists[i].id);
        }
      },
    })));
  }

  const [substitutions, setSubstitutions] = useState<
    Array<{ ingredientId: string; originalName: string; substituteName: string; savingsCents: number; reason: string }>
  >([]);

  useEffect(() => {
    if (!id) return;
    getRecipeCost(id)
      .then((r) => {
        setRecipe(r);
        // Single batched request for all substitutions (was N requests, one per ingredient)
        getRecipeSubstitutions(id, selectedStores)
          .then(res => setSubstitutions(res.substitutions))
          .catch(() => { /* substitutions are optional */ });
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [id]);

  const adjustedServings = recipe ? Math.round(recipe.servings * servingsMultiplier) : 0;

  const recipeMacros = (() => {
    if (!recipe) return null;
    let totals: Macros = { kcal: 0, protein: 0, fat: 0, carbs: 0, fiber: 0, sugar: 0 };
    let hasAny = false;
    for (const ing of recipe.ingredients) {
      if (!ing.product?.name) continue;
      const m = computeIngredientMacros(ing.product.name, ing.parsedQuantity, ing.parsedUnit);
      if (!m) continue;
      hasAny = true;
      totals = {
        kcal:    totals.kcal    + Math.round(m.kcal    * servingsMultiplier),
        protein: totals.protein + Math.round(m.protein * servingsMultiplier * 10) / 10,
        fat:     totals.fat     + Math.round(m.fat     * servingsMultiplier * 10) / 10,
        carbs:   totals.carbs   + Math.round(m.carbs   * servingsMultiplier * 10) / 10,
        fiber:   totals.fiber   + Math.round(m.fiber   * servingsMultiplier * 10) / 10,
        sugar:   totals.sugar   + Math.round(m.sugar   * servingsMultiplier * 10) / 10,
      };
    }
    return hasAny ? totals : null;
  })();

  // Per-store totals: prorata (cost of amounts used) + package (buy full formats)
  // Pantry items excluded — user already has them
  const summaries = (() => {
    if (!recipe) return [];
    const prorata = new Map<string, number>();
    const pkg = new Map<string, number>();
    for (const ing of recipe.ingredients) {
      if (pantry.has(ing.id)) continue;
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

  const pantrySavings = (() => {
    if (!recipe || pantry.size === 0) return 0;
    let total = 0;
    for (const ing of recipe.ingredients) {
      if (!pantry.has(ing.id)) continue;
      const prices = ing.costByStore
        .filter(p => selectedStores.includes(p.chain as StoreChain))
        .sort((a, b) => a.priceCents - b.priceCents);
      if (prices[0]) total += Math.round(prices[0].priceCents * servingsMultiplier);
    }
    return total;
  })();
  const best = summaries[0];

  return (
    <View style={styles.container}>
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#2E7D32" />
        </View>
      )}
      {error && <Text style={styles.error}>{error}</Text>}

      {/* Macro detail modal */}
      <Modal visible={!!macroModal} transparent animationType="slide" onRequestClose={() => setMacroModal(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setMacroModal(null)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>{macroModal?.name}</Text>
            <Text style={styles.modalSub}>Valeurs pour 100 g</Text>
            {macroModal && (
              <View style={styles.modalGrid}>
                {([
                  ['Calories',    macroModal.macros.kcal,    'kcal'],
                  ['Protéines',   macroModal.macros.protein, 'g'],
                  ['Lipides',     macroModal.macros.fat,     'g'],
                  ['Glucides',    macroModal.macros.carbs,   'g'],
                  ['Fibres',      macroModal.macros.fiber,   'g'],
                  ['Sucres',      macroModal.macros.sugar,   'g'],
                ] as [string, number, string][]).map(([label, val, unit]) => (
                  <View key={label} style={styles.modalRow}>
                    <Text style={styles.modalLabel}>{label}</Text>
                    <Text style={styles.modalValue}>{val} {unit}</Text>
                  </View>
                ))}
              </View>
            )}
            {macroModal?.perRecipe && (
              <>
                <Text style={[styles.modalSub, { marginTop: 12 }]}>Dans cette recette (quantité utilisée)</Text>
                <View style={styles.modalGrid}>
                  {([
                    ['Calories',  macroModal.perRecipe.kcal,    'kcal'],
                    ['Protéines', macroModal.perRecipe.protein, 'g'],
                    ['Lipides',   macroModal.perRecipe.fat,     'g'],
                    ['Glucides',  macroModal.perRecipe.carbs,   'g'],
                  ] as [string, number, string][]).map(([label, val, unit]) => (
                    <View key={label} style={styles.modalRow}>
                      <Text style={styles.modalLabel}>{label}</Text>
                      <Text style={styles.modalValue}>{val} {unit}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}
            <TouchableOpacity style={styles.modalClose} onPress={() => setMacroModal(null)}>
              <Text style={styles.modalCloseText}>Fermer</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {recipe && (
        <ScrollView contentContainerStyle={styles.scroll}>
          {/* Hero image with floating controls */}
          <View style={styles.heroWrap}>
            {recipe.imageUrl
              ? <Image source={{ uri: recipe.imageUrl }} style={styles.image} resizeMode="cover" />
              : <View style={[styles.image, styles.imagePlaceholder]}>
                  <Ionicons name="restaurant" size={64} color="#ddd" />
                </View>
            }
            {/* Dark gradient overlay at top for button legibility */}
            <View style={styles.heroOverlayTop} />
            {/* Floating action row */}
            <View style={styles.heroActions}>
              <TouchableOpacity style={styles.heroBtn} onPress={() => router.back()}>
                <Ionicons name="chevron-back" size={22} color="#fff" />
              </TouchableOpacity>
              <View style={styles.heroActionsRight}>
                <TouchableOpacity style={styles.heroBtn} onPress={() => id && toggleFavorite(id)}>
                  <Ionicons name={id && isFavorite(id) ? 'heart' : 'heart-outline'} size={20} color={id && isFavorite(id) ? '#FF8A80' : '#fff'} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.heroBtn} onPress={handleShare}>
                  <Ionicons name="share-outline" size={20} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.heroBtn}
                  onPress={async () => {
                    if (!id) return;
                    try {
                      const result = await rematchRecipe(id);
                      setRecipe(result.recipe);
                      if (result.updated > 0) {
                        Alert.alert('Mis à jour', `${result.updated} ingrédient(s) nouvellement identifié(s).`);
                      } else {
                        Alert.alert('À jour', 'Tous les ingrédients sont déjà identifiés au mieux.');
                      }
                    } catch (e) { Alert.alert('Erreur', String(e)); }
                  }}
                >
                  <Ionicons name="refresh-outline" size={20} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <Text style={styles.title}>{recipe.title}</Text>
          <View style={styles.meta}>
            {recipe.category && (
              <View style={styles.catBadge}>
                <Text style={styles.catBadgeText}>{recipe.category}</Text>
              </View>
            )}
            {recipe.difficulty && (
              <View style={[styles.diffBadge, { backgroundColor: DIFFICULTY_COLORS[recipe.difficulty] }]}>
                <Text style={styles.diffBadgeText}>{recipe.difficulty}</Text>
              </View>
            )}
            {recipe.prepTimeMinutes != null && (
              <View style={styles.timePill}>
                <Ionicons name="timer-outline" size={12} color="#555" />
                <Text style={styles.metaText}>{recipe.prepTimeMinutes} min</Text>
              </View>
            )}
            {recipe.cookTimeMinutes != null && (
              <View style={styles.timePill}>
                <Ionicons name="flame-outline" size={12} color="#555" />
                <Text style={styles.metaText}>{recipe.cookTimeMinutes} min</Text>
              </View>
            )}
          </View>

          {recipe.description && (
            <Text style={styles.description}>{recipe.description}</Text>
          )}

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
              <Text style={styles.heroLabel}>
                {pantry.size > 0 ? 'Coût estimé (sans ce que tu as)' : 'Coût total de la recette'}
              </Text>
              <Text style={styles.heroTotal}>{formatCents(best.prorata)}</Text>
              {pantrySavings > 0 && (
                <View style={styles.pantryBadge}>
                  <Ionicons name="checkmark-circle" size={14} color="#2E7D32" />
                  <Text style={styles.pantryBadgeText}>Tu économises {formatCents(pantrySavings)} grâce à ton garde-manger</Text>
                </View>
              )}
              <Text style={styles.heroSub}>
                {formatCents(Math.round(best.prorata / adjustedServings))} / portion · meilleur prix chez {best.chain}
              </Text>
              <Text style={styles.heroPkg}>
                ≈ {formatCents(best.pkg)} si tu achètes les formats complets
              </Text>
              {recipeMacros && (
                <View style={styles.macroRow}>
                  <MacroChip label="kcal" value={String(recipeMacros.kcal)} />
                  <MacroChip label="prot" value={`${recipeMacros.protein}g`} />
                  <MacroChip label="lip"  value={`${recipeMacros.fat}g`} />
                  <MacroChip label="glu"  value={`${recipeMacros.carbs}g`} />
                </View>
              )}
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
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingRight: 16 }}>
            <Text style={styles.section}>
              Ingrédients{pantry.size > 0 ? ` (${pantry.size} en stock)` : ''}
            </Text>
            <TouchableOpacity
              onPress={() => {
                const text = recipe.ingredients.map(i => `- ${i.rawText}`).join('\n');
                Share.share({ message: `${recipe.title}\n\n${text}` });
              }}
              hitSlop={8}
              style={{ padding: 4 }}
            >
              <Ionicons name="copy-outline" size={20} color="#2E7D32" />
            </TouchableOpacity>
          </View>
          <Text style={styles.pantryHint}>Prix = quantité utilisée dans la recette (pas le format complet) · Appuie pour marquer en stock</Text>
          {recipe.ingredients.map((ing) => {
            const prices = ing.costByStore
              .filter(p => selectedStores.includes(p.chain as StoreChain))
              .sort((a, b) => a.priceCents - b.priceCents);
            const cheapest = prices[0];
            const priceDiff = prices.length >= 2 ? prices[prices.length - 1].priceCents - prices[0].priceCents : 0;
            const matched = !!ing.productId;
            const inPantry = pantry.has(ing.id);
            const emoji = getFoodEmoji(ing.rawText);
            return (
              <TouchableOpacity
                key={ing.id}
                style={[styles.ingRow, inPantry && styles.ingRowPantry]}
                onPress={() => {
                  setPantry(prev => {
                    const next = new Set(prev);
                    if (next.has(ing.id)) next.delete(ing.id);
                    else next.add(ing.id);
                    return next;
                  });
                }}
                onLongPress={() => {
                  if (!ing.product?.name) return;
                  const baseMacros = getMacros(ing.product.name);
                  if (!baseMacros) return;
                  const perRecipe = computeIngredientMacros(ing.product.name, ing.parsedQuantity, ing.parsedUnit);
                  setMacroModal({ name: ing.product.name, macros: baseMacros, perRecipe });
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.ingEmoji}>{emoji}</Text>
                <View style={styles.ingLeft}>
                  <Text style={[styles.ingText, inPantry && styles.ingTextPantry]}>{ing.rawText}</Text>
                  {matched && ing.product?.name && (
                    <Text style={styles.ingProduct}>≈ {ing.product.name}</Text>
                  )}
                  {cheapest && prices.length > 1 && priceDiff > 10 && !inPantry && (
                    <Text style={styles.ingBestChain}>
                      Meilleur: {cheapest.chain} ({formatCents(cheapest.priceCents)})
                    </Text>
                  )}
                  {inPantry && <Text style={styles.ingPantryLabel}>✓ Déjà en stock</Text>}
                </View>
                {inPantry
                  ? <Ionicons name="checkmark-circle" size={22} color="#2E7D32" />
                  : cheapest
                    ? <View style={styles.ingPriceWrap}>
                        <Text style={styles.ingPrice}>{formatCents(Math.round(cheapest.priceCents * servingsMultiplier))}</Text>
                        <Text style={styles.ingPortionPrice}>{formatCents(Math.round(cheapest.priceCents * servingsMultiplier / adjustedServings))}/portion</Text>
                        {cheapest.packagePriceCents > 0 && (
                          <Text style={styles.ingPkgPrice}>
                            {formatPackage(cheapest.packageSize, cheapest.packageUnit)} · {formatCents(cheapest.packagePriceCents)}
                          </Text>
                        )}
                        {cheapest.isPromo && <Text style={styles.ingPromo}>PROMO</Text>}
                      </View>
                    : <Text style={styles.ingNo}>—</Text>}
              </TouchableOpacity>
            );
          })}

          {/* Substitution suggestions */}
          {substitutions.length > 0 && (
            <>
              <Text style={styles.section}>💡 Substituts moins chers</Text>
              <View style={styles.subSummary}>
                <Text style={styles.subSummaryText}>
                  {substitutions.length} substitution{substitutions.length > 1 ? 's' : ''} possible{substitutions.length > 1 ? 's' : ''} — économie totale de{' '}
                  <Text style={{ fontWeight: '700' }}>{formatCents(substitutions.reduce((s, x) => s + x.savingsCents, 0))}</Text>
                </Text>
              </View>
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

          {/* Action row */}
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.actionBtnPrimary}
              onPress={handleAddToList}
              disabled={addingToList}
            >
              {addingToList
                ? <ActivityIndicator color="#fff" size="small" />
                : <Ionicons name="cart-outline" size={18} color="#fff" />}
              <Text style={styles.actionBtnPrimaryText}>Épicerie</Text>
            </TouchableOpacity>
            {recipe.sourceUrl && (
              <TouchableOpacity
                style={styles.actionBtnSecondary}
                onPress={() => Linking.openURL(recipe.sourceUrl!)}
              >
                <Ionicons name="open-outline" size={18} color="#2E7D32" />
                <Text style={styles.actionBtnSecondaryText}>Originale</Text>
              </TouchableOpacity>
            )}
          </View>

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
            <Ionicons name="trash-outline" size={16} color="#C62828" />
            <Text style={styles.deleteBtnText}>Supprimer</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );
}

function formatCents(c: number) { return `${(c / 100).toFixed(2)} $`; }

function formatPackage(size: number, unit: string) {
  if (!size || Number.isNaN(size)) return unit || '';
  const n = size % 1 === 0 ? size : Math.round(size * 10) / 10;
  return `${n} ${unit}`.trim();
}

function MacroChip({ label, value }: { label: string; value: string }) {
  return (
    <View style={macroStyles.chip}>
      <Text style={macroStyles.chipVal}>{value}</Text>
      <Text style={macroStyles.chipLbl}>{label}</Text>
    </View>
  );
}

const macroStyles = StyleSheet.create({
  chip:    { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  chipVal: { fontSize: 15, fontWeight: '700', color: '#1B5E20' },
  chipLbl: { fontSize: 10, color: '#388E3C', textTransform: 'uppercase' },
});

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: '#f5f5f5' },
  loadingOverlay:  { flex: 1, alignItems: 'center', justifyContent: 'center' },
  error:           { color: '#C62828', padding: 16 },
  scroll:          { paddingBottom: 48 },

  // Hero
  heroWrap:        { position: 'relative' },
  image:           { width: '100%', height: 260 },
  imagePlaceholder:{ alignItems: 'center', justifyContent: 'center', backgroundColor: '#f0f0f0' },
  heroOverlayTop:  { position: 'absolute', top: 0, left: 0, right: 0, height: 100, backgroundColor: 'rgba(0,0,0,0.35)' },
  heroActions:     { position: 'absolute', top: 50, left: 12, right: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroActionsRight:{ flexDirection: 'row', gap: 6 },
  heroBtn:         { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },

  title:           { fontSize: 24, fontWeight: '800', paddingHorizontal: 16, paddingTop: 16, color: '#1a1a1a', lineHeight: 30 },
  description:   { fontSize: 13, color: '#666', paddingHorizontal: 16, marginTop: 6, lineHeight: 19 },
  meta:          { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, paddingHorizontal: 16, marginTop: 4 },
  metaText:      { color: '#666', fontSize: 13 },
  catBadge:      { backgroundColor: '#E8F5E9', borderRadius: 4, paddingHorizontal: 7, paddingVertical: 2 },
  catBadgeText:  { color: '#2E7D32', fontSize: 11, fontWeight: '600' },
  timePill:      { flexDirection: 'row', alignItems: 'center', gap: 3 },
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
  ingRow:          { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#eee', gap: 8 },
  ingRowPantry:    { backgroundColor: '#F1F8E9', opacity: 0.85 },
  ingEmoji:        { fontSize: 20, width: 28, textAlign: 'center' },
  ingLeft:         { flex: 1, marginRight: 8 },
  ingText:         { fontSize: 14 },
  ingTextPantry:   { color: '#999', textDecorationLine: 'line-through' },
  ingProduct:      { fontSize: 11, color: '#888', marginTop: 1 },
  ingBestChain:    { fontSize: 10, color: '#2E7D32', marginTop: 1 },
  ingPantryLabel:  { fontSize: 10, color: '#2E7D32', fontWeight: '600', marginTop: 1 },
  pantryHint:      { fontSize: 11, color: '#aaa', paddingHorizontal: 16, marginBottom: 4, fontStyle: 'italic' },
  pantryBadge:     { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#C8E6C9', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, marginTop: 4 },
  pantryBadgeText: { fontSize: 12, color: '#2E7D32', fontWeight: '600' },
  matchRate:     { fontSize: 12, color: '#888', textAlign: 'center', paddingVertical: 8 },
  ingPriceWrap:  { alignItems: 'flex-end', gap: 1 },
  ingPrice:      { fontSize: 14, color: '#2E7D32', fontWeight: '700' },
  ingPortionPrice: { fontSize: 10, color: '#66A366' },
  ingPkgPrice:   { fontSize: 10, color: '#999' },
  ingPromo:      { fontSize: 8, color: '#FF6F00', fontWeight: '700' },
  ingNo:         { fontSize: 14, color: '#ccc' },
  stepRow:       { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 6, gap: 10 },
  stepNum:       { width: 22, height: 22, borderRadius: 11, backgroundColor: '#2E7D32', color: '#fff', textAlign: 'center', lineHeight: 22, fontSize: 12, fontWeight: '700', overflow: 'hidden' },
  stepText:      { flex: 1, fontSize: 14, lineHeight: 20, color: '#333' },
  subSummary:    { backgroundColor: '#E8F5E9', borderRadius: 8, padding: 10, marginHorizontal: 16, marginBottom: 6 },
  subSummaryText:{ fontSize: 13, color: '#2E7D32' },
  subRow:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#FFF8E1', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#FFE082' },
  subInfo:       { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  subOriginal:   { fontSize: 13, color: '#999', textDecorationLine: 'line-through' },
  subReplace:    { fontSize: 13, color: '#E65100', fontWeight: '600' },
  subSaving:     { backgroundColor: '#2E7D32', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  subSavingText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  actionRow:            { flexDirection: 'row', gap: 10, marginHorizontal: 16, marginTop: 16, marginBottom: 8 },
  actionBtnPrimary:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: '#2E7D32', borderRadius: 12, paddingVertical: 14 },
  actionBtnPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  actionBtnSecondary:   { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: '#E8F5E9', borderRadius: 12, paddingVertical: 14, borderWidth: 1.5, borderColor: '#2E7D32' },
  actionBtnSecondaryText: { color: '#2E7D32', fontWeight: '700', fontSize: 15 },
  deleteBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, marginBottom: 20 },
  deleteBtnText: { color: '#C62828', fontWeight: '500', fontSize: 13 },
  macroRow:      { flexDirection: 'row', gap: 6, marginTop: 10, justifyContent: 'center', flexWrap: 'wrap' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard:     { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 36 },
  modalTitle:    { fontSize: 18, fontWeight: '700', color: '#1B5E20', marginBottom: 2 },
  modalSub:      { fontSize: 12, color: '#888', marginBottom: 8 },
  modalGrid:     { backgroundColor: '#F9FBE7', borderRadius: 10, overflow: 'hidden' },
  modalRow:      { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E0E0E0' },
  modalLabel:    { fontSize: 14, color: '#555' },
  modalValue:    { fontSize: 14, fontWeight: '700', color: '#2E7D32' },
  modalClose:    { marginTop: 16, backgroundColor: '#2E7D32', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  modalCloseText:{ color: '#fff', fontWeight: '600', fontSize: 15 },
});
