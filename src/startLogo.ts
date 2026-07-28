/** TMNT-inspired graffiti title — canvas for crisp scaling. */
export function buildStartLogo(): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = 920
  c.height = 320
  const g = c.getContext('2d')!

  // Subtle splatter / grime
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(0,0,0,${0.04 + Math.random() * 0.06})`
    g.beginPath()
    g.arc(Math.random() * c.width, Math.random() * c.height, 2 + Math.random() * 18, 0, Math.PI * 2)
    g.fill()
  }

  const drawOutlinedText = (
    text: string,
    x: number,
    y: number,
    size: number,
    fill: string,
    stroke: string,
    strokeW: number,
    font: string,
    skew = 0,
  ) => {
    g.save()
    g.translate(x, y)
    if (skew) g.transform(1, 0, skew, 1, 0, 0)
    g.font = font
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.lineJoin = 'round'
    g.miterLimit = 2

    // Hard comic shadow
    g.fillStyle = 'rgba(0,0,0,0.85)'
    g.fillText(text, 6, 8)

    // Outer stroke stack (gold → black)
    g.strokeStyle = '#1a1020'
    g.lineWidth = strokeW + 6
    g.strokeText(text, 0, 0)
    g.strokeStyle = stroke
    g.lineWidth = strokeW
    g.strokeText(text, 0, 0)

    g.fillStyle = fill
    g.fillText(text, 0, 0)

    // Highlight slash on fill
    g.globalCompositeOperation = 'source-atop'
    g.fillStyle = 'rgba(255,255,255,0.18)'
    g.fillRect(-size * text.length * 0.35, -size * 0.45, size * text.length * 0.7, size * 0.22)
    g.restore()
  }

  // Top tag — like "TEENAGE MUTANT NINJA"
  drawOutlinedText(
    'CYBER',
    c.width / 2,
    72,
    52,
    '#e82828',
    '#ff8866',
    5,
    '900 52px Impact, Haettenschweiler, "Arial Black", sans-serif',
    -0.12,
  )

  // Hero word — like "TURTLES"
  drawOutlinedText(
    'STREET',
    c.width / 2,
    188,
    118,
    '#7ae020',
    '#ffd400',
    14,
    '900 118px Impact, Haettenschweiler, "Arial Black", sans-serif',
    -0.08,
  )

  // Purple graffiti tag under
  g.save()
  g.translate(c.width / 2 + 120, 248)
  g.rotate(-0.18)
  g.font = 'italic bold 28px "Courier New", monospace'
  g.fillStyle = '#c040ff'
  g.strokeStyle = '#1a0828'
  g.lineWidth = 4
  g.strokeText('NEON ALLEY', 0, 0)
  g.fillText('NEON ALLEY', 0, 0)
  g.restore()

  // Drip accents on STREEt feel
  g.fillStyle = '#5bc918'
  for (const dx of [-180, -60, 80, 200]) {
    g.beginPath()
    g.moveTo(c.width / 2 + dx, 248)
    g.quadraticCurveTo(c.width / 2 + dx + 4, 268, c.width / 2 + dx - 2, 278)
    g.lineTo(c.width / 2 + dx + 6, 278)
    g.quadraticCurveTo(c.width / 2 + dx + 10, 265, c.width / 2 + dx + 8, 248)
    g.fill()
  }

  return c
}

export function mountStartLogo(imgEl: HTMLImageElement) {
  const canvas = buildStartLogo()
  imgEl.src = canvas.toDataURL('image/png')
  imgEl.width = canvas.width
  imgEl.height = canvas.height
}
