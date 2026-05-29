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
import { parseRecipe } from '../lib/api';

export default function RecipesScreen() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [recipe, setRecipe] = useState<RecipeWithCost | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  async function handleParse() {
    if (!url.trim()) return;
    setLoading(true);
    setRecipe(null);
    setWarnings([]);
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

          {recipe.cheapestTotalCents != null && (
            <View style={styles.costBox}>
              <Text style={styles.costLine}>
                Meilleur prix · {recipe.cheapestStore}
              </Text>
              <Text style={styles.costTotal}>{formatCents(recipe.cheapestTotalCents)}</Text>
              <Text style={styles.costPerServing}>
                {formatCents(recipe.costPerServingCents ?? 0)} / portion
              </Text>
            </View>
          )}

          <Text style={styles.sectionTitle}>Ingrédients</Text>
          {recipe.ingredients.map((ing) => (
            <View key={ing.id} style={styles.ingredientRow}>
              <View style={styles.ingredientLeft}>
                <Text style={styles.ingredientText}>{ing.rawText}</Text>
                {ing.product && (
                  <Text style={styles.ingredientMatch}>{ing.product.name}</Text>
                )}
              </View>
              {ing.cheapestCostCents != null ? (
                <Text style={styles.ingredientCost}>
                  {formatCents(ing.cheapestCostCents)}
                </Text>
              ) : (
                <Text style={styles.ingredientNoMatch}>—</Text>
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
  loaderContainer: { alignItems: 'center', marginTop: 32, gap: 12 },
  loaderText: { color: '#666', fontSize: 14 },
  warningBox: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: '#FFF8E1',
    borderRadius: 8,
    padding: 12,
    gap: 4,
  },
  warningText: { color: '#F57F17', fontSize: 13 },
  recipeCard: { margin: 16, backgroundColor: '#fff', borderRadius: 12, padding: 16 },
  recipeTitle: { fontSize: 20, fontWeight: '700', marginBottom: 4 },
  servings: { color: '#666', marginBottom: 12 },
  costBox: {
    backgroundColor: '#E8F5E9',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  costLine: { fontSize: 12, color: '#2E7D32', fontWeight: '600', marginBottom: 2 },
  costTotal: { fontSize: 24, fontWeight: '700', color: '#1B5E20' },
  costPerServing: { fontSize: 13, color: '#388E3C', marginTop: 2 },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 8 },
  ingredientRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  ingredientLeft: { flex: 1, marginRight: 8 },
  ingredientText: { fontSize: 14 },
  ingredientMatch: { fontSize: 11, color: '#999', marginTop: 1 },
  ingredientCost: { fontSize: 14, color: '#2E7D32', fontWeight: '600' },
  ingredientNoMatch: { fontSize: 14, color: '#ccc' },
});
