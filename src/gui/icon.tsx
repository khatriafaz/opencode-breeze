// Breeze's logo mark, from its favicon.
const VIEWBOX = "0 -25 1040 1045"
const COLOR = "#6c4cf1"
const PATHS = [
  "M31.28,811.04 Q1.58,781.34 31.28,751.64 L415.76,367.17 Q445.46,337.47 475.16,367.17 L560.99,453 Q590.69,482.7 620.39,453 L923.06,150.34 Q952.76,120.64 982.46,150.34 L1008.15,176.03 Q1037.85,205.73 1008.15,235.43 L621.84,621.76 Q592.14,651.46 562.44,621.76 L475.02,534.34 Q445.32,504.64 415.62,534.34 L114.8,835.16 Q85.1,864.86 55.4,835.16 Z",
  "M470.06,7.77 Q440.57,-22.14 410.66,7.35 L29.91,382.64 Q0,412.12 29.48,442.03 L61.28,474.29 Q90.76,504.2 120.68,474.73 L409.52,190.2 Q439.44,160.73 468.92,190.64 L555.65,278.62 Q585.13,308.53 615.04,279.04 L647.22,247.3 Q677.13,217.81 647.64,187.9 Z",
  "M1008.3,606.43 Q1038,576.74 1008.3,547.04 L975.82,514.56 Q946.12,484.86 916.41,514.55 L627.91,802.88 Q598.2,832.57 568.5,802.87 L480.41,714.79 Q450.71,685.09 421.01,714.79 L388.57,747.23 Q358.87,776.93 388.57,806.63 L568.57,986.63 Q598.27,1016.33 627.97,986.64 Z",
]

export function BreezeIcon(props: { readonly size?: number }) {
  return (
    <svg
      class="breeze-icon"
      viewBox={VIEWBOX}
      width={props.size ?? 14}
      height={props.size ?? 14}
      aria-hidden="true"
      fill={COLOR}
    >
      {PATHS.map((d) => (
        <path d={d} />
      ))}
    </svg>
  )
}

const svg = (width: string, height: string) => {
  const NS = "http://www.w3.org/2000/svg"
  const element = document.createElementNS(NS, "svg")
  element.setAttribute("class", "breeze-icon")
  element.setAttribute("viewBox", VIEWBOX)
  element.setAttribute("width", width)
  element.setAttribute("height", height)
  element.setAttribute("aria-hidden", "true")
  element.setAttribute("fill", COLOR)
  for (const d of PATHS) {
    const path = document.createElementNS(NS, "path")
    path.setAttribute("d", d)
    element.append(path)
  }
  return element
}

/**
 * Gives the host's launcher rows for this plugin (the side panel + menu and the New tab list) the Breeze logo. Those
 * rows only take built-in icon names, so swap the icon in the DOM: a button or menu item whose text is exactly `title`
 * and that has an icon. It relies on the app's markup, like the link interception. Returns a cleanup.
 */
export function brandLaunchers(title: () => string) {
  let frame = 0
  const patch = () => {
    frame = 0
    const label = title()
    for (const row of document.querySelectorAll<HTMLElement>('button, [role="menuitem"], [role="option"]')) {
      if (row.textContent?.trim() !== label || row.querySelector(".breeze-icon")) continue
      const icon = row.querySelector("svg")
      if (!icon) continue
      const box = icon.getBoundingClientRect()
      const size = (value: string | null, measured: number) => value ?? `${Math.round(measured) || 16}`
      icon.replaceWith(svg(size(icon.getAttribute("width"), box.width), size(icon.getAttribute("height"), box.height)))
    }
  }
  const observer = new MutationObserver(() => {
    if (!frame) frame = requestAnimationFrame(patch)
  })
  observer.observe(document.body, { childList: true, subtree: true })
  patch()
  return () => {
    observer.disconnect()
    if (frame) cancelAnimationFrame(frame)
  }
}
