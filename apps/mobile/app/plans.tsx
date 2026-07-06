import { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput, StyleSheet,
  ActivityIndicator, Alert, RefreshControl, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '../lib/auth-context';
import {
  getMealPlans, getMealPlan, createMealPlan, deleteMealPlan,
  addRecipeToPlan, deleteEntry, generateListFromPlan, getRecipes,
} from '../lib/api';
import type { MealPlanSummary, MealPlanWithCost, RecipeDifficulty } from '@epicerie/shared-types';

const GREEN = '#2E7D32';
const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const DIFF_COLORS: Record<RecipeDifficulty, string> = { 'débutant': '#4CAF50', 'confirmé': '#FF9800', 'expert': '#E53935' };

function formatPrice(cents: number | null) {
  if (cents == null) return '—';
  return `${(cents / 100).toFixed(2)} $`;
}

export default function PlansScreen() {
  const { status } = useAuth();
  const [plans, setPlans] = useState<MealPlanSummary[]>([]);
  const [activePlan, setActivePlan] = useState<MealPlanWithCost | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [newName, setNewName] = useState('');
  const [budget, setBudget] = useState('');
  const [showAddRecipe, setShowAddRecipe] = useState(false);
  const [recipeSearch, setRecipeSearch] = useState<{ id: string; title: string; difficulty: RecipeDifficulty | null }[]>([]);
  const [searchText, setSearchText] = useState('');

  const loadPlans = useCallback(async () => {
    if (status !== 'authed') return;
    try {
      const { plans: p } = await getMealPlans();
      setPlans(p);
    } catch { /* */ }
  }, [status]);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    loadPlans().finally(() => setLoading(false));
  }, [loadPlans]));

  async function refresh() {
    setRefreshing(true);
    if (activePlan) {
      try { setActivePlan(await getMealPlan(activePlan.id)); } catch { /* */ }
    } else {
      await loadPlans();
    }
    setRefreshing(false);
  }

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    const cents = budget ? Math.round(parseFloat(budget) * 100) : undefined;
    try {
      const plan = await createMealPlan(name, cents);
      setNewName('');
      setBudget('');
      setActivePlan(plan);
    } catch (e) {
      Alert.alert('Erreur', e instanceof Error ? e.message : 'Impossible de créer le plan');
    }
  }

  async function handleDelete(id: string) {
    Alert.alert('Supprimer', 'Supprimer ce plan ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: async () => {
        try {
          await deleteMealPlan(id);
          if (activePlan?.id === id) setActivePlan(null);
          await loadPlans();
        } catch { /* */ }
      }},
    ]);
  }

  async function openRecipePicker() {
    setShowAddRecipe(true);
    try {
      const { recipes } = await getRecipes({ sort: 'recent' });
      setRecipeSearch(recipes.map(r => ({ id: r.id, title: r.title, difficulty: r.difficulty })));
    } catch { /* */ }
  }

  async function pickRecipe(recipeId: string) {
    if (!activePlan) return;
    setShowAddRecipe(false);
    try {
      setActivePlan(await addRecipeToPlan(activePlan.id, recipeId));
    } catch (e) {
      Alert.alert('Erreur', e instanceof Error ? e.message : 'Impossible d\'ajouter la recette');
    }
  }

  async function handleDeleteEntry(entryId: string) {
    if (!activePlan) return;
    try {
      await deleteEntry(activePlan.id, entryId);
      setActivePlan(await getMealPlan(activePlan.id));
    } catch { /* */ }
  }

  async function handleGenerateList() {
    if (!activePlan) return;
    try {
      const list = await generateListFromPlan(activePlan.id);
      Alert.alert('Liste créée !', `"${list.name}" — ${list.itemCount} articles\nEstimé: ${formatPrice(list.estimatedTotalCents)}`);
    } catch (e) {
      Alert.alert('Erreur', e instanceof Error ? e.message : 'Impossible de générer la liste');
    }
  }

  if (status !== 'authed') {
    return (
      <View style={styles.center}>
        <Ionicons name="calendar-outline" size={48} color="#ccc" />
        <Text style={styles.emptyText}>Connectez-vous pour planifier vos repas</Text>
      </View>
    );
  }

  if (loading && !activePlan) {
    return <View style={styles.center}><ActivityIndicator size="large" color={GREEN} /></View>;
  }

  // ─── Detail view ───────────────────────────────────────────────────────────
  if (activePlan) {
    const budgetInfo = activePlan.budget;
    return (
      <View style={styles.container}>
        <TouchableOpacity style={styles.backRow} onPress={() => { setActivePlan(null); loadPlans(); }}>
          <Ionicons name="arrow-back" size={20} color={GREEN} />
          <Text style={styles.backText}>Mes plans</Text>
        </TouchableOpacity>

        <Text style={styles.planTitle}>{activePlan.name}</Text>

        {/* Budget bar */}
        {budgetInfo && (
          <View style={styles.budgetCard}>
            <View style={styles.budgetRow}>
              <Text style={styles.budgetLabel}>Budget</Text>
              <Text style={[styles.budgetAmount, budgetInfo.overBudget && styles.overBudget]}>
                {formatPrice(budgetInfo.spentCents)} / {formatPrice(budgetInfo.targetCents)}
              </Text>
            </View>
            <View style={styles.barBg}>
              <View style={[
                styles.barFill,
                { width: `${Math.min((budgetInfo.spentCents / budgetInfo.targetCents) * 100, 100)}%` },
                budgetInfo.overBudget && styles.barOver,
              ]} />
            </View>
            <Text style={styles.budgetRemaining}>
              {budgetInfo.overBudget
                ? `Dépassé de ${formatPrice(-budgetInfo.remainingCents)}`
                : `Reste ${formatPrice(budgetInfo.remainingCents)}`}
            </Text>
          </View>
        )}

        {/* Cost summary */}
        <View style={styles.costRow}>
          {activePlan.cheapestStore && (
            <Text style={styles.costLabel}>
              Meilleur: <Text style={styles.costValue}>{activePlan.cheapestStore} — {formatPrice(activePlan.cheapestTotalCents)}</Text>
            </Text>
          )}
          {activePlan.entries.length > 0 && (() => {
            const totalServings = activePlan.entries.reduce((s, e) => s + e.servings, 0);
            const cheapest = activePlan.cheapestTotalCents;
            return totalServings > 0 && cheapest != null ? (
              <Text style={styles.perPortionLabel}>
                {formatPrice(Math.round(cheapest / totalServings))} / portion · {totalServings} portions total
              </Text>
            ) : null;
          })()}
        </View>

        {/* Actions */}
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.actionBtn} onPress={openRecipePicker}>
            <Ionicons name="add-circle-outline" size={18} color="#fff" />
            <Text style={styles.actionText}>Ajouter recette</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, styles.actionSecondary]} onPress={handleGenerateList}>
            <Ionicons name="cart-outline" size={18} color={GREEN} />
            <Text style={[styles.actionText, { color: GREEN }]}>Générer liste</Text>
          </TouchableOpacity>
        </View>

        {/* Entries */}
        <FlatList
          data={activePlan.entries}
          keyExtractor={e => e.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={GREEN} />}
          renderItem={({ item: entry }) => (
            <View style={styles.entryCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.entryTitle}>{entry.recipe.title}</Text>
                <View style={styles.entryMeta}>
                  <Text style={styles.entryServings}>{entry.servings} portions</Text>
                  {entry.recipe.difficulty && (
                    <View style={[styles.diffBadge, { backgroundColor: DIFF_COLORS[entry.recipe.difficulty] + '22' }]}>
                      <Text style={[styles.diffText, { color: DIFF_COLORS[entry.recipe.difficulty] }]}>{entry.recipe.difficulty}</Text>
                    </View>
                  )}
                  {entry.dayOfWeek != null && (
                    <Text style={styles.dayLabel}>{DAYS[entry.dayOfWeek]}</Text>
                  )}
                </View>
                {entry.costCents != null && (
                  <Text style={styles.entryCost}>
                    {formatPrice(entry.costCents)} {entry.cheapestStore ? `(${entry.cheapestStore})` : ''}
                  </Text>
                )}
              </View>
              <TouchableOpacity onPress={() => handleDeleteEntry(entry.id)} hitSlop={8}>
                <Ionicons name="trash-outline" size={18} color="#C62828" />
              </TouchableOpacity>
            </View>
          )}
          ListEmptyComponent={<Text style={styles.emptyText}>Aucune recette — ajoutez-en !</Text>}
        />

        {/* Recipe picker modal */}
        <Modal visible={showAddRecipe} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Ajouter une recette</Text>
                <TouchableOpacity onPress={() => setShowAddRecipe(false)}>
                  <Ionicons name="close" size={24} color="#666" />
                </TouchableOpacity>
              </View>
              <TextInput
                style={styles.searchInput}
                placeholder="Rechercher..."
                value={searchText}
                onChangeText={setSearchText}
              />
              <FlatList
                data={recipeSearch.filter(r => !searchText || r.title.toLowerCase().includes(searchText.toLowerCase()))}
                keyExtractor={r => r.id}
                renderItem={({ item: r }) => (
                  <TouchableOpacity style={styles.recipeRow} onPress={() => pickRecipe(r.id)}>
                    <Ionicons name="restaurant-outline" size={20} color={GREEN} />
                    <Text style={styles.recipeName}>{r.title}</Text>
                    {r.difficulty && (
                      <View style={[styles.diffBadge, { backgroundColor: DIFF_COLORS[r.difficulty] + '22' }]}>
                        <Text style={[styles.diffText, { color: DIFF_COLORS[r.difficulty] }]}>{r.difficulty}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                )}
                ListEmptyComponent={<Text style={styles.emptyText}>Aucune recette trouvée</Text>}
              />
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  // ─── Plans index ───────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <View style={styles.createSection}>
        <TextInput
          style={styles.addInput}
          placeholder="Nom du plan (ex: Semaine 1)"
          value={newName}
          onChangeText={setNewName}
          returnKeyType="next"
        />
        <View style={styles.budgetInput}>
          <TextInput
            style={[styles.addInput, { flex: 1 }]}
            placeholder="Budget ($)"
            value={budget}
            onChangeText={setBudget}
            keyboardType="numeric"
            returnKeyType="done"
          />
          <TouchableOpacity style={styles.createBtn} onPress={handleCreate}>
            <Text style={styles.createBtnText}>Créer</Text>
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={plans}
        keyExtractor={p => p.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={GREEN} />}
        contentContainerStyle={{ paddingBottom: 20 }}
        renderItem={({ item: p }) => (
          <TouchableOpacity
            style={styles.planCard}
            onPress={async () => {
              setLoading(true);
              try { setActivePlan(await getMealPlan(p.id)); } catch { /* */ }
              setLoading(false);
            }}
            onLongPress={() => handleDelete(p.id)}
            activeOpacity={0.75}
          >
            <View style={styles.planIcon}>
              <Ionicons name="calendar-outline" size={22} color={GREEN} />
            </View>
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={styles.planName}>{p.name}</Text>
              {p.budgetCents != null && (
                <View style={styles.miniProgressBar}>
                  <View style={[styles.miniProgressFill, { width: '0%' }]} />
                </View>
              )}
              <Text style={styles.planMeta}>
                {p.recipeCount} recette{p.recipeCount !== 1 ? 's' : ''}
                {p.budgetCents ? ` · Budget ${formatPrice(p.budgetCents)}` : ''}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#ccc" />
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.emptyBlock}>
            <Ionicons name="calendar-outline" size={52} color="#e0e0e0" />
            <Text style={styles.emptyTitle}>Aucun plan</Text>
            <Text style={styles.emptyText}>Créez un plan repas pour la semaine.</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: '#f5f5f5', padding: 16 },
  center:          { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyText:       { color: '#999', fontSize: 15, textAlign: 'center', marginTop: 16 },
  backRow:         { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  backText:        { color: GREEN, fontWeight: '600', fontSize: 15 },
  planTitle:       { fontSize: 22, fontWeight: '700', marginBottom: 10 },
  // Budget
  budgetCard:      { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 12 },
  budgetRow:       { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  budgetLabel:     { fontSize: 14, fontWeight: '600', color: '#555' },
  budgetAmount:    { fontSize: 14, fontWeight: '700', color: GREEN },
  overBudget:      { color: '#C62828' },
  barBg:           { height: 8, backgroundColor: '#E8F5E9', borderRadius: 4 },
  barFill:         { height: 8, backgroundColor: GREEN, borderRadius: 4 },
  barOver:         { backgroundColor: '#C62828' },
  budgetRemaining: { fontSize: 12, color: '#888', marginTop: 4 },
  // Cost
  costRow:         { marginBottom: 10 },
  costLabel:       { fontSize: 13, color: '#555' },
  costValue:       { fontWeight: '700', color: GREEN },
  perPortionLabel: { fontSize: 12, color: '#888', marginTop: 2 },
  // Actions
  actionRow:       { flexDirection: 'row', gap: 10, marginBottom: 14 },
  actionBtn:       { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: GREEN, borderRadius: 10, paddingVertical: 12 },
  actionSecondary: { backgroundColor: '#E8F5E9' },
  actionText:      { color: '#fff', fontWeight: '600', fontSize: 14 },
  // Entries
  entryCard:       { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 8, gap: 12 },
  entryTitle:      { fontSize: 15, fontWeight: '600' },
  entryMeta:       { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  entryServings:   { fontSize: 12, color: '#888' },
  entryCost:       { fontSize: 12, color: GREEN, fontWeight: '600', marginTop: 3 },
  dayLabel:        { fontSize: 11, color: '#1565C0', fontWeight: '600' },
  diffBadge:       { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  diffText:        { fontSize: 11, fontWeight: '600' },
  // Create form
  createSection:   { marginBottom: 16, gap: 8 },
  addInput:        { backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  budgetInput:     { flexDirection: 'row', gap: 8 },
  createBtn:       { backgroundColor: GREEN, borderRadius: 10, paddingHorizontal: 20, justifyContent: 'center' },
  createBtnText:   { color: '#fff', fontWeight: '700', fontSize: 15 },
  // Plan card
  planCard:        { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  planIcon:        { width: 44, height: 44, borderRadius: 12, backgroundColor: '#E8F5E9', alignItems: 'center', justifyContent: 'center' },
  planName:        { fontSize: 16, fontWeight: '700', color: '#1a1a1a' },
  planMeta:        { fontSize: 12, color: '#aaa' },
  miniProgressBar: { height: 4, backgroundColor: '#E0E0E0', borderRadius: 2, overflow: 'hidden' },
  miniProgressFill:{ height: 4, backgroundColor: GREEN, borderRadius: 2 },
  emptyBlock:      { alignItems: 'center', paddingTop: 48, gap: 8 },
  emptyTitle:      { fontSize: 18, fontWeight: '700', color: '#ccc' },
  // Modal
  modalOverlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalContent:    { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, maxHeight: '70%' },
  modalHeader:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  modalTitle:      { fontSize: 18, fontWeight: '700' },
  searchInput:     { backgroundColor: '#f5f5f5', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, marginBottom: 12 },
  recipeRow:       { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  recipeName:      { flex: 1, fontSize: 15 },
});
