// Original bilingual mini-dialogues. Levels describe reading difficulty approximately.
const englishBasics=`minutes||минуты
does||вспомогательный глагол в вопросе (he/she/it)
your||твой; ваш
is||есть; является (форма to be)
looks||выглядит
checks||проверки
later||позже
suggests||указывает на; позволяет предположить
has been||был; оказался (present perfect)
be||быть
are||есть; являются (форма to be)
us||нас; нам`;
const text=(id,course,level,title,lines,glossary)=>({id,course,level,title,
  lines:lines.map(([speaker,text,translation])=>({speaker,text,translation})),
  glossary:(course==='en'?englishBasics+'\n'+glossary:glossary).split('\n').filter(Boolean).map(row=>{
    const [text,reading,translation]=row.split('|');return {text,reading,translation};
  })});

export const miniTexts=[
  text('zh-tea','zh',1,'A cup of tea',[
    ['A','你想喝什么？','What would you like to drink?'],
    ['B','我想喝茶。你呢？','I would like tea. How about you?'],
    ['A','我也喝茶。热的还是冷的？','Tea for me too. Hot or cold?'],
    ['B','热的，谢谢！','Hot, thank you!']
  ],`你|nǐ|you
想|xiǎng|would like; want
喝|hē|to drink
什么|shén me|what
我|wǒ|I; me
茶|chá|tea
呢|ne|question particle: how about…?
也|yě|also; too
热|rè|hot
的|de|here: replaces “one” (the hot one)
还是|hái shi|or (in a choice question)
冷|lěng|cold
谢谢|xiè xie|thank you`),
  text('zh-book','zh',1,'Looking for a book',[
    ['A','我的书在哪儿？','Where is my book?'],
    ['B','在桌子上。','It is on the table.'],
    ['A','这不是我的书。','This is not my book.'],
    ['B','你的书在这儿！','Your book is here!']
  ],`我|wǒ|I; me
的|de|possessive particle
书|shū|book
在|zài|to be at; in
哪儿|nǎr|where
桌子|zhuō zi|table
上|shàng|on; above
这|zhè|this
不|bù|not
是|shì|to be
你|nǐ|you
这儿|zhèr|here`),
  text('zh-weekend','zh',2,'Weekend plans',[
    ['A','明天你有时间吗？','Do you have time tomorrow?'],
    ['B','有。我们一起去公园吧。','Yes. Let’s go to the park together.'],
    ['A','好！几点见面？','Great! What time shall we meet?'],
    ['B','上午十点，在地铁站见。','At ten in the morning. See you at the metro station.']
  ],`明天|míng tiān|tomorrow
你|nǐ|you
有|yǒu|to have
时间|shí jiān|time
吗|ma|yes/no question particle
我们|wǒ men|we; us
一起|yì qǐ|together
去|qù|to go
公园|gōng yuán|park
吧|ba|particle used to suggest something
好|hǎo|good; all right
几点|jǐ diǎn|what time
见面|jiàn miàn|to meet
上午|shàng wǔ|morning
十点|shí diǎn|ten o’clock
在|zài|at
地铁站|dì tiě zhàn|metro station
见|jiàn|to see; to meet`),
  text('zh-cafe','zh',3,'A quiet place to work',[
    ['A','这家咖啡店怎么样？','What is this café like?'],
    ['B','很安静，而且离我家很近。','It is quiet, and it is very close to my home.'],
    ['A','那我们下午在这里工作吧。','Then let’s work here this afternoon.'],
    ['B','好，不过我三点以前得回家。','All right, but I have to go home before three.']
  ],`这家|zhè jiā|this (shop or business)
咖啡店|kā fēi diàn|café
怎么样|zěn me yàng|what is it like?
很|hěn|very; quite
安静|ān jìng|quiet
而且|ér qiě|and also; moreover
离|lí|away from (a place)
我家|wǒ jiā|my home
近|jìn|near; close
那|nà|then; in that case
我们|wǒ men|we; us
下午|xià wǔ|afternoon
在|zài|at; in
这里|zhè lǐ|here
工作|gōng zuò|to work
吧|ba|suggestion particle
好|hǎo|all right
不过|bú guò|but; however
我|wǒ|I
三点|sān diǎn|three o’clock
以前|yǐ qián|before
得|děi|must; have to
回家|huí jiā|to go home`),
  text('zh-habit','zh',4,'A small daily habit',[
    ['A','你最近怎么每天都在读中文？','How come you have been reading Chinese every day lately?'],
    ['B','我发现，每天读一点比周末读很多更容易坚持。','I have found that reading a little each day is easier to keep up than reading a lot at the weekend.'],
    ['A','遇到不认识的词，你会马上查吗？','When you come across an unfamiliar word, do you look it up straight away?'],
    ['B','不一定。我先猜意思，再看它会不会出现第二次。','Not always. I guess the meaning first, then see whether it comes up again.']
  ],`你|nǐ|you
最近|zuì jìn|recently; lately
怎么|zěn me|how come; why
每天|měi tiān|every day
都|dōu|all; every time
在|zài|marks an ongoing action
读|dú|to read
中文|zhōng wén|Chinese (language)
我|wǒ|I
发现|fā xiàn|to discover; to find
一点|yì diǎn|a little
比|bǐ|compared with; than
周末|zhōu mò|weekend
很多|hěn duō|a lot
更|gèng|even more
容易|róng yì|easy
坚持|jiān chí|to keep going; to stick with
遇到|yù dào|to come across
不|bù|not
认识|rèn shi|to know; to recognise
的|de|modifier particle
词|cí|word
会|huì|will; would
马上|mǎ shàng|straight away
查|chá|to look up; to check
吗|ma|question particle
不一定|bù yí dìng|not necessarily
先|xiān|first
猜|cāi|to guess
意思|yì si|meaning
再|zài|then; next
看|kàn|to see
它|tā|it
不会|bú huì|will not
出现|chū xiàn|to appear; to come up
第二次|dì èr cì|a second time`),
  text('en-coffee','en',1,'Coffee before class',[
    ['A','Do you want a coffee?','Хочешь кофе?'],
    ['B','Yes, please. A small one.','Да, пожалуйста. Маленький.'],
    ['A','Milk or sugar?','Молоко или сахар?'],
    ['B','Just milk, thanks. We have ten minutes before class.','Только молоко, спасибо. У нас десять минут до занятия.']
  ],`coffee||кофе
small||маленький
milk||молоко
sugar||сахар
just||только
before||до; перед
class||занятие`),
  text('en-train','en',2,'The next train',[
    ['A','Excuse me, does this train stop at the airport?','Извините, этот поезд останавливается в аэропорту?'],
    ['B','No, you need the next one. It leaves in fifteen minutes.','Нет, вам нужен следующий. Он отправляется через пятнадцать минут.'],
    ['A','Do I need a different ticket?','Мне нужен другой билет?'],
    ['B','No, your ticket is fine. Just wait on this platform.','Нет, ваш билет подходит. Просто подождите на этой платформе.']
  ],`excuse me||извините
airport||аэропорт
next||следующий
leaves||отправляется
different||другой
ticket||билет
fine||подходящий; в порядке
platform||платформа`),
  text('en-plans','en',3,'A change of plans',[
    ['A','The weather looks terrible. Shall we cancel the walk?','Погода выглядит ужасно. Может, отменим прогулку?'],
    ['B','We could visit the museum instead.','Можно вместо этого сходить в музей.'],
    ['A','Good idea. I have been meaning to go there for ages.','Хорошая идея. Я уже давно собираюсь туда сходить.'],
    ['B','I will check whether we need to book in advance.','Я проверю, нужно ли бронировать заранее.']
  ],`terrible||ужасный
cancel||отменить
instead||вместо этого
have been meaning to||давно собираться что-либо сделать
for ages||уже очень давно
whether||ли
book||бронировать
in advance||заранее`),
  text('en-deadline','en',4,'A realistic deadline',[
    ['A','Can we bring the deadline forward by a week?','Можно перенести крайний срок на неделю раньше?'],
    ['B','Only if we narrow the scope. Otherwise, we risk rushing the final checks.','Только если сократим объём работы. Иначе рискуем провести финальные проверки в спешке.'],
    ['A','What would you leave out?','Что бы ты исключил?'],
    ['B','The extra dashboard. We can release it later without compromising the main feature.','Дополнительную панель. Её можно выпустить позже без ущерба для основной функции.']
  ],`bring the deadline forward||перенести крайний срок на более раннюю дату
deadline||крайний срок
narrow||сузить; сократить
scope||объём работы
otherwise||иначе
rushing||выполнение в спешке
leave out||исключить; не включать
dashboard||информационная панель
release||выпустить
compromising||снижение качества; ущерб
feature||функция; возможность`),
  text('en-evidence','en',5,'Reading the evidence',[
    ['A','The survey suggests that the new policy has been a success.','Опрос указывает на то, что новая политика оказалась успешной.'],
    ['B','I would be wary of drawing that conclusion. The sample is fairly small.','Я бы не спешил с таким выводом. Выборка довольно мала.'],
    ['A','So you think the findings are unreliable?','То есть ты считаешь результаты ненадёжными?'],
    ['B','Not necessarily. They are promising, but we need a broader sample before making a firm claim.','Не обязательно. Они обнадёживают, но для уверенного утверждения нужна более широкая выборка.']
  ],`survey||опрос
policy||политика; принятые меры
wary||осторожный; настороженный
drawing||формулирование; выведение (вывода)
conclusion||вывод
sample||выборка
findings||результаты исследования
unreliable||ненадёжный
promising||обнадёживающий
broader||более широкий
firm||твёрдый; уверенный
claim||утверждение`),
  text('en-compromise','en',6,'A workable compromise',[
    ['A','The proposal is elegant, but it glosses over the cost of implementation.','Предложение изящное, но в нём обходят стороной стоимость внедрения.'],
    ['B','That is a fair criticism. Could a phased rollout make it more tenable?','Это справедливое замечание. Может ли поэтапный запуск сделать его более жизнеспособным?'],
    ['A','Possibly, provided the safeguards are in place from the outset.','Возможно, при условии, что защитные меры будут действовать с самого начала.'],
    ['B','Then let us make that a prerequisite rather than an afterthought.','Тогда давай сделаем это обязательным условием, а не запоздалым дополнением.']
  ],`proposal||предложение; проект
glosses over||поверхностно освещает; обходит стороной
implementation||внедрение; реализация
phased rollout||поэтапный запуск
tenable||обоснованный; жизнеспособный
provided||при условии, что
safeguards||защитные меры
from the outset||с самого начала
prerequisite||необходимое предварительное условие
afterthought||то, о чём подумали лишь потом`)
];
