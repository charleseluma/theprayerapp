// Web version: turn a recording or picked file into something Supabase Storage can upload.
export type PickedAudio = {
  uri: string;
  name: string;
  mimeType: string;
  size?: number;
  durationSec: number | null;
  webFile?: File;
  source: 'recording' | 'file';
};

/** Returns the audio labelled with exactly `contentType` (browsers may add codec details Supabase rejects). */
export async function uploadBody(audio: PickedAudio, contentType: string): Promise<Blob | ArrayBuffer> {
  const blob = audio.webFile ?? (await (await fetch(audio.uri)).blob());
  return new Blob([blob], { type: contentType });
}

/** Reads the length of an audio file in the browser. */
export function measureDuration(audio: PickedAudio): Promise<number | null> {
  return new Promise((resolve) => {
    const fallback = audio.durationSec ?? null;
    const el = new Audio();
    const timer = setTimeout(() => resolve(fallback), 4000);
    const done = (v: number | null) => {
      clearTimeout(timer);
      resolve(v);
    };
    el.preload = 'metadata';
    el.onloadedmetadata = () => done(Number.isFinite(el.duration) && el.duration > 0 ? Math.round(el.duration) : fallback);
    el.onerror = () => done(fallback);
    el.src = audio.uri;
  });
}

/** The recording format the browser should use: MP4 with AAC audio plays on every phone. */
export function webRecordingMime(): string | null {
  if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) return null;
  // Only AAC: some browsers put Opus inside MP4 files, which older iPhones can't play.
  const aac = 'audio/mp4;codecs=mp4a.40.2';
  return MediaRecorder.isTypeSupported(aac) ? aac : null;
}
