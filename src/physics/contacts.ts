import type { World, Contact } from 'planck';
import type { Bike } from './bike';
import type { FixtureTag } from './terrain';

/** Routes contacts between a bike's parts and the terrain to the owning bike. */
export function routeContacts(world: World, bikes: Map<number, Bike>): void {
  const route = (c: Contact, delta: 1 | -1) => {
    const a = c.getFixtureA().getUserData() as FixtureTag | null;
    const b = c.getFixtureB().getUserData() as FixtureTag | null;
    if (!a || !b) return;
    for (const [mine, other] of [[a, b], [b, a]] as const) {
      if (mine.owner === undefined || (other.kind !== 'ground' && other.kind !== 'pit')) continue;
      bikes.get(mine.owner)?.onContact(mine, other, delta);
    }
  };
  world.on('begin-contact', (c) => route(c, 1));
  world.on('end-contact', (c) => route(c, -1));
}
