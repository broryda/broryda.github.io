import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  type PressableProps,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import {
  buttonSizePreset,
  buttonTextPreset,
  buttonVariantPreset,
  shadows,
  theme,
} from '../../design/theme';

type ButtonVariant = 'primary' | 'secondary' | 'neutral' | 'ghost' | 'disabled';
type ButtonSize = 'sm' | 'md' | 'lg' | 'xl';
type ButtonShadow = 'none' | 'soft' | 'focus';

type Props = Omit<PressableProps, 'style'> & {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  disabled?: boolean;
  shadowType?: ButtonShadow;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

export function AppButton({
  label,
  variant = 'neutral',
  size = 'md',
  block = false,
  disabled = false,
  shadowType = 'none',
  style,
  textStyle,
  ...props
}: Props): React.JSX.Element {
  const resolvedVariant: ButtonVariant = disabled ? 'disabled' : variant;
  const preset = buttonVariantPreset[resolvedVariant];

  return (
    <Pressable
      {...props}
      disabled={disabled}
      style={({pressed}) => [
        styles.base,
        buttonSizePreset[size],
        block && styles.block,
        {
          backgroundColor: pressed ? preset.pressedBackgroundColor : preset.backgroundColor,
          borderColor: preset.borderColor,
        },
        shadows[shadowType],
        disabled && styles.disabled,
        style,
      ]}>
      <Text style={[styles.text, buttonTextPreset[resolvedVariant], textStyle]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  block: {
    alignSelf: 'stretch',
  },
  disabled: {
    opacity: 0.6,
  },
  text: {
    ...theme.typography.button,
    includeFontPadding: false,
  },
});
