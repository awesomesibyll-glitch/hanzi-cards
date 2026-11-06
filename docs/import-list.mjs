const fields=['text','translation','reading','sentence','sentenceTranslation','level','topic'];
const aliases=[
  ['word','hanzi','foreign word','слово','иероглиф'],
  ['translation','meaning','перевод'],
  ['pinyin','ipa','pronunciation','reading','пиньинь','транскрипция'],
  ['sentence','example','context sentence','пример','предложение'],
  ['sentence translation','example translation','перевод предложения','перевод примера'],
  ['level','уровень'],
  ['topic','тема']
];
export const importWordKey=word=>JSON.stringify([word.sourceLanguage,word.targetLanguage,word.text.normalize('NFKC').trim().toLowerCase().replace(/[’‘]/g,"'").replace(/\s+/g,' ')]);

function parseTable(input){
  const rows=[];
  let cells=[],cell='',quoted=false,closed=false,line=1,start=1;
  const text=input.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
  for(let i=0;i<text.length;i++){
    const char=text[i];
    if(quoted){
      if(char==='"'){
        if(text[i+1]==='"'){cell+='"';i++;}
        else {quoted=false;closed=true;}
      }else{cell+=char;if(char==='\n')line++;}
    }else if(char==='\t'||char==='\n'){
      cells.push(cell.trim());cell='';closed=false;
      if(char==='\n'){if(cells.some(Boolean))rows.push({line:start,cells});cells=[];start=++line;}
    }else if(closed){
      if(char!==' ')throw new Error(`Unexpected text after a quoted cell on line ${line}.`);
    }else if(char==='"'&&!cell)quoted=true;
    else cell+=char;
  }
  if(quoted)throw new Error(`A quoted cell is missing its closing quote on line ${start}.`);
  cells.push(cell.trim());
  if(cells.some(Boolean))rows.push({line:start,cells});
  return rows;
}

export function previewImport(input,existing,{sourceLanguage,targetLanguage,level,maxLevel}){
  if(input.length>300_000)throw new Error('Paste up to 300,000 characters at a time.');
  const rows=parseTable(input);
  const header=rows[0]?.cells.map(cell=>aliases.findIndex(list=>list.includes(cell.toLowerCase())));
  let columns=fields;
  if(header?.includes(0)&&header.includes(1)){
    const known=header.filter(index=>index>=0);
    if(new Set(known).size!==known.length)throw new Error('A column name appears more than once.');
    columns=header.map(index=>fields[index]);
    rows.shift();
  }
  if(rows.length>300)throw new Error('Paste up to 300 rows at a time.');
  const keys=new Set(existing.map(importWordKey));
  const added=[],results=[];
  for(const {line,cells} of rows){
    const word={text:'',translation:'',reading:'',sentence:'',sentenceTranslation:'',level:'',topic:''};
    columns.forEach((key,i)=>{if(key)word[key]=cells[i]??'';});
    const rawLevel=word.level.toUpperCase();
    const levels=sourceLanguage==='zh-CN' ? ['HSK 1','HSK 2','HSK 3','HSK 4','HSK 5','HSK 6','HSK 7–9'] : ['A1','A2','B1','B2','C1','C2'];
    word.level=rawLevel?(levels.includes(rawLevel)?levels.indexOf(rawLevel)+1:Number(rawLevel)):level;
    const invalid=cells.length>columns.length?'Too many columns.':
      !word.text||!word.translation?'Enter a word and translation.':
      sourceLanguage==='zh-CN'&&!word.reading?'Enter pinyin for Chinese words.':
      Boolean(word.sentence)!==Boolean(word.sentenceTranslation)?'Enter both the sentence and its translation, or leave both blank.':
      !Number.isInteger(word.level)||word.level<1||word.level>maxLevel?'Invalid level for this course.':
      [word.text,word.translation,word.reading,word.sentence,word.sentenceTranslation,word.topic].some((value,i)=>value.length>[32,250,120,500,500,60][i])?'A cell is too long.':'';
    if(invalid){results.push({line,text:word.text,status:'error',message:invalid});continue;}
    word.sourceLanguage=sourceLanguage;word.targetLanguage=targetLanguage;
    const key=importWordKey(word);
    if(keys.has(key)){results.push({line,text:word.text,status:'duplicate',message:'This word already appears in the course or pasted list.'});continue;}
    keys.add(key);
    word.reading||='IPA unavailable';
    word.topic||='My words';
    added.push(word);
    results.push({line,text:word.text,status:'ready',message:word.translation});
  }
  return {added,results};
}
