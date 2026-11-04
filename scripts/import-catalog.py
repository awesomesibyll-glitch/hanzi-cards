"""Build the web catalog from downloaded, openly licensed source snapshots.

Usage: python scripts/import-catalog.py PATH_TO_DATASET_DIRECTORY
Inputs: hsk.json (complete-hsk-vocabulary v1.4), en-words.jsonl and en-ru.jsonl
(Vocab Bloom Hub 0.3.1), frequency.txt (Google 10k, used only for selection/order).
Character medians come from the installed hanzi-writer-data package.
"""
import json
import re
import sys
import gzip
from pathlib import Path
from collections import Counter

root=Path(__file__).resolve().parent.parent
source=Path(sys.argv[1])
out=root/'web/data'
out.mkdir(parents=True,exist_ok=True)
old=json.loads((root/'src/data/words.json').read_text(encoding='utf-8'))
old_ids={w['text']:w['id'] for w in old}
chinese=[]
parts={'n':'Nouns','v':'Verbs','a':'Adjectives','d':'Adverbs','r':'Pronouns','m':'Numbers','q':'Classifiers','p':'Prepositions','c':'Conjunctions','i':'Expressions'}
for w in json.loads((source/'hsk.json').read_text(encoding='utf-8')):
    levels=[int(l[4:]) for l in w['level'] if re.fullmatch(r'new-[1-7]',l)]
    if not levels or not w['forms']:continue
    form=w['forms'][0]
    meaning='; '.join(form['meanings'][:4])[:480]
    reading=form['transcriptions']['pinyin']
    if not meaning or not reading:continue
    text=w['simplified']
    chinese.append(dict(id=old_ids.get(text,'hsk3-'+text),text=text,reading=reading,translation=meaning,level=min(levels),topic=parts.get((w.get('pos') or [''])[0],'General'),sourceLanguage='zh-CN',targetLanguage='en-US',rank=w.get('frequency',999999),dataset='complete-hsk-vocabulary-v1.4',levelSystem='HSK 3.0 (2021)',generated=False))
chinese.sort(key=lambda w:(w['level'],w['rank'],w['text']))
translations={}
with (source/'en-ru.jsonl').open(encoding='utf-8') as file:
    for line in file:
        w=json.loads(line)
        variants=[v.strip() for v in w.get('variants_of_words',[]) if isinstance(v,str) and re.search('[а-яА-Я]',v)]
        if variants:translations[(w['word'].lower(),w['part_of_speech'])]='; '.join(dict.fromkeys(variants))[:380]
frequency={w.strip():i for i,w in enumerate((source/'frequency.txt').read_text(encoding='utf-8').splitlines())}
english={}
with (source/'en-words.jsonl').open(encoding='utf-8') as file:
    for line in file:
        w=json.loads(line);text=w['word'].lower();pos=w['part_of_speech'];level=w.get('word_level','')
        translation=translations.get((text,pos))
        if not translation or w.get('is_obsolete') or w.get('noun___is_proper') or w.get('is_abbreviation') or not re.fullmatch(r"[a-z]+(?:[-'][a-z]+)?",text) or len(text)>28 or level not in ['A1','A2','B1','B2','C1','C2']:continue
        if text not in frequency:continue
        if text in english:continue
        english[text]=dict(id='en-ru-'+text,text=text,reading=w.get('transcription','')[:250] or 'IPA unavailable',translation=translation,level=['A1','A2','B1','B2','C1','C2'].index(level)+1,topic=pos.replace('_',' ').title(),sourceLanguage='en-US',targetLanguage='ru-RU',rank=frequency[text],dataset='vocab-bloom-hub-en-0.3.1',generated=True,generated_by_model=w.get('generated_by_model',''),levelSystem='CEFR (community, AI-generated)')
english=sorted(english.values(),key=lambda w:(w['level'],w['rank']))
words=chinese+english
if len(chinese)<10000 or len(english)<3000:raise ValueError(f'Insufficient catalog: {len(chinese)}, {len(english)}')
def packed(name,records):
    payload=gzip.compress(json.dumps(records,ensure_ascii=False,separators=(',',':')).encode('utf-8'),mtime=0)
    folder=out/name
    folder.mkdir(exist_ok=True)
    for previous in folder.glob('part-*.bin'):previous.unlink()
    files=[]
    for i,start in enumerate(range(0,len(payload),24000)):
        filename=f'{name}/part-{i:03}.bin'
        (out/filename).write_bytes(payload[start:start+24000])
        files.append(filename)
    return files
word_files=packed('words',words)
strokes={};missing=[]
original_guides=json.loads((root/'src/data/strokes.json').read_text(encoding='utf-8'))
for char in sorted(set(''.join(w['text'] for w in chinese))):
    if not re.fullmatch('[\u3400-\u9fff]',char):continue
    file=root/'node_modules/hanzi-writer-data'/f'{char}.json'
    if file.exists():
        data=json.loads(file.read_text(encoding='utf-8'))
        # Preserve existing detailed guides; centerline guides keep the expanded
        # pack small while retaining every reference stroke and its direction.
        strokes[char]=original_guides.get(char,{'medians':data['medians'],'centerlines':True})
    else:missing.append(char)
stroke_files=packed('strokes',strokes)
for name in ['words.json','strokes.json','words.json.gz','strokes.json.gz']:
    (out/name).unlink(missing_ok=True)
stats={'chinese':len(chinese),'english':len(english),'chineseLevels':dict(Counter(w['level'] for w in chinese)),'englishLevels':dict(Counter(w['level'] for w in english)),'handwritingCharacters':len(strokes),'missingCharacters':missing,'englishNotice':'AI-generated, not human-verified; translations and CEFR levels may contain errors.'}
stats['packs']={'words':word_files,'strokes':stroke_files}
(out/'catalog.json').write_text(json.dumps(stats,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(stats,ensure_ascii=False))
