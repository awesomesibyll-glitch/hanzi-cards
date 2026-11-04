import * as SQLite from 'expo-sqlite';
import words from './data/words.json';
import { Progress, Rating, schedule } from './srs';
export interface Card extends Progress {
  id: string; text: string; reading: string; translation: string;
  sourceLanguage: string; targetLanguage: string; level: number; topic: string;
}
// All timestamps are UTC epoch milliseconds; intervals are days.
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS levels(id INTEGER PRIMARY KEY, system TEXT NOT NULL, label TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS words(
 id TEXT PRIMARY KEY, text TEXT NOT NULL, reading TEXT NOT NULL,
 translation TEXT NOT NULL, sourceLanguage TEXT NOT NULL, targetLanguage TEXT NOT NULL,
 level INTEGER NOT NULL REFERENCES levels(id), topic TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS words_filter ON words(sourceLanguage, level, topic);
CREATE TABLE IF NOT EXISTS progress(
 wordId TEXT PRIMARY KEY REFERENCES words(id), repetitions INTEGER NOT NULL DEFAULT 0,
 interval REAL NOT NULL DEFAULT 0, ease REAL NOT NULL DEFAULT 2.5, due INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS progress_due ON progress(due);
CREATE TABLE IF NOT EXISTS reviews(
 id INTEGER PRIMARY KEY, wordId TEXT NOT NULL REFERENCES words(id), rating TEXT NOT NULL,
 reviewedAt INTEGER NOT NULL, nextDue INTEGER NOT NULL);
PRAGMA user_version = 1;`;
let connection: SQLite.SQLiteDatabase;
export async function initialize() {
  connection = await SQLite.openDatabaseAsync('hanzi-cards.db');
  await connection.execAsync('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');
  const version = await connection.getFirstAsync<{user_version:number}>('PRAGMA user_version');
  if ((version?.user_version ?? 0) > 1) throw new Error('Database version is newer than this app');
  await connection.withExclusiveTransactionAsync(async tx => {
    await tx.execAsync(SCHEMA);
    for (let i = 1; i <= 9; i++) await tx.runAsync('INSERT OR IGNORE INTO levels VALUES (?, ?, ?)', i, 'HSK (dataset-defined)', `HSK ${i}`);
    for (const w of words) {
      await tx.runAsync(`INSERT INTO words VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET text=excluded.text, reading=excluded.reading,
        translation=excluded.translation, level=excluded.level, topic=excluded.topic`,
      w.id, w.text, w.reading, w.translation, w.sourceLanguage, w.targetLanguage, w.level, w.topic);
      await tx.runAsync('INSERT OR IGNORE INTO progress(wordId) VALUES (?)', w.id);
    }
  });
}
export async function dueCard(level: number, topic: string): Promise<Card | null> {
  return connection.getFirstAsync<Card>(`SELECT w.*, p.repetitions, p.interval, p.ease, p.due
    FROM words w JOIN progress p ON p.wordId=w.id WHERE p.due<=?
    AND (?=0 OR w.level=?) AND (?='' OR w.topic=?)
    ORDER BY CASE WHEN p.due=0 THEN 1 ELSE 0 END, p.due, w.id LIMIT 1`, Date.now(), level, level, topic, topic);
}
export async function review(card: Card, rating: Rating) {
  await connection.withExclusiveTransactionAsync(async tx => {
    const current = await tx.getFirstAsync<Progress>('SELECT * FROM progress WHERE wordId=?', card.id);
    if (!current || current.due !== card.due || current.repetitions !== card.repetitions) throw new Error('Card already reviewed. Reload the queue.');
    const now = Date.now(), next = schedule(current, rating, now);
    await tx.runAsync('UPDATE progress SET repetitions=?, interval=?, ease=?, due=? WHERE wordId=?', next.repetitions, next.interval, next.ease, next.due, card.id);
    await tx.runAsync('INSERT INTO reviews(wordId,rating,reviewedAt,nextDue) VALUES (?,?,?,?)', card.id, rating, now, next.due);
  });
}
export async function topics(): Promise<string[]> {
  return (await connection.getAllAsync<{topic:string}>('SELECT DISTINCT topic FROM words ORDER BY topic')).map(w => w.topic);
}
