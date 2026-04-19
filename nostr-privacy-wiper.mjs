#!/usr/bin/env node
/**
 * NOSTR Privacy Wiper
 * 
 * Datenschutz-konforme Automatische Löschung alter Daten.
 * Löscht automatisch:
 * - DMs älter als X Tage
 * - Checkin-Daten älter als X Tage
 * - Unverknüpfte Patienten ohne Aktivität
 * 
 * Konfiguration über Umgebungsvariablen:
 * - WIPE_DMS_AFTER_DAYS: Tage bis DMs gelöscht werden (default: 30)
 * - WIPE_CHECKINS_AFTER_DAYS: Tage bis Checkins gelöscht werden (default: 90)
 * - WIPE_UNLINKED_AFTER_DAYS: Tage bis unverknüpfte Patienten gelöscht (default: 7)
 * - DRY_RUN: "true" für Simulation ohne Löschung
 */

import Database from 'better-sqlite3';
import { existsSync } from 'fs';

const DB_PATH = process.env.DB_PATH || './data/here-me-now.db';
const DRY_RUN = process.env.DRY_RUN === 'true';

// Konfiguration
const WIPE_DMS_AFTER_DAYS = parseInt(process.env.WIPE_DMS_AFTER_DAYS || '30');
const WIPE_CHECKINS_AFTER_DAYS = parseInt(process.env.WIPE_CHECKINS_AFTER_DAYS || '90');
const WIPE_UNLINKED_AFTER_DAYS = parseInt(process.env.WIPE_UNLINKED_AFTER_DAYS || '7');

if (!existsSync(DB_PATH)) {
  console.error('Database not found at:', DB_PATH);
  process.exit(1);
}

const db = new Database(DB_PATH);

console.log('='.repeat(60));
console.log('NOSTR Privacy Wiper');
console.log('='.repeat(60));
console.log('Mode:', DRY_RUN ? 'DRY RUN (no actual deletion)' : 'LIVE');
console.log('DMs after:', WIPE_DMS_AFTER_DAYS, 'days');
console.log('Checkins after:', WIPE_CHECKINS_AFTER_DAYS, 'days');
console.log('Unlinked patients after:', WIPE_UNLINKED_AFTER_DAYS, 'days');
console.log('='.repeat(60));

function wipeOldDMs() {
  const stmt = db.prepare(`
    SELECT COUNT(*) as count FROM messages
    WHERE sent_at < datetime('now', '-${WIPE_DMS_AFTER_DAYS} days')
  `);
  const { count } = stmt.get();
  
  console.log(`\n[DMs] Found ${count} messages older than ${WIPE_DMS_AFTER_DAYS} days`);
  
  if (count > 0 && !DRY_RUN) {
    const delStmt = db.prepare(`
      DELETE FROM messages
      WHERE sent_at < datetime('now', '-${WIPE_DMS_AFTER_DAYS} days')
    `);
    delStmt.run();
    console.log(`[DMs] Deleted ${count} messages`);
  }
  
  return count;
}

function wipeOldCheckins() {
  // Nur abgeschlossene oder stornierte Checkins
  const stmt = db.prepare(`
    SELECT COUNT(*) as count FROM checkins
    WHERE status IN ('completed', 'cancelled')
      AND completed_at < datetime('now', '-${WIPE_CHECKINS_AFTER_DAYS} days')
  `);
  const { count } = stmt.get();
  
  console.log(`\n[Checkins] Found ${count} completed checkins older than ${WIPE_CHECKINS_AFTER_DAYS} days`);
  
  if (count > 0 && !DRY_RUN) {
    // Zuerst zugehörige Messages löschen
    const delMsgs = db.prepare(`
      DELETE FROM messages
      WHERE checkin_id IN (
        SELECT id FROM checkins
        WHERE status IN ('completed', 'cancelled')
          AND completed_at < datetime('now', '-${WIPE_CHECKINS_AFTER_DAYS} days')
      )
    `);
    const msgsDeleted = delMsgs.run().changes;
    console.log(`[Checkins] Deleted ${msgsDeleted} associated messages`);
    
    // Dann Checkins löschen
    const delStmt = db.prepare(`
      DELETE FROM checkins
      WHERE status IN ('completed', 'cancelled')
        AND completed_at < datetime('now', '-${WIPE_CHECKINS_AFTER_DAYS} days')
    `);
    delStmt.run();
    console.log(`[Checkins] Deleted ${count} checkins`);
  }
  
  return count;
}

function wipeUnlinkedPatients() {
  // Lösche Patienten die nie verknüpft wurden und keine aktiven Checkins haben
  const stmt = db.prepare(`
    SELECT COUNT(*) as count FROM patients
    WHERE linked_by IS NULL
      AND created_at < datetime('now', '-${WIPE_UNLINKED_AFTER_DAYS} days')
      AND id NOT IN (SELECT DISTINCT patient_id FROM checkins WHERE status IN ('waiting', 'called', 'in_progress'))
  `);
  const { count } = stmt.get();
  
  console.log(`\n[Patients] Found ${count} unlinked patients older than ${WIPE_UNLINKED_AFTER_DAYS} days`);
  
  if (count > 0 && !DRY_RUN) {
    const delStmt = db.prepare(`
      DELETE FROM patients
      WHERE linked_by IS NULL
        AND created_at < datetime('now', '-${WIPE_UNLINKED_AFTER_DAYS} days')
        AND id NOT IN (SELECT DISTINCT patient_id FROM checkins WHERE status IN ('waiting', 'called', 'in_progress'))
    `);
    delStmt.run();
    console.log(`[Patients] Deleted ${count} unlinked patients`);
  }
  
  return count;
}

// Anonymisierte Statistik behalten
function generateStats() {
  const stats = db.prepare(`
    SELECT 
      COUNT(*) as total_checkins,
      AVG(JULIANDAY(completed_at) - JULIANDAY(checkin_at)) * 24 * 60 as avg_wait_minutes
    FROM checkins
    WHERE status = 'completed'
      AND completed_at IS NOT NULL
      AND checkin_at >= datetime('now', '-30 days')
  `).get();
  
  console.log('\n[Stats] Last 30 days:');
  console.log('  Total checkins:', stats.total_checkins);
  console.log('  Avg wait time:', stats.avg_wait_minutes ? Math.round(stats.avg_wait_minutes) + ' min' : 'N/A');
}

// Hauptausführung
const dmsDeleted = wipeOldDMs();
const checkinsDeleted = wipeOldCheckins();
const patientsDeleted = wipeUnlinkedPatients();

generateStats();

console.log('\n' + '='.repeat(60));
console.log('Summary:');
console.log(`  DMs: ${dmsDeleted} ${DRY_RUN ? '(would be deleted)' : 'deleted'}`);
console.log(`  Checkins: ${checkinsDeleted} ${DRY_RUN ? '(would be deleted)' : 'deleted'}`);
console.log(`  Patients: ${patientsDeleted} ${DRY_RUN ? '(would be deleted)' : 'deleted'}`);
console.log('='.repeat(60));

db.close();

// Exit code für cron monitoring
const total = dmsDeleted + checkinsDeleted + patientsDeleted;
process.exit(DRY_RUN ? 0 : (total > 0 ? 0 : 0));  // Always 0 for cron success
