import * as fs from 'fs';
import csv from 'csv-parser';
import * as xlsx from 'xlsx';

export async function getFilePreview(
  filePath: string,
  originalName: string,
): Promise<{ headers: string[]; previewRows: any[] }> {
  const isCsv = originalName.toLowerCase().endsWith('.csv') || filePath.toLowerCase().endsWith('.csv');

  if (isCsv) {
    return new Promise((resolve, reject) => {
      const results: any[] = [];
      let headers: string[] = [];
      const stream = fs.createReadStream(filePath).pipe(csv());

      stream.on('headers', (hdrList: string[]) => {
        headers = hdrList;
      });

      stream.on('data', (data: any) => {
        if (results.length < 5) {
          results.push(data);
        } else {
          // Destroys the read stream as soon as we have enough preview rows
          stream.destroy();
          resolve({ headers, previewRows: results });
        }
      });

      stream.on('end', () => {
        resolve({ headers, previewRows: results });
      });

      stream.on('error', (err: any) => {
        reject(err);
      });
    });
  } else {
    // xlsx or xls
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json<any>(worksheet);
    const headers = data.length > 0 ? Object.keys(data[0]) : [];
    const previewRows = data.slice(0, 5);
    return { headers, previewRows };
  }
}
