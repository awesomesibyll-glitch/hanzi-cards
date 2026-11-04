import React, { useEffect, useRef, useState } from 'react';
import { AppState, Button, ScrollView, StatusBar, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Card, dueCard, initialize, review, topics } from './src/db';
import { Flashcard } from './src/components/Flashcard';
import { WritingCanvas } from './src/components/WritingCanvas';
import { Rating } from './src/srs';
import { stopSpeech } from './src/speech';
export default function App() {
  const [ready,setReady] = useState(false), [card,setCard] = useState<Card|null>(null);
  const [level,setLevel] = useState(0), [topic,setTopic] = useState('');
  const [allTopics,setTopics] = useState<string[]>([]);
  const [busy,setBusy] = useState(false), [error,setError] = useState('');
  const [character,setCharacter] = useState('');
  const saving = useRef(false);
  useEffect(() => {
    initialize().then(async () => {setTopics(await topics());setReady(true);}).catch(e=>setError(String(e)));
  }, []);
  useEffect(() => {
    if (!ready) return;
    let active = true;
    const load = () => dueCard(level,topic).then(c=>{if(active){setCard(c);setCharacter(c ? Array.from(c.text)[0] : '');}}).catch(e=>{if(active)setError(String(e));});
    setCard(null); stopSpeech(); void load();
    const timer = setInterval(() => { if (!busy) void load(); },30_000);
    const listener = AppState.addEventListener('change', s => { if(s==='active' && !busy) void load(); if(s!=='active')stopSpeech(); });
    return () => {active=false; clearInterval(timer);listener.remove();};
  },[ready,level,topic,busy]);
  const rate = async (r: Rating) => {
    if (!card || saving.current) return;
    saving.current = true;
    setBusy(true);setError('');stopSpeech();
    try { await review(card,r); } catch(e) { setError(String(e)); } finally { saving.current = false; setBusy(false); }
  };
  return <SafeAreaProvider><SafeAreaView style={{flex:1,backgroundColor:'#edf2f6'}}>
    <StatusBar barStyle="dark-content" />
    <ScrollView contentContainerStyle={{padding:20,gap:18}}>
      <Text style={{fontSize:30,fontWeight:'700'}}>Hanzi Cards</Text>
      <Text>Chinese → English · Offline study</Text>
      {!!error && <Text accessibilityRole="alert" style={{color:'#a21'}}>{error}</Text>}
      {!ready ? <Text>Opening your library…</Text> : <>
        <Text>Level</Text><ScrollView horizontal>{[0,1,2,3,4,5,6,7,8,9].map(l=><Button key={l} disabled={busy} title={(level===l?'✓ ':'')+(l?`HSK ${l}`:'All')} onPress={()=>setLevel(l)} />)}</ScrollView>
        <Text>Topic</Text><ScrollView horizontal>{['',...allTopics].map(t=><Button key={t} disabled={busy} title={(topic===t?'✓ ':'')+(t||'All')} onPress={()=>setTopic(t)} />)}</ScrollView>
        {card ? <>
          <Flashcard key={card.id + ':' + card.due} card={card} busy={busy} onRate={rate} />
          <View style={{flexDirection:'row',flexWrap:'wrap'}}>{Array.from(card.text).map((c,i)=><Button key={i} title={c} onPress={()=>setCharacter(c)} />)}</View>
          <WritingCanvas key={card.id+character} character={character} />
        </> : <Text>{busy ? 'Saving…' : 'No cards due in this selection. Reviews return automatically when due.'}</Text>}
      </>}
    </ScrollView>
  </SafeAreaView></SafeAreaProvider>;
}
