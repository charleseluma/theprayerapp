// iPhone and Android version: read the recorded or picked file from the device.
import { File } from 'expo-file-system';

export type PickedAudio = {
  uri: string;
  name: string;
  mimeType: string;
  size?: number;
  durationSec: number | null;
  webFile?: undefined;
  source: 'recording' | 'file';
};

export async function uploadBody(audio: PickedAudio, _contentType: string): Promise<ArrayBuffer> {
  const bytes = await new File(audio.uri).bytes();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export function measureDuration(audio: PickedAudio): Promise<number | null> {
  return Promise.resolve(audio.durationSec);
}

export function webRecordingMime(): string | null {
  return null;
}
