import type {TextStyle, ViewStyle} from 'react-native';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'neutral'
  | 'ghost'
  | 'disabled'
  | 'success'
  | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'xl';

type ShadowType = 'none' | 'soft' | 'focus' | 'floating';
type CardVariant = 'base' | 'soft' | 'emphasis' | 'outlined' | 'board' | 'achievement';

export const theme = {
  color: {
    bg: {
      page: '#F8FAFC',
      transparent: 'transparent',
      overlay: 'rgba(19, 42, 58, 0.28)',
      surface: '#FFFFFF',
      surfaceStrong: '#EAF5EE',
      board: '#D8B56B',
    },
    surface: {
      base: '#FFFFFF',
      soft: '#EEF7F0',
      softElevated: '#E8F3ED',
      emphasis: '#DFF3E6',
      board: '#D8B56B',
    },
    brand: {
      mint: '#34D399',
      mintStrong: '#00C853',
      blue: '#64B5F6',
      blueStrong: '#2196F3',
      gold: '#F3C86B',
      coral: '#FF8E8E',
      violet: '#A89BFF',
    },
    text: {
      primary: '#1D2A33',
      secondary: '#5E6E63',
      muted: '#7F97A5',
      disabled: '#B4C0C8',
      onDarkAccent: '#FFFFFF',
      onLightPrimary: '#0F2D33',
      inverse: '#FFFFFF',
    },
    border: {
      soft: '#DBEBDD',
      default: '#CDE2D2',
      strong: '#A9CEB1',
    },
    state: {
      success: '#3FB873',
      successSoft: '#E7F9EE',
      warning: '#EEB349',
      warningSoft: '#FFF5DC',
      error: '#F06E78',
      errorSoft: '#FFECEF',
      info: '#5FA8FF',
      infoSoft: '#ECF4FF',
      streak: '#9C7BFF',
      streakSoft: '#F2EEFF',
    },
    action: {
      primary: '#00C853',
      primaryPressed: '#00B348',
      secondary: '#E7F2FF',
      secondaryPressed: '#DCEAFF',
      neutral: '#FFFFFF',
      neutralPressed: '#F4F8F4',
      ghostPressed: '#ECF4EE',
      disabled: '#F2F6F8',
    },
  },
  space: {
    xxs: 4,
    xs: 8,
    sm: 12,
    md: 16,
    lg: 20,
    xl: 24,
    xxl: 32,
    xxxl: 40,
  },
  radius: {
    xs: 6,
    sm: 10,
    md: 14,
    lg: 18,
    xl: 22,
    xxl: 28,
    pill: 999,
  },
  typography: {
    display: {fontSize: 30, lineHeight: 38, fontWeight: '800' as const},
    h1: {fontSize: 24, lineHeight: 32, fontWeight: '700' as const},
    h2: {fontSize: 20, lineHeight: 28, fontWeight: '700' as const},
    h3: {fontSize: 18, lineHeight: 24, fontWeight: '700' as const},
    titleSm: {fontSize: 16, lineHeight: 22, fontWeight: '700' as const},
    bodyLg: {fontSize: 16, lineHeight: 24, fontWeight: '600' as const},
    body: {fontSize: 15, lineHeight: 22, fontWeight: '500' as const},
    label: {fontSize: 14, lineHeight: 20, fontWeight: '600' as const},
    caption: {fontSize: 12, lineHeight: 18, fontWeight: '500' as const},
    micro: {fontSize: 11, lineHeight: 16, fontWeight: '500' as const},

    // legacy aliases (for current screen compatibility)
    titleLg: {fontSize: 30, lineHeight: 38, fontWeight: '800' as const},
    titleMd: {fontSize: 24, lineHeight: 32, fontWeight: '700' as const},
    section: {fontSize: 18, lineHeight: 24, fontWeight: '700' as const},
    button: {fontSize: 15, lineHeight: 22, fontWeight: '600' as const},
  },
} as const;

export const shadows: Record<ShadowType, ViewStyle> = {
  none: {},
  soft: {
    shadowColor: '#163545',
    shadowOpacity: 0.08,
    shadowOffset: {width: 0, height: 4},
    shadowRadius: 10,
    elevation: 2,
  },
  focus: {
    shadowColor: '#163545',
    shadowOpacity: 0.12,
    shadowOffset: {width: 0, height: 8},
    shadowRadius: 18,
    elevation: 4,
  },
  floating: {
    shadowColor: '#163545',
    shadowOpacity: 0.16,
    shadowOffset: {width: 0, height: 12},
    shadowRadius: 24,
    elevation: 8,
  },
};

export const cardPreset: Record<CardVariant | 'default' | 'strong', ViewStyle> = {
  base: {
    backgroundColor: '#FFFFFF',
    borderColor: '#DBEBDD',
    borderWidth: 1,
  },
  soft: {
    backgroundColor: '#EEF7F0',
    borderColor: '#DBEBDD',
    borderWidth: 1,
  },
  emphasis: {
    backgroundColor: '#DFF3E6',
    borderColor: '#A9CEB1',
    borderWidth: 1,
  },
  outlined: {
    backgroundColor: '#FFFFFF',
    borderColor: '#CDE2D2',
    borderWidth: 1,
  },
  board: {
    backgroundColor: '#D8B56B',
    borderColor: 'transparent',
    borderWidth: 1,
  },
  achievement: {
    backgroundColor: '#F2EEFF',
    borderColor: '#D5CCFF',
    borderWidth: 1,
  },

  // legacy aliases
  default: {
    backgroundColor: '#FFFFFF',
    borderColor: '#DBEBDD',
    borderWidth: 1,
  },
  strong: {
    backgroundColor: '#E1F3E6',
    borderColor: '#A9CEB1',
    borderWidth: 1,
  },
};

export const buttonHeight: Record<ButtonSize, number> = {
  sm: 34,
  md: 42,
  lg: 50,
  xl: 56,
};

export const buttonPaddingX: Record<ButtonSize, number> = {
  sm: 12,
  md: 16,
  lg: 18,
  xl: 20,
};

export const buttonSizeTextPreset: Record<ButtonSize, TextStyle> = {
  sm: theme.typography.label,
  md: theme.typography.body,
  lg: theme.typography.bodyLg,
  xl: {...theme.typography.bodyLg, fontWeight: '700'},
};

export const buttonVariantPreset: Record<
  ButtonVariant,
  {backgroundColor: string; borderColor: string; pressedBackgroundColor: string}
> = {
  primary: {
    backgroundColor: '#00C853',
    borderColor: '#00C853',
    pressedBackgroundColor: '#00B348',
  },
  secondary: {
    backgroundColor: '#E7F2FF',
    borderColor: '#BFD7F5',
    pressedBackgroundColor: '#DCEAFF',
  },
  neutral: {
    backgroundColor: '#FFFFFF',
    borderColor: '#CDE2D2',
    pressedBackgroundColor: '#F4F8F4',
  },
  ghost: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    pressedBackgroundColor: '#ECF4EE',
  },
  disabled: {
    backgroundColor: '#F2F6F8',
    borderColor: '#E3EBEF',
    pressedBackgroundColor: '#F2F6F8',
  },
  success: {
    backgroundColor: '#E7F9EE',
    borderColor: '#3FB873',
    pressedBackgroundColor: '#D8F1E2',
  },
  danger: {
    backgroundColor: '#FFECEF',
    borderColor: '#F06E78',
    pressedBackgroundColor: '#FCDDE2',
  },
};

export const buttonTextPreset: Record<ButtonVariant, TextStyle> = {
  primary: {color: '#FFFFFF'},
  secondary: {color: '#1D2A33'},
  neutral: {color: '#1D2A33'},
  ghost: {color: '#567080'},
  disabled: {color: '#B4C0C8'},
  success: {color: '#2D8554'},
  danger: {color: '#B4464C'},
};

export const buttonSizePreset: Record<ButtonSize, ViewStyle> = {
  sm: {minHeight: 34, paddingHorizontal: 12},
  md: {minHeight: 42, paddingHorizontal: 16},
  lg: {minHeight: 50, paddingHorizontal: 18},
  xl: {minHeight: 56, paddingHorizontal: 20},
};

export type Theme = typeof theme;
