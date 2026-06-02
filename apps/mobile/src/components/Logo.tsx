// Loop 品牌标识——react-native-svg 重画 desktop components/Logo.tsx。
// 环用传入的 `color`（随主题 fg 明暗），「下一步」橙点固定。
import Svg, { G, Path, Circle, Text as SvgText } from 'react-native-svg';

const ORANGE = '#FF5C39';
const RING = 'M 0 -28 A 28 28 0 1 1 -28 0';

export function LoopIcon({ size = 24, color = '#000', title = 'Loop' }: { size?: number; color?: string; title?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 96 96" accessibilityRole="image" accessibilityLabel={title}>
      <G transform="translate(48, 48)">
        <Path d={RING} fill="none" stroke={color} strokeWidth={10} strokeLinecap="round" />
        <Circle cx={0} cy={-28} r={7} fill={ORANGE} />
      </G>
    </Svg>
  );
}

export function LoopLockup({ height = 28, color = '#000', title = 'Loop' }: { height?: number; color?: string; title?: string }) {
  const width = height * (320 / 96);
  return (
    <Svg width={width} height={height} viewBox="0 0 320 96" accessibilityRole="image" accessibilityLabel={title}>
      <G transform="translate(48, 48)">
        <Path d={RING} fill="none" stroke={color} strokeWidth={10} strokeLinecap="round" />
        <Circle cx={0} cy={-28} r={7} fill={ORANGE} />
      </G>
      <SvgText x={104} y={62} fontSize={52} fontWeight="500" letterSpacing={-1.5} fill={color}>
        Loop
      </SvgText>
    </Svg>
  );
}
