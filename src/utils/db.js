
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let dbPromise;

export async function getDb(){
  if (!dbPromise){
    dbPromise = open({
      filename: path.join(__dirname, '../../data.sqlite'),
      driver: sqlite3.Database
    });
  }
  return dbPromise;
}

export async function ensureDb(){
  const db = await getDb();
  await db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT,
      price INTEGER NOT NULL,
      stock INTEGER NOT NULL DEFAULT 0,
      image TEXT,
      category_id INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_name TEXT,
      email TEXT,
      phone TEXT,
      address TEXT,
      city TEXT,
      region TEXT,
      inside_valley INTEGER NOT NULL,
      delivery_fee INTEGER NOT NULL,
      items_json TEXT NOT NULL,
      subtotal INTEGER NOT NULL,
      total INTEGER NOT NULL,
      payment_method TEXT NOT NULL,
      payment_status TEXT NOT NULL,
      stripe_session_id TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);
}
