import Database from 'better-sqlite3';
import { join } from 'path';

const DB_PATH = process.env.DB_PATH || './data/here-me-now.db';

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

export function initDatabase() {
  // Praxen / Locations
  db.exec(`
    CREATE TABLE IF NOT EXISTS locations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      address TEXT,
      fhir_endpoint TEXT,
      fhir_enabled BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Patienten - werden erst bei Check-in erkannt
  db.exec(`
    CREATE TABLE IF NOT EXISTS patients (
      id TEXT PRIMARY KEY,
      npub TEXT UNIQUE NOT NULL,
      last_name TEXT,
      birth_date TEXT,
      insurance_number TEXT,
      phone TEXT,
      email TEXT,
      location_id TEXT,
      notes TEXT,
      linked_by TEXT,
      linked_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (location_id) REFERENCES locations(id)
    )
  `);

  // Check-ins
  db.exec(`
    CREATE TABLE IF NOT EXISTS checkins (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      location_id TEXT NOT NULL,
      appointment_id TEXT,
      has_appointment BOOLEAN DEFAULT 0,
      reason TEXT,
      notes TEXT,
      status TEXT DEFAULT 'waiting',
      checkin_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      called_at DATETIME,
      completed_at DATETIME,
      fhir_encounter_id TEXT,
      FOREIGN KEY (patient_id) REFERENCES patients(id),
      FOREIGN KEY (location_id) REFERENCES locations(id)
    )
  `);

  // Termine (optional - können auch extern sein)
  db.exec(`
    CREATE TABLE IF NOT EXISTS appointments (
      id TEXT PRIMARY KEY,
      patient_id TEXT,
      location_id TEXT NOT NULL,
      scheduled_at DATETIME NOT NULL,
      duration_minutes INTEGER DEFAULT 15,
      status TEXT DEFAULT 'scheduled',
      notes TEXT,
      fhir_appointment_id TEXT,
      FOREIGN KEY (patient_id) REFERENCES patients(id),
      FOREIGN KEY (location_id) REFERENCES locations(id)
    )
  `);

  // NOSTR DMs / Nachrichten
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      checkin_id TEXT NOT NULL,
      direction TEXT NOT NULL, -- 'inbound' oder 'outbound'
      content TEXT NOT NULL,
      event_id TEXT,
      sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      read_at DATETIME,
      FOREIGN KEY (checkin_id) REFERENCES checkins(id)
    )
  `);

  // Indexes für Performance
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_patients_npub ON patients(npub);
    CREATE INDEX IF NOT EXISTS idx_patients_location ON patients(location_id);
    CREATE INDEX IF NOT EXISTS idx_checkins_location ON checkins(location_id);
    CREATE INDEX IF NOT EXISTS idx_checkins_status ON checkins(status);
    CREATE INDEX IF NOT EXISTS idx_checkins_patient ON checkins(patient_id);
  `);

  console.log('Database initialized');
}

export type Patient = {
  id: string;
  npub: string;
  last_name?: string;
  birth_date?: string;
  insurance_number?: string;
  phone?: string;
  email?: string;
  location_id?: string;
  notes?: string;
  linked_by?: string;
  linked_at?: string;
  created_at: string;
};

export type Checkin = {
  id: string;
  patient_id: string;
  location_id: string;
  appointment_id?: string;
  has_appointment: boolean;
  reason?: string;
  notes?: string;
  status: 'waiting' | 'called' | 'in_progress' | 'completed' | 'cancelled';
  checkin_at: string;
  called_at?: string;
  completed_at?: string;
  fhir_encounter_id?: string;
};

export type Location = {
  id: string;
  name: string;
  address?: string;
  fhir_endpoint?: string;
  fhir_enabled: boolean;
  created_at: string;
};
