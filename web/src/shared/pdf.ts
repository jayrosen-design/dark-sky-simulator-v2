// Text layout for the apps' jsPDF briefs: wrapped lines with page breaks, and "label: value" rows whose value is a
// hyperlink back to the app state it came from.
import type { jsPDF } from "jspdf";

export function pdfWriter(doc: jsPDF, { margin = 48, bottom = 740 } = {}) {
  const W = doc.internal.pageSize.getWidth();
  let y = margin;
  const line = (text: string, size = 10, style: "normal" | "bold" = "normal", color: [number, number, number] = [20, 20, 20]) => {
    doc.setFont("helvetica", style).setFontSize(size).setTextColor(...color);
    for (const l of doc.splitTextToSize(text, W - 2 * margin) as string[]) {
      if (y > bottom) { doc.addPage(); y = margin; }
      doc.text(l, margin, y);
      y += size * 1.35;
    }
  };
  const linked = (label: string, value: string, url: string) => {
    if (y > bottom) { doc.addPage(); y = margin; }
    doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(20, 20, 20);
    doc.text(`${label}:`, margin, y);
    doc.setTextColor(20, 70, 160);
    doc.textWithLink(value, margin + 170, y, { url });
    y += 14;
  };
  const gap = (n: number) => { y += n; };
  return { line, linked, gap };
}
