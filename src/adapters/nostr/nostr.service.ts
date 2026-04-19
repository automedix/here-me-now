import { SimplePool, Event, getPublicKey, nip04, finalizeEvent } from 'nostr-tools';
import { db } from '../../infrastructure/db/database.js';
import { randomUUID } from 'crypto';

const RELAYS = [
  'wss://relay.getalby.com',
  'wss://relay2.getalby.com',
  'wss://nos.lol',
  'wss://relay.damus.io',
];

export class NostrService {
  private static pool: SimplePool | null = null;

  static init() {
    this.pool = new SimplePool();
    console.log('NOSTR pool initialized');
  }

  /**
   * Send DM to patient's npub
   * This requires the server to have its own NOSTR keys
   */
  static async sendDM(params: {
    recipientNpub: string;
    content: string;
    serverNsec: string;
    checkinId: string;
  }): Promise<boolean> {
    if (!this.pool) this.init();

    try {
      const sk = Uint8Array.from(Buffer.from(params.serverNsec, 'hex'));
      const pk = getPublicKey(sk);
      const recipientPk = this.npubToHex(params.recipientNpub);

      // Encrypt content
      const encrypted = await nip04.encrypt(sk, recipientPk, params.content);

      // Create event
      const event = finalizeEvent({
        kind: 4, // NIP-04 encrypted DM
        pubkey: pk,
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', recipientPk]],
        content: encrypted,
      }, sk);

      // Publish to relays
      const pubs = this.pool!.publish(RELAYS, event);
      await Promise.any(pubs);

      // Store message in DB
      const stmt = db.prepare(`
        INSERT INTO messages (id, checkin_id, direction, content, event_id, sent_at)
        VALUES (?, ?, 'outbound', ?, ?, ?)
      `);
      stmt.run(randomUUID(), params.checkinId, params.content, event.id, new Date().toISOString());

      return true;
    } catch (error) {
      console.error('Failed to send DM:', error);
      return false;
    }
  }

  /**
   * Subscribe to DMs from patients
   * Only relevant if patients can send messages back
   */
  static async subscribeToDMs(serverNpub: string, onMessage: (event: Event) => void) {
    if (!this.pool) this.init();

    const pk = this.npubToHex(serverNpub);
    
    const sub = this.pool!.subscribeMany(RELAYS, [
      {
        kinds: [4],
        '#p': [pk],
        since: Math.floor(Date.now() / 1000),
      },
    ], {
      onevent: onMessage,
      onerror: (error) => console.error('Subscription error:', error),
    });

    return sub;
  }

  /**
   * Get message history for a checkin
   */
  static getMessages(checkinId: string): Array<{
    id: string;
    direction: 'inbound' | 'outbound';
    content: string;
    sent_at: string;
    read_at?: string;
  }> {
    const stmt = db.prepare(`
      SELECT id, direction, content, sent_at, read_at
      FROM messages
      WHERE checkin_id = ?
      ORDER BY sent_at ASC
    `);
    return stmt.all(checkinId) as any[];
  }

  /**
   * Mark messages as read
   */
  static markAsRead(checkinId: string): void {
    const stmt = db.prepare(`
      UPDATE messages SET read_at = CURRENT_TIMESTAMP
      WHERE checkin_id = ? AND direction = 'inbound' AND read_at IS NULL
    `);
    stmt.run(checkinId);
  }

  private static npubToHex(npub: string): string {
    // Simple bech32 decode - in production use proper bech32 library
    if (npub.startsWith('npub1')) {
      // This is a placeholder - we'll need @scure/base for proper bech32
      throw new Error('bech32 npub not yet implemented - use hex pubkey for now');
    }
    return npub; // Assume already hex
  }
}
