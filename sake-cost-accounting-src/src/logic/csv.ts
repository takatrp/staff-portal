export type CsvEncoding = "UTF-8" | "Shift-JIS";

export type CsvPreview = {
  fileName: string;
  encoding: CsvEncoding;
  headers: string[];
  rows: string[][];
  rowCount: number;
  columnCount: number;
};

export function detectCsvEncoding(bytes: Uint8Array): CsvEncoding {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return "UTF-8";
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return "UTF-8";
  } catch {
    return "Shift-JIS";
  }
}

export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < clean.length; index += 1) {
    const char = clean[index];
    if (quoted) {
      if (char === '"' && clean[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (field !== "" || row.length > 0) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((cell) => cell !== ""));
}

export function normalizeHeader(value: string): string {
  return value.replace(/^\uFEFF/, "").normalize("NFKC").trim().replace(/\s+/g, " ");
}

export async function previewCsv(file: File): Promise<CsvPreview> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const encoding = detectCsvEncoding(bytes);
  const decoder = new TextDecoder(encoding === "UTF-8" ? "utf-8" : "shift-jis");
  const parsed = parseCsv(decoder.decode(bytes));
  const headers = (parsed[0] ?? []).map(normalizeHeader);
  const dataRows = parsed.slice(1);
  return {
    fileName: file.name,
    encoding,
    headers,
    rows: dataRows.slice(0, 5),
    rowCount: dataRows.length,
    columnCount: Math.max(headers.length, ...dataRows.map((row) => row.length), 0),
  };
}

export function validateImportRows(_headers: string[], _rows: string[][]): { valid: boolean; errors: string[] } {
  void _headers;
  void _rows;
  return { valid: false, errors: ["実物CSVの正式な項目マッピングが未確定です。"] };
}

export function applyCsvImport(): never {
  throw new Error("正式なCSV取込は未実装です。");
}
