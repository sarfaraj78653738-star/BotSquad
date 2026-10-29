import { PermissionsAndroid, Platform } from 'react-native';

// Voice input for the built APK only — NOT Expo Go.
// Library: @react-native-voice/voice 3.2.4, with its Expo config plugin
// (see app.json plugins). It uses Android's SpeechRecognizer, so it needs
// a native build (expo run:android / dev build / release APK). In Expo Go
// the native module is absent, and startVoice() fails with a clear
// VOICE_NATIVE_MISSING error instead of faking a transcript.
// NOTE: the library is deprecated upstream in favour of
// expo-speech-recognition. That successor is the right move when this app
// upgrades to a newer Expo SDK; it was NOT swapped in here because this
// app is on Expo SDK 52 / React Native 0.76, and @react-native-voice/voice
// is the version verified against that stack. No transcript is ever faked.

export class VoiceError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

function loadVoice(): any {
  try {
    // Lazy require so the module load itself never crashes the chat screen.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@react-native-voice/voice');
    return mod?.default ?? mod ?? null;
  } catch {
    return null;
  }
}

export async function startVoice(
  onPartial: (text: string) => void,
  onFinal: (text: string) => void,
  onError: (message: string) => void,
): Promise<() => Promise<void>> {
  // Set while the stop function runs: Android's recognizer fires a
  // "client side error" (code 5) when it is torn down, so an error
  // arriving during teardown is the stop itself, not a failure — it
  // must never surface as a scary "5/Client side error" line after
  // the user simply turned the mic off.
  let stopping = false;
  const Voice = loadVoice();
  if (!Voice || typeof Voice.start !== 'function') {
    throw new VoiceError(
      'VOICE_NATIVE_MISSING',
      'Voice needs the built APK (native build), not Expo Go. Build with "npx expo run:android" and try the mic again — no transcript was faked.',
    );
  }
  if (Platform.OS === 'android') {
    const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
    if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
      throw new VoiceError('VOICE_PERMISSION_DENIED', 'Microphone permission was denied. Allow microphone access in Android Settings and try again.');
    }
  }
  try {
    const available = await Voice.isAvailable();
    if (available === 0) {
      throw new VoiceError(
        'VOICE_NOT_AVAILABLE',
        'No speech-recognition service is available on this device (Google speech services are usually required on Android).',
      );
    }
  } catch (e) {
    if (e instanceof VoiceError) throw e;
    // isAvailable failing on some devices is not fatal — start() will surface the real error.
  }

  Voice.onSpeechPartialResults = (e: any) => {
    const v = e?.value?.[0];
    if (typeof v === 'string' && v) onPartial(v);
  };
  Voice.onSpeechResults = (e: any) => {
    const v = e?.value?.[0];
    if (typeof v === 'string' && v) onFinal(v);
  };
  Voice.onSpeechError = (e: any) => {
    if (stopping) return;
    const raw = e?.error;
    const code = raw && typeof raw === 'object' ? String(raw.code ?? '') : '';
    let message = raw && typeof raw === 'object' ? String(raw.message ?? '') : typeof raw === 'string' ? raw : '';
    // The library may report "5/Client side error" as one string;
    // never show a raw code prefix to the user.
    message = message.replace(/^\d+\//, '').trim();
    // Benign recognizer noise: tearing down (5), saying nothing (6/7).
    // These are not failures — stay silent instead of alarming the
    // user with an error line for a mic they just turned off.
    const benign = code === '5' || code === '6' || code === '7'
      || /client side error/i.test(message)
      || /no match/i.test(message)
      || /no speech|speech timeout/i.test(message);
    if (benign) return;
    onError(message || 'Speech recognition failed. Try again, or type instead.');
  };
  Voice.onSpeechEnd = () => {};
  await Voice.start('en-US');

  return async () => {
    stopping = true;
    try { await Voice.stop(); } catch { /* already stopped */ }
    try { await Voice.destroy(); } catch { /* already destroyed */ }
    Voice.onSpeechPartialResults = () => {};
    Voice.onSpeechResults = () => {};
    Voice.onSpeechError = () => {};
  };
}
