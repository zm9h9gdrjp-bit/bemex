import { World, Vec2, Box, Circle, RevoluteJoint, type Body } from 'planck';
import type { RiderPose } from './riderPose';
import { GEOM } from './riderPose';
import type { Vec } from './terrain';
import { CAT, MASK } from './collision';
import type { FixtureTag } from './terrain';

export interface RagdollPart {
  body: Body;
  /** Bone name used by the renderer. */
  bone: 'torso' | 'head' | 'thigh' | 'shin' | 'upperArm' | 'forearm';
  halfLength: number;
  halfWidth: number;
}

/**
 * Spawns a six-part ragdoll matching the rider's current pose, inheriting the
 * bike's velocity so the fall reads as a continuation of the crash.
 */
export class Ragdoll {
  readonly parts: RagdollPart[] = [];

  constructor(private world: World, pose: RiderPose, vel: Vec, angVel: number, owner: number) {
    const group = -(owner + 1); // negative group: parts never collide with each other
    const make = (bone: RagdollPart['bone'], a: Vec, b: Vec, halfWidth: number, density: number) => {
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      const halfLength = Math.max(0.05, Math.hypot(b.x - a.x, b.y - a.y) / 2);
      const body = world.createDynamicBody({ position: new Vec2(cx, cy), angle: Math.atan2(b.y - a.y, b.x - a.x) });
      body.createFixture({
        shape: new Box(halfLength, halfWidth),
        density, friction: 0.9, restitution: 0.05,
        filterCategoryBits: CAT.RAGDOLL, filterMaskBits: MASK.RAGDOLL, filterGroupIndex: group,
        userData: { kind: 'ragdoll', owner } satisfies FixtureTag,
      });
      body.setLinearVelocity(new Vec2(vel.x, vel.y));
      body.setAngularVelocity(angVel * 0.6);
      body.setAngularDamping(0.4);
      this.parts.push({ body, bone, halfLength, halfWidth });
      return body;
    };

    const torso = make('torso', pose.hip, pose.shoulder, 0.13, 6);
    const thigh = make('thigh', pose.hip, pose.knee, 0.075, 5);
    const shin = make('shin', pose.knee, pose.foot, 0.06, 5);
    const upper = make('upperArm', pose.shoulder, pose.elbow, 0.05, 4);
    const fore = make('forearm', pose.elbow, pose.hand, 0.045, 4);

    const head = world.createDynamicBody({ position: new Vec2(pose.head.x, pose.head.y) });
    head.createFixture({
      shape: new Circle(GEOM.headRadius), density: 4, friction: 0.8, restitution: 0.1,
      filterCategoryBits: CAT.RAGDOLL, filterMaskBits: MASK.RAGDOLL, filterGroupIndex: group,
      userData: { kind: 'ragdoll', owner } satisfies FixtureTag,
    });
    head.setLinearVelocity(new Vec2(vel.x, vel.y));
    this.parts.push({ body: head, bone: 'head', halfLength: GEOM.headRadius, halfWidth: GEOM.headRadius });

    const pin = (a: Body, b: Body, at: Vec, lo: number, hi: number) =>
      world.createJoint(new RevoluteJoint({ enableLimit: true, lowerAngle: lo, upperAngle: hi }, a, b, new Vec2(at.x, at.y)));
    const D = Math.PI / 180;
    pin(torso, head, pose.neck, -40 * D, 40 * D);
    pin(torso, thigh, pose.hip, -120 * D, 30 * D);
    pin(thigh, shin, pose.knee, 0, 140 * D);
    pin(torso, upper, pose.shoulder, -160 * D, 60 * D);
    pin(upper, fore, pose.elbow, -140 * D, 0);
  }

  get torso(): Body { return this.parts[0].body; }

  destroy(): void {
    for (const p of this.parts) this.world.destroyBody(p.body);
    this.parts.length = 0;
  }
}
