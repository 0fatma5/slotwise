import { DatabaseSync } from 'node:sqlite';
import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export function verifyPassword(password, encoded) {
  const [salt, hash] = encoded.split(':');
  return timingSafeEqual(scryptSync(password, salt, 64), Buffer.from(hash, 'hex'));
}

export function openDatabase(path = ':memory:', demo = false) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE, password TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin','member')) DEFAULT 'member');
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS branches (id INTEGER PRIMARY KEY, name TEXT NOT NULL, city TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, duration INTEGER NOT NULL,
      price INTEGER NOT NULL, color TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
      branch_id INTEGER NOT NULL REFERENCES branches(id), service_id INTEGER NOT NULL REFERENCES services(id),
      starts_at TEXT NOT NULL, ends_at TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('confirmed','cancelled')) DEFAULT 'confirmed',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      CHECK(ends_at > starts_at));
    CREATE INDEX IF NOT EXISTS booking_overlap ON bookings(branch_id, starts_at, ends_at) WHERE status='confirmed';
    CREATE TRIGGER IF NOT EXISTS prevent_booking_overlap BEFORE INSERT ON bookings
    WHEN NEW.status='confirmed' AND EXISTS (
      SELECT 1 FROM bookings WHERE branch_id=NEW.branch_id AND status='confirmed'
      AND starts_at < NEW.ends_at AND ends_at > NEW.starts_at)
    BEGIN SELECT RAISE(ABORT, 'SLOT_CONFLICT'); END;
  `);
  if (!db.prepare('SELECT count(*) AS n FROM branches').get().n) {
    const add = db.prepare('INSERT INTO branches(name,city) VALUES (?,?)');
    [['The District','Cairo'],['Coastal Studio','Alexandria'],['Garden House','Cairo']].forEach(x=>add.run(...x));
    const svc = db.prepare('INSERT INTO services(name,duration,price,color) VALUES (?,?,?,?)');
    [['Strategy session',60,450,'purple'],['Design consultation',45,350,'blue'],['Workspace tour',30,0,'green']].forEach(x=>svc.run(...x));
  }
  if (demo && !db.prepare('SELECT id FROM users LIMIT 1').get()) {
    const add = db.prepare('INSERT INTO users(name,email,password,role) VALUES (?,?,?,?)');
    [['Fatma Saad','admin@example.test','admin'],['Nour Hassan','nour@example.test','member'],['Omar Adel','omar@example.test','member'],['Salma Mostafa','salma@example.test','member']].forEach(([name,email,role])=>add.run(name,email,hashPassword('DemoOnly!2026'),role));
    const insert = db.prepare('INSERT INTO bookings(user_id,branch_id,service_id,starts_at,ends_at) VALUES(?,?,?,?,?)');
    for(let i=0;i<12;i++) {
      const start = new Date(); start.setUTCDate(start.getUTCDate()+1+Math.floor(i/3)); start.setUTCHours(9+(i%3)*2,0,0,0);
      insert.run(2+i%3,1+i%3,1+i%3,start.toISOString(),new Date(+start+[60,45,30][i%3]*60000).toISOString());
    }
  }
  return db;
}
