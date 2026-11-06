// P2P 방: 방장(HostRoom)과 참가자(ClientRoom). 계정 없이 4자리 방 코드 + 닉네임만 사용.
import Peer from 'peerjs';
import { NETWORK, peerOptions } from '../config/network.js';

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 헷갈리는 글자(I, O, 0, 1, L) 제외

export function makeCode() {
  let s = '';
  for (let i = 0; i < NETWORK.codeLength; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}

export function normalizeCode(c) {
  return (c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, NETWORK.codeLength);
}

export class HostRoom {
  constructor() {
    this.peer = null;
    this.code = null;
    this.conns = new Map(); // peerId → DataConnection
    this.onJoin = null;     // (peerId) => void
    this.onLeave = null;    // (peerId) => void
    this.onMessage = null;  // (peerId, msg) => void
  }

  async open() {
    for (let attempt = 0; attempt < 6; attempt++) {
      const code = makeCode();
      try {
        this.peer = await openPeer(NETWORK.idPrefix + code);
        this.code = code;
        break;
      } catch (e) {
        if (e.type !== 'unavailable-id') throw e; // 같은 코드가 이미 쓰이면 다른 코드로 재시도
      }
    }
    if (!this.peer) throw Object.assign(new Error('no code'), { type: 'unavailable-id' });
    this.peer.on('connection', (conn) => {
      conn.on('open', () => {
        if (this.conns.size >= NETWORK.maxPlayers - 1) { conn.send({ t: 'full' }); setTimeout(() => conn.close(), 300); return; }
        this.conns.set(conn.peer, conn);
        this.onJoin?.(conn.peer);
      });
      conn.on('data', (msg) => this.onMessage?.(conn.peer, msg));
      const leave = () => {
        if (!this.conns.has(conn.peer)) return;
        this.conns.delete(conn.peer);
        this.onLeave?.(conn.peer);
      };
      conn.on('close', leave);
      conn.on('error', leave);
    });
    this.peer.on('disconnected', () => { try { this.peer.reconnect(); } catch { /* 무시 */ } });
    return this.code;
  }

  send(peerId, msg) {
    const c = this.conns.get(peerId);
    if (c?.open) c.send(msg);
  }

  broadcast(msg) {
    for (const c of this.conns.values()) if (c.open) c.send(msg);
  }

  kick(peerId) { this.conns.get(peerId)?.close(); }

  close() {
    this.broadcast({ t: 'closed' });
    setTimeout(() => this.peer?.destroy(), 200);
  }
}

export class ClientRoom {
  constructor() {
    this.peer = null;
    this.conn = null;
    this.onMessage = null;
    this.onClosed = null;
  }

  async join(code) {
    this.peer = await openPeer();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Object.assign(new Error('timeout'), { type: 'timeout' })), NETWORK.joinTimeoutMs);
      this.peer.on('error', (e) => { clearTimeout(timer); reject(e); });
      const conn = this.peer.connect(NETWORK.idPrefix + code, { serialization: 'json', reliable: true });
      conn.on('open', () => { clearTimeout(timer); this.conn = conn; resolve(); });
      conn.on('data', (msg) => this.onMessage?.(msg));
      conn.on('close', () => this.onClosed?.());
      conn.on('error', () => this.onClosed?.());
    });
  }

  send(msg) { if (this.conn?.open) this.conn.send(msg); }

  close() {
    try { this.conn?.close(); } catch { /* 무시 */ }
    setTimeout(() => this.peer?.destroy(), 200);
  }
}

function openPeer(id) {
  return new Promise((resolve, reject) => {
    const peer = id ? new Peer(id, peerOptions()) : new Peer(peerOptions());
    const fail = (e) => { peer.destroy(); reject(e); };
    peer.once('open', () => { peer.off('error', fail); resolve(peer); });
    peer.once('error', fail);
  });
}
