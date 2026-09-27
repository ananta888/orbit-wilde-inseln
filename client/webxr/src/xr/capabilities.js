/** Standard WebXR capability discovery; optional hardware never blocks desktop play. */
export async function detectSupport() {
  if (!globalThis.isSecureContext || !navigator.xr) return { vr: false, mr: false };
  const [vr, mr] = await Promise.all(['immersive-vr', 'immersive-ar'].map(mode => navigator.xr.isSessionSupported(mode).catch(() => false)));
  return { vr, mr };
}

export const futureCapabilities = Object.freeze({
  anchors: 'optional-adapter', roomMesh: 'optional-adapter', boundary: 'optional-adapter', bodyTracking: 'optional-adapter',
});
