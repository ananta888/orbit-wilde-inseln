// Both runtimes read the same tuning file.
export const FLIGHT = await fetch('/flight-config.json').then(response => {
  if (!response.ok) throw new Error('Flugparameter fehlen');
  return response.json();
});
export const HALF_WORLD = Math.PI * FLIGHT.planetRadius;
export const POLAR_LIMIT = HALF_WORLD / 2 - 16;
export function flightBoost(height) {
  return Math.min(FLIGHT.maxBoost, 1 + (Math.max(0, height - FLIGHT.boostStart) / FLIGHT.boostScale) ** FLIGHT.boostPower);
}
export function coordinates(x, z) {
  return [((x + HALF_WORLD) % (2 * HALF_WORLD) + 2 * HALF_WORLD) % (2 * HALF_WORLD) - HALF_WORLD, Math.max(-POLAR_LIMIT, Math.min(POLAR_LIMIT, z))];
}
export function accelerate(velocity, direction, height, dt, flying) {
  const gain = flightBoost(height), horizontal = flying ? FLIGHT.horizontalSpeed * gain : 2.8;
  const [dx, dy, dz] = direction, target = [dx * horizontal, flying ? dy * FLIGHT.verticalSpeed * gain : -FLIGHT.landingSpeed * gain, dz * horizontal];
  const blend = 1 - Math.exp(-FLIGHT.response * dt);
  return velocity.map((v, i) => Math.abs(target[i]) < 1e-8 && Math.abs(v) < .02 ? 0 : v + (target[i] - v) * blend);
}
