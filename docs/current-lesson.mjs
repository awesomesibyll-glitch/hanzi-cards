// The requested vocabulary, in notebook order.
const entries = `日|rì|day of the month (common in written dates)|九月十一日开学。|School starts on September 11.
几|jǐ|how many (often a small number)|你有几本书？|How many books do you have?
今天|jīn tiān|today|今天几号？|What is today's date?
昨天|zuó tiān|yesterday|昨天我在家。|I was at home yesterday.
明天|míng tiān|tomorrow|明天见！|See you tomorrow!
号|hào|number; day of the month (common in speech)|今天是九月十一号。|Today is September 11.
你|nǐ|you (singular)|你住在哪里？|Where do you live?
什么|shén me|what|你叫什么名字？|What's your name?
好|hǎo|good; well; okay|好，明天见！|Okay, see you tomorrow!
叫|jiào|to be called; to call|我叫李明。|My name is Li Ming.
名字|míng zi|name|你的名字怎么写？|How do you write your name?
我|wǒ|I; me|我住在北京。|I live in Beijing.
呢|ne|follow-up question particle (as in “and you?”)|我住在北京，你呢？|I live in Beijing. How about you?
请问|qǐng wèn|excuse me, may I ask…?|请问，今天几号？|Excuse me, what's today's date?
认识|rèn shi|to know someone; to be acquainted|很高兴认识你。|Nice to meet you.
很|hěn|very; quite|我很高兴。|I'm very happy.
姓|xìng|surname; to have the surname|我姓王。|My surname is Wang.
对不起|duì bu qǐ|I'm sorry|对不起，我来晚了。|I'm sorry I'm late.
高兴|gāo xìng|happy; glad|很高兴认识你。|Nice to meet you.
早上|zǎo shang|morning|早上好！|Good morning!
日本|Rì běn|Japan|她住在日本。|She lives in Japan.
人|rén|person; people|你是哪国人？|What country are you from?
吗|ma|yes/no question particle|你住在北京吗？|Do you live in Beijing?
不|bù|not; no|我不住在伦敦。|I don't live in London.
哪里|nǎ lǐ|where|你住在哪里？|Where do you live?
哪|nǎ|which|你是哪国人？|What country are you from?
中国|Zhōng guó|China|我在中国学习。|I study in China.
国|guó|country; nation|你是哪国人？|What country are you from?
英国|Yīng guó|the United Kingdom; Britain|她住在英国。|She lives in the United Kingdom.
住|zhù|to live; to reside|我住在北京。|I live in Beijing.
在|zài|to be in or at a place; in; at|我在北京。|I'm in Beijing.
伦敦|Lún dūn|London|我朋友住在伦敦。|My friend lives in London.
北京|Běi jīng|Beijing|北京在中国。|Beijing is in China.`;

export const currentLesson = entries.split('\n').map(row => {
  const [text, reading, translation, sentence, sentenceTranslation] = row.split('|');
  return {text, reading, translation, sentence, sentenceTranslation};
});
