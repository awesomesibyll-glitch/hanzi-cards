export const studyModes=['classic','recall','reverse-classic','reverse-recall','cloze','listen-word','listen-sentence','listen-tones'];
export function parseModes(value,legacy='classic'){
  let values;try{values=JSON.parse(value);}catch{}
  const valid=Array.isArray(values)?studyModes.filter(mode=>values.includes(mode)):[];
  return valid.length?valid:[studyModes.includes(legacy)?legacy:'classic'];
}
export function availableModes(modes,course){const usable=modes.filter(mode=>course==='zh'||mode!=='listen-tones');return usable.length?usable:['listen-word'];}
