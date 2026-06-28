import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Props { children: React.ReactNode; }
interface State { hasError: boolean; error: string | null; }

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error: error.message };
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Ionicons name="warning-outline" size={48} color="#E53935" />
          <Text style={styles.title}>Oups, une erreur est survenue</Text>
          <Text style={styles.message}>{this.state.error}</Text>
          <TouchableOpacity
            style={styles.button}
            onPress={() => this.setState({ hasError: false, error: null })}
          >
            <Text style={styles.buttonText}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: '#f5f5f5', gap: 12 },
  title: { fontSize: 18, fontWeight: '700', color: '#333', textAlign: 'center' },
  message: { fontSize: 13, color: '#999', textAlign: 'center' },
  button: { backgroundColor: '#2E7D32', borderRadius: 8, paddingHorizontal: 24, paddingVertical: 12, marginTop: 8 },
  buttonText: { color: '#fff', fontWeight: '600' },
});
