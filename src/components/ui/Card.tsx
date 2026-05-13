import React from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {cardPreset, shadows, theme} from '../../design/theme';

type CardVariant =
  | 'base'
  | 'soft'
  | 'emphasis'
  | 'outlined'
  | 'board'
  | 'achievement'
  | 'default'
  | 'strong';
type CardShadow = 'none' | 'soft' | 'focus' | 'floating';

type Props = Omit<PressableProps, 'style'> & {
  children: React.ReactNode;
  variant?: CardVariant;
  padded?: boolean;
  shadowType?: CardShadow;
  pressable?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Card({
  children,
  variant = 'base',
  padded = true,
  shadowType = 'none',
  pressable = false,
  style,
  ...pressableProps
}: Props): React.JSX.Element {
  const baseStyle: StyleProp<ViewStyle> = [
    styles.base,
    cardPreset[variant],
    padded && styles.padded,
    shadows[shadowType],
    style,
  ];

  if (!pressable) {
    return <View style={baseStyle}>{children}</View>;
  }

  return (
    <Pressable
      {...pressableProps}
      style={({pressed}) => [baseStyle, pressed && styles.pressed]}>
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: theme.radius.xl,
    overflow: 'hidden',
  },
  padded: {
    padding: theme.space.md,
  },
  pressed: {
    opacity: 0.96,
    transform: [{scale: 0.995}],
  },
});
