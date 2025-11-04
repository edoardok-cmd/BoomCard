import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { Download, Plus, MapPin, QrCode, Printer, Edit, Trash2 } from 'lucide-react';

// ============================================
// Types
// ============================================

interface StickerLocation {
  id: string;
  name: string;
  nameBg?: string;
  locationType: string;
  locationNumber: string;
  capacity?: number;
  floor?: string;
  section?: string;
  createdAt: string;
}

interface Sticker {
  id: string;
  stickerId: string;
  qrCode: string;
  status: 'PENDING' | 'ACTIVE' | 'INACTIVE' | 'DAMAGED' | 'RETIRED';
  totalScans: number;
  lastScannedAt?: string;
  location: {
    name: string;
    locationType: string;
  };
}

type ViewMode = 'list' | 'create' | 'generate';

// ============================================
// Styled Components
// ============================================

const PageContainer = styled.div`
  padding: 32px;
  max-width: 1400px;
  margin: 0 auto;

  @media (max-width: 768px) {
    padding: 16px;
  }
`;

const Header = styled.div`
  margin-bottom: 32px;
`;

const Title = styled.h1`
  font-size: 32px;
  font-weight: 700;
  margin: 0 0 8px 0;
  color: #1a1a1a;
`;

const Subtitle = styled.p`
  font-size: 16px;
  color: #666;
  margin: 0;
`;

const Tabs = styled.div`
  display: flex;
  gap: 16px;
  border-bottom: 2px solid #e0e0e0;
  margin-bottom: 32px;
`;

const Tab = styled.button<{ $active: boolean }>`
  padding: 12px 24px;
  border: none;
  background: none;
  font-weight: 600;
  font-size: 16px;
  color: ${props => props.$active ? '#1976d2' : '#666'};
  border-bottom: 3px solid ${props => props.$active ? '#1976d2' : 'transparent'};
  margin-bottom: -2px;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    color: #1976d2;
  }
`;

const ActionBar = styled.div`
  display: flex;
  gap: 12px;
  margin-bottom: 24px;
  justify-content: flex-end;
`;

const Button = styled.button<{ $variant?: 'primary' | 'secondary' | 'outline' }>`
  padding: 12px 24px;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  gap: 8px;

  ${props => {
    switch (props.$variant) {
      case 'primary':
        return `
          background: linear-gradient(135deg, #1976d2 0%, #2196f3 100%);
          color: white;
          box-shadow: 0 4px 12px rgba(25, 118, 210, 0.3);

          &:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 16px rgba(25, 118, 210, 0.4);
          }
        `;
      case 'outline':
        return `
          background: white;
          color: #1976d2;
          border: 2px solid #1976d2;

          &:hover {
            background: #e3f2fd;
          }
        `;
      default:
        return `
          background: #f5f5f5;
          color: #666;

          &:hover {
            background: #e0e0e0;
          }
        `;
    }
  }}

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none !important;
  }
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 24px;
`;

const Card = styled.div`
  background: white;
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  transition: all 0.3s ease;

  &:hover {
    transform: translateY(-4px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  }
`;

const CardHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
`;

const CardTitle = styled.h3`
  font-size: 18px;
  font-weight: 700;
  margin: 0 0 4px 0;
  color: #1a1a1a;
`;

const CardSubtitle = styled.div`
  font-size: 14px;
  color: #666;
`;

const StatusBadge = styled.span<{ $status: string }>`
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
  background: ${props => {
    switch (props.$status) {
      case 'ACTIVE': return '#e8f5e9';
      case 'PENDING': return '#fff3e0';
      case 'INACTIVE': return '#f5f5f5';
      case 'DAMAGED': return '#ffebee';
      default: return '#e0e0e0';
    }
  }};
  color: ${props => {
    switch (props.$status) {
      case 'ACTIVE': return '#2e7d32';
      case 'PENDING': return '#ef6c00';
      case 'INACTIVE': return '#666';
      case 'DAMAGED': return '#c62828';
      default: return '#666';
    }
  }};
`;

const Stats = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  margin-top: 16px;
`;

const StatItem = styled.div`
  text-align: center;
  padding: 12px;
  background: #f5f5f5;
  border-radius: 8px;
`;

const StatValue = styled.div`
  font-size: 24px;
  font-weight: 700;
  color: #1976d2;
`;

const StatLabel = styled.div`
  font-size: 12px;
  color: #666;
  margin-top: 4px;
`;

const QRCodePreview = styled.img`
  width: 100%;
  aspect-ratio: 1;
  border: 2px solid #e0e0e0;
  border-radius: 12px;
  padding: 16px;
  margin: 16px 0;
  background: white;
`;

const Form = styled.form`
  background: white;
  border-radius: 16px;
  padding: 32px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  max-width: 600px;
  margin: 0 auto;
`;

const FormGroup = styled.div`
  margin-bottom: 24px;
`;

const Label = styled.label`
  display: block;
  font-weight: 600;
  margin-bottom: 8px;
  color: #1a1a1a;
`;

const Input = styled.input`
  width: 100%;
  padding: 12px 16px;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  font-size: 16px;
  transition: border-color 0.2s ease;

  &:focus {
    outline: none;
    border-color: #1976d2;
  }
`;

const Select = styled.select`
  width: 100%;
  padding: 12px 16px;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  font-size: 16px;
  background: white;
  cursor: pointer;
  transition: border-color 0.2s ease;

  &:focus {
    outline: none;
    border-color: #1976d2;
  }
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: 12px;
  margin-top: 32px;
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 64px 32px;
  color: #666;
`;

const EmptyIcon = styled.div`
  font-size: 64px;
  margin-bottom: 16px;
  opacity: 0.3;
`;

const EmptyText = styled.div`
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 8px;
`;

const EmptySubtext = styled.div`
  font-size: 14px;
  margin-bottom: 24px;
`;

// ============================================
// Component
// ============================================

export const StickerManagementPage: React.FC = () => {
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [locations, setLocations] = useState<StickerLocation[]>([]);
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [selectedVenueId] = useState('venue-id'); // TODO: Get from context
  const [isLoading, setIsLoading] = useState(false);

  // Form state for creating location
  const [locationForm, setLocationForm] = useState({
    name: '',
    nameBg: '',
    locationType: 'TABLE',
    locationNumber: '',
    capacity: '',
    floor: '',
    section: '',
  });

  // Load locations and stickers
  useEffect(() => {
    loadLocations();
    loadStickers();
  }, []);

  const loadLocations = async () => {
    // TODO: Implement API call
    console.log('Loading locations...');
  };

  const loadStickers = async () => {
    // TODO: Implement API call
    console.log('Loading stickers...');
  };

  // Create location
  const handleCreateLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await fetch('/api/stickers/locations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          venueId: selectedVenueId,
          ...locationForm,
          capacity: locationForm.capacity ? parseInt(locationForm.capacity) : undefined,
        }),
      });

      const result = await response.json();

      if (result.success) {
        alert('Location created successfully!');
        setLocationForm({
          name: '',
          nameBg: '',
          locationType: 'TABLE',
          locationNumber: '',
          capacity: '',
          floor: '',
          section: '',
        });
        setViewMode('list');
        loadLocations();
      } else {
        alert(result.error || 'Failed to create location');
      }
    } catch (error) {
      console.error('Create location error:', error);
      alert('Failed to create location');
    } finally {
      setIsLoading(false);
    }
  };

  // Generate sticker
  const handleGenerateSticker = async (locationId: string) => {
    setIsLoading(true);

    try {
      const response = await fetch(`/api/stickers/generate/${locationId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      const result = await response.json();

      if (result.success) {
        alert('Sticker generated successfully!');
        loadStickers();
      } else {
        alert(result.error || 'Failed to generate sticker');
      }
    } catch (error) {
      console.error('Generate sticker error:', error);
      alert('Failed to generate sticker');
    } finally {
      setIsLoading(false);
    }
  };

  // Download QR code
  const handleDownloadQR = (sticker: Sticker) => {
    const link = document.createElement('a');
    link.download = `BOOM-${sticker.stickerId}.png`;
    link.href = sticker.qrCode;
    link.click();
  };

  // Print QR code
  const handlePrintQR = (sticker: Sticker) => {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>BOOM Sticker - ${sticker.stickerId}</title>
            <style>
              body {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                min-height: 100vh;
                margin: 0;
                font-family: Arial, sans-serif;
              }
              img {
                width: 400px;
                height: 400px;
                border: 2px solid #000;
                padding: 20px;
              }
              h1 {
                font-size: 32px;
                margin: 20px 0 10px 0;
              }
              p {
                font-size: 18px;
                color: #666;
                margin: 0;
              }
            </style>
          </head>
          <body>
            <img src="${sticker.qrCode}" alt="QR Code" />
            <h1>${sticker.stickerId}</h1>
            <p>${sticker.location.name}</p>
            <p style="margin-top: 20px; font-size: 14px;">Scan with BOOM app to earn cashback!</p>
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 500);
    }
  };

  return (
    <PageContainer>
      <Header>
        <Title>Sticker Management</Title>
        <Subtitle>Create locations and generate QR stickers for your venue</Subtitle>
      </Header>

      <Tabs>
        <Tab $active={viewMode === 'list'} onClick={() => setViewMode('list')}>
          My Stickers
        </Tab>
        <Tab $active={viewMode === 'create'} onClick={() => setViewMode('create')}>
          Create Location
        </Tab>
      </Tabs>

      {viewMode === 'list' && (
        <>
          <ActionBar>
            <Button onClick={() => setViewMode('create')} $variant="primary">
              <Plus size={20} />
              New Location
            </Button>
          </ActionBar>

          {stickers.length === 0 ? (
            <EmptyState>
              <EmptyIcon>
                <QrCode size={64} />
              </EmptyIcon>
              <EmptyText>No stickers yet</EmptyText>
              <EmptySubtext>
                Create locations and generate QR stickers to start accepting BOOM payments
              </EmptySubtext>
              <Button onClick={() => setViewMode('create')} $variant="primary">
                <Plus size={20} />
                Create First Location
              </Button>
            </EmptyState>
          ) : (
            <Grid>
              {stickers.map(sticker => (
                <Card key={sticker.id}>
                  <CardHeader>
                    <div>
                      <CardTitle>{sticker.stickerId}</CardTitle>
                      <CardSubtitle>{sticker.location.name}</CardSubtitle>
                    </div>
                    <StatusBadge $status={sticker.status}>{sticker.status}</StatusBadge>
                  </CardHeader>

                  <QRCodePreview src={sticker.qrCode} alt={`QR Code ${sticker.stickerId}`} />

                  <Stats>
                    <StatItem>
                      <StatValue>{sticker.totalScans}</StatValue>
                      <StatLabel>Total Scans</StatLabel>
                    </StatItem>
                    <StatItem>
                      <StatValue>
                        {sticker.lastScannedAt
                          ? new Date(sticker.lastScannedAt).toLocaleDateString()
                          : 'Never'}
                      </StatValue>
                      <StatLabel>Last Scan</StatLabel>
                    </StatItem>
                  </Stats>

                  <ButtonGroup>
                    <Button onClick={() => handleDownloadQR(sticker)} $variant="outline">
                      <Download size={16} />
                      Download
                    </Button>
                    <Button onClick={() => handlePrintQR(sticker)} $variant="primary">
                      <Printer size={16} />
                      Print
                    </Button>
                  </ButtonGroup>
                </Card>
              ))}
            </Grid>
          )}
        </>
      )}

      {viewMode === 'create' && (
        <Form onSubmit={handleCreateLocation}>
          <FormGroup>
            <Label>Location Name (English) *</Label>
            <Input
              type="text"
              value={locationForm.name}
              onChange={(e) => setLocationForm({ ...locationForm, name: e.target.value })}
              placeholder="Table 01"
              required
            />
          </FormGroup>

          <FormGroup>
            <Label>Location Name (Bulgarian)</Label>
            <Input
              type="text"
              value={locationForm.nameBg}
              onChange={(e) => setLocationForm({ ...locationForm, nameBg: e.target.value })}
              placeholder="Маса 01"
            />
          </FormGroup>

          <FormGroup>
            <Label>Location Type *</Label>
            <Select
              value={locationForm.locationType}
              onChange={(e) => setLocationForm({ ...locationForm, locationType: e.target.value })}
              required
            >
              <option value="TABLE">Table</option>
              <option value="COUNTER">Counter</option>
              <option value="BAR">Bar</option>
              <option value="ENTRANCE">Entrance</option>
              <option value="RECEPTION">Reception</option>
              <option value="OTHER">Other</option>
            </Select>
          </FormGroup>

          <FormGroup>
            <Label>Location Number *</Label>
            <Input
              type="text"
              value={locationForm.locationNumber}
              onChange={(e) => setLocationForm({ ...locationForm, locationNumber: e.target.value })}
              placeholder="01"
              required
            />
          </FormGroup>

          <FormGroup>
            <Label>Capacity (optional)</Label>
            <Input
              type="number"
              value={locationForm.capacity}
              onChange={(e) => setLocationForm({ ...locationForm, capacity: e.target.value })}
              placeholder="4"
              min="1"
            />
          </FormGroup>

          <FormGroup>
            <Label>Floor (optional)</Label>
            <Input
              type="text"
              value={locationForm.floor}
              onChange={(e) => setLocationForm({ ...locationForm, floor: e.target.value })}
              placeholder="Ground, First, Terrace, etc."
            />
          </FormGroup>

          <FormGroup>
            <Label>Section (optional)</Label>
            <Input
              type="text"
              value={locationForm.section}
              onChange={(e) => setLocationForm({ ...locationForm, section: e.target.value })}
              placeholder="Smoking, Non-smoking, VIP, etc."
            />
          </FormGroup>

          <ButtonGroup>
            <Button
              type="button"
              onClick={() => setViewMode('list')}
              $variant="secondary"
            >
              Cancel
            </Button>
            <Button type="submit" $variant="primary" disabled={isLoading}>
              {isLoading ? 'Creating...' : 'Create Location'}
            </Button>
          </ButtonGroup>
        </Form>
      )}
    </PageContainer>
  );
};

export default StickerManagementPage;
