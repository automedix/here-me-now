# here-me-now

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![Status: MVP](https://img.shields.io/badge/Status-MVP-green.svg)](https://github.com/automedix/here-me-now)
[![GitHub last commit](https://img.shields.io/github/last-commit/automedix/here-me-now)](https://github.com/automedix/here-me-now/commits/master)
[![GitHub commit activity](https://img.shields.io/github/commit-activity/t/automedix/here-me-now)](https://github.com/automedix/here-me-now/graphs/commit-activity)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6.svg)](https://www.typescriptlang.org/)
[![Fastify](https://img.shields.io/badge/Fastify-4.0+-000000.svg)](https://www.fastify.io/)

**Patient Self Check-in via NOSTR**

Ein dezentraler, datenschutzfreundlicher Check-in für Arztpraxen – basierend auf dem NOSTR-Protokoll.

## Konzept

- **Self-Sovereign Identity**: Patienten-Keys werden lokal im Browser generiert (CashU-Style)
- **Privacy-First**: Keine sensitiven Daten auf dem Server
- **Sofortiger Check-in**: Web-App mit QR/NFC für Patienten
- **Admin Dashboard**: Echtzeit-Patientenmanagement mit Kachel-Ansicht
- **NOSTR DMs**: Direkte Arzt-Patienten-Kommunikation

## Features (MVP)

✅ Patienten-UI mit Key-Generierung im Browser  
✅ Admin Dashboard mit Status-Management (warten → aufrufen → behandeln → entlassen)  
✅ Inline NOSTR Messaging zwischen Arzt und Patient  
✅ SQLite-Backend für temporäre Check-in-Daten  
✅ Fastify REST API  

## Technologie
- **Backend**: TypeScript, Fastify, SQLite
- **Frontend**: Vanilla TypeScript (patient), Server-Side Rendering (admin)
- **Kommunikation**: NOSTR Protocol (NIP-01, NIP-04 Encryption)
- **Styling**: TailwindCSS-inspired CSS

## Schnellstart

```bash
npm install
npm run build
npm start
```

## Lizenz
GNU General Public License v3.0

---
*Part of [automedix](https://automedix.github.io) – Open Source Healthcare Solutions*
