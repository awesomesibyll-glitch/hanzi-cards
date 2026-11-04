import React, { useEffect, useState } from 'react';
import { View, Text, Button, StyleSheet } from 'react-native';
import { Card } from '../db';
import { Rating, schedule } from '../srs';
import { speak, stopSpeech } from '../speech';
export function Flashcard({ card, busy, onRate }: {card: Card; busy: boolean; onRate: (r: Rating) => void}) {
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState('');
  const play = (english = false) => void speak(english ? card.translation : card.text, english ? card.targetLanguage : card.sourceLanguage, setError);
  useEffect(() => { play(); return stopSpeech; }, [card.id]);
  return <View style={styles.card}>
    <Text style={styles.word}>{card.text}</Text>
    <Button title="Play Chinese" onPress={() => play()} />
    {!revealed ? <Button title="Show answer" onPress={() => setRevealed(true)} /> : <>
      <Text style={styles.reading}>{card.reading}</Text><Text style={styles.meaning}>{card.translation}</Text>
      <Button title="Play English" onPress={() => play(true)} />
      <View style={styles.grades}>{(['Again','Hard','Good','Easy'] as Rating[]).map(r => {
        const next = schedule(card, r);
        return <Button key={r} disabled={busy} title={`${r} (${r === 'Again' ? '1m' : next.interval + 'd'})`} onPress={() => onRate(r)} />;
      })}</View>
    </>}
    {!!error && <Text accessibilityRole="alert">{error}</Text>}
  </View>;
}
const styles = StyleSheet.create({card:{padding:18, backgroundColor:'#fff',borderRadius:16,gap:12},word:{fontSize:76,textAlign:'center'},reading:{fontSize:26,textAlign:'center'},meaning:{fontSize:22,textAlign:'center'},grades:{gap:8}});
