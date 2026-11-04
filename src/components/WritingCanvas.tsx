import React, { useEffect, useRef, useState } from 'react';
import { Button, PanResponder, Text, View } from 'react-native';
import Svg, { G, Path, Line, Polyline } from 'react-native-svg';
import { Point, matchesStroke } from '../strokes';
import bank from '../data/strokes.json';
interface CharacterData { strokes: string[]; medians: Point[][]; }
const data = bank as unknown as Record<string, CharacterData>;
const SIZE = 300;
export function WritingCanvas({ character }: {character: string}) {
  const entry = data[character];
  const [accepted, setAccepted] = useState(0);
  const [ink, setInk] = useState<Point[]>([]);
  const [message, setMessage] = useState('Follow the outline in stroke order.');
  const [demo, setDemo] = useState<Point[] | null>(null);
  const points = useRef<Point[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const state = useRef({ accepted, entry, demo });
  state.current = { accepted, entry, demo };
  const stop = () => { if (timer.current) clearInterval(timer.current); timer.current = null; };
  useEffect(() => () => stop(), []);
  const convert = (x: number, y: number): Point => [x * 1024 / SIZE, 900 - y * 1024 / SIZE];
  const responder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => !state.current.demo,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: e => {
      points.current = [convert(e.nativeEvent.locationX, e.nativeEvent.locationY)];
      setInk([...points.current]);
    },
    onPanResponderMove: e => {
      points.current.push(convert(e.nativeEvent.locationX, e.nativeEvent.locationY));
      setInk([...points.current]);
    },
    onPanResponderRelease: e => {
      points.current.push(convert(e.nativeEvent.locationX, e.nativeEvent.locationY));
      const {entry: current, accepted: index} = state.current;
      if (current && index < current.medians.length) {
        if (matchesStroke(points.current, current.medians[index])) {
          setAccepted(index + 1);
          setMessage(index + 1 === current.medians.length ? 'Character complete!' : 'Correct. Write the next stroke.');
        } else setMessage('Try again. Check the starting point, direction and stroke order.');
      }
      points.current = []; setInk([]);
    },
    onPanResponderTerminationRequest: () => false,
    onPanResponderTerminate: () => { points.current = []; setInk([]); }
  })).current;
  if (!entry) return <Text>No bundled stroke data for {character}.</Text>;
  const animate = () => {
    stop(); setAccepted(0); setInk([]);
    let stroke = 0, point = 1;
    setDemo(entry.medians[0].slice(0, 1));
    setMessage('Watch the stroke direction.');
    timer.current = setInterval(() => {
      const median = entry.medians[stroke];
      setDemo(median.slice(0, ++point));
      if (point > median.length + 4) {
        stroke++; point = 1; setAccepted(stroke);
        if (stroke === entry.medians.length) {
          stop(); setDemo(null); setAccepted(0); setMessage('Your turn.');
        } else setDemo(entry.medians[stroke].slice(0, 1));
      }
    }, 65);
  };
  return <View style={{alignItems:'center',gap:10}}>
    <Text>Writing: {character} · Stroke {Math.min(accepted + 1, entry.strokes.length)}/{entry.strokes.length}</Text>
    <View {...responder.panHandlers} style={{width:SIZE,height:SIZE,backgroundColor:'white',borderWidth:1,borderColor:'#b8c4ce'}}>
      <Svg width={SIZE} height={SIZE} viewBox="0 0 1024 1024" pointerEvents="none">
        <Line x1="0" y1="512" x2="1024" y2="512" stroke="#ddd" strokeDasharray="12 12" />
        <Line x1="512" y1="0" x2="512" y2="1024" stroke="#ddd" strokeDasharray="12 12" />
        <G transform="translate(0,900) scale(1,-1)">
          {entry.strokes.map((d,i) => <Path key={i} d={d} fill={i < accepted ? '#177a5c' : '#dce3e8'} />)}
          <Polyline points={(demo ?? ink).map(p=>p.join(',')).join(' ')} fill="none" stroke="#237cdd" strokeWidth="24" strokeLinecap="round" strokeLinejoin="round" />
        </G>
      </Svg>
    </View>
    <Text accessibilityLiveRegion="polite">{message}</Text>
    <Button title="Animate stroke order" onPress={animate} />
    <Button title="Clear and restart" onPress={() => { stop();setDemo(null);setAccepted(0);setInk([]);setMessage('Your turn.'); }} />
  </View>;
}
