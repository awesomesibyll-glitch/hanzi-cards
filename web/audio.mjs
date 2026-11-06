import { loadRecording } from './recordings.mjs';

export function audioPreference(key,value) {
  try {
    if (value !== undefined) localStorage.setItem('hanzi-'+key,String(value));
    return localStorage.getItem('hanzi-'+key) ?? '';
  } catch { return ''; }
}

export function voiceScore(voice,language) {
  const lang=voice.lang.toLowerCase().replaceAll('_','-');
  const name=voice.name.toLowerCase();
  if (!lang.startsWith(language.slice(0,2))) return -1000;
  if(language.startsWith('en-')&&lang!==language.toLowerCase())return -1000;
  if (language==='zh-CN' && /zh-(hk|mo)|yue/i.test(lang)) return -900;
  return (lang===language.toLowerCase()?100:0)+(/premium|enhanced|natural|neural/.test(name)?80:0)+(voice.localService?15:0)+(/tingting|meijia|samantha|ava|daniel|milena/.test(name)?10:0)-(/compact|espeak/.test(name)?40:0);
}

export function availableVoices(language) {
  return (window.speechSynthesis?.getVoices() ?? [])
    .filter(voice=>voice.localService!==false && voiceScore(voice,language)>-100)
    .sort((a,b)=>voiceScore(b,language)-voiceScore(a,language));
}

export function englishAccent(value) {
  if(value)audioPreference('english-accent',value);
  return audioPreference('english-accent')==='en-GB'?'en-GB':'en-US';
}

let generation=0,context,source,current;
export function stopAudio() {
  generation++;
  if(source){try{source.stop();}catch{}source=null;}
  current=null;
  window.speechSynthesis?.cancel();
}

function systemSpeech(text,language,notify) {
  const synth=window.speechSynthesis;
  if (!synth || !window.SpeechSynthesisUtterance) {
    notify('This browser does not offer system speech. Try Safari, Chrome or Edge.');
    return;
  }
  const voiceList=availableVoices(language);
  const saved=audioPreference('voice-'+language);
  const chosen=voiceList.find(voice=>voice.voiceURI===saved) ?? voiceList[0];
  const warning=`No on-device ${language} voice is available. Install a voice for this language in your device’s speech settings.`;
  if (!chosen && synth.getVoices().length) { notify(warning); return; }
  const utterance=new SpeechSynthesisUtterance(text);
  current=utterance;
  utterance.lang=language;
  if (chosen) utterance.voice=chosen;
  utterance.rate=Number(audioPreference('speech-rate') || '1');
  utterance.onerror=event=>{
    if (current===utterance && !['canceled','interrupted'].includes(event.error)) notify(warning);
  };
  notify(chosen ? '' : 'The voice list is still unavailable. Trying your device’s default voice for this language.');
  synth.speak(utterance);
}


export async function playAudio(text,language,notify,{word=false,reading,credit=()=>{}}={}){
  stopAudio();credit(null);
  if(language.startsWith('en-'))language=englishAccent();
  const AudioEngine=window.AudioContext??window.webkitAudioContext;
  if(!word||!AudioEngine||audioPreference('recording-mode')==='system'||!['en-US','en-GB','zh-CN'].includes(language)){
    systemSpeech(text,language,notify);return;
  }
  const ticket=generation;
  try{
    context??=new AudioEngine();
    const resume=Promise.race([context.resume(),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Playback needs a tap.')),1200))]);
    const [recording]=await Promise.all([loadRecording(text,language,reading),resume]);
    if(ticket!==generation)return;
    if(recording){
      const buffer=await context.decodeAudioData(await recording.blob.arrayBuffer());
      if(ticket!==generation)return;
      source=context.createBufferSource();
      source.buffer=buffer;
      source.playbackRate.value=Number(audioPreference('speech-rate')||'1');
      source.connect(context.destination);
      source.start();
      notify('');credit(recording);return;
    }
  }catch{}
  if(ticket===generation)systemSpeech(text,language,notify);
}
