import { schedule, DAY } from './modules/srs.mjs';
import { beginnerExamples } from './examples.mjs';
import { advancedExamples } from './advanced-examples.mjs';

// Common entries double as an offline input method and a set of natural examples.
const chinese = [
  ['你好','nǐ hǎo','你好，很高兴见到你。','Hello, nice to meet you.'],
  ['泥壕','ní háo'], ['谢谢','xiè xie','谢谢你的帮助。','Thank you for your help.'],
  ['再见','zài jiàn','明天见，再见！','See you tomorrow, goodbye!'],
  ['中国','zhōng guó','我在中国学习。','I study in China.'],
  ['学习','xué xí','我每天学习汉语。','I study Chinese every day.'],
  ['汉语','hàn yǔ','她会说汉语。','She can speak Chinese.'],
  ['朋友','péng you','他是我的朋友。','He is my friend.'],
  ['今天','jīn tiān','今天我很忙。','I am busy today.'],
  ['明天','míng tiān','我们明天见。','See you tomorrow.'],
  ['喜欢','xǐ huan','我喜欢喝茶。','I like drinking tea.'],
  ['苹果','píng guǒ','我买了两个苹果。','I bought two apples.'],
  ['茶','chá','你想喝茶吗？','Would you like some tea?'],
  ['吃饭','chī fàn','我们一起吃饭吧。','Let’s eat together.'],
  ['对不起','duì bu qǐ','对不起，我来晚了。','Sorry I am late.'],
  ['没关系','méi guān xi','没关系，我也刚到。','It’s okay. I just arrived too.'],
  ['早上好','zǎo shang hǎo','早上好，你今天忙吗？','Good morning. Are you busy today?'],
  ['是','shì','她是我的老师。','She is my teacher.'], ['事','shì'], ['十','shí'], ['时','shí'],
  ['我','wǒ','我住在北京。','I live in Beijing.'], ['你','nǐ','你想去哪里？','Where do you want to go?'],
  ['水','shuǐ','请给我一杯水。','Please give me a glass of water.'], ['好','hǎo','这个办法很好。','This idea is very good.'],
  ['家','jiā','我现在要回家。','I need to go home now.'], ['学校','xué xiào','学校离这里不远。','The school is not far from here.']
];
const english = {
  hello:['She smiled and said hello.','Она улыбнулась и поздоровалась.'],
  apple:['I ate an apple after lunch.','Я съел яблоко после обеда.'],
  friend:['I met a friend at the station.','Я встретил друга на вокзале.'],
  water:['Could I have a glass of water?','Можно мне стакан воды?'],
  learn:['I want to learn another language.','Я хочу выучить ещё один язык.'],
  book:['I left the book on the table.','Я оставил книгу на столе.'],
  the:['The door is open.','Дверь открыта.'],
  and:['I bought bread and milk.','Я купил хлеб и молоко.'],
  go:['I go to school by bus.','Я езжу в школу на автобусе.'],
  good:['That sounds like a good idea.','Звучит как хорошая идея.']
};
const examples = new Map(chinese.filter(row => row[2]).map(([word,, sentence, translation]) => [word,[sentence,translation]]));
const fold = text => text.toLowerCase().normalize('NFD').replace(/u\u0308/g,'v').replace(/\p{M}/gu,'').normalize('NFC');
export const pinyinKey = text => fold(text.toLowerCase().replace(/u:/g,'v')).replace(/[\s'’\-0-5]+/g,'');
export function pinyinChoices(text) {
  const key = pinyinKey(text);
  if (!key || !/^[a-z]+$/.test(key)) return [];
  return chinese.filter(([, reading]) => pinyinKey(reading).startsWith(key))
    .sort((a,b) => Number(pinyinKey(b[1]) === key) - Number(pinyinKey(a[1]) === key)).slice(0,8);
}

export function withContext(word) {
  if (word.sentence?.trim() && word.sentenceTranslation?.trim()) return word;
  const zh = word.sourceLanguage === 'zh-CN';
  const example = (!zh&&word.level>=4 ? advancedExamples.get(word.text) : undefined) ??
    (zh ? examples.get(word.text) : Object.hasOwn(english,word.text) ? english[word.text] : undefined) ??
    beginnerExamples[zh?'zh':'en'].get(word.text);
  const [sentence, sentenceTranslation] = example ?? (zh
    ? [`我正在学习“${word.text}”这个词。`, `I’m learning the word “${word.text}”.`]
    : [`I’m learning the word “${word.text}”.`, `Я учу слово «${word.text}».`]);
  return {...word, sentence, sentenceTranslation, contextKind:example ? 'example' : 'practice'};
}

export function checkAnswer(word, input) {
  const normalize = text => text.normalize('NFKC').trim().toLowerCase().replace(/[‘’]/g,"'").replace(/\s+/g,' ');
  const answer = normalize(input);
  if (!answer) return false;
  return answer === normalize(word.text) || (word.sourceLanguage === 'zh-CN' && pinyinKey(answer) === pinyinKey(word.reading));
}

function toneSpelling(value){
  const text=value.toLowerCase().normalize('NFC').replace(/u:|v/g,'ü').replace(/[\s'’\-]+/g,'');
  if(!/[0-5]/.test(text))return text;
  if(!/^(?:[a-zü]+[0-5])+$/u.test(text))return '';
  const marks=['','\u0304','\u0301','\u030c','\u0300',''];
  return text.replace(/([a-zü]+)([0-5])/gu,(_,syllable,tone)=>{
    const index=[syllable.indexOf('a'),syllable.indexOf('e'),syllable.indexOf('ou'),syllable.search(/[iouü](?!.*[iouü])/u)].find(i=>i>=0);
    if(index===undefined)return syllable+marks[tone];
    return syllable.slice(0,index+1)+marks[tone]+syllable.slice(index+1);
  }).normalize('NFC');
}

export function checkDictation(word,input,mode){
  if(mode==='listen-tones'){
    const expected=toneSpelling(word.reading);
    return Boolean(expected)&&toneSpelling(input)===expected;
  }
  if(mode==='listen-sentence'){
    const zh=word.sourceLanguage==='zh-CN';
    const normalize=value=>value.normalize('NFKC').toLowerCase().replace(/[‘’]/g,"'")
      .replace(/[^\p{L}\p{N}'\s]+/gu,zh?'':' ').replace(/\s+/g,zh?'':' ').trim();
    const answer=normalize(input);
    return Boolean(answer)&&answer===normalize(word.sentence);
  }
  return checkAnswer(word,input);
}

export function clozeSentence(word) {
  if (word.contextKind==='practice' || !word.sentence || !word.text) return '';
  const literal=word.text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const pattern=word.sourceLanguage==='zh-CN' ? literal : `(?<![\\p{L}\\p{N}])${literal}(?![\\p{L}\\p{N}])`;
  const prompt=word.sentence.replace(new RegExp(pattern,'giu'),'____');
  return prompt===word.sentence ? '' : prompt;
}

export function studySchedule(progress, rating, now, rule = 2) {
  const next = schedule(progress, rating, now);
  if (rule !== 2 || rating === 'Again' || rating === 'Easy') return next;
  const interval = rating === 'Good' ? Math.max(1, progress.interval * 2) : Math.max(1, progress.interval + 1);
  const days = Math.min(36500, interval);
  return {...next, interval:days, due:now + days * DAY};
}

export function studyQueue(cards, reviews, limit, now = Date.now()) {
  const day = new Date(now);
  day.setHours(0,0,0,0);
  const firstReviews = new Map();
  for (const review of reviews) {
    if(review.reviewedAt>now)continue;
    const previous = firstReviews.get(review.wordId) ?? Infinity;
    if (review.reviewedAt < previous) firstReviews.set(review.wordId, review.reviewedAt);
  }
  const startedToday = [...firstReviews.values()].filter(time => time >= +day && time <= now).length;
  const byRank = (a,b) => (a.rank ?? 999999) - (b.rank ?? 999999) || a.id.localeCompare(b.id);
  const due = cards.filter(card => card.due > 0 && card.due <= now).sort((a,b) => a.due - b.due || byRank(a,b));
  const fresh = cards.filter(card => !card.due).sort(byRank);
  const remaining = Math.max(0, limit - startedToday);
  const newCards=fresh.filter(card=>!firstReviews.has(card.id));
  const allowed=new Set(newCards.slice(0,remaining).map(card=>card.id));
  const available=fresh.filter(card=>firstReviews.has(card.id)||allowed.has(card.id));
  return {queue:[...due,...available], limited:available.length < fresh.length};
}

export function mistakeQueue(cards,reviews,completed) {
  const scores=new Map();
  for(const review of reviews){
    if(review.rating!=='Again'&&review.mistake!==true)continue;
    const score=scores.get(review.wordId)??{count:0,last:0};
    score.count++;
    score.last=Math.max(score.last,review.reviewedAt);
    scores.set(review.wordId,score);
  }
  return cards.filter(card=>scores.has(card.id)&&!completed.has(card.id)).sort((a,b)=>{
    const first=scores.get(a.id),second=scores.get(b.id);
    return second.count-first.count||second.last-first.last||a.id.localeCompare(b.id);
  });
}

export function quickRefresh(cards,reviews,seen,queueLength,now=Date.now()){
  const midnight=new Date(now);
  midnight.setHours(0,0,0,0);
  const today=+midnight;
  if(Object.values(seen).some(time=>time>=today&&time<=now))return null;
  if(queueLength&&reviews.filter(review=>review.reviewedAt>=today&&review.reviewedAt<=now).length<5)return null;
  const latest=new Map();
  for(const review of reviews)if(review.reviewedAt<=now){
    latest.set(review.wordId,Math.max(latest.get(review.wordId)??0,review.reviewedAt));
  }
  return cards.filter(card=>card.due>now&&card.interval>=7&&latest.has(card.id)&&now-latest.get(card.id)>=7*DAY)
    .sort((a,b)=>(seen[a.id]??0)-(seen[b.id]??0)||latest.get(a.id)-latest.get(b.id)||a.id.localeCompare(b.id))[0]??null;
}

export function resumableCard(queue,refresh,saved,scope){
  if(!saved||saved.scope!==scope)return null;
  const card=saved.refresh?refresh:queue.find(item=>item.id===saved.wordId);
  return card&&card.id===saved.wordId&&card.due===saved.due&&card.repetitions===saved.repetitions?card:null;
}
