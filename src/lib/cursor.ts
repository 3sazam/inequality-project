// Singleton cursor position — one global pointermove listener shared across all consumers.
const pos = { x: -9999, y: -9999 };

if (typeof window !== 'undefined') {
  window.addEventListener('pointermove', (e) => {
    pos.x = e.clientX;
    pos.y = e.clientY;
  }, { passive: true });
  window.addEventListener('pointerleave', () => {
    pos.x = -9999;
    pos.y = -9999;
  });
}

export const globalCursor = pos;
