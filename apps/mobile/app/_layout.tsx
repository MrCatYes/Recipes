import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StoreProvider } from '../lib/store-context';
import { AuthProvider } from '../lib/auth-context';
import { FavoritesProvider } from '../lib/favorites-context';
import { PriceAlertsProvider } from '../lib/price-alerts-context';
import { ErrorBoundary } from '../lib/ErrorBoundary';

export default function RootLayout() {
  return (
    <ErrorBoundary>
    <AuthProvider>
    <FavoritesProvider>
    <PriceAlertsProvider>
    <StoreProvider>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: '#2E7D32',
          tabBarInactiveTintColor: '#9E9E9E',
          tabBarStyle: { borderTopWidth: 0.5, borderTopColor: '#e0e0e0', elevation: 8 },
          tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginBottom: 2 },
          headerStyle: { backgroundColor: '#2E7D32' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: '700' },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Recettes',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="restaurant-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="deals"
          options={{
            title: 'Promos',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="flame-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="lists"
          options={{
            title: 'Épicerie',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="cart-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="plans"
          options={{
            title: 'Planif',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="calendar-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: 'Réglages',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="settings-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="compare"
          options={{ href: null }}
        />
        {/* Detail + auth routes — registered but hidden from the tab bar */}
        <Tabs.Screen name="recipe/[id]" options={{ href: null, headerShown: false }} />
        <Tabs.Screen name="auth/login" options={{ href: null, headerShown: false }} />
        <Tabs.Screen name="auth/register" options={{ href: null, headerShown: false }} />
      </Tabs>
    </StoreProvider>
    </PriceAlertsProvider>
    </FavoritesProvider>
    </AuthProvider>
    </ErrorBoundary>
  );
}
