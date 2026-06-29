import { useState, useCallback } from 'react';
import {
  View, Text, SectionList, FlatList, TouchableOpacity, TextInput, StyleSheet,
  ActivityIndicator, Alert, RefreshControl, Share,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '../lib/auth-context';
import {
  getShoppingLists, getShoppingList, createShoppingList,
  addListItem, toggleListItem, deleteListItem, deleteShoppingList,
} from '../lib/api';
import type { ShoppingListSummary, ShoppingListWithCost, ShoppingListItemWithCost } from '@epicerie/shared-types';

const GREEN = '#2E7D32';

function formatPrice(cents: number | null) {
  if (cents == null) return '—';
  return `${(cents / 100).toFixed(2)} $`;
}

export default function ListsScreen() {
  const { status } = useAuth();
  const [lists, setLists] = useState<ShoppingListSummary[]>([]);
  const [activeList, setActiveList] = useState<ShoppingListWithCost | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [newItemText, setNewItemText] = useState('');

  const loadLists = useCallback(async () => {
    if (status !== 'authed') return;
    try {
      const { lists: l } = await getShoppingLists();
      setLists(l);
    } catch { /* ignore */ }
  }, [status]);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    loadLists().finally(() => setLoading(false));
  }, [loadLists]));

  async function refresh() {
    setRefreshing(true);
    if (activeList) {
      try { setActiveList(await getShoppingList(activeList.id)); } catch { /* */ }
    } else {
      await loadLists();
    }
    setRefreshing(false);
  }

  async function handleCreateList() {
    const name = newListName.trim();
    if (!name) return;
    try {
      const list = await createShoppingList(name);
      setNewListName('');
      setActiveList(list);
    } catch (e) {
      Alert.alert('Erreur', e instanceof Error ? e.message : 'Impossible de créer la liste');
    }
  }

  async function handleDeleteList(id: string) {
    Alert.alert('Supprimer', 'Supprimer cette liste ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: async () => {
        try {
          await deleteShoppingList(id);
          if (activeList?.id === id) setActiveList(null);
          await loadLists();
        } catch { /* */ }
      }},
    ]);
  }

  async function handleAddItem() {
    if (!activeList || !newItemText.trim()) return;
    try {
      setActiveList(await addListItem(activeList.id, { rawText: newItemText.trim() }));
      setNewItemText('');
    } catch { /* */ }
  }

  async function handleToggle(item: ShoppingListItemWithCost) {
    if (!activeList) return;
    try {
      await toggleListItem(activeList.id, item.id, !item.checked);
      setActiveList(await getShoppingList(activeList.id));
    } catch { /* */ }
  }

  async function handleDeleteItem(itemId: string) {
    if (!activeList) return;
    try {
      await deleteListItem(activeList.id, itemId);
      setActiveList(await getShoppingList(activeList.id));
    } catch { /* */ }
  }

  async function handleShareList() {
    if (!activeList) return;
    const unchecked = activeList.items.filter(i => !i.checked);
    const lines = unchecked.map(i => `- ${i.rawText}`);
    const text = `${activeList.name}\n\n${lines.join('\n')}`;
    try {
      await Share.share({ message: text, title: activeList.name });
    } catch { /* */ }
  }

  if (status !== 'authed') {
    return (
      <View style={styles.center}>
        <Ionicons name="cart-outline" size={48} color="#ccc" />
        <Text style={styles.emptyText}>Connectez-vous pour créer des listes de courses</Text>
      </View>
    );
  }

  if (loading && !activeList) {
    return <View style={styles.center}><ActivityIndicator size="large" color={GREEN} /></View>;
  }

  // ─── Detail view ───────────────────────────────────────────────────────────
  if (activeList) {
    const checked = activeList.items.filter(i => i.checked).length;
    const total = activeList.items.length;
    return (
      <View style={styles.container}>
        <TouchableOpacity style={styles.backRow} onPress={() => { setActiveList(null); loadLists(); }}>
          <Ionicons name="arrow-back" size={20} color={GREEN} />
          <Text style={styles.backText}>Mes listes</Text>
        </TouchableOpacity>

        <View style={styles.titleRow}>
          <Text style={styles.listTitle}>{activeList.name}</Text>
          <TouchableOpacity onPress={handleShareList} hitSlop={8}>
            <Ionicons name="share-outline" size={22} color={GREEN} />
          </TouchableOpacity>
        </View>
        <View style={styles.costRow}>
          {activeList.cheapestStore && (
            <Text style={styles.costLabel}>
              Meilleur magasin: <Text style={styles.costValue}>{activeList.cheapestStore} — {formatPrice(activeList.cheapestTotalCents)}</Text>
            </Text>
          )}
          {activeList.estimatedTotalCents != null && (
            <Text style={styles.costSplit}>Multi-magasin: {formatPrice(activeList.estimatedTotalCents)}</Text>
          )}
        </View>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: total > 0 ? `${Math.round(checked / total * 100)}%` : '0%' }]} />
        </View>
        <Text style={styles.progressText}>{checked}/{total} cochés{total > 0 ? ` (${Math.round(checked / total * 100)}%)` : ''}</Text>

        {/* Add item */}
        <View style={styles.addRow}>
          <TextInput
            style={styles.addInput}
            placeholder="Ajouter un article..."
            value={newItemText}
            onChangeText={setNewItemText}
            onSubmitEditing={handleAddItem}
            returnKeyType="done"
          />
          <TouchableOpacity style={styles.addBtn} onPress={handleAddItem}>
            <Ionicons name="add" size={22} color="#fff" />
          </TouchableOpacity>
        </View>

        <SectionList
          sections={(() => {
            const sorted = [...activeList.items].sort((a, b) => (a.checked ? 1 : 0) - (b.checked ? 1 : 0) || a.sortOrder - b.sortOrder);
            const grouped = new Map<string, ShoppingListItemWithCost[]>();
            for (const item of sorted) {
              const cat = item.category || 'Autre';
              if (!grouped.has(cat)) grouped.set(cat, []);
              grouped.get(cat)!.push(item);
            }
            return Array.from(grouped.entries()).map(([title, data]) => ({ title, data }));
          })()}
          keyExtractor={i => i.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={GREEN} />}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <Text style={styles.sectionCount}>{section.data.length}</Text>
            </View>
          )}
          renderItem={({ item }) => (
            <View style={[styles.itemRow, item.checked && styles.itemChecked]}>
              <TouchableOpacity onPress={() => handleToggle(item)} hitSlop={8}>
                <Ionicons
                  name={item.checked ? 'checkbox' : 'square-outline'}
                  size={24}
                  color={item.checked ? '#999' : GREEN}
                />
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <Text style={[styles.itemText, item.checked && styles.itemTextChecked]}>{item.rawText}</Text>
                {item.cheapestStore && (
                  <Text style={styles.itemCost}>{item.cheapestStore} — {formatPrice(item.cheapestCostCents)}</Text>
                )}
              </View>
              <TouchableOpacity onPress={() => handleDeleteItem(item.id)} hitSlop={8}>
                <Ionicons name="trash-outline" size={18} color="#C62828" />
              </TouchableOpacity>
            </View>
          )}
          ListEmptyComponent={<Text style={styles.emptyText}>Aucun article — ajoutez-en un !</Text>}
        />
      </View>
    );
  }

  // ─── Lists index ───────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <View style={styles.addRow}>
        <TextInput
          style={styles.addInput}
          placeholder="Nouvelle liste..."
          value={newListName}
          onChangeText={setNewListName}
          onSubmitEditing={handleCreateList}
          returnKeyType="done"
        />
        <TouchableOpacity style={styles.addBtn} onPress={handleCreateList}>
          <Ionicons name="add" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={lists}
        keyExtractor={l => l.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={GREEN} />}
        renderItem={({ item: l }) => (
          <TouchableOpacity
            style={styles.listCard}
            onPress={async () => {
              setLoading(true);
              try { setActiveList(await getShoppingList(l.id)); } catch { /* */ }
              setLoading(false);
            }}
            onLongPress={() => handleDeleteList(l.id)}
          >
            <Ionicons name="cart-outline" size={28} color={GREEN} />
            <View style={{ flex: 1 }}>
              <Text style={styles.listName}>{l.name}</Text>
              <Text style={styles.listMeta}>{l.checkedCount}/{l.itemCount} cochés</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#ccc" />
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={styles.emptyText}>Aucune liste — créez-en une !</Text>}
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
  titleRow:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  listTitle:       { fontSize: 22, fontWeight: '700' },
  costRow:         { marginBottom: 6 },
  costLabel:       { fontSize: 13, color: '#555' },
  costValue:       { fontWeight: '700', color: GREEN },
  costSplit:       { fontSize: 12, color: '#888' },
  progressBar:     { height: 6, backgroundColor: '#E0E0E0', borderRadius: 3, marginBottom: 4 },
  progressFill:    { height: 6, backgroundColor: GREEN, borderRadius: 3 },
  progressText:    { fontSize: 12, color: '#888', marginBottom: 12 },
  addRow:          { flexDirection: 'row', gap: 8, marginBottom: 16 },
  addInput:        { flex: 1, backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  addBtn:          { backgroundColor: GREEN, borderRadius: 10, width: 44, alignItems: 'center', justifyContent: 'center' },
  itemRow:         { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 8 },
  itemChecked:     { opacity: 0.5 },
  itemText:        { fontSize: 15, fontWeight: '500' },
  itemTextChecked: { textDecorationLine: 'line-through', color: '#999' },
  itemCost:        { fontSize: 12, color: GREEN, marginTop: 2 },
  sectionHeader:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6, marginTop: 8 },
  sectionTitle:    { fontSize: 14, fontWeight: '700', color: '#555' },
  sectionCount:    { fontSize: 12, color: '#999' },
  listCard:        { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 10 },
  listName:        { fontSize: 16, fontWeight: '600' },
  listMeta:        { fontSize: 13, color: '#888', marginTop: 2 },
});
