/** Below this, a shorter visual viewport is browser chrome moving (the address bar), not a keyboard. */
const KEYBOARD_MIN = 80

/**
 * Follows the on-screen keyboard through the visual viewport: how much of the screen's bottom it covers goes in
 * `--kb-inset` and `data-keyboard` on <html>, which sheets, the page's scroll padding and the coach's composer read to
 * stay above it. Phones keep the page its full height under the keyboard (iOS always, Android by default), so without
 * this a bottom sheet's results sit hidden behind it. The visible height itself goes in `--vv-height`: iOS also moves
 * the visual viewport down the page (`offsetTop`), so a sheet sized from the whole screen would run past its top.
 */
export function trackKeyboard(): () => void {
  const viewport = window.visualViewport
  if (!viewport) return () => {}
  const html = document.documentElement
  const update = () => {
    // Zooming in shrinks the visual viewport too: that is not the keyboard.
    const covered = viewport.scale > 1.01 ? 0 : window.innerHeight - viewport.height - viewport.offsetTop
    const open = covered > KEYBOARD_MIN
    html.style.setProperty('--kb-inset', `${open ? Math.round(covered) : 0}px`)
    html.style.setProperty('--vv-height', `${Math.round(viewport.height)}px`)
    if (open) html.dataset.keyboard = 'open'
    else delete html.dataset.keyboard
  }
  viewport.addEventListener('resize', update)
  viewport.addEventListener('scroll', update)
  update()
  return () => {
    viewport.removeEventListener('resize', update)
    viewport.removeEventListener('scroll', update)
  }
}
