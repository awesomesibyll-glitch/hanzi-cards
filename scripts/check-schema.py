"""Validate the actual SQL schema and atomic-review behavior with stdlib SQLite."""
import json
import re
import sqlite3
from pathlib import Path

root = Path(__file__).resolve().parent.parent
schema = re.search(r'export const SCHEMA = `(.+?)`;', (root / 'src/db.ts').read_text(encoding='utf-8'), re.S).group(1)
db = sqlite3.connect(':memory:')
db.execute('PRAGMA foreign_keys=ON')
db.executescript(schema)
db.execute('INSERT INTO levels VALUES (1, ?, ?)', ('HSK', 'HSK 1'))
for w in json.loads((root / 'src/data/words.json').read_text(encoding='utf-8')):
    db.execute('INSERT INTO words VALUES (?,?,?,?,?,?,?,?)', tuple(w[k] for k in ['id','text','reading','translation','sourceLanguage','targetLanguage','level','topic']))
    db.execute('INSERT INTO progress(wordId) VALUES (?)', (w['id'],))
db.commit()
assert db.execute('SELECT COUNT(*) FROM progress WHERE due<=0').fetchone()[0] == 6
try:
    with db:
        db.execute('UPDATE progress SET due=86400000 WHERE wordId=?', ('zh-en-ni',))
        db.execute('INSERT INTO reviews(wordId,rating,reviewedAt,nextDue) VALUES (?,?,?,?)', ('unknown','Good',0,86400000))
except sqlite3.IntegrityError:
    pass
else:
    raise AssertionError('Expected foreign key rejection')
assert db.execute('SELECT due FROM progress WHERE wordId=?', ('zh-en-ni',)).fetchone()[0] == 0
assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
print('PASS: schema, seed, due queue, foreign keys, transaction rollback, integrity')
