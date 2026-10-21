import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import type { MessageAttachment } from '../types/control';

const MAX_CHAT_ATTACHMENT_BYTES = 15 * 1024 * 1024;

let exportSequence = 0;

function safeOutputName(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^\.+/, '').replace(/\.+$/, '');
  if (!cleaned) return 'export';
  if (cleaned.length <= 140) return cleaned;
  // Keep the real extension so iOS can hand a long-titled export to its app.
  const lastDot = cleaned.lastIndexOf('.');
  const extension = lastDot > 0 ? cleaned.slice(lastDot) : '';
  if (extension.length >= 2 && extension.length <= 12) {
    return `${cleaned.slice(0, 140 - extension.length)}${extension}`;
  }
  return cleaned.slice(0, 140).replace(/\.+$/, '') || 'export';
}

function createCachedOutput(name: string): { file: File; safeName: string } {
  // An exported note, CSV or generated image can share a name with a previous
  // export. Keep the visible filename while isolating its bytes, including when
  // two share sheets are open at once. Cache is OS-reclaimable.
  const safeName = safeOutputName(name);
  const directory = new Directory(
    Paths.cache,
    `kory-output-${Date.now().toString(36)}-${(++exportSequence).toString(36)}`,
  );
  directory.create();
  return { file: new File(directory, safeName), safeName };
}

export type PickedFile = {
  data: string;
  name: string;
  mimeType?: string;
  size: number;
  uri: string;
};

export async function pickFiles(options?: {
  type?: string | string[];
  multiple?: boolean;
  maxTotalBytes?: number;
}): Promise<PickedFile[]> {
  const result = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
    multiple: options?.multiple ?? false,
    type: options?.type ?? '*/*',
  });
  if (result.canceled) return [];

  const maxTotalBytes = options?.maxTotalBytes ?? Number.POSITIVE_INFINITY;
  let total = 0;
  const files: PickedFile[] = [];
  for (const asset of result.assets) {
    const size = asset.size ?? new File(asset.uri).size ?? 0;
    if (size <= 0) throw new Error(`${asset.name} is empty or unavailable`);
    total += size;
    if (total > maxTotalBytes) {
      throw new Error(`Selected files exceed the ${Math.round(maxTotalBytes / 1024 / 1024)} MB limit`);
    }
    files.push({
      data: asset.base64 ?? await new File(asset.uri).base64(),
      name: asset.name,
      mimeType: asset.mimeType,
      size,
      uri: asset.uri,
    });
  }
  return files;
}

export async function pickChatAttachments(maxTotalBytes = MAX_CHAT_ATTACHMENT_BYTES): Promise<MessageAttachment[]> {
  const files = await pickFiles({ multiple: true, maxTotalBytes });
  return files.map((file) => ({
    type: file.mimeType?.startsWith('image/') ? 'image' : 'file',
    data: file.data,
    name: file.name,
    mimeType: file.mimeType,
    size: file.size,
  }));
}

export async function pickImageBase64(): Promise<PickedFile | null> {
  const files = await pickFiles({ type: 'image/*', maxTotalBytes: 25 * 1024 * 1024 });
  return files[0] ?? null;
}

export async function shareTextFile(name: string, content: string, mimeType: string): Promise<string> {
  const { file, safeName } = createCachedOutput(name);
  file.write(content);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: safeName });
  }
  return file.uri;
}

export async function shareBytesFile(name: string, bytes: Uint8Array, mimeType: string): Promise<string> {
  const { file, safeName } = createCachedOutput(name);
  file.write(bytes);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: safeName });
  }
  return file.uri;
}

export function cacheBase64File(name: string, base64: string): string {
  return writeCachedBase64(name, base64).uri;
}

function writeCachedBase64(name: string, base64: string): { uri: string; safeName: string } {
  const { file, safeName } = createCachedOutput(name);
  file.write(base64, { encoding: 'base64' });
  return { uri: file.uri, safeName };
}

export async function shareBase64File(
  name: string,
  base64: string,
  mimeType: string,
): Promise<string> {
  const { uri, safeName } = writeCachedBase64(name, base64);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType, dialogTitle: safeName });
  }
  return uri;
}
