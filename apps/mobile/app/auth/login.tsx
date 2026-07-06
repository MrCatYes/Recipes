import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useRouter, Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../lib/auth-context';

const GREEN = '#2E7D32';

export default function LoginScreen() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!email.trim() || !password) return;
    setLoading(true);
    setError(null);
    try {
      await login(email.trim(), password);
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connexion échouée');
    } finally {
      setLoading(false);
    }
  }

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

        <Text style={styles.title}>Connexion</Text>
        <Text style={styles.subtitle}>Accède à tes listes et magasins favoris.</Text>

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
            placeholder="••••••••"
            placeholderTextColor="#bbb"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPwd}
            autoComplete="password"
            onSubmitEditing={submit}
            returnKeyType="go"
          />
          <TouchableOpacity style={styles.pwdEye} onPress={() => setShowPwd(v => !v)}>
            <Ionicons name={showPwd ? 'eye-off-outline' : 'eye-outline'} size={20} color="#aaa" />
          </TouchableOpacity>
        </View>

        {error && (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle-outline" size={16} color="#C62828" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <TouchableOpacity style={[styles.btn, loading && styles.btnDisabled]} onPress={submit} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Se connecter</Text>}
        </TouchableOpacity>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Pas de compte ? </Text>
          <Link href="/auth/register" replace style={styles.link}>Créer un compte</Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root:       { flex: 1, backgroundColor: '#fff' },
  scroll:     { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 40 },
  closeBtn:   { alignSelf: 'flex-end', marginTop: 52, marginBottom: 8, width: 36, height: 36, borderRadius: 18, backgroundColor: '#f5f5f5', alignItems: 'center', justifyContent: 'center' },
  brand:      { alignItems: 'center', marginTop: 20, marginBottom: 28, gap: 8 },
  brandIcon:  { width: 64, height: 64, borderRadius: 20, backgroundColor: GREEN, alignItems: 'center', justifyContent: 'center' },
  brandName:  { fontSize: 22, fontWeight: '800', color: GREEN },
  title:      { fontSize: 26, fontWeight: '800', color: '#111', marginBottom: 4 },
  subtitle:   { fontSize: 14, color: '#888', marginBottom: 24 },
  label:      { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 6, marginTop: 14 },
  input:      { borderWidth: 1.5, borderColor: '#e8e8e8', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, backgroundColor: '#fafafa', color: '#111' },
  pwdWrap:    { position: 'relative' },
  pwdInput:   { paddingRight: 48 },
  pwdEye:     { position: 'absolute', right: 14, top: 0, bottom: 0, justifyContent: 'center' },
  errorBox:   { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFF0F0', borderRadius: 8, padding: 10, marginTop: 10 },
  errorText:  { color: '#C62828', fontSize: 13, flex: 1 },
  btn:        { backgroundColor: GREEN, borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 24 },
  btnDisabled:{ opacity: 0.7 },
  btnText:    { color: '#fff', fontWeight: '700', fontSize: 16 },
  footer:     { flexDirection: 'row', justifyContent: 'center', marginTop: 20 },
  footerText: { color: '#888', fontSize: 14 },
  link:       { color: GREEN, fontWeight: '700', fontSize: 14 },
});
