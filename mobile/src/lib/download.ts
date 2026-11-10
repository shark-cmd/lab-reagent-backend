import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { API_ROOT, getAuthToken } from './api';

function mimeFor(filename: string): string {
  if (filename.endsWith('.csv')) return 'text/csv';
  if (filename.endsWith('.pdf')) return 'application/pdf';
  if (filename.endsWith('.json')) return 'application/json';
  return 'application/octet-stream';
}

/**
 * Download an authenticated backend file (CSV export, JSON backup, PO PDF) and
 * hand it to the OS share/save sheet. Replaces the web app's blob + anchor download.
 */
export async function downloadAndShare(path: string, filename: string): Promise<void> {
  const url = `${API_ROOT}${path}`;
  const token = getAuthToken();
  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;

  if (Platform.OS === 'web') {
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const anyGlobal = globalThis as unknown as {
      URL: { createObjectURL: (b: Blob) => string; revokeObjectURL: (u: string) => void };
      document: { createElement: (t: string) => any; body: { appendChild: (n: any) => void } };
    };
    const objectUrl = anyGlobal.URL.createObjectURL(blob);
    const a = anyGlobal.document.createElement('a');
    a.href = objectUrl;
    a.download = filename;
    anyGlobal.document.body.appendChild(a);
    a.click();
    a.remove?.();
    anyGlobal.URL.revokeObjectURL(objectUrl);
    return;
  }

  const target = `${FileSystem.cacheDirectory}${filename}`;
  const res = await FileSystem.downloadAsync(url, target, { headers });
  if (res.status !== 200) throw new Error(`HTTP ${res.status}`);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(res.uri, { mimeType: mimeFor(filename), dialogTitle: filename });
  }
}
