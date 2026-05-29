import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function DealsScreen() {
  return (
    <View style={styles.container}>
      <Ionicons name="flame-outline" size={64} color="#E0E0E0" />
      <Text style={styles.title}>Promos — Phase 3</Text>
      <Text style={styles.body}>
        Suggestions de recettes basées sur les circulaires IGA, Metro, Maxi, Walmart et Costco.
      </Text>
      <Text style={styles.hint}>
        Disponible après l'intégration des scrapers de circulaires.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 16,
  },
  title: { fontSize: 18, fontWeight: '700', color: '#757575' },
  body: { fontSize: 15, color: '#9E9E9E', textAlign: 'center', lineHeight: 22 },
  hint: { fontSize: 12, color: '#BDBDBD', textAlign: 'center', marginTop: 8 },
});
