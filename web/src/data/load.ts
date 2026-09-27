// Loads the precomputed data package (web/public/data) and decodes the binary layers.
import type { EngineData, Lin16Meta, Log16Meta } from "../engine/types";

const BASE = `${import.meta.env.BASE_URL}data/`;

export async function fetchJson<T>(name: string): Promise<T> {
  const r = await fetch(BASE + name);
  if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
  return r.json() as Promise<T>;
}

/** Undo pipeline/encode.py packing: gunzip when the gzip magic is present, then cumulative-sum each row (mod 65536). */
export async function unpackU16(bytes: ArrayBuffer, nx: number, delta: boolean): Promise<Uint16Array> {
  let buf = bytes;
  const head = new Uint8Array(buf, 0, 2);
  if (head[0] === 0x1f && head[1] === 0x8b) {
    buf = await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
  }
  const u = new Uint16Array(buf);
  if (delta) for (let i = 0; i < u.length; i += nx) for (let x = 1; x < nx; x++) u[i + x] = u[i + x] + u[i + x - 1];
  return u;
}

async function fetchU16(name: string, nx: number, delta: boolean): Promise<Uint16Array> {
  const r = await fetch(BASE + name);
  if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
  return unpackU16(await r.arrayBuffer(), nx, delta);
}

export function decodeLog16(codes: Uint16Array, lo: number, hi: number): Float32Array {
  const out = new Float32Array(codes.length);
  const k = (hi - lo) / 65534;
  for (let i = 0; i < codes.length; i++) {
    const c = codes[i];
    out[i] = c === 0 ? 0 : 10 ** (lo + (c - 1) * k);
  }
  return out;
}

export function decodeLin16(codes: Uint16Array, lo: number, hi: number): Float32Array {
  const out = new Float32Array(codes.length);
  const k = (hi - lo) / 65534;
  for (let i = 0; i < codes.length; i++) out[i] = codes[i] === 65535 ? NaN : lo + codes[i] * k;
  return out;
}

export async function loadLog16(m: Log16Meta): Promise<Float32Array[]> {
  const codes = await fetchU16(m.file, m.shape[1], m.delta === "row");
  const size = m.shape[0] * m.shape[1];
  const all = decodeLog16(codes, m.lo, m.hi);
  return Array.from({ length: m.count }, (_, i) => all.subarray(i * size, (i + 1) * size));
}

export async function loadLin16(m: Lin16Meta): Promise<Float32Array[]> {
  const codes = await fetchU16(m.file, m.shape[1], m.delta === "row");
  const size = m.shape[0] * m.shape[1];
  return m.layers.map((l, i) => decodeLin16(codes.subarray(i * size, (i + 1) * size), l.lo, l.hi));
}

export async function loadInt8(file: string): Promise<Int8Array> {
  const r = await fetch(BASE + file);
  return new Int8Array(await r.arrayBuffer());
}

export const loadEngine = () => fetchJson<EngineData>("engine.json");
