// Client-side PDF generation for the "Exportovať dáta" → PDF format.
//
// Replaces the old window.print() approach (a temporary #finvu-print-export DOM
// node + @media print CSS). That approach only reliably rendered a single
// column and stamped the browser's own URL/date into the page header/footer.
// Here we build a real PDF file with jsPDF instead — everything (jsPDF, the
// embedded Unicode font, the logo raster) is lazy-loaded so the main bundle
// stays small, exactly like the pdfjs-dist / xlsx import-on-demand pattern.
import { formatMoney, formatDateLocale } from '../utils/format'

export interface PdfExportTransaction {
  date: string
  type: 'income' | 'expense'
  categoryName: string | null
  description: string | null
  amount: number
}

export interface PdfExportOptions {
  transactions: PdfExportTransaction[]
  title: string       // localized, e.g. "Výpis transakcií"
  rangeLabel: string  // e.g. "Júl 2026" or "Máj 2026 – Júl 2026"
  incomeLabel: string // localized type label, e.g. "Príjem"
  expenseLabel: string
  fileName: string
  locale: string      // active UI locale, e.g. "sk-SK"
  currency: string    // user's currency, e.g. "EUR"
  labels: {
    date: string
    type: string
    category: string
    note: string
    amount: string
    empty: string
    generatedOn: string // contains "{date}"
  }
}

// Brand violet accent used for headings + table header fill.
const ACCENT: [number, number, number] = [124, 58, 237] // #7C3AED
const INK: [number, number, number] = [30, 27, 45]
const MUTED: [number, number, number] = [120, 120, 135]
const LINE: [number, number, number] = [228, 224, 238]
const GREEN: [number, number, number] = [21, 128, 61]
const RED: [number, number, number] = [220, 38, 38]

// Rasterize the app's SVG logo to a PNG data URL so jsPDF.addImage can embed it.
async function logoDataUrl(): Promise<string | null> {
  try {
    const img = new Image()
    const loaded = new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('logo load failed'))
    })
    img.src = '/logo.svg'
    await loaded
    const size = 128
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(img, 0, 0, size, size)
    return canvas.toDataURL('image/png')
  } catch {
    return null
  }
}

export async function generateTransactionsPdf(opts: PdfExportOptions): Promise<void> {
  const [{ jsPDF }, { ROBOTO_REGULAR_B64, ROBOTO_BOLD_B64 }, logo] = await Promise.all([
    import('jspdf'),
    import('./pdfFont'),
    logoDataUrl(),
  ])

  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  doc.addFileToVFS('Roboto-Regular.ttf', ROBOTO_REGULAR_B64)
  doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal')
  doc.addFileToVFS('Roboto-Bold.ttf', ROBOTO_BOLD_B64)
  doc.addFont('Roboto-Bold.ttf', 'Roboto', 'bold')

  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const M = 40
  const contentR = pageW - M

  // Column layout (x = left edge; amount is right-aligned to contentR).
  const col = {
    date: M,
    type: M + 74,
    cat: M + 140,
    note: M + 264,
    amountRight: contentR,
    amountLeft: contentR - 96,
  }
  const rowH = 22
  const headerH = 24

  // Trim a string to fit maxW at the current font size, adding an ellipsis.
  const fit = (text: string, maxW: number): string => {
    if (!text) return ''
    if (doc.getTextWidth(text) <= maxW) return text
    let s = text
    while (s.length > 1 && doc.getTextWidth(s + '…') > maxW) s = s.slice(0, -1)
    return s + '…'
  }

  // ── Document header (logo + title + period) ──
  let logoBottom = M
  if (logo) {
    doc.addImage(logo, 'PNG', M, M, 32, 32)
    logoBottom = M + 32
  }
  const textX = logo ? M + 44 : M
  doc.setFont('Roboto', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(...ACCENT)
  doc.text(opts.title, textX, M + 15)
  doc.setFont('Roboto', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...MUTED)
  doc.text(opts.rangeLabel, textX, M + 30)

  let y = Math.max(logoBottom, M + 40) + 18

  // ── Table header (repeated on every page) ──
  const drawTableHeader = () => {
    doc.setFillColor(...ACCENT)
    doc.roundedRect(M, y, contentR - M, headerH, 4, 4, 'F')
    doc.setFont('Roboto', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(255, 255, 255)
    const ty = y + headerH / 2 + 3
    doc.text(opts.labels.date, col.date + 8, ty)
    doc.text(opts.labels.type, col.type + 4, ty)
    doc.text(opts.labels.category, col.cat + 4, ty)
    doc.text(opts.labels.note, col.note + 4, ty)
    doc.text(opts.labels.amount, col.amountRight - 8, ty, { align: 'right' })
    y += headerH + 4
  }

  drawTableHeader()

  // ── Rows ──
  doc.setFont('Roboto', 'normal')
  doc.setFontSize(9.5)

  if (opts.transactions.length === 0) {
    doc.setTextColor(...MUTED)
    doc.text(opts.labels.empty, M, y + 14)
    y += rowH
  }

  for (const tx of opts.transactions) {
    // Page break — keep one row + footer space clear at the bottom.
    if (y + rowH > pageH - 56) {
      doc.addPage()
      y = M
      drawTableHeader()
      doc.setFont('Roboto', 'normal')
      doc.setFontSize(9.5)
    }

    const isIncome = tx.type === 'income'
    const baseY = y + 14

    doc.setTextColor(...INK)
    doc.text(fit(formatDateLocale(tx.date, opts.locale, { day: '2-digit', month: '2-digit', year: 'numeric' }), col.type - col.date - 10), col.date + 8, baseY)

    doc.setTextColor(...(isIncome ? GREEN : RED))
    doc.text(isIncome ? opts.incomeLabel : opts.expenseLabel, col.type + 4, baseY)

    doc.setTextColor(...INK)
    doc.text(fit(tx.categoryName ?? '—', col.note - col.cat - 8), col.cat + 4, baseY)
    doc.setTextColor(...MUTED)
    doc.text(fit(tx.description ?? '', col.amountLeft - col.note - 8), col.note + 4, baseY)

    const amount = `${isIncome ? '+' : '−'}${formatMoney(Math.abs(tx.amount), opts.locale, opts.currency)}`
    doc.setFont('Roboto', 'bold')
    doc.setTextColor(...(isIncome ? GREEN : RED))
    doc.text(amount, col.amountRight - 8, baseY, { align: 'right' })
    doc.setFont('Roboto', 'normal')

    // Subtle row divider.
    doc.setDrawColor(...LINE)
    doc.setLineWidth(0.5)
    doc.line(M, y + rowH, contentR, y + rowH)

    y += rowH
  }

  // ── Footer on every page (app-defined — no browser artifacts) ──
  const totalPages = doc.getNumberOfPages()
  const generatedOn = formatDateLocale(new Date(), opts.locale)
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p)
    doc.setFont('Roboto', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...MUTED)
    doc.text(opts.labels.generatedOn.replace('{date}', generatedOn), M, pageH - 28)
    doc.text(`Strana ${p}/${totalPages}`, contentR, pageH - 28, { align: 'right' })
  }

  doc.save(opts.fileName)
}
