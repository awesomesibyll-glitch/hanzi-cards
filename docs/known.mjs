export const knownWordIds=states=>new Set((states??[]).filter(state=>state.known).map(state=>state.wordId));

export function validateKnownWords(states,ids,allowUnknown=false){
  if(!Array.isArray(states)||states.length>30000)throw new Error('Invalid known-word records.');
  const seen=new Set();
  for(const state of states){
    if(!state||typeof state.wordId!=='string'||!state.wordId||state.wordId.length>500||seen.has(state.wordId)||
        typeof state.known!=='boolean'||!Number.isSafeInteger(state.updatedAt)||state.updatedAt<0||state.updatedAt>8e15||
        (!allowUnknown&&!ids.has(state.wordId)))throw new Error('Invalid known-word record.');
    seen.add(state.wordId);
  }
}

// Retain “learn again” records so an older device cannot resurrect a known flag.
export function mergeKnownWords(local,incoming,ids){
  const merged=new Map();
  for(const states of [local??[],...incoming]){
    validateKnownWords(states,ids,true);
    for(const state of states){
      if(!ids.has(state.wordId))continue;
      const previous=merged.get(state.wordId);
      if(!previous||state.updatedAt>previous.updatedAt||
          (state.updatedAt===previous.updatedAt&&state.known&&!previous.known))merged.set(state.wordId,{wordId:state.wordId,known:state.known,updatedAt:state.updatedAt});
    }
  }
  return [...merged.values()];
}
