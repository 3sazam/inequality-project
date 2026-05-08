import { useEffect } from 'react';

/**
 * Sets the html + body background to match the current page's theme on mount,
 * and restores the previous value on unmount. This keeps iOS overscroll/rubber-band
 * the same colour as the page, so the user never sees a black band when scrolling
 * past the top or bottom of the document.
 *
 * Pass any CSS colour (or gradient) that matches the page's primary surface.
 */
export function usePageBackground(background: string) {
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.background;
    const prevBody = body.style.background;
    html.style.background = background;
    body.style.background = background;
    return () => {
      html.style.background = prevHtml;
      body.style.background = prevBody;
    };
  }, [background]);
}
