const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const XLSX = require('xlsx');

const MAX_EXTRACT_CHARS = 48000;

function truncate(s) {
  if (s.length <= MAX_EXTRACT_CHARS) return s;
  return `${s.slice(0, MAX_EXTRACT_CHARS)}\n\n[truncated]`;
}

async function extractDocumentText(buffer, mimetype, originalname = '') {
  const name = (originalname || '').toLowerCase();
  const mt = (mimetype || '').toLowerCase();

  if (mt === 'text/plain' || mt === 'text/csv' || mt === 'application/csv' || name.endsWith('.txt') || name.endsWith('.csv')) {
    return truncate(buffer.toString('utf8'));
  }

  if (mt === 'application/pdf' || name.endsWith('.pdf')) {
    const data = await pdfParse(buffer);
    return truncate(String(data.text || ''));
  }

  if (
    mt === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    || name.endsWith('.docx')
  ) {
    const { value } = await mammoth.extractRawText({ buffer });
    return truncate(String(value || ''));
  }

  if (
    mt === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    || name.endsWith('.xlsx')
  ) {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    let out = '';
    for (const sheetName of wb.SheetNames) {
      const sheet = wb.Sheets[sheetName];
      out += `--- ${sheetName} ---\n${XLSX.utils.sheet_to_csv(sheet)}\n`;
    }
    return truncate(out);
  }

  const err = new Error('Unsupported document type');
  err.statusCode = 400;
  throw err;
}

module.exports = { extractDocumentText, truncate, MAX_EXTRACT_CHARS };
