import RNFS from 'react-native-fs';

const SETTINGS_FILE = `${RNFS.DocumentDirectoryPath}/settings_v1.json`;

export type AppSettings = {
  useConfirmButton: boolean;
  autoNextOnCorrect: boolean;
  profileName: string;
  profileIcon: string;
  deviceId: string;
  nicknamePromptDismissed: boolean;
};

const defaultSettings: AppSettings = {
  useConfirmButton: true,
  autoNextOnCorrect: true,
  profileName: '사용자',
  profileIcon: '🦉',
  deviceId: '',
  nicknamePromptDismissed: false,
};

function makeDeviceId(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  const ts = Date.now().toString(36);
  return `dev_${ts}_${rand}`;
}

export async function loadSettings(): Promise<AppSettings> {
  try {
    const exists = await RNFS.exists(SETTINGS_FILE);
    if (!exists) {
      const created = {...defaultSettings, deviceId: makeDeviceId()};
      await saveSettings(created);
      return created;
    }
    const raw = await RNFS.readFile(SETTINGS_FILE, 'utf8');
    if (!raw) {
      const created = {...defaultSettings, deviceId: makeDeviceId()};
      await saveSettings(created);
      return created;
    }
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    const next: AppSettings = {
      useConfirmButton:
        typeof parsed.useConfirmButton === 'boolean'
          ? parsed.useConfirmButton
          : defaultSettings.useConfirmButton,
      autoNextOnCorrect:
        typeof parsed.autoNextOnCorrect === 'boolean'
          ? parsed.autoNextOnCorrect
          : defaultSettings.autoNextOnCorrect,
      profileName:
        typeof parsed.profileName === 'string' && parsed.profileName.trim().length > 0
          ? parsed.profileName.trim()
          : defaultSettings.profileName,
      profileIcon:
        typeof parsed.profileIcon === 'string' && parsed.profileIcon.trim().length > 0
          ? parsed.profileIcon.trim()
          : defaultSettings.profileIcon,
      deviceId:
        typeof parsed.deviceId === 'string' && parsed.deviceId.trim().length > 0
          ? parsed.deviceId.trim()
          : makeDeviceId(),
      nicknamePromptDismissed:
        typeof parsed.nicknamePromptDismissed === 'boolean'
          ? parsed.nicknamePromptDismissed
          : defaultSettings.nicknamePromptDismissed,
    };
    if (
      next.deviceId !== parsed.deviceId ||
      next.nicknamePromptDismissed !== parsed.nicknamePromptDismissed
    ) {
      await saveSettings(next);
    }
    return next;
  } catch {
    return {...defaultSettings, deviceId: makeDeviceId()};
  }
}

export async function saveSettings(next: AppSettings): Promise<void> {
  await RNFS.writeFile(SETTINGS_FILE, JSON.stringify(next), 'utf8');
}

