const cacheName='hanzi-pronunciation-v2';
const accents={'en-US':'us','en-GB':'uk'};
const positive=new Map();
const missing=new Set();
const pending=new Map();

export function englishRecording(entries,language){
  const accent=accents[language];
  if(!accent||!Array.isArray(entries))return null;
  for(const phonetic of entries.flatMap(entry=>entry.phonetics??[])){
    if(!phonetic.audio?.startsWith('https://api.dictionaryapi.dev/media/')||
        !new RegExp(`-${accent}\\.(?:mp3|ogg|wav)$`,'i').test(phonetic.audio)||
        !phonetic.sourceUrl?.startsWith('https://commons.wikimedia.org/')||
        !phonetic.license?.url?.startsWith('https://creativecommons.org/'))continue;
    return {url:phonetic.audio,source:phonetic.sourceUrl,license:phonetic.license.url};
  }
  return null;
}

function plain(html){
  const template=document.createElement('template');
  template.innerHTML=html??'';
  return template.content.textContent.trim();
}

async function mandarinRecording(text,reading,signal){
  if(!/^[\p{Script=Han}]+$/u.test(text)||!reading)return null;
  const pinyin=reading.normalize('NFC').toLowerCase().replace(/[\s'’]/g,'');
  if(!/^[\p{Script=Latin}\p{M}]+$/u.test(pinyin))return null;
  const query=new URLSearchParams({action:'query',format:'json',origin:'*',redirects:'1',prop:'imageinfo',
    iiprop:'url|extmetadata',iiextmetadatafilter:'ImageDescription|Artist|LicenseUrl',
    titles:`File:Zh-${pinyin}.ogg|File:Cmn-${pinyin}.ogg`});
  const response=await fetch('https://commons.wikimedia.org/w/api.php?'+query,{signal,credentials:'omit'});
  if(!response.ok)throw new Error('Recording lookup failed.');
  const pages=Object.values((await response.json()).query?.pages??{});
  for(const page of pages){
    const info=page.imageinfo?.[0],metadata=info?.extmetadata;
    const source=info?.descriptionurl,license=metadata?.LicenseUrl?.value?.replace(/^http:/,'https:');
    const description=plain(metadata?.ImageDescription?.value);
    if(!info?.url?.startsWith('https://upload.wikimedia.org/')||!source?.startsWith('https://commons.wikimedia.org/')||
        !license?.startsWith('https://creativecommons.org/')||
        !/(mandarin|standard chinese|in chinese)/i.test(description)||/cantonese|hokkien|shanghainese/i.test(description))continue;
    return {url:info.url,source,license,artist:plain(metadata?.Artist?.value).slice(0,150)};
  }
  return null;
}

async function findRecording(text,language,reading,signal){
  if(language==='zh-CN')return mandarinRecording(text,reading,signal);
  if(!accents[language]||!/^[a-z]+(?:[-'][a-z]+)?$/i.test(text)||text.length>40)return null;
  const response=await fetch('https://api.dictionaryapi.dev/api/v2/entries/en/'+encodeURIComponent(text.toLowerCase()),{signal,credentials:'omit'});
  if(response.status===404)return null;
  if(!response.ok)throw new Error('Recording lookup failed.');
  return englishRecording(await response.json(),language);
}

export function loadRecording(text,language,reading){
  const identity=JSON.stringify([language,text.toLowerCase(),reading??'']);
  if(positive.has(identity))return Promise.resolve(positive.get(identity));
  if(missing.has(identity))return Promise.resolve(null);
  if(pending.has(identity))return pending.get(identity);
  const task=(async()=>{
    try{
      const key=new URL('./recordings/'+encodeURIComponent(identity),location.href).href;
      const cache=await globalThis.caches?.open(cacheName).catch(()=>null);
      let response=await cache?.match(key);
      if(!response&&navigator.onLine){
        const signal=AbortSignal.timeout(4500);
        const clip=await findRecording(text,language,reading,signal);
        if(!clip){missing.add(identity);return null;}
        const download=await fetch(clip.url,{signal,credentials:'omit'});
        if(!download.ok)return null;
        const blob=await download.blob();
        if(blob.size>500_000||!blob.type.startsWith('audio/'))return null;
        response=new Response(blob,{headers:{'Content-Type':blob.type,'X-Source':clip.source,'X-License':clip.license,'X-Artist':encodeURIComponent(clip.artist??'')}});
        if(cache)try{
          await cache.put(key,response.clone());
          const keys=await cache.keys();
          for(const old of keys.slice(0,Math.max(0,keys.length-200)))await cache.delete(old);
        }catch{}
      }
      if(!response)return null;
      const recording={blob:await response.blob(),source:response.headers.get('X-Source'),license:response.headers.get('X-License'),artist:decodeURIComponent(response.headers.get('X-Artist')??'')};
      if(positive.size>=20)positive.delete(positive.keys().next().value);
      positive.set(identity,recording);
      return recording;
    }catch{return null;}
  })().finally(()=>pending.delete(identity));
  pending.set(identity,task);
  return task;
}
