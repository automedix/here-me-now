import { db, Checkin, Patient } from '../../infrastructure/db/database.js';
import { randomUUID } from 'crypto';
import { PatientService } from '../patient/patient.service.js';

export type CreateCheckinInput = {
  npub: string;
  locationId: string;
  hasAppointment: boolean;
  reason?: string;
  notes?: string;
};

export class CheckinService {
  /**
   * Process a check-in
   * Creates patient if new, creates checkin record
   */
  static checkin(input: CreateCheckinInput): { checkin: Checkin; patient: Patient; isNewPatient: boolean } {
    let patient = PatientService.findByNpub(input.npub, input.locationId);
    let isNewPatient = false;

    if (!patient) {
      // First time at this practice
      patient = PatientService.create({
        npub: input.npub,
        locationId: input.locationId,
      });
      isNewPatient = true;
    }

    const checkin = this.createCheckin({
      patientId: patient.id,
      locationId: input.locationId,
      hasAppointment: input.hasAppointment,
      reason: input.reason,
      notes: input.notes,
    });

    return { checkin, patient, isNewPatient };
  }

  /**
   * Create check-in record
   */
  private static createCheckin(data: {
    patientId: string;
    locationId: string;
    hasAppointment: boolean;
    reason?: string;
    notes?: string;
  }): Checkin {
    const id = randomUUID();
    const stmt = db.prepare(`
      INSERT INTO checkins (id, patient_id, location_id, has_appointment, reason, notes, status)
      VALUES (?, ?, ?, ?, ?, ?, 'waiting')
    `);

    stmt.run(
      id,
      data.patientId,
      data.locationId,
      data.hasAppointment ? 1 : 0,
      data.reason || null,
      data.notes || null
    );

    return this.findById(id)!;
  }

  /**
   * Get active checkins for location
   */
  static getActiveCheckins(locationId: string): Array<Checkin & { patient: Patient }> {
    const stmt = db.prepare(`
      SELECT c.*, p.id as patient_id_ref, p.npub, p.last_name, p.birth_date, 
             p.insurance_number, p.phone, p.notes as patient_notes, 
             p.linked_by, p.linked_at, p.created_at as patient_created_at
      FROM checkins c
      JOIN patients p ON c.patient_id = p.id
      WHERE c.location_id = ? AND c.status IN ('waiting', 'called')
      ORDER BY c.checkin_at ASC
    `);

    const rows = stmt.all(locationId) as any[];
    return rows.map(this.mapRowToCheckinWithPatient);
  }

  /**
   * Get today's checkins
   */
  static getTodayCheckins(locationId: string): Array<Checkin & { patient: Patient }> {
    const stmt = db.prepare(`
      SELECT c.*, p.id as patient_id_ref, p.npub, p.last_name, p.birth_date,
             p.insurance_number, p.phone, p.notes as patient_notes,
             p.linked_by, p.linked_at, p.created_at as patient_created_at
      FROM checkins c
      JOIN patients p ON c.patient_id = p.id
      WHERE c.location_id = ? 
        AND date(c.checkin_at) = date('now')
      ORDER BY c.checkin_at DESC
    `);

    const rows = stmt.all(locationId) as any[];
    return rows.map(this.mapRowToCheckinWithPatient);
  }

  /**
   * Update checkin status
   */
  static updateStatus(
    checkinId: string,
    status: Checkin['status']
  ): Checkin {
    let stmt;
    
    if (status === 'called') {
      stmt = db.prepare(`
        UPDATE checkins SET status = ?, called_at = CURRENT_TIMESTAMP WHERE id = ?
      `);
    } else if (status === 'completed') {
      stmt = db.prepare(`
        UPDATE checkins SET status = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?
      `);
    } else {
      stmt = db.prepare(`
        UPDATE checkins SET status = ? WHERE id = ?
      `);
    }

    stmt.run(status, checkinId);
    return this.findById(checkinId)!;
  }

  /**
   * Find checkin by ID
   */
  /**
   * Update checkin notes
   */
  static updateNotes(checkinId: string, notes: string): Checkin {
    const stmt = db.prepare(`
      UPDATE checkins SET notes = ? WHERE id = ?
    `);
    stmt.run(notes, checkinId);
    return this.findById(checkinId)!;
  }

  static findById(id: string): Checkin | undefined {
    const stmt = db.prepare('SELECT * FROM checkins WHERE id = ?');
    return stmt.get(id) as Checkin | undefined;
  }

  /**
   * Get checkin with patient details
   */
  static getWithPatient(id: string): (Checkin & { patient: Patient }) | undefined {
    const stmt = db.prepare(`
      SELECT c.*, p.id as patient_id_ref, p.npub, p.last_name, p.birth_date,
             p.insurance_number, p.phone, p.notes as patient_notes,
             p.linked_by, p.linked_at, p.created_at as patient_created_at
      FROM checkins c
      JOIN patients p ON c.patient_id = p.id
      WHERE c.id = ?
    `);

    const row = stmt.get(id) as any | undefined;
    return row ? this.mapRowToCheckinWithPatient(row) : undefined;
  }

  private static mapRowToCheckinWithPatient(row: any): Checkin & { patient: Patient } {
    const { patient_id_ref, npub, last_name, birth_date, insurance_number, phone, patient_notes, linked_by, linked_at, patient_created_at, ...checkin } = row;
    
    return {
      ...checkin,
      patient: {
        id: patient_id_ref,
        npub,
        last_name,
        birth_date,
        insurance_number,
        phone,
        notes: patient_notes,
        linked_by,
        linked_at,
        created_at: patient_created_at,
      },
    };
  }
}
