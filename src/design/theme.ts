export const theme = {
  color: {
    bg: {
      page: '#F7F5EE',
      surface: '#F1F6F3',
      surfaceStrong: '#E6F0EF',
      board: '#C7AE73',
      overlay: 'rgba(23, 28, 35, 0.32)',
    },
    text: {
      primary: '#1E2A2A',
      secondary: '#5E6E6E',
      tertiary: '#7F8A8A',
      inverse: '#F8FAFA',
    },
    border: {
      soft: '#D7E4E0',
      strong: '#C5D8D4',
      focus: '#8FB6AC',
    },
    action: {
      primary: '#2C6F76',
      primaryPressed: '#245B61',
      secondary: '#E4F0EE',
      secondaryPressed: '#D2E6E1',
      neutral: '#EEF3F3',
      neutralPressed: '#E2EBEB',
      ghostPressed: '#E6ECEB',
      disabled: '#DCE4E4',
    },
    state: {
      success: '#1E9A57',
      warning: '#C98B2E',
      error: '#D45454',
      info: '#3A77A8',
      neutral: '#7B8888',
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
  },
  radius: {
    sm: 10,
    md: 14,
    lg: 18,
    xl: 22,
    pill: 999,
  },
  typography: {
    titleLg: {fontSize: 30, fontWeight: '800' as const, lineHeight: 36},
    titleMd: {fontSize: 24, fontWeight: '800' as const, lineHeight: 30},
    section: {fontSize: 18, fontWeight: '700' as const, lineHeight: 24},
    body: {fontSize: 14, fontWeight: '500' as const, lineHeight: 20},
    caption: {fontSize: 12, fontWeight: '500' as const, lineHeight: 16},
    button: {fontSize: 15, fontWeight: '700' as const, lineHeight: 20},
  },
};

export const shadows = {
  none: {},
  soft: {
    shadowColor: '#24403D',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: {width: 0, height: 4},
    elevation: 2,
  },
  focus: {
    shadowColor: '#1D4E49',
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: {width: 0, height: 6},
    elevation: 3,
  },
};

export const cardPreset = {
  default: {
    backgroundColor: theme.color.bg.surface,
    borderColor: theme.color.border.soft,
    borderWidth: 1,
  },
  strong: {
    backgroundColor: theme.color.bg.surfaceStrong,
    borderColor: theme.color.border.strong,
    borderWidth: 1,
  },
  outlined: {
    backgroundColor: theme.color.bg.page,
    borderColor: theme.color.border.soft,
    borderWidth: 1,
  },
  board: {
    backgroundColor: theme.color.bg.board,
    borderColor: '#B9A064',
    borderWidth: 1,
  },
};

export const buttonVariantPreset = {
  primary: {
    backgroundColor: theme.color.action.primary,
    borderColor: '#225A60',
    pressedBackgroundColor: theme.color.action.primaryPressed,
  },
  secondary: {
    backgroundColor: theme.color.action.secondary,
    borderColor: theme.color.border.strong,
    pressedBackgroundColor: theme.color.action.secondaryPressed,
  },
  neutral: {
    backgroundColor: theme.color.action.neutral,
    borderColor: theme.color.border.soft,
    pressedBackgroundColor: theme.color.action.neutralPressed,
  },
  ghost: {
    backgroundColor: 'transparent',
    borderColor: theme.color.border.soft,
    pressedBackgroundColor: theme.color.action.ghostPressed,
  },
  disabled: {
    backgroundColor: theme.color.action.disabled,
    borderColor: theme.color.border.soft,
    pressedBackgroundColor: theme.color.action.disabled,
  },
};

export const buttonTextPreset = {
  primary: {color: theme.color.text.inverse},
  secondary: {color: theme.color.text.primary},
  neutral: {color: theme.color.text.primary},
  ghost: {color: theme.color.text.secondary},
  disabled: {color: '#8E9898'},
};

export const buttonSizePreset = {
  sm: {minHeight: 34, paddingHorizontal: 10, paddingVertical: 6},
  md: {minHeight: 42, paddingHorizontal: 12, paddingVertical: 8},
  lg: {minHeight: 52, paddingHorizontal: 14, paddingVertical: 10},
  xl: {minHeight: 60, paddingHorizontal: 16, paddingVertical: 12},
};

export type Theme = typeof theme;
