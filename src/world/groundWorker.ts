// Paints chunk ground off the main thread, so driving into new country never
// stutters. The worker rebuilds the (deterministic) features itself.
import { paintGroundChunk, type Materials } from '../systems/paintGround';

export type GroundRequest = { type: 'materials'; materials: Materials } | { type: 'paint'; seed: number; cx: number; cy: number };
export interface GroundReply {
  cx: number;
  cy: number;
  seed: number;
  pixels: Uint8ClampedArray;
}

let materials: Materials | undefined;

self.onmessage = (e: MessageEvent<GroundRequest>) => {
  const msg = e.data;
  if (msg.type === 'materials') {
    materials = msg.materials;
    return;
  }
  if (!materials) return;
  const pixels = paintGroundChunk(msg.seed, msg.cx, msg.cy, materials);
  (self as unknown as Worker).postMessage({ cx: msg.cx, cy: msg.cy, seed: msg.seed, pixels } satisfies GroundReply, [pixels.buffer]);
};
