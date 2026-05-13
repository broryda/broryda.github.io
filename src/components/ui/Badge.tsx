import React from 'react';
import {StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle} from 'react-native';
import {theme} from '../../design/theme';

type BadgeVariant = 'neutral' | 'info' | 'success' | 'warning' | 'error' | 'outline' | 'streak';
type BadgeSize = 'sm' | 'md';

type Props = {
  label: string;
  variant?: BadgeVariant;
  size?: BadgeSize;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

const variantStyle: Record<BadgeVariant, {background: string; border: string; text: string}> = {
  neutral: {
    background: '#EEF8FB',
    border: '#D7E8F5',
    text: '#567080',
  },
  info: {
    background: '#EAF3FF',
    border: '#BFD9FF',
    text: '#3F79C8',
  },
  success: {
    background: '#E7F7EC',
    border: '#BFE5CA',
    text: '#2A7A49',
  },
  warning: {
    background: '#FFF4DB',
    border: '#F3D48B',
    text: '#9A6A12',
  },
  error: {
    background: '#FDEBED',
    border: '#F4C4C8',
    text: '#B4464C',
  },
  outline: {
    background: 'transparent',
    border: '#C5DDED',
    text: '#567080',
  },
  streak: {
    background: '#F1ECFF',
    border: '#D8CBFF',
    text: '#6D55CC',
  },
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
        {
          backgroundColor: token.background,
          borderColor: token.border,
        },
        style,
      ]}>
      <Text
        numberOfLines={1}
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
    alignSelf: 'flex-start',
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.space.xs,
  },
  sm: {
    minHeight: 24,
    paddingVertical: 2,
  },
  md: {
    minHeight: 31,
    paddingHorizontal: theme.space.sm,
    paddingVertical: 4,
  },
  text: {
    includeFontPadding: false,
  },
  textSm: {
    ...theme.typography.micro,
  },
  textMd: {
    ...theme.typography.label,
  },
});
