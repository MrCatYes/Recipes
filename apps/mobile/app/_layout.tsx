import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StoreProvider } from '../lib/store-context';

export default function RootLayout() {
  return (
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
          name="settings"
          options={{
            title: 'Magasins',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="storefront-outline" size={size} color={color} />
            ),
          }}
        />
      </Tabs>
    </StoreProvider>
  );
}
