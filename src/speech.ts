import * as Speech from 'expo-speech';
let generation = 0;
export async function speak(text: string, language: string, onError: (message: string) => void) {
  const token = ++generation;
  try {
    await Speech.stop();
    const voices = await Speech.getAvailableVoicesAsync();
    if (token !== generation) return;
    const voice = voices.find(v => v.language.toLowerCase() === language.toLowerCase())
      ?? voices.find(v => v.language.split('-')[0] === language.split('-')[0]);
    if (!voice) { onError(`Install a ${language} system voice in your phone settings.`); return; }
    Speech.speak(text, { language, voice: voice.identifier, rate: 0.8,
      onError: () => onError('Speech failed. Check installed offline voices and sound settings.') });
  } catch { if (token === generation) onError('Could not start speech.'); }
}
export function stopSpeech() { generation++; void Speech.stop(); }
