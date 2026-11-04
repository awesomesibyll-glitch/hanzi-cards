// System voice selection plus attributed, unmodified human English recordings.
const CACHE='hanzi-audio-v1';
const preferences={get(key,fallback=''){try{return localStorage.getItem('hanzi-'+key)??fallback;}catch{return fallback;}},set(key,value){try{localStorage.setItem('hanzi-'+key,value);}catch{}}};
let player,objectUrl,generation=0;
const ready=new Map(),pending=new Map();
export function audioPreference(key,value){if(value!==undefined)preferences.set(key,String(value));return preferences.get(key);}
export function voiceScore(voice,language){
  const lang=voice.lang.toLowerCase();const name=voice.name.toLowerCase();
  if(!lang.startsWith(language.slice(0,2)))return -1000;
  if(language==='zh-CN'&&/zh-(hk|mo)|yue/i.test(lang))return -900;
  return (lang===language.toLowerCase()?100:0)+(/premium|enhanced|natural|neural/.test(name)?80:0)+(voice.localService?15:0)+(/tingting|meijia|samantha|ava|daniel|milena/.test(name)?10:0)-( /compact|espeak/.test(name)?40:0);
}
export function availableVoices(language){return (window.speechSynthesis?.getVoices()??[]).filter(v=>voiceScore(v,language)>-100).sort((a,b)=>voiceScore(b,language)-voiceScore(a,language));}
export function stopAudio(){generation++;window.speechSynthesis?.cancel();if(player)player.pause();}
function key(word){return new URL('./recorded-english/'+encodeURIComponent(word.toLowerCase()),location.href).href;}
export async function prepareRecording(word){
  if(!/^[a-z]+(?:[-'][a-z]+)?$/i.test(word)||word.length>35)return null;
  word=word.toLowerCase();if(ready.has(word))return ready.get(word);if(pending.has(word))return pending.get(word);
  const task=(async()=>{
    try{
      const cache=await caches.open(CACHE);let response=await cache.match(key(word));
      if(!response&&navigator.onLine){
        const result=await fetch('https://api.dictionaryapi.dev/api/v2/entries/en/'+encodeURIComponent(word),{signal:AbortSignal.timeout(6000)});
        if(!result.ok)return null;
        const entries=await result.json();
        const clips=entries.flatMap(e=>e.phonetics??[]).filter(p=>p.audio?.startsWith('https://api.dictionaryapi.dev/media/')&&p.sourceUrl?.startsWith('https://commons.wikimedia.org/')&&p.license?.url?.startsWith('https://creativecommons.org/'));
        const clip=clips.find(p=>p.audio.includes('-us.'))??clips.find(p=>p.audio.includes('-uk.'))??clips[0];
        if(!clip)return null;
        const download=await fetch(clip.audio,{signal:AbortSignal.timeout(10000)});if(!download.ok)return null;
        const blob=await download.blob();if(blob.size>1500000||!blob.type.startsWith('audio/'))return null;
        response=new Response(blob,{headers:{'Content-Type':blob.type,'X-Audio-Source':clip.sourceUrl,'X-Audio-License':clip.license.url,'X-Audio-License-Name':clip.license.name}});
        await cache.put(key(word),response.clone());
      }
      if(!response)return null;
      const recording={blob:await response.blob(),source:response.headers.get('X-Audio-Source'),license:response.headers.get('X-Audio-License'),licenseName:response.headers.get('X-Audio-License-Name')};ready.set(word,recording);return recording;
    }catch{return null;}finally{pending.delete(word);}
  })();pending.set(word,task);return task;
}
export function warmAudio(text,language){if(language.startsWith('en')&&preferences.get('audio-mode','recorded')==='recorded')void prepareRecording(text);}
function systemSpeak(text,language,notify){
  if(!window.speechSynthesis){notify('System speech is unavailable. Choose recorded English audio or another browser.');return;}
  const utterance=new SpeechSynthesisUtterance(text);utterance.lang=language;
  utterance.rate=Number(preferences.get('speech-rate','0.95'));
  const voices=availableVoices(language),saved=preferences.get('voice-'+language);
  const chosen=voices.find(v=>v.voiceURI===saved)??voices[0];if(chosen)utterance.voice=chosen;
  utterance.onerror=e=>{if(!['canceled','interrupted'].includes(e.error))notify('Tap Play again. Download a system voice in iPhone Settings if needed.');};
  speechSynthesis.speak(utterance);
}
export async function playAudio(text,language,notify,attribution){
  stopAudio();const token=generation;attribution(null);
  if(language.startsWith('en')&&preferences.get('audio-mode','recorded')==='recorded'){
    const clip=ready.get(text.toLowerCase())??await prepareRecording(text);
    if(token!==generation)return;
    if(clip){
      if(!player)player=new Audio();if(objectUrl)URL.revokeObjectURL(objectUrl);
      objectUrl=URL.createObjectURL(clip.blob);player.src=objectUrl;player.playbackRate=Number(preferences.get('speech-rate','0.95'));
      attribution(clip);
      try{await player.play();return;}catch(e){if(e.name==='NotAllowedError'){notify('Recording is ready. Tap the sound button again to allow playback.');return;}}
    }
  }
  if(token===generation)systemSpeak(text,language,notify);
}
