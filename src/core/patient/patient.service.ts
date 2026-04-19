import { db, Patient } from '../../infrastructure/db/database.js';
import { randomUUID } from 'crypto';

export class PatientService {
  /**
   * Find patient by npub
   */
  static findByNpub(npub: string, locationId: string): Patient | undefined {
    const stmt = db.prepare('SELECT * FROM patients WHERE npub = ? AND location_id = ?');
    return stmt.get(npub, locationId) as Patient | undefined;
  }

  /**
   * Check if patient exists anywhere (for first-time detection)
   */
  static existsGlobally(npub: string): boolean {
    const stmt = db.prepare('SELECT 1 FROM patients WHERE npub = ? LIMIT 1');
    return !!stmt.get(npub);
  }

  /**
   * Create new patient with npub
   * Used when patient checks in for the first time at a practice
   */
  static create(data: {
    npub: string;
    locationId: string;
    lastName?: string;
    birthDate?: string;
  }): Patient {
    const id = randomUUID();
    const stmt = db.prepare(`
      INSERT INTO patients (id, npub, last_name, birth_date, location_id)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    stmt.run(id, data.npub, data.lastName || null, data.birthDate || null, data.locationId);
    
    return this.findById(id)!;
  }

  /**
   * Link patient to identity (MFA manually assigns identity)
   */
  static linkToIdentity(
    patientId: string,
    data: {
      lastName: string;
      birthDate?: string;
      insuranceNumber?: string;
      phone?: string;
      notes?: string;
      linkedBy: string;
    }
  ): Patient {
    const stmt = db.prepare(`
      UPDATE patients 
      SET last_name = ?, birth_date = ?, insurance_number = ?, 
          phone = ?, notes = ?, linked_by = ?, linked_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    
    stmt.run(
      data.lastName,
      data.birthDate || null,
      data.insuranceNumber || null,
      data.phone || null,
      data.notes || null,
      data.linkedBy,
      patientId
    );
    
    return this.findById(patientId)!;
  }

  /**
   * Get all patients for a location
   */
  static findByLocation(locationId: string): Patient[] {
    const stmt = db.prepare('SELECT * FROM patients WHERE location_id = ? ORDER BY created_at DESC');
    return stmt.all(locationId) as Patient[];
  }

  /**
   * Get unlinked patients (need MFA attention)
   */
  static findUnlinked(locationId: string): Patient[] {
    const stmt = db.prepare(`
      SELECT * FROM patients 
      WHERE location_id = ? AND linked_by IS NULL 
      ORDER BY created_at DESC
    `);
    return stmt.all(locationId) as Patient[];
  }

  private static findById(id: string): Patient | undefined {
    const stmt = db.prepare('SELECT * FROM patients WHERE id = ?');
    return stmt.get(id) as Patient | undefined;
  }
}
