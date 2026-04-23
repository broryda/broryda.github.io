import React from 'react';
import {
  Pressable,
  StyleSheet,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
  View,
} from 'react-native';
import {cardPreset, shadows, theme} from '../../design/theme';

type CardVariant = 'default' | 'strong' | 'outlined' | 'board';
type CardShadow = 'none' | 'soft' | 'focus';

type BaseProps = {
  variant?: CardVariant;
  padded?: boolean;
  shadowType?: CardShadow;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
  pressable?: boolean;
};

type Props = BaseProps & PressableProps;

export function Card({
  variant = 'default',
  padded = true,
  shadowType = 'none',
  style,
  children,
  pressable = false,
  ...pressableProps
}: Props): React.JSX.Element {
  const baseStyle: StyleProp<ViewStyle> = [
    styles.base,
    cardPreset[variant],
    padded && styles.padded,
    shadows[shadowType],
    style,
  ];

  if (pressable) {
    return (
      <Pressable
        {...pressableProps}
        style={({pressed}) => [baseStyle, pressed && styles.pressed]}>
        {children}
      </Pressable>
    );
  }

  return <View style={baseStyle}>{children}</View>;
}

const styles = StyleSheet.create({
  base: {
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
  },
  padded: {
    padding: theme.space.md,
  },
  pressed: {
    opacity: 0.94,
  },
});
