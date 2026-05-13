import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import {
  buttonHeight,
  buttonPaddingX,
  buttonSizeTextPreset,
  buttonTextPreset,
  buttonVariantPreset,
  shadows,
  theme,
  type ButtonSize,
  type ButtonVariant,
} from '../../design/theme';

type ButtonShadow = 'none' | 'soft' | 'focus';

type Props = Omit<PressableProps, 'style'> & {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  disabled?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
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
  leftIcon,
  rightIcon,
  shadowType = 'none',
  style,
  textStyle,
  ...pressableProps
}: Props): React.JSX.Element {
  const resolvedVariant: ButtonVariant = disabled ? 'disabled' : variant;
  const token = buttonVariantPreset[resolvedVariant];

  return (
    <Pressable
      {...pressableProps}
      disabled={disabled}
      style={({pressed}) => [
        styles.base,
        {
          minHeight: buttonHeight[size],
          paddingHorizontal: buttonPaddingX[size],
          borderRadius: size === 'sm' ? theme.radius.md : theme.radius.lg,
          backgroundColor: pressed ? token.pressedBackgroundColor : token.backgroundColor,
          borderColor: token.borderColor,
        },
        block && styles.block,
        shadows[shadowType],
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}>
      <View style={styles.inner}>
        {leftIcon ? <View style={styles.iconLeft}>{leftIcon}</View> : null}
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.82}
          style={[
            styles.text,
            buttonSizeTextPreset[size],
            buttonTextPreset[resolvedVariant],
            textStyle,
          ]}>
          {label}
        </Text>
        {rightIcon ? <View style={styles.iconRight}>{rightIcon}</View> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  block: {
    width: '100%',
  },
  pressed: {
    opacity: 0.95,
    transform: [{scale: 0.994}],
  },
  disabled: {
    opacity: 1,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space.xs,
    minWidth: 0,
  },
  iconLeft: {
    marginRight: theme.space.xxs,
  },
  iconRight: {
    marginLeft: theme.space.xxs,
  },
  text: {
    includeFontPadding: false,
    textAlign: 'center',
    flexShrink: 1,
  },
});
