import { useEffect } from 'react';

/**
 * Sets the html + body background to match the current page's theme on mount,
 * and restores the previous values on unmount. Also updates the iOS Safari
 * `theme-color` meta tag so the browser's URL bar (top in regular tabs, bottom
 * in compact tab mode) tints to match the page — without this the user sees
 * default-white iOS chrome around the page on every route.
 *
 * Pass any CSS colour. The bg accepts gradients/strings; theme-color must be a
 * solid colour, so callers can pass an optional second argument when the visual
 * bg is a gradient and the chrome tint should be a representative solid stop.
 */
export function usePageBackground(background: string, themeColor?: string) {
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');

    const prevHtml = html.style.background;
    const prevBody = body.style.background;
    const prevTheme = meta?.getAttribute('content') ?? null;

    html.style.background = background;
    body.style.background = background;
    if (meta) meta.setAttribute('content', themeColor ?? background);

    return () => {
      html.style.background = prevHtml;
      body.style.background = prevBody;
      if (meta && prevTheme !== null) meta.setAttribute('content', prevTheme);
    };
  }, [background, themeColor]);
}
