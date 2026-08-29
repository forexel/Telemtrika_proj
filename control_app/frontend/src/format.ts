export const dateRu = (value?: string | null) => value ? value.slice(0, 10).split("-").reverse().join(".") : "—";
export const time = (value?: string | null) => value ? value.slice(11, 16) : "—";
export const duration = (seconds?: number | null) => {
  if (seconds == null) return "—";
  const value = Math.max(0, Number(seconds) || 0), hours = Math.floor(value / 3600), minutes = Math.floor(value % 3600 / 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};
export const numberRu = (value?: number | null, digits = 1) => Number(value || 0).toLocaleString("ru-RU", { minimumFractionDigits: digits, maximumFractionDigits: digits });
export const today = () => new Date().toISOString().slice(0, 10);
export const monthAgo = () => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10); };
export const clockMinutes = (value?: number | null) => value == null ? "—" : `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;

export function reportStatus(status?: string | null) {
  return ({ trip_confirmed: "confirmed", consistent: "confirmed", partial: "partial", not_confirmed: "unconfirmed", unplanned: "no-schedule" } as Record<string, string>)[status || ""] || "partial";
}

export function exportTable(tableId: string, name: string, title?: string) {
  const table = document.getElementById(tableId) as HTMLTableElement | null;
  if (!table) return false;
  const clone = table.cloneNode(true) as HTMLTableElement;
  clone.querySelectorAll("[data-no-export]").forEach(node => node.remove());
  clone.querySelectorAll("button").forEach(button => {
    const cell = button.closest("th,td");
    if (cell && !cell.textContent?.trim().replace(button.textContent?.trim() || "", "")) cell.remove();
    else button.remove();
  });
  clone.removeAttribute("id"); clone.removeAttribute("class"); clone.removeAttribute("style");
  clone.querySelectorAll("*").forEach(node => { node.removeAttribute("class"); node.removeAttribute("title"); });
  const reportTitle = title || `Отчёт: ${name}`;
  const generated = new Date().toLocaleString("ru-RU");
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><style>
    body{font-family:Arial,sans-serif;color:#1f2937}h1{font-size:18pt;margin:0 0 4pt}p{font-size:9pt;color:#6b7280;margin:0 0 12pt}
    table{border-collapse:collapse;width:100%;font-size:9pt}th{background:#dbeaf5;color:#243746;font-weight:700;text-align:left;border:1px solid #9ca3af;padding:7px;white-space:normal;vertical-align:top}
    td{border:1px solid #c7cdd3;padding:6px;white-space:normal;vertical-align:top}tbody tr:nth-child(even) td{background:#f4f7f9}
  </style></head><body><h1>${reportTitle}</h1><p>Сформировано: ${generated}</p>${clone.outerHTML}</body></html>`;
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob(["\ufeff", html], { type: "application/vnd.ms-excel;charset=utf-8" }));
  link.download = `${name}_${today()}.xls`; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000); return true;
}
