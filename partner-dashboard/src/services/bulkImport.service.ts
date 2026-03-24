import { API_CONFIG } from '../config/api.config';

export interface BulkImportResult {
  partnerCreated: boolean;
  partnerId: string;
  businessName: string;
  offersCreated: number;
  offersSkipped: number;
  imagesUploaded: number;
  errors: string[];
  warnings: string[];
}

export interface PartnerImportResult {
  partnersCreated: number;
  partnersSkipped: number;
  imagesUploaded: number;
  tierApplied: string | null;
  errors: string[];
  warnings: string[];
  partners: Array<{ id: string; businessName: string; created: boolean }>;
}

function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function downloadFile(response: Response, filename: string): Promise<void> {
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const bulkImportService = {
  /** Download the Premium (single-partner/multiple-offers) XLSX template. */
  async downloadTemplate(): Promise<void> {
    const response = await fetch(`${API_CONFIG.baseURL}/admin/bulk-import/template`, {
      method: 'GET',
      headers: getAuthHeader(),
    });
    if (!response.ok) throw new Error(`Failed to download template: ${response.statusText}`);
    await downloadFile(response, 'boomcard-bulk-import-template.xlsx');
  },

  /** Download the Partners (multiple partners per file) XLSX template. */
  async downloadPartnersTemplate(): Promise<void> {
    const response = await fetch(`${API_CONFIG.baseURL}/admin/bulk-import/template/partners`, {
      method: 'GET',
      headers: getAuthHeader(),
    });
    if (!response.ok) throw new Error(`Failed to download template: ${response.statusText}`);
    await downloadFile(response, 'boomcard-partners-import-template.xlsx');
  },

  /** Premium import: one partner + multiple offers from a single spreadsheet. */
  async import(spreadsheet: File, images: File[]): Promise<BulkImportResult> {
    const formData = new FormData();
    formData.append('spreadsheet', spreadsheet);
    for (const img of images) formData.append('images', img);

    const response = await fetch(`${API_CONFIG.baseURL}/admin/bulk-import`, {
      method: 'POST',
      headers: getAuthHeader(),
      body: formData,
    });

    const json = await response.json();
    if (!response.ok || !json.success) throw new Error(json.error || 'Import failed');
    return json.data as BulkImportResult;
  },

  /** Partners import: multiple partners per spreadsheet, tier encoded in filename. */
  async importPartners(spreadsheet: File, images: File[]): Promise<PartnerImportResult> {
    const formData = new FormData();
    formData.append('spreadsheet', spreadsheet);
    for (const img of images) formData.append('images', img);

    const response = await fetch(`${API_CONFIG.baseURL}/admin/bulk-import/partners`, {
      method: 'POST',
      headers: getAuthHeader(),
      body: formData,
    });

    const json = await response.json();
    if (!response.ok || !json.success) throw new Error(json.error || 'Partners import failed');
    return json.data as PartnerImportResult;
  },

  /** Upload menu images to a venue. */
  async uploadVenueMenu(venueId: string, images: File[]): Promise<{ menuImages: string[]; uploaded: number }> {
    const formData = new FormData();
    for (const img of images) formData.append('images', img);

    const response = await fetch(`${API_CONFIG.baseURL}/venues/${venueId}/menu`, {
      method: 'POST',
      headers: getAuthHeader(),
      body: formData,
    });

    const json = await response.json();
    if (!response.ok || !json.success) throw new Error(json.error || 'Menu upload failed');
    return json.data as { menuImages: string[]; uploaded: number };
  },

  /** Clear all menu images for a venue. */
  async clearVenueMenu(venueId: string): Promise<void> {
    const response = await fetch(`${API_CONFIG.baseURL}/venues/${venueId}/menu`, {
      method: 'DELETE',
      headers: getAuthHeader(),
    });
    const json = await response.json();
    if (!response.ok || !json.success) throw new Error(json.error || 'Failed to clear menu');
  },
};
