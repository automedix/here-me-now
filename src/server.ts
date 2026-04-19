import Fastify from 'fastify';
import cors from '@fastify/cors';
import staticPlugin from '@fastify/static';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { initDatabase } from './infrastructure/db/database.js';
import { PatientService } from './core/patient/patient.service.js';
import { CheckinService } from './core/checkin/checkin.service.js';
import { NostrService } from './adapters/nostr/nostr.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize database
initDatabase();

// Initialize NOSTR
NOSTRService.init();

const app = Fastify({
  logger: true,
});

// CORS für Web-Apps
await app.register(cors, {
  origin: true,
  credentials: true,
});

// Static files
await app.register(staticPlugin, {
  root: join(__dirname, 'static'),
  prefix: '/',
});

// ============================================
// API Routes
// ============================================

// Health check
app.get('/api/health', async () => ({ status: 'ok' }));

// Checkin für Patienten
app.post('/api/checkin', async (request, reply) => {
  const body = request.body as {
    npub: string;
    locationId: string;
    hasAppointment: boolean;
    reason?: string;
    notes?: string;
    lastName?: string;
    birthDate?: string;
  };

  if (!body.npub || !body.locationId) {
    return reply.status(400).send({ error: 'Missing npub or locationId' });
  }

  try {
    // Bei erstem Checkin: Patientendaten mitgeben
    const patient = PatientService.findByNpub(body.npub, body.locationId);
    
    if (!patient && (body.lastName || body.birthDate)) {
      // Erster Checkin mit Identifikation
      PatientService.create({
        npub: body.npub,
        locationId: body.locationId,
        lastName: body.lastName,
        birthDate: body.birthDate,
      });
    }

    const result = CheckinService.checkin({
      npub: body.npub,
      locationId: body.locationId,
      hasAppointment: body.hasAppointment || false,
      reason: body.reason,
      notes: body.notes,
    });

    return {
      success: true,
      checkinId: result.checkin.id,
      status: result.checkin.status,
      isNewPatient: result.isNewPatient,
      needsIdentification: !result.patient.linked_by && result.isNewPatient,
      timestamp: result.checkin.checkin_at,
    };
  } catch (error) {
    app.log.error(error);
    return reply.status(500).send({ error: 'Checkin failed' });
  }
});

// Praxis: Liste aller aktiven Checkins
app.get('/api/admin/checkins', async (request, reply) => {
  const { locationId } = request.query as { locationId?: string };
  
  if (!locationId) {
    return reply.status(400).send({ error: 'Missing locationId' });
  }

  try {
    const checkins = CheckinService.getActiveCheckins(locationId);
    return { checkins };
  } catch (error) {
    app.log.error(error);
    return reply.status(500).send({ error: 'Failed to fetch checkins' });
  }
});

// Praxis: Checkin Details
app.get('/api/admin/checkins/:id', async (request, reply) => {
  const { id } = request.params as { id: string };
  
  try {
    const checkin = CheckinService.getWithPatient(id);
    if (!checkin) {
      return reply.status(404).send({ error: 'Checkin not found' });
    }
    return checkin;
  } catch (error) {
    app.log.error(error);
    return reply.status(500).send({ error: 'Failed to fetch checkin' });
  }
});

// Praxis: Patienten-Liste (für Verknüpfung)
app.get('/api/admin/patients', async (request, reply) => {
  const { locationId, unlinked } = request.query as { locationId?: string; unlinked?: string };
  
  if (!locationId) {
    return reply.status(400).send({ error: 'Missing locationId' });
  }

  try {
    const patients = unlinked === 'true' 
      ? PatientService.findUnlinked(locationId)
      : PatientService.findByLocation(locationId);
    return { patients };
  } catch (error) {
    app.log.error(error);
    return reply.status(500).send({ error: 'Failed to fetch patients' });
  }
});

// Praxis: Patient mit Identität verknüpfen
app.post('/api/admin/patients/:id/link', async (request, reply) => {
  const { id } = request.params as { id: string };
  const body = request.body as {
    lastName: string;
    birthDate?: string;
    insuranceNumber?: string;
    phone?: string;
    notes?: string;
    linkedBy: string;
  };

  if (!body.lastName || !body.linkedBy) {
    return reply.status(400).send({ error: 'Missing lastName or linkedBy' });
  }

  try {
    const patient = PatientService.linkToIdentity(id, {
      lastName: body.lastName,
      birthDate: body.birthDate,
      insuranceNumber: body.insuranceNumber,
      phone: body.phone,
      notes: body.notes,
      linkedBy: body.linkedBy,
    });
    return { success: true, patient };
  } catch (error) {
    app.log.error(error);
    return reply.status(500).send({ error: 'Failed to link patient' });
  }
});

// Praxis: Checkin Status ändern
app.post('/api/admin/checkins/:id/status', async (request, reply) => {
  const { id } = request.params as { id: string };
  const { status } = request.body as { status: string };

  const validStatuses = ['waiting', 'called', 'in_progress', 'completed', 'cancelled'];
  if (!validStatuses.includes(status)) {
    return reply.status(400).send({ error: 'Invalid status' });
  }

  try {
    const checkin = CheckinService.updateStatus(id, status as any);
    return { success: true, checkin };
  } catch (error) {
    app.log.error(error);
    return reply.status(500).send({ error: 'Failed to update status' });
  }
});

// Praxis: DM senden an Patient
app.post('/api/admin/checkins/:id/message', async (request, reply) => {
  const { id } = request.params as { id: string };
  const { content, serverNsec } = request.body as { content: string; serverNsec: string };

  if (!content || !serverNsec) {
    return reply.status(400).send({ error: 'Missing content or serverNsec' });
  }

  try {
    const checkin = CheckinService.getWithPatient(id);
    if (!checkin) {
      return reply.status(404).send({ error: 'Checkin not found' });
    }

    const success = await NostrService.sendDM({
      recipientNpub: checkin.patient.npub,
      content,
      serverNsec,
      checkinId: id,
    });

    if (success) {
      return { success: true, message: 'Message sent' };
    } else {
      return reply.status(500).send({ error: 'Failed to send message' });
    }
  } catch (error) {
    app.log.error(error);
    return reply.status(500).send({ error: 'Failed to send message' });
  }
});

// Praxis: Nachrichten-History
app.get('/api/admin/checkins/:id/messages', async (request, reply) => {
  const { id } = request.params as { id: string };
  
  try {
    const messages = NostrService.getMessages(id);
    return { messages };
  } catch (error) {
    app.log.error(error);
    return reply.status(500).send({ error: 'Failed to fetch messages' });
  }
});

// Start server
const PORT = parseInt(process.env.PORT || '3000');
const HOST = process.env.HOST || '0.0.0.0';

try {
  await app.listen({ port: PORT, host: HOST });
  console.log(`Server running on http://${HOST}:${PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
