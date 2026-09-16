import { requireNativeModule } from 'expo';

type Native = {
  chooseAccount(): Promise<string>;
  authorize(email: string, interactive: boolean): Promise<string>;
  clearToken(token: string): Promise<void>;
};

const native = requireNativeModule<Native>('GoogleAuth');

/** Opens the system Google account picker; resolves with the chosen email. */
export const chooseGoogleAccount = () => native.chooseAccount();
/**
 * A Google Drive (drive.file) access token for exactly this account. With interactive=false it never shows UI
 * and rejects with ERR_NEEDS_CONSENT.
 */
export const getDriveToken = (email: string, interactive: boolean) => native.authorize(email, interactive);
export const clearDriveToken = (token: string) => native.clearToken(token);
