import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ALL_STORES, useStores, type StoreChain } from '../lib/store-context';

const STORE_COLORS: Record<StoreChain, string> = {
  Maxi:    '#E53935',
  IGA:     '#1565C0',
  Metro:   '#F57C00',
  Walmart: '#0071CE',
  Costco:  '#E53935',
};

export default function SettingsScreen() {
  const { isSelected, toggleStore } = useStores();

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Épiceries</Text>
      <Text style={styles.subtitle}>Sélectionne les magasins à comparer</Text>

      {ALL_STORES.map(chain => {
        const selected = isSelected(chain);
        return (
          <TouchableOpacity
            key={chain}
            style={[styles.row, selected && styles.rowSelected]}
            onPress={() => toggleStore(chain)}
            activeOpacity={0.7}
          >
            <View style={[styles.dot, { backgroundColor: STORE_COLORS[chain] }]} />
            <Text style={[styles.chainName, selected && styles.chainNameSelected]}>{chain}</Text>
            {selected && (
              <Ionicons name="checkmark-circle" size={22} color="#2E7D32" />
            )}
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: '#f5f5f5', padding: 16 },
  title:            { fontSize: 22, fontWeight: '700', marginBottom: 4, marginTop: 8 },
  subtitle:         { fontSize: 14, color: '#666', marginBottom: 20 },
  row:              { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 10, borderWidth: 2, borderColor: 'transparent' },
  rowSelected:      { borderColor: '#2E7D32' },
  dot:              { width: 14, height: 14, borderRadius: 7, marginRight: 12 },
  chainName:        { flex: 1, fontSize: 16, color: '#999' },
  chainNameSelected:{ color: '#111', fontWeight: '600' },
});
