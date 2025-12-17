# ADR 001: TOON (Token-Oriented Object Notation) Format Integration

**Status:** Accepted
**Date:** 2025-12-17
**Deciders:** OidaNice
**Technical Story:** [NP-TOON-001](https://github.com/oidanice/nodepulse/issues/TOON-001)

---

## Context

NodePulse Dashboard leidet unter Performance-Problemen auf Low-End-Hardware (Raspberry Pi 2B, Fire HD 10 2017):

**Current State:**
- JSON-Response: 16-25 KB (5 Nodes), 165-250 KB (50 Nodes)
- JSON.parse: ~20ms pro Request
- Bandwidth-intensiv: Dashboard-Refresh alle 5s × 25 KB = 4.32 MB/Tag (50 Nodes: 43.2 MB/Tag)

**Target Hardware:**
- Raspberry Pi 2B: 900MHz Single-Core CPU, 1GB RAM
- Fire HD 10 (2017): Quad-Core 1.3GHz, 2GB RAM, Silk Browser
- ES5 JavaScript compatibility required

**User Pain Points:**
1. Dashboard-Refresh dauert > 100ms auf Raspberry Pi 2B
2. Fire HD 10 localStorage quota (5-10 MB) wird nach 3-7 Tagen gefüllt
3. Hoher Netzwerk-Traffic in Mobilfunk-Umgebungen

---

## Decision

Wir implementieren **TOON (Token-Oriented Object Notation)** als optionales, kompaktes Format für Live-Metriken.

### TOON Format Specification v1.0

**Struktur:** 17 Tokens, Pipe-delimited
```
V1|N:5|C:45.2|R:67.8|D:23.4|U:86400|L1:0.8|L5:1.2|L15:1.5|NR:123456789|NT:987654321|T:45|VM:3|CT:2|DC:5|O:1|TS:1734444000
```

**Token Mapping:**
- V=version, N=node_id, C=cpu_percent, R=ram_percent, D=disk_percent
- U=uptime_seconds, L1/L5/L15=load_avg, NR/NT=net_rx/tx_bytes
- T=temp_cpu, VM=vms_running, CT=cts_running, DC=containers_running
- O=online (1/0), TS=timestamp

**Hybrid Response:**
```json
{
  "success": true,
  "data": {
    "format": "toon",
    "version": 1,
    "metadata_hash": "a3f5c21d",
    "nodes": ["V1|N:1|C:45.2|...", "V1|N:2|C:12.5|..."],
    "metadata": {
      "1": {"name": "pve-node1", "cpu_cores": 8, "ram_total": 16000000000, ...}
    }
  }
}
```

### Architecture Principles

1. **Hybrid Approach**
   - JSON bleibt Default (100% backward-compatible)
   - TOON opt-in via Settings UI (`use_toon_format` Toggle)
   - Auto-Fallback bei Parse-Fehlern

2. **Metadata Caching**
   - Initial Load: Full metadata included
   - Subsequent Requests: Only metadata hash
   - Cache Invalidation: MD5 hash of hardware specs
   - localStorage mit LRU Eviction (2 MB Limit)

3. **Absolute Values (NOT Deltas)**
   - Charts require absolute values → server-side reconstruction
   - Network counters: Counter-reset detection
   - Offline nodes: NULL values (dash `-`)

4. **Query Parameter Activation**
   - `GET /api/stats?format=toon` → TOON response
   - `GET /api/stats` → JSON response (default)
   - Client includes metadata hash: `&metadata_hash=a3f5c21d`

---

## Consequences

### Positive

**Performance:**
- ✅ Response Size: -81% (16-25 KB → 3-5 KB)
- ✅ Parse Speed: 4x faster (20ms → <5ms)
- ✅ Bandwidth Savings: >70% (43.2 MB/Tag → 12 MB/Tag bei 50 Nodes)
- ✅ localStorage Usage: -60% (Metadata cached statt full JSON)

**Compatibility:**
- ✅ Zero Breaking Changes (JSON bleibt default)
- ✅ Rollback-fähig (Settings-Toggle auf `false`)
- ✅ ES5-kompatibel (Fire HD 10 2017 support)

**User Experience:**
- ✅ Dashboard-Refresh < 100ms (Target erreicht)
- ✅ Reduzierte Mobilfunk-Kosten
- ✅ Längere localStorage-Nutzung (3-7 Tage → 10-20 Tage)

### Negative

**Complexity:**
- ⚠️ Doppelter Code: JSON + TOON Formatter
- ⚠️ Metadata-Hash-Verwaltung erforderlich
- ⚠️ Testing-Aufwand: 72 zusätzliche Tests (50 Unit, 12 Integration, 6 E2E, 4 Performance)

**Maintenance:**
- ⚠️ Token-Schema-Evolution (neue Metriken = neue Tokens)
- ⚠️ Zwei Formate parallel zu pflegen

### Risks & Mitigations

| Risk | Probability | Mitigation |
|------|-------------|------------|
| localStorage Quota Exceeded | Hoch | Safe Storage mit LRU Eviction (2 MB Limit) |
| Metadata Hash Collision | Niedrig | MD5-Hash (1:2^64 Kollision) |
| Migration Fails | Mittel | Transaction + Rollback + Down-Migration |
| Charts zeigen falsche Werte | Mittel | Server-side Reconstruction + Cache |

---

## Alternatives Considered

### Alternative 1: gzip Compression (Rejected)

**Pros:**
- Einfache Implementation
- Standards-basiert

**Cons:**
- Nur 60% Reduktion (vs. 81% bei TOON)
- Kein Client-side Parsing Performance-Gewinn
- Overhead für Compression/Decompression

### Alternative 2: Protocol Buffers (Rejected)

**Pros:**
- Sehr kompakt
- Typsicher

**Cons:**
- Zusätzliche Dependencies (protobuf.js)
- Komplexe Schema-Evolution
- Fire HD 10 (2017) Compatibility fraglich

### Alternative 3: MessagePack (Rejected)

**Pros:**
- Kompakter als JSON
- Relativ einfach

**Cons:**
- Nur ~50% Reduktion
- Neue Dependency
- Kein Performance-Gewinn beim Parsing

---

## Implementation Plan

**Timeline:** 20-30 Tage (160-240h)

**Phase 1: Vorbereitung** (2-3 Tage)
- Code Review Sprint 1-3
- DB-Backup + Git Branch
- ADR finalisieren

**Phase 2: Foundation** (3-5 Tage)
- Metadata Hash System (MD5, In-Memory Cache)
- Circuit Breaker Pattern
- Safe Storage Wrapper (LRU Eviction)

**Phase 3: Core TOON** (5-7 Tage)
- DB-Migration 7 (vms_running, cts_running, containers_running)
- Backend TOON-Formatter
- Frontend TOON-Parser (ES5)

**Phase 4: Integration** (3-5 Tage)
- 4 API-Endpoints mit TOON-Support
- Charts Integration (Server-side Reconstruction)
- Settings UI (TOON-Toggle)

**Phase 5: Testing** (5-7 Tage)
- 50 Unit Tests, 12 Integration Tests, 6 E2E Tests, 4 Performance Tests
- 85% Code Coverage Target

**Phase 6: Deployment** (2-3 Tage)
- Canary Deployment (10% → 50% → 100%)
- Monitoring Setup

**Phase 7: Validation** (1-2 Wochen)
- Success-Metriken validieren
- Stabilität monitoren

---

## Success Metrics

**Nach 1 Woche:**
- ✅ API-Response: < 5 KB (5 Nodes), < 50 KB (50 Nodes)
- ✅ Parse-Time: < 5ms (TOON) vs. ~20ms (JSON)
- ✅ Error-Rate: < 0.1%
- ✅ Bandwidth-Savings: > 70%
- ✅ User-Adoption: > 30% aktivieren TOON

---

## References

- [Plan File](../../.claude/plans/glittery-frolicking-newell.md)
- [26 Critical Problems & Solutions](../../.claude/plans/glittery-frolicking-newell.md#-26-critical-problems--solutions-production-ready)
- [TOON Format Specification v1.0](../../.claude/plans/glittery-frolicking-newell.md#-toon-format-spezifikation-v10)
