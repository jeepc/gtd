import { useRef, useState, type ComponentRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, Pressable, Switch } from 'react-native';
import { useTheme, baseStyles, useScreenBottomInset, type Theme } from '../theme';
import { useVaultStore } from '../state/vaultStore';

type ThemePref = 'auto' | 'dark' | 'light';
const THEME_OPTIONS: [ThemePref, string][] = [
  ['auto', '跟随系统'],
  ['dark', '深色模式'],
  ['light', '浅色模式'],
];

export default function AppearanceScreen() {
  const theme = useTheme();
  const bottomInset = useScreenBottomInset();
  const vaultConfig = useVaultStore(s => s.vaultConfig);
  const saveVaultConfig = useVaultStore(s => s.saveVaultConfig);
  const appSettings = useVaultStore(s => s.appSettings);
  const saveAppSettings = useVaultStore(s => s.saveAppSettings);
  const themePref = vaultConfig.ui.theme;
  const showToolbar = appSettings.ui?.showInputToolbar ?? true;

  return (
    <ScrollView style={[baseStyles.screen, { backgroundColor: theme.bg }]} contentContainerStyle={bottomInset}>
      <View style={[baseStyles.row, { justifyContent: 'space-between' }]}>
        <Text style={{ color: theme.fg, fontSize: 16 }}>主题</Text>
        <View style={{ flex: 1, marginLeft: 16 }}>
          <Dropdown
            value={themePref}
            options={THEME_OPTIONS}
            onChange={v => saveVaultConfig({ ...vaultConfig, ui: { ...vaultConfig.ui, theme: v } })}
            theme={theme}
          />
        </View>
      </View>

      <View style={[baseStyles.row, { justifyContent: 'space-between', marginTop: 24 }]}>
        <Text style={{ color: theme.fg, fontSize: 16, flex: 1, marginRight: 16 }}>
          在输入框上方显示 # @ ! 工具栏
        </Text>
        <Switch
          value={showToolbar}
          onValueChange={v =>
            saveAppSettings({ ...appSettings, ui: { ...appSettings.ui, showInputToolbar: v } })
          }
          trackColor={{ true: theme.accent }}
        />
      </View>
    </ScrollView>
  );
}

/**
 * A `<select>`-style dropdown matching the desktop UI: a bordered box showing the
 * current value + ▾, that opens an anchored popup list. Built on Modal so the
 * popup is never clipped by the ScrollView and no native Picker dep is needed.
 */
function Dropdown({
  value, options, onChange, theme,
}: {
  value: ThemePref;
  options: [ThemePref, string][];
  onChange: (v: ThemePref) => void;
  theme: Theme;
}) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const ref = useRef<ComponentRef<typeof TouchableOpacity>>(null);
  const currentLabel = options.find(o => o[0] === value)?.[1] ?? '';

  const openMenu = () => {
    ref.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height });
      setOpen(true);
    });
  };

  return (
    <>
      <TouchableOpacity
        ref={ref}
        activeOpacity={0.7}
        onPress={openMenu}
        style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          borderWidth: 1, borderColor: theme.border, borderRadius: 6,
          paddingHorizontal: 12, paddingVertical: 10,
        }}
      >
        <Text style={{ color: theme.fg, fontSize: 14 }}>{currentLabel}</Text>
        <Text style={{ color: theme.muted, fontSize: 12 }}>▾</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={{ flex: 1 }} onPress={() => setOpen(false)}>
          <View
            style={{
              position: 'absolute',
              left: anchor.x,
              top: anchor.y + anchor.height + 4,
              width: anchor.width,
              backgroundColor: theme.bg,
              borderWidth: 1, borderColor: theme.border, borderRadius: 8, overflow: 'hidden',
              shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 12,
              shadowOffset: { width: 0, height: 6 }, elevation: 8,
            }}
          >
            {options.map(([val, label]) => {
              const active = val === value;
              return (
                <TouchableOpacity
                  key={val}
                  onPress={() => { onChange(val); setOpen(false); }}
                  style={{
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                    paddingHorizontal: 12, paddingVertical: 12,
                    backgroundColor: active ? theme.tagBg : 'transparent',
                  }}
                >
                  <Text style={{ color: theme.fg, fontSize: 14 }}>{label}</Text>
                  {active && <Text style={{ color: theme.accent, fontSize: 14 }}>✓</Text>}
                </TouchableOpacity>
              );
            })}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}
