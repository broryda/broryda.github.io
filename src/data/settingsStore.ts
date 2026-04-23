import RNFS from 'react-native-fs';

const SETTINGS_FILE = `${RNFS.DocumentDirectoryPath}/settings_v1.json`;

export type AppSettings = {
  useConfirmButton: boolean;
  autoNextOnCorrect: boolean;
};

const defaultSettings: AppSettings = {
  useConfirmButton: true,
  autoNextOnCorrect: true,
};

export async function loadSettings(): Promise<AppSettings> {
  try {
    const exists = await RNFS.exists(SETTINGS_FILE);
    if (!exists) return {...defaultSettings};
    const raw = await RNFS.readFile(SETTINGS_FILE, 'utf8');
    if (!raw) return {...defaultSettings};
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      useConfirmButton:
        typeof parsed.useConfirmButton === 'boolean'
          ? parsed.useConfirmButton
          : defaultSettings.useConfirmButton,
      autoNextOnCorrect:
        typeof parsed.autoNextOnCorrect === 'boolean'
          ? parsed.autoNextOnCorrect
          : defaultSettings.autoNextOnCorrect,
    };
  } catch {
    return {...defaultSettings};
  }
}

export async function saveSettings(next: AppSettings): Promise<void> {
  await RNFS.writeFile(SETTINGS_FILE, JSON.stringify(next), 'utf8');
}
