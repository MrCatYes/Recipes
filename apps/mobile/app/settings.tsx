import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ALL_STORES, useStores, type StoreChain } from '../lib/store-context';
import { useAuth } from '../lib/auth-context';
import { getCurrentCoords } from '../lib/location';
import { getNearbyStores, API_BASE } from '../lib/api';
import type { NearbyStore } from '@epicerie/shared-types';

const GREEN = '#2E7D32';

const STORE_COLORS: Record<StoreChain, string> = {
  Maxi: '#E53935', IGA: '#1565C0', Metro: '#F57C00', SuperC: '#C8102E', Walmart: '#0071CE', Costco: '#E53935',
};

function SectionHeader({ title }: { title: string }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.sectionLabel}>{title.toUpperCase()}</Text>
      <View style={styles.sectionLine} />
    </View>
  );
}

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

  const initials = user?.displayName
    ? user.displayName.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()
    : user?.email?.[0]?.toUpperCase() ?? '?';

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>

      {/* Account */}
      <SectionHeader title="Compte" />
      {status === 'authed' && user ? (
        <View style={styles.accountCard}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.accountName}>{user.displayName ?? 'Mon compte'}</Text>
            <Text style={styles.accountEmail}>{user.email}</Text>
          </View>
          <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
            <Ionicons name="log-out-outline" size={18} color="#C62828" />
          </TouchableOpacity>
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
      <SectionHeader title="Magasins proches" />
      <TouchableOpacity style={styles.locBtn} onPress={useMyLocation} disabled={locating}>
        {locating ? <ActivityIndicator color={GREEN} size="small" /> : <Ionicons name="navigate" size={18} color={GREEN} />}
        <Text style={styles.locBtnText}>Utiliser ma position</Text>
      </TouchableOpacity>
      {nearby.length > 0 && (
        <View style={styles.nearbyCard}>
          {nearby.map((s, idx) => (
            <View key={s.id} style={[styles.nearRow, idx < nearby.length - 1 && styles.nearDivider]}>
              <View style={[styles.nearDot, { backgroundColor: STORE_COLORS[s.chain] }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.nearName}>{s.name}</Text>
                {s.address && <Text style={styles.nearAddr}>{s.address}{s.city ? `, ${s.city}` : ''}</Text>}
              </View>
              <Text style={styles.nearDist}>{s.distanceKm} km</Text>
            </View>
          ))}
        </View>
      )}

      {/* Chain filter */}
      <SectionHeader title="Chaînes à comparer" />
      <View style={styles.chainsGrid}>
        {ALL_STORES.map((chain) => {
          const selected = isSelected(chain);
          return (
            <TouchableOpacity
              key={chain}
              style={[styles.chainPill, selected && { borderColor: STORE_COLORS[chain], backgroundColor: STORE_COLORS[chain] + '14' }]}
              onPress={() => toggleStore(chain)}
              activeOpacity={0.7}
            >
              <View style={[styles.chainDot, { backgroundColor: STORE_COLORS[chain] }]} />
              <Text style={[styles.chainLabel, selected && { color: '#111', fontWeight: '700' }]}>{chain}</Text>
              {selected && <Ionicons name="checkmark" size={14} color={STORE_COLORS[chain]} />}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* App info */}
      <SectionHeader title="À propos" />
      <View style={styles.aboutCard}>
        <View style={styles.aboutRow}>
          <Text style={styles.aboutLabel}>Version</Text>
          <Text style={styles.aboutValue}>1.0.0-beta</Text>
        </View>
        <View style={styles.aboutDivider} />
        <View style={styles.aboutRow}>
          <Text style={styles.aboutLabel}>Données</Text>
          <Text style={styles.aboutValue}>Circulaires Flipp (hebdomadaire)</Text>
        </View>
        {stats && (
          <>
            {stats.recipeCount != null && (
              <>
                <View style={styles.aboutDivider} />
                <View style={styles.aboutRow}>
                  <Text style={styles.aboutLabel}>Recettes</Text>
                  <Text style={styles.aboutValue}>{stats.recipeCount.toLocaleString()}</Text>
                </View>
              </>
            )}
            {stats.storeCount != null && (
              <>
                <View style={styles.aboutDivider} />
                <View style={styles.aboutRow}>
                  <Text style={styles.aboutLabel}>Magasins indexés</Text>
                  <Text style={styles.aboutValue}>{stats.storeCount.toLocaleString()}</Text>
                </View>
              </>
            )}
            {stats.totalItems > 0 && (
              <>
                <View style={styles.aboutDivider} />
                <View style={styles.aboutRow}>
                  <Text style={styles.aboutLabel}>Spéciaux en base</Text>
                  <Text style={styles.aboutValue}>{stats.totalItems.toLocaleString()}</Text>
                </View>
              </>
            )}
            {stats.lastCrawl && (
              <>
                <View style={styles.aboutDivider} />
                <View style={styles.aboutRow}>
                  <Text style={styles.aboutLabel}>Mise à jour</Text>
                  <Text style={styles.aboutValue}>{new Date(stats.lastCrawl).toLocaleDateString('fr-CA')}</Text>
                </View>
              </>
            )}
          </>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: '#f5f5f5', paddingHorizontal: 16, paddingTop: 16 },
  // Section header
  sectionRow:       { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 24, marginBottom: 10 },
  sectionLabel:     { fontSize: 11, fontWeight: '700', color: '#999', letterSpacing: 0.8 },
  sectionLine:      { flex: 1, height: 1, backgroundColor: '#E8E8E8' },
  // Account
  accountCard:      { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 14, padding: 16, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  avatarCircle:     { width: 44, height: 44, borderRadius: 22, backgroundColor: '#2E7D32', alignItems: 'center', justifyContent: 'center' },
  avatarText:       { color: '#fff', fontWeight: '700', fontSize: 16 },
  accountName:      { fontSize: 16, fontWeight: '700', color: '#1a1a1a' },
  accountEmail:     { fontSize: 13, color: '#888', marginTop: 1 },
  logoutBtn:        { width: 36, height: 36, borderRadius: 18, backgroundColor: '#FFF0F0', alignItems: 'center', justifyContent: 'center' },
  authButtons:      { gap: 10 },
  authPrimary:      { backgroundColor: GREEN, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  authPrimaryText:  { color: '#fff', fontWeight: '700', fontSize: 15 },
  authSecondary:    { borderWidth: 1.5, borderColor: GREEN, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  authSecondaryText:{ color: GREEN, fontWeight: '700', fontSize: 15 },
  // Location
  locBtn:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#E8F5E9', borderRadius: 12, paddingVertical: 13, marginBottom: 10 },
  locBtnText:       { color: GREEN, fontWeight: '600', fontSize: 14 },
  nearbyCard:       { backgroundColor: '#fff', borderRadius: 14, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  nearRow:          { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  nearDivider:      { borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  nearDot:          { width: 10, height: 10, borderRadius: 5 },
  nearName:         { fontSize: 14, fontWeight: '600', color: '#1a1a1a' },
  nearAddr:         { fontSize: 12, color: '#999', marginTop: 1 },
  nearDist:         { fontSize: 13, color: GREEN, fontWeight: '700' },
  // Chains
  chainsGrid:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chainPill:        { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff', borderRadius: 20, borderWidth: 1.5, borderColor: '#e0e0e0', paddingHorizontal: 14, paddingVertical: 9 },
  chainDot:         { width: 8, height: 8, borderRadius: 4 },
  chainLabel:       { fontSize: 14, color: '#888' },
  // About
  aboutCard:        { backgroundColor: '#fff', borderRadius: 14, padding: 16, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  aboutRow:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 2 },
  aboutDivider:     { height: 1, backgroundColor: '#f5f5f5', marginVertical: 8 },
  aboutLabel:       { fontSize: 14, color: '#888' },
  aboutValue:       { fontSize: 14, color: '#333', fontWeight: '500', textAlign: 'right', flex: 1, marginLeft: 16 },
});
