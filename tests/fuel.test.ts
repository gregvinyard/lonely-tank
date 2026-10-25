import { describe, expect, it } from 'vitest';
import { BATTERY, FUEL } from '../src/data/tuning';
import { canDrive, stepPower, stranded, type Power, type PowerStep } from '../src/systems/power';

const T = { drainPerSec: BATTERY.drainPerSec, generatorPerSec: BATTERY.generatorPerSec, solarPerSec: BATTERY.solarPerSec };
const step = (o: Partial<PowerStep> = {}): PowerStep => ({ throttle: 1, solar: false, dtMs: 1000, maxFuel: 100, maxBattery: 20, ...o });

describe('hybrid power', () => {
  it('the generator keeps the battery full while driving, burning fuel 1:1 for the charge used', () => {
    const p = stepPower({ fuel: 100, battery: 20 }, step(), T);
    expect(p.battery).toBeCloseTo(20);
    expect(p.fuel).toBeCloseTo(100 - BATTERY.drainPerSec);
  });

  it('drains with throttle and not at rest; parked and full burns no fuel', () => {
    expect(stepPower({ fuel: 0, battery: 10 }, step({ throttle: 0.5 }), T).battery).toBeCloseTo(10 - BATTERY.drainPerSec / 2);
    expect(stepPower({ fuel: 50, battery: 20 }, step({ throttle: 0 }), T)).toEqual({ fuel: 50, battery: 20 });
  });

  it('runs on the battery alone once the fuel is gone, down to empty', () => {
    expect(stepPower({ fuel: 0, battery: 5 }, step(), T)).toEqual({ fuel: 0, battery: 5 - BATTERY.drainPerSec });
    const flat = stepPower({ fuel: 0, battery: 0.2 }, step(), T);
    expect(flat.battery).toBe(0);
    expect(canDrive(flat)).toBe(false);
    expect(stranded(flat)).toBe(true);
    expect(stranded({ fuel: 1, battery: 0 })).toBe(false); // the generator will refill it
  });

  it('solar panels charge a parked tank, up to the cap', () => {
    expect(stepPower({ fuel: 0, battery: 0 }, step({ throttle: 0, solar: true }), T).battery).toBeCloseTo(BATTERY.solarPerSec);
    expect(stepPower({ fuel: 0, battery: 19.9 }, step({ throttle: 0, solar: true }), T).battery).toBe(20);
  });

  it('a nearly empty tank tops up only from the fuel it has', () => {
    const p = stepPower({ fuel: 0.3, battery: 10 }, step({ throttle: 0 }), T);
    expect(p).toEqual({ fuel: 0, battery: 10.3 });
  });

  it('full-throttle range is the fuel plus one battery, so fuel lasts as long as it always has', () => {
    let p: Power = { fuel: FUEL.max, battery: BATTERY.max };
    let seconds = 0;
    while (canDrive(p) && seconds < 1000) {
      p = stepPower(p, step({ dtMs: 100, maxFuel: FUEL.max, maxBattery: BATTERY.max }), T);
      seconds += 0.1;
    }
    expect(seconds).toBeCloseTo(FUEL.max / BATTERY.drainPerSec + BATTERY.max / BATTERY.drainPerSec, 0);
  });
});
