import React from 'react';
import {StyleSheet, Text, type StyleProp, type TextStyle, type ViewStyle, View} from 'react-native';
import {theme} from '../../design/theme';

type BadgeVariant = 'neutral' | 'info' | 'success' | 'warning' | 'error' | 'outline';
type BadgeSize = 'sm' | 'md';

type Props = {
  label: string;
  variant?: BadgeVariant;
  size?: BadgeSize;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

const variantStyle: Record<BadgeVariant, {bg: string; border: string; text: string}> = {
  neutral: {bg: '#EAF0EF', border: '#D5E1DE', text: theme.color.text.secondary},
  info: {bg: '#E6F1F8', border: '#C8DDED', text: theme.color.state.info},
  success: {bg: '#E5F4EC', border: '#BFE2CF', text: theme.color.state.success},
  warning: {bg: '#FFF4E5', border: '#F2D7AD', text: theme.color.state.warning},
  error: {bg: '#FDECEC', border: '#F4C9C9', text: theme.color.state.error},
  outline: {bg: 'transparent', border: theme.color.border.soft, text: theme.color.text.secondary},
};

export function Badge({
  label,
  variant = 'neutral',
  size = 'sm',
  style,
  textStyle,
}: Props): React.JSX.Element {
  const token = variantStyle[variant];
  return (
    <View
      style={[
        styles.base,
        size === 'sm' ? styles.sm : styles.md,
        {backgroundColor: token.bg, borderColor: token.border},
        style,
      ]}>
      <Text
        style={[
          styles.text,
          size === 'sm' ? styles.textSm : styles.textMd,
          {color: token.text},
          textStyle,
        ]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  sm: {
    minHeight: 22,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  md: {
    minHeight: 28,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  text: {
    includeFontPadding: false,
    fontWeight: '700',
  },
  textSm: {
    fontSize: 11,
    lineHeight: 14,
  },
  textMd: {
    fontSize: 13,
    lineHeight: 16,
  },
});
