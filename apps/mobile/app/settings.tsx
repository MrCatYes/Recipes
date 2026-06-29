import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ALL_STORES, useStores, type StoreChain } from '../lib/store-context';
import { useAuth } from '../lib/auth-context';
import { getCurrentCoords } from '../lib/location';
import { getNearbyStores, API_BASE } from '../lib/api';
import type { NearbyStore } from '@epicerie/shared-types';

const STORE_COLORS: Record<StoreChain, string> = {
  Maxi: '#E53935', IGA: '#1565C0', Metro: '#F57C00', SuperC: '#C8102E', Walmart: '#0071CE', Costco: '#E53935',
};

export default function SettingsScreen() {
  const router = useRouter();
  const { isSelected, toggleStore } = useStores();
  const { status, user, logout, updateProfile } = useAuth();

  const [nearby, setNearby] = useState<NearbyStore[]>([]);
  const [locating, setLocating] = useState(false);
  const [stats, setStats] = useState<{
    totalItems: number; matchedToProducts: number; matchRate: string;
    productCount?: number; recipeCount?: number; storeCount?: number;
    lastCrawl: string | null;
  } | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/flyers/stats`).then(r => r.json()).then(setStats).catch(() => {});
  }, []);

  async function useMyLocation() {
    setLocating(true);
    try {
      const { latitude, longitude } = await getCurrentCoords();
      const { stores } = await getNearbyStores(latitude, longitude, 15);
      setNearby(stores);
      if (status === 'authed') {
        try { await updateProfile({ latitude, longitude }); } catch { /* non-blocking */ }
      }
      if (stores.length === 0) Alert.alert('Aucun magasin', 'Aucun magasin trouvé dans un rayon de 15 km.');
    } catch (e) {
      Alert.alert('Localisation', e instanceof Error ? e.message : 'Erreur');
    } finally {
      setLocating(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 32 }}>
      {/* Account */}
      <Text style={styles.section}>Compte</Text>
      {status === 'authed' && user ? (
        <View style={styles.card}>
          <Ionicons name="person-circle-outline" size={36} color="#2E7D32" />
          <View style={{ flex: 1 }}>
            <Text style={styles.accountName}>{user.displayName ?? 'Mon compte'}</Text>
            <Text style={styles.accountEmail}>{user.email}</Text>
          </View>
          <TouchableOpacity onPress={logout}><Text style={styles.logout}>Déconnexion</Text></TouchableOpacity>
        </View>
      ) : (
        <View style={styles.authButtons}>
          <TouchableOpacity style={styles.authPrimary} onPress={() => router.push('/auth/login')}>
            <Text style={styles.authPrimaryText}>Se connecter</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.authSecondary} onPress={() => router.push('/auth/register')}>
            <Text style={styles.authSecondaryText}>Créer un compte</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Location */}
      <Text style={styles.section}>Magasins proches</Text>
      <TouchableOpacity style={styles.locBtn} onPress={useMyLocation} disabled={locating}>
        {locating ? <ActivityIndicator color="#2E7D32" /> : <Ionicons name="navigate" size={18} color="#2E7D32" />}
        <Text style={styles.locBtnText}>Utiliser ma position</Text>
      </TouchableOpacity>
      {nearby.map((s) => (
        <View key={s.id} style={styles.nearRow}>
          <View style={[styles.dot, { backgroundColor: STORE_COLORS[s.chain] }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.nearName}>{s.name}</Text>
            {s.address && <Text style={styles.nearAddr}>{s.address}{s.city ? `, ${s.city}` : ''}</Text>}
          </View>
          <Text style={styles.nearDist}>{s.distanceKm} km</Text>
        </View>
      ))}

      {/* Chain filter */}
      <Text style={styles.section}>Chaînes à comparer</Text>
      {ALL_STORES.map((chain) => {
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
            {selected && <Ionicons name="checkmark-circle" size={22} color="#2E7D32" />}
          </TouchableOpacity>
        );
      })}

      {/* App info */}
      <Text style={styles.section}>À propos</Text>
      <View style={styles.aboutCard}>
        <View style={styles.aboutRow}>
          <Text style={styles.aboutLabel}>Version</Text>
          <Text style={styles.aboutValue}>1.0.0-beta</Text>
        </View>
        <View style={styles.aboutRow}>
          <Text style={styles.aboutLabel}>Chaînes</Text>
          <Text style={styles.aboutValue}>IGA, Metro, Maxi, Super C, Walmart, Costco</Text>
        </View>
        <View style={styles.aboutRow}>
          <Text style={styles.aboutLabel}>Données</Text>
          <Text style={styles.aboutValue}>Circulaires Flipp (hebdomadaire)</Text>
        </View>
        {stats && (
          <>
            <View style={styles.aboutRow}>
              <Text style={styles.aboutLabel}>Spéciaux en base</Text>
              <Text style={styles.aboutValue}>{stats.totalItems.toLocaleString()} items</Text>
            </View>
            <View style={styles.aboutRow}>
              <Text style={styles.aboutLabel}>Taux de correspondance</Text>
              <Text style={styles.aboutValue}>{stats.matchRate}</Text>
            </View>
            {stats.productCount != null && (
              <View style={styles.aboutRow}>
                <Text style={styles.aboutLabel}>Produits en catalogue</Text>
                <Text style={styles.aboutValue}>{stats.productCount}</Text>
              </View>
            )}
            {stats.recipeCount != null && (
              <View style={styles.aboutRow}>
                <Text style={styles.aboutLabel}>Recettes enregistrées</Text>
                <Text style={styles.aboutValue}>{stats.recipeCount}</Text>
              </View>
            )}
            {stats.storeCount != null && (
              <View style={styles.aboutRow}>
                <Text style={styles.aboutLabel}>Magasins indexés</Text>
                <Text style={styles.aboutValue}>{stats.storeCount}</Text>
              </View>
            )}
            {stats.lastCrawl && (
              <View style={styles.aboutRow}>
                <Text style={styles.aboutLabel}>Dernière mise à jour</Text>
                <Text style={styles.aboutValue}>
                  {new Date(stats.lastCrawl).toLocaleDateString('fr-CA')}
                </Text>
              </View>
            )}
          </>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: '#f5f5f5', padding: 16 },
  section:          { fontSize: 18, fontWeight: '700', marginTop: 20, marginBottom: 10 },
  card:             { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 12, padding: 16 },
  accountName:      { fontSize: 16, fontWeight: '600' },
  accountEmail:     { fontSize: 13, color: '#666' },
  logout:           { color: '#C62828', fontWeight: '600' },
  authButtons:      { gap: 10 },
  authPrimary:      { backgroundColor: '#2E7D32', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  authPrimaryText:  { color: '#fff', fontWeight: '700', fontSize: 15 },
  authSecondary:    { borderWidth: 1.5, borderColor: '#2E7D32', borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  authSecondaryText:{ color: '#2E7D32', fontWeight: '700', fontSize: 15 },
  locBtn:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#E8F5E9', borderRadius: 10, paddingVertical: 12, marginBottom: 10 },
  locBtnText:       { color: '#2E7D32', fontWeight: '600' },
  nearRow:          { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8 },
  nearName:         { fontSize: 14, fontWeight: '600' },
  nearAddr:         { fontSize: 12, color: '#888', marginTop: 1 },
  nearDist:         { fontSize: 13, color: '#2E7D32', fontWeight: '700' },
  row:              { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 10, borderWidth: 2, borderColor: 'transparent' },
  rowSelected:      { borderColor: '#2E7D32' },
  dot:              { width: 14, height: 14, borderRadius: 7 },
  chainName:        { flex: 1, fontSize: 16, color: '#999', marginLeft: 12 },
  chainNameSelected:{ color: '#111', fontWeight: '600' },
  aboutCard:        { backgroundColor: '#fff', borderRadius: 12, padding: 16, gap: 10 },
  aboutRow:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  aboutLabel:       { fontSize: 14, color: '#666' },
  aboutValue:       { fontSize: 14, color: '#333', fontWeight: '500', textAlign: 'right', flex: 1, marginLeft: 10 },
});
