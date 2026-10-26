import * as Phaser from 'phaser';

// Drop shadows: a dark, see-through copy of a sprite, nudged down and to the
// right (all the art, and the baked mesa shadows, are lit from the upper
// left). They live on one layer just above the ground, and the day/night
// cycle sets how strong they are.

type Source = Phaser.GameObjects.Image;

interface Follower {
  src: Source;
  shadow: Source;
  dx: number;
  dy: number;
}

/** How far a shadow falls for something `lift` px tall. */
export function shadowOffset(lift: number) {
  return { dx: Math.round(lift), dy: Math.round(lift * 0.6) };
}

export class Shadows {
  private readonly layer: Phaser.GameObjects.Layer;
  private readonly followers: Follower[] = [];
  private alpha = 0.3;
  private unsorted = false;

  constructor(private readonly scene: Phaser.Scene) {
    this.layer = scene.add.layer().setDepth(1.5);
    // After physics has moved things this frame, so moving shadows never lag.
    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.update, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.update, this));
  }

  /** A shadow for something that never moves. Destroy it with its source. */
  cast(src: Source, lift: number): Source {
    const { dx, dy } = shadowOffset(lift);
    const s = this.scene.add.image(src.x + dx, src.y + dy, src.texture.key, src.frame.name);
    s.setOrigin(src.originX, src.originY).setFlip(src.flipX, src.flipY).setRotation(src.rotation).setScale(src.scaleX, src.scaleY);
    s.setTint(0x000000).setAlpha(this.alpha);
    this.layer.add(s);
    this.unsorted = true;
    return s;
  }

  /** A shadow that tracks a moving sprite every frame (and hides with it). */
  follow(src: Source, lift: number): Source {
    const s = this.cast(src, lift);
    this.followers.push({ src, shadow: s, ...shadowOffset(lift) });
    return s;
  }

  /** How dark shadows are (0..1): strong under the sun, faint by moonlight. */
  setStrength(alpha: number) {
    if (Math.abs(alpha - this.alpha) < 0.004) return;
    this.alpha = alpha;
    for (const s of this.layer.list as Source[]) s.setAlpha(alpha);
  }

  private update() {
    // Grouped by texture, so they draw in a few batches rather than one by one.
    if (this.unsorted) {
      this.unsorted = false;
      (this.layer.list as Source[]).sort((a, b) => (a.texture.key < b.texture.key ? -1 : a.texture.key > b.texture.key ? 1 : 0));
    }
    for (let i = this.followers.length - 1; i >= 0; i--) {
      const f = this.followers[i];
      if (!f.src.active) {
        f.shadow.destroy();
        this.followers.splice(i, 1);
        continue;
      }
      f.shadow.setPosition(f.src.x + f.dx, f.src.y + f.dy).setRotation(f.src.rotation).setVisible(f.src.visible);
    }
  }

  get count() {
    return this.layer.list.length;
  }
}
