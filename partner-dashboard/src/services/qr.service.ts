import { apiService } from './api.service';

interface QRCodeData {
  venueId: string;
  offerId: string;
  expiresAt: string;
}

interface QRCodeResponse {
  qrCode: {
    id: string;
    code: string;
    dataURL: string;
  };
}

interface ValidationResponse {
  valid: boolean;
  qrCode?: any;
  message: string;
}

class QRService {
  async generateQRCode(data: QRCodeData): Promise<QRCodeResponse> {
    return apiService.post<QRCodeResponse>('/qr/generate', data);
  }

  async validateQRCode(code: string): Promise<ValidationResponse> {
    return apiService.post<ValidationResponse>('/qr/validate', { code });
  }

  async getQRCodeHistory(userId?: string) {
    return apiService.get('/qr/history', { userId });
  }

  async getQRCodeStats(venueId: string) {
    return apiService.get(`/qr/stats/${venueId}`);
  }
}

export const qrService = new QRService();