import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StoreProvider } from '../lib/store-context';
import { AuthProvider } from '../lib/auth-context';
import { ErrorBoundary } from '../lib/ErrorBoundary';

export default function RootLayout() {
  return (
    <ErrorBoundary>
    <AuthProvider>
    <StoreProvider>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: '#2E7D32',
          headerStyle: { backgroundColor: '#2E7D32' },
          headerTintColor: '#fff',
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
          name="compare"
          options={{
            title: 'Comparateur',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="pricetag-outline" size={size} color={color} />
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
            title: 'Listes',
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
            title: 'Magasins',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="storefront-outline" size={size} color={color} />
            ),
          }}
        />
        {/* Detail + auth routes — registered but hidden from the tab bar */}
        <Tabs.Screen name="recipe/[id]" options={{ href: null, headerShown: false }} />
        <Tabs.Screen name="auth/login" options={{ href: null, headerShown: false }} />
        <Tabs.Screen name="auth/register" options={{ href: null, headerShown: false }} />
      </Tabs>
    </StoreProvider>
    </AuthProvider>
    </ErrorBoundary>
  );
}
