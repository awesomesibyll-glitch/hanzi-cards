import { loadRecording } from './recordings-v12.mjs';

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

let generation=0,context,source,current,prepared;
export function stopAudio() {
  generation++;
  if(source){try{source.stop();}catch{}source=null;}
  current=null;
  const synth=window.speechSynthesis;
  if(synth?.speaking||synth?.pending)synth.cancel();
}

function systemSpeech(text,language,notify,{quiet=false}={}) {
  const synth=window.speechSynthesis;
  if (!synth || !window.SpeechSynthesisUtterance) {
    if(!quiet)notify('This browser does not offer system speech. Open Hanzi Cards in Safari or Chrome.');
    return false;
  }
  const voiceList=availableVoices(language);
  const saved=audioPreference('voice-'+language);
  const chosen=voiceList.find(voice=>voice.voiceURI===saved) ?? voiceList[0];
  const warning=`No on-device ${language} voice is available. Install a voice for this language in your device’s speech settings.`;
  if (!chosen && synth.getVoices().length) { if(!quiet)notify(warning); return false; }
  const utterance=new SpeechSynthesisUtterance(text);
  current=utterance;
  utterance.lang=language;
  if (chosen) utterance.voice=chosen;
  utterance.rate=Number(audioPreference('speech-rate') || '1');
  const blocked='The browser could not start speech. Tap the speaker again or check the voice in Audio settings.';
  const watchdog=setTimeout(()=>{if(current===utterance)notify(blocked);},4000);
  utterance.onstart=()=>{clearTimeout(watchdog);if(current===utterance)notify('');};
  utterance.onend=()=>clearTimeout(watchdog);
  utterance.onerror=event=>{
    clearTimeout(watchdog);
    if (current===utterance && !['canceled','interrupted'].includes(event.error))notify(event.error==='not-allowed'?blocked:warning);
  };
  try { synth.speak(utterance);return true; }
  catch { clearTimeout(watchdog);if(!quiet)notify(blocked);return false; }
}

const playbackLanguage=language=>language.startsWith('en-')?englishAccent():language;
function recordingEngine(language){
  return audioPreference('recording-mode')!=='system'&&['en-US','en-GB','zh-CN'].includes(language)
    ? window.AudioContext??window.webkitAudioContext : undefined;
}

export function prepareWordAudio(text,language,reading){
  language=playbackLanguage(language);
  if(!recordingEngine(language))return null;
  const key=JSON.stringify([text,language,reading]);
  if(prepared?.key===key)return prepared;
  const entry={key,settled:false,recording:null};
  entry.ready=loadRecording(text,language,reading).then(async recording=>{
    const Decoder=window.OfflineAudioContext??window.webkitOfflineAudioContext;
    if(recording&&Decoder){
      try{entry.buffer=await new Decoder(1,1,44100).decodeAudioData(await recording.blob.arrayBuffer());}
      catch{return null;}
    }
    return recording;
  }).then(recording=>{
    entry.settled=true;entry.recording=recording;return recording;
  });
  prepared=entry;
  return entry;
}

export async function playAudio(text,language,notify,{word=false,reading,credit=()=>{}}={}){
  stopAudio();credit(null);
  language=playbackLanguage(language);
  const AudioEngine=word&&recordingEngine(language);
  if(!AudioEngine){
    systemSpeech(text,language,notify);return;
  }
  const entry=prepareWordAudio(text,language,reading);
  if(entry.settled&&!entry.recording){systemSpeech(text,language,notify);return;}

  // Start system speech inside the tap if the download is still pending.
  // Never wait for the network and then call speechSynthesis.speak on iOS.
  if(!entry.recording&&systemSpeech(text,language,notify,{quiet:true}))return;
  notify('Loading pronunciation…');
  const ticket=generation;
  try{
    if(!context||context.state==='closed')context=new AudioEngine();
    let timeout;
    const resume=Promise.race([context.resume(),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('Playback needs a tap.')),1200);})])
      .finally(()=>clearTimeout(timeout));
    const [recording]=await Promise.all([entry.ready,resume]);
    if(ticket!==generation)return;
    if(recording){
      const buffer=entry.buffer??await context.decodeAudioData(await recording.blob.arrayBuffer());
      if(ticket!==generation)return;
      source=context.createBufferSource();
      source.buffer=buffer;
      source.playbackRate.value=Number(audioPreference('speech-rate')||'1');
      source.connect(context.destination);
      source.start();
      notify('');credit(recording);return;
    }
    notify(`No recording or on-device ${language} voice is available. Download the matching voice in your phone’s speech settings.`);
  }catch{
    if(ticket!==generation)return;
    // The next tap can invoke system speech synchronously if decoding fails.
    if(context?.state==='running'&&entry.recording)entry.recording=null;
    notify('This recording could not play. Tap the speaker again to retry or use the system voice.');
  }
}
