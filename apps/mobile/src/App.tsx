import { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import HomeScreen from './screens/HomeScreen';
import EntryDetailScreen from './screens/EntryDetailScreen';
import TagScreen from './screens/TagScreen';
import SearchScreen from './screens/SearchScreen';
import SettingsScreen from './screens/SettingsScreen';
import SyncSettingsScreen from './screens/SyncSettingsScreen';
import AISettingsScreen from './screens/AISettingsScreen';
import PromptTemplatesScreen from './screens/PromptTemplatesScreen';
import AboutScreen from './screens/AboutScreen';
import ConflictsScreen from './screens/ConflictsScreen';
import { useVaultStore } from './state/vaultStore';

const Stack = createNativeStackNavigator();

export default function App() {
  const init = useVaultStore(s => s.init);
  useEffect(() => { init(); }, [init]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <NavigationContainer>
          <Stack.Navigator screenOptions={{ headerTitleAlign: 'center' }}>
            <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'GTD' }} />
            <Stack.Screen name="Entry" component={EntryDetailScreen} options={{ title: '条目' }} />
            <Stack.Screen name="Tag" component={TagScreen} options={{ title: '标签' }} />
            <Stack.Screen name="Search" component={SearchScreen} options={{ title: '搜索' }} />
            <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: '设置' }} />
            <Stack.Screen name="SyncSettings" component={SyncSettingsScreen} options={{ title: '同步配置' }} />
            <Stack.Screen name="AISettings" component={AISettingsScreen} options={{ title: 'AI 配置' }} />
            <Stack.Screen name="PromptTemplates" component={PromptTemplatesScreen} options={{ title: 'Prompt 模板' }} />
            <Stack.Screen name="About" component={AboutScreen} options={{ title: '关于' }} />
            <Stack.Screen name="Conflicts" component={ConflictsScreen} options={{ title: '冲突' }} />
          </Stack.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
