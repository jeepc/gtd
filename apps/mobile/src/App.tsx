import { useEffect, useRef } from 'react';
import { Appearance, AppState, type AppStateStatus } from 'react-native';
import { NavigationContainer, DefaultTheme, DarkTheme, useNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useTheme } from './theme';
import HomeScreen from './screens/HomeScreen';
import EntryDetailScreen from './screens/EntryDetailScreen';
import TagScreen from './screens/TagScreen';
import PriorityScreen from './screens/PriorityScreen';
import SearchScreen from './screens/SearchScreen';
import SettingsScreen from './screens/SettingsScreen';
import AppearanceScreen from './screens/AppearanceScreen';
import SyncSettingsScreen from './screens/SyncSettingsScreen';
import AboutScreen from './screens/AboutScreen';
import ConflictsScreen from './screens/ConflictsScreen';
import { useVaultStore } from './state/vaultStore';

const Stack = createNativeStackNavigator();

export default function App() {
  const init = useVaultStore(s => s.init);
  const onFg = useVaultStore(s => s.onAppForeground);
  const onBg = useVaultStore(s => s.onAppBackground);
  const navRef = useNavigationContainerRef();
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const themePref = useVaultStore(s => s.vaultConfig.ui.theme);

  useEffect(() => { init(); }, [init]);

  // 把应用内主题偏好下推到原生 DayNight（Android 上调用 AppCompatDelegate.setDefaultNightMode）。
  // 否则强制深色而系统为浅色时，原生 windowBackground / 系统栏仍停留在浅色资源，
  // 导致页面切换动画闪白、底部导航栏发白。'auto' → 跟随系统。
  useEffect(() => {
    Appearance.setColorScheme(themePref === 'auto' ? 'unspecified' : themePref);
  }, [themePref]);

  // PRD §4.7.2 mobile sync triggers via AppState foreground/background.
  useEffect(() => {
    const sub = AppState.addEventListener('change', next => {
      const prev = appStateRef.current;
      appStateRef.current = next;
      if (prev !== 'active' && next === 'active') onFg();
      else if (prev === 'active' && next !== 'active') onBg();
    });
    return () => sub.remove();
  }, [onFg, onBg]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <RootNavigator navRef={navRef} />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

// 主题感知的导航器：状态栏透明 + translucent，原生 header 直接画到状态栏后面，
// 形成沉浸式效果；状态栏图标随明暗主题反色。
function RootNavigator({ navRef }: { navRef: ReturnType<typeof useNavigationContainerRef> }) {
  const theme = useTheme();
  const navTheme = {
    ...(theme.name === 'dark' ? DarkTheme : DefaultTheme),
    colors: {
      ...(theme.name === 'dark' ? DarkTheme : DefaultTheme).colors,
      background: theme.bg,
      card: theme.bg,
      text: theme.fg,
      border: theme.border,
      primary: theme.accent,
    },
  };
  return (
    <NavigationContainer ref={navRef} theme={navTheme}>
      <Stack.Navigator
        screenOptions={{
          headerTitleAlign: 'center',
          // 沉浸式状态栏：透明且 translucent，header 背景延伸到状态栏区域。
          // 注：native-stack v7 移除了 statusBarColor（Android 15 edge-to-edge 下被系统忽略），
          // 透明状态栏由原生 AppTheme 主题负责，这里只控制图标明暗。
          statusBarTranslucent: true,
          statusBarStyle: theme.name === 'dark' ? 'light' : 'dark',
          headerStyle: { backgroundColor: theme.bg },
          headerTintColor: theme.fg,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: theme.bg },
        }}
      >
        <Stack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Entry" component={EntryDetailScreen} options={{ title: '条目' }} />
            <Stack.Screen name="Tag" component={TagScreen} options={{ title: '标签' }} />
            <Stack.Screen name="Priority" component={PriorityScreen} options={{ title: '优先级' }} />
            <Stack.Screen name="Search" component={SearchScreen} options={{ title: '搜索' }} />
            <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: '设置' }} />
            <Stack.Screen name="Appearance" component={AppearanceScreen} options={{ title: '外观' }} />
            <Stack.Screen name="SyncSettings" component={SyncSettingsScreen} options={{ title: '同步配置' }} />
            <Stack.Screen name="About" component={AboutScreen} options={{ title: '关于' }} />
            <Stack.Screen name="Conflicts" component={ConflictsScreen} options={{ title: '冲突' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
