// Parser for the store's category inventory spreadsheets (Hardware/InventorySheets, the
// Link Products sheets, and the HH_HD_CT_DT cross-retailer sheet in Drive). These files share
// one idea, a row per product with a SKU, a description, and a stock count, but the columns
// vary per file: extra supplier SKU columns (SKU_HH, SKU_ORGILL), movement flags (FAST, SLOW,
// DEAD, REQUIRED), overstock counts with a shelf location (the paint matrix), repeated header
// rows mid-sheet, order columns that must NOT be read as stock, and stray section-label rows.
// The parser scans every sheet for header rows and maps what it finds; anything it cannot
// place lands in the per-sheet skipped count so nothing silently disappears.

export type InventoryLine = {
  sku: string | null;
  name: string;
  qty: number | null;
  note: string | null;
};
export type InventoryPerSheet = { sheet: string; lines: number; skipped: number };
export type InventoryParse = { lines: InventoryLine[]; perSheet: InventoryPerSheet[] };

const text = (v: unknown): string => (v == null ? "" : String(v).trim());

// Header recognizers. "Order Qty", "Suggested Qnt for 2026", and "PACK SIZE" are order and
// pack data, not stock on hand, so the qty matcher explicitly refuses them.
// Leading boundary only: "SKU_HH" and "Sku#" must match, and an underscore is a word
// character, so a trailing \b would wrongly reject the supplier-suffixed columns.
const isSkuHeader = (h: string) => /\b(sku|upc|barcode)|item\s*#/i.test(h);
const isDescHeader = (h: string) => /descrip|details|^desc$|product\b|^item$|^type$/i.test(h);
const isQtyHeader = (h: string) =>
  /(stock|inventor|quantit|counted|on\s*hand|\bleft\b)/i.test(h) &&
  !/(order|suggest|pack)/i.test(h);
const isNoteHeader = (h: string) => /overstock|location|comment|note/i.test(h);
// Columns that describe the product in the no-description (paint matrix) files.
const isComposeHeader = (h: string) =>
  /usecase|productline|^size$|^sheen$|^base$|colou?r|finish/i.test(h);

const MOVEMENT_FLAG = /^(fast|slow|dead|required)\s*$/i;

// "120+", "4+ Basment", "12" all mean a leading number; "?" and words mean unknown.
function parseQty(v: unknown): number | null {
  const s = text(v).replace(/,/g, "");
  const m = s.match(/^-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

type ColumnMap = {
  skuCols: number[];
  descCol: number;
  qtyCol: number;
  noteCols: number[];
  composeCols: number[];
};

// A row is a header when it names a description column plus a SKU or stock column, or (the
// paint matrix) SKU plus stock with product-describing columns instead of a description.
function mapHeader(row: unknown[]): ColumnMap | null {
  const skuCols: number[] = [];
  const noteCols: number[] = [];
  const composeCols: number[] = [];
  let descCol = -1;
  let qtyCol = -1;
  row.forEach((cell, i) => {
    const h = text(cell);
    if (!h) return;
    if (isSkuHeader(h)) skuCols.push(i);
    else if (isDescHeader(h) && descCol < 0) descCol = i;
    else if (isQtyHeader(h) && qtyCol < 0) qtyCol = i;
    else if (isNoteHeader(h)) noteCols.push(i);
    else if (isComposeHeader(h)) composeCols.push(i);
  });
  if (descCol >= 0 && (skuCols.length || qtyCol >= 0)) return { skuCols, descCol, qtyCol, noteCols, composeCols };
  if (descCol < 0 && skuCols.length && qtyCol >= 0 && composeCols.length) return { skuCols, descCol, qtyCol, noteCols, composeCols };
  return null;
}

export function parseInventory(sheets: { name: string; rows: unknown[][] }[]): InventoryParse {
  const lines: InventoryLine[] = [];
  const perSheet: InventoryPerSheet[] = [];

  for (const sheet of sheets) {
    // Order sheets live next to count sheets in the same workbook; qty there means order qty.
    if (/^order/i.test(sheet.name.trim())) continue;

    let map: ColumnMap | null = null;
    // Forward-fill memory for compose columns: the paint matrix leaves a cell blank when it
    // repeats the value above (same product line, next size).
    const carry: Record<number, string> = {};
    let count = 0;
    let skipped = 0;

    for (const row of sheet.rows) {
      if (!Array.isArray(row) || row.every((c) => text(c) === "")) continue;

      // A fresh header row (first, or repeated mid-sheet for the next section) remaps columns.
      const remap = mapHeader(row);
      if (remap) {
        map = remap;
        for (const k of Object.keys(carry)) delete carry[Number(k)];
        continue;
      }
      if (!map) continue;

      const sku = map.skuCols.map((i) => text(row[i])).find((s) => s !== "") || null;

      let name = map.descCol >= 0 ? text(row[map.descCol]) : "";
      if (!name && map.composeCols.length) {
        const parts: string[] = [];
        for (const i of map.composeCols) {
          const v = text(row[i]);
          if (v) carry[i] = v;
          if (carry[i]) parts.push(carry[i]);
        }
        name = parts.join(" ");
      }

      const qty = map.qtyCol >= 0 ? parseQty(row[map.qtyCol]) : null;

      // Everything informative that is not the product itself becomes the line note: the
      // named note columns (overstock, location) and any unmapped trailing cells carrying a
      // movement flag or a free-text remark.
      const noteBits: string[] = [];
      for (const i of map.noteCols) {
        const v = text(row[i]);
        if (v) noteBits.push(v);
      }
      row.forEach((cell, i) => {
        if (i === map!.descCol || i === map!.qtyCol) return;
        if (map!.skuCols.includes(i) || map!.noteCols.includes(i) || map!.composeCols.includes(i)) return;
        const v = text(cell);
        if (!v) return;
        if (MOVEMENT_FLAG.test(v) || /[a-z]/i.test(v)) noteBits.push(v);
      });
      const note = noteBits.length ? noteBits.join(" | ").slice(0, 300) : null;

      // Section labels ("Paint", "Link Products") have a name but no SKU, no qty, no note.
      if (!name && !sku) { skipped++; continue; }
      if (!sku && qty == null && !note) { skipped++; continue; }

      lines.push({ sku, name: name || sku || "", qty, note });
      count++;
    }

    perSheet.push({ sheet: sheet.name, lines: count, skipped });
  }

  return { lines, perSheet };
}

// Cheap detection for the import route: it is an inventory workbook if parsing finds lines.
export function looksLikeInventory(sheets: { name: string; rows: unknown[][] }[]): boolean {
  return parseInventory(sheets).lines.length > 0;
}
