import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useRouter, Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../lib/auth-context';

const GREEN = '#2E7D32';

export default function RegisterScreen() {
  const router = useRouter();
  const { register } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!email.trim() || password.length < 8) {
      setError('Mot de passe : 8 caractères minimum.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await register(email.trim(), password, displayName.trim() || undefined);
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Création échouée');
    } finally {
      setLoading(false);
    }
  }

  const pwdStrength = password.length === 0 ? 0 : password.length < 8 ? 1 : password.length < 12 ? 2 : 3;
  const pwdColor = ['#e0e0e0', '#E53935', '#FF9800', GREEN][pwdStrength];

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
          <Ionicons name="close" size={22} color="#555" />
        </TouchableOpacity>

        <View style={styles.brand}>
          <View style={styles.brandIcon}>
            <Ionicons name="leaf" size={28} color="#fff" />
          </View>
          <Text style={styles.brandName}>Épicerie</Text>
        </View>

        <Text style={styles.title}>Créer un compte</Text>
        <Text style={styles.subtitle}>Sauvegarde tes listes, recettes et magasins.</Text>

        <Text style={styles.label}>Nom <Text style={styles.optional}>(optionnel)</Text></Text>
        <TextInput
          style={styles.input}
          placeholder="Ton prénom"
          placeholderTextColor="#bbb"
          value={displayName}
          onChangeText={setDisplayName}
          autoComplete="name"
        />

        <Text style={styles.label}>Courriel</Text>
        <TextInput
          style={styles.input}
          placeholder="ton@courriel.com"
          placeholderTextColor="#bbb"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
        />

        <Text style={styles.label}>Mot de passe</Text>
        <View style={styles.pwdWrap}>
          <TextInput
            style={[styles.input, styles.pwdInput]}
            placeholder="8 caractères minimum"
            placeholderTextColor="#bbb"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPwd}
            autoComplete="password-new"
            onSubmitEditing={submit}
            returnKeyType="go"
          />
          <TouchableOpacity style={styles.pwdEye} onPress={() => setShowPwd(v => !v)}>
            <Ionicons name={showPwd ? 'eye-off-outline' : 'eye-outline'} size={20} color="#aaa" />
          </TouchableOpacity>
        </View>
        {password.length > 0 && (
          <View style={styles.strengthRow}>
            {[1, 2, 3].map(i => (
              <View key={i} style={[styles.strengthBar, { backgroundColor: i <= pwdStrength ? pwdColor : '#e8e8e8' }]} />
            ))}
            <Text style={[styles.strengthLabel, { color: pwdColor }]}>
              {['', 'Trop court', 'Acceptable', 'Fort'][pwdStrength]}
            </Text>
          </View>
        )}

        {error && (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle-outline" size={16} color="#C62828" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <TouchableOpacity style={[styles.btn, loading && styles.btnDisabled]} onPress={submit} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Créer mon compte</Text>}
        </TouchableOpacity>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Déjà un compte ? </Text>
          <Link href="/auth/login" replace style={styles.link}>Se connecter</Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root:         { flex: 1, backgroundColor: '#fff' },
  scroll:       { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 40 },
  closeBtn:     { alignSelf: 'flex-end', marginTop: 52, marginBottom: 8, width: 36, height: 36, borderRadius: 18, backgroundColor: '#f5f5f5', alignItems: 'center', justifyContent: 'center' },
  brand:        { alignItems: 'center', marginTop: 20, marginBottom: 28, gap: 8 },
  brandIcon:    { width: 64, height: 64, borderRadius: 20, backgroundColor: GREEN, alignItems: 'center', justifyContent: 'center' },
  brandName:    { fontSize: 22, fontWeight: '800', color: GREEN },
  title:        { fontSize: 26, fontWeight: '800', color: '#111', marginBottom: 4 },
  subtitle:     { fontSize: 14, color: '#888', marginBottom: 24 },
  label:        { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 6, marginTop: 14 },
  optional:     { fontWeight: '400', color: '#bbb' },
  input:        { borderWidth: 1.5, borderColor: '#e8e8e8', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, backgroundColor: '#fafafa', color: '#111' },
  pwdWrap:      { position: 'relative' },
  pwdInput:     { paddingRight: 48 },
  pwdEye:       { position: 'absolute', right: 14, top: 0, bottom: 0, justifyContent: 'center' },
  strengthRow:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  strengthBar:  { flex: 1, height: 3, borderRadius: 2 },
  strengthLabel:{ fontSize: 11, fontWeight: '600', width: 70, textAlign: 'right' },
  errorBox:     { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFF0F0', borderRadius: 8, padding: 10, marginTop: 10 },
  errorText:    { color: '#C62828', fontSize: 13, flex: 1 },
  btn:          { backgroundColor: GREEN, borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 24 },
  btnDisabled:  { opacity: 0.7 },
  btnText:      { color: '#fff', fontWeight: '700', fontSize: 16 },
  footer:       { flexDirection: 'row', justifyContent: 'center', marginTop: 20 },
  footerText:   { color: '#888', fontSize: 14 },
  link:         { color: GREEN, fontWeight: '700', fontSize: 14 },
});
