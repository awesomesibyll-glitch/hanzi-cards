import { pinyinKey } from './study.mjs';

const fold=text=>text.normalize('NFKD').toLowerCase().replace(/\p{M}/gu,'').replace(/\s+/g,' ').trim();

export function indexWords(words){
  return words.map(word=>({
    word,
    text:fold(word.text),
    translation:fold(word.translation),
    pinyin:word.sourceLanguage==='zh-CN'?pinyinKey(word.reading):''
  }));
}

export function findWords(index,query){
  const text=fold(query),pinyin=pinyinKey(query);
  if(!text)return index.map(entry=>entry.word);
  const groups=[[],[],[],[]];
  for(const entry of index){
    if(entry.text===text||(pinyin&&entry.pinyin===pinyin))groups[0].push(entry.word);
    else if(entry.translation===text)groups[1].push(entry.word);
    else if(entry.text.startsWith(text)||(pinyin&&entry.pinyin.startsWith(pinyin)))groups[2].push(entry.word);
    else if(entry.text.includes(text)||entry.translation.includes(text)||(pinyin&&entry.pinyin.includes(pinyin)))groups[3].push(entry.word);
  }
  return groups.flat();
}

export function wordsInSet(words,set){
  const ids=new Set(set.wordIds);
  return words.filter(word=>ids.has(word.id));
}
