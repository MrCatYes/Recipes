import { useState } from 'react';
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
import type { RecipeWithCost } from '@epicerie/shared-types';

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

export default function RecipesScreen() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [recipe, setRecipe] = useState<RecipeWithCost | null>(null);

  async function parseRecipe() {
    if (!url.trim()) return;
    setLoading(true);
    setRecipe(null);
    try {
      const res = await fetch(`${API_BASE}/recipes/parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setRecipe(data.recipe);
    } catch (e) {
      Alert.alert('Erreur', String(e));
    } finally {
      setLoading(false);
    }
  }

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
        />
        <TouchableOpacity style={styles.button} onPress={parseRecipe} disabled={loading}>
          <Text style={styles.buttonText}>Calculer</Text>
        </TouchableOpacity>
      </View>

      {loading && <ActivityIndicator style={styles.loader} size="large" color="#2E7D32" />}

      {recipe && (
        <View style={styles.recipeCard}>
          <Text style={styles.recipeTitle}>{recipe.title}</Text>
          <Text style={styles.servings}>{recipe.servings} portions</Text>

          {recipe.cheapestTotalCents != null && (
            <Text style={styles.totalCost}>
              Meilleur prix: {formatCents(recipe.cheapestTotalCents)} @ {recipe.cheapestStore}
              {'\n'}
              Coût/portion: {formatCents(recipe.costPerServingCents ?? 0)}
            </Text>
          )}

          <Text style={styles.sectionTitle}>Ingrédients</Text>
          {recipe.ingredients.map((ing) => (
            <View key={ing.id} style={styles.ingredientRow}>
              <Text style={styles.ingredientText}>{ing.rawText}</Text>
              {ing.cheapestCostCents != null && (
                <Text style={styles.ingredientCost}>
                  {formatCents(ing.cheapestCostCents)}
                </Text>
              )}
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function formatCents(cents: number) {
  return `${(cents / 100).toFixed(2)} $`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  searchRow: { flexDirection: 'row', padding: 16, gap: 8 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
    fontSize: 14,
  },
  button: {
    backgroundColor: '#2E7D32',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  buttonText: { color: '#fff', fontWeight: '600' },
  loader: { marginTop: 32 },
  recipeCard: { margin: 16, backgroundColor: '#fff', borderRadius: 12, padding: 16 },
  recipeTitle: { fontSize: 20, fontWeight: '700', marginBottom: 4 },
  servings: { color: '#666', marginBottom: 8 },
  totalCost: {
    backgroundColor: '#E8F5E9',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    fontSize: 15,
    fontWeight: '600',
    color: '#2E7D32',
  },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 8 },
  ingredientRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  ingredientText: { flex: 1, fontSize: 14 },
  ingredientCost: { fontSize: 14, color: '#2E7D32', fontWeight: '500' },
});
