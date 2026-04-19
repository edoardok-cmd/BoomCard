import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { API_CONFIG } from '../config/api.config';
import FraudReasonTag from '../components/admin/FraudReasonTag';
import * as authStorage from '../lib/auth/authStorage';

// ============================================
// Types
// ============================================

interface StickerScan {
  id: string;
  userId: string;
  stickerId: string;
  cardId: string;
  venueId: string;
  billAmount: number;
  verifiedAmount: number | null;
  cashbackPercent: number;
  cashbackAmount: number;
  status: 'PENDING' | 'VALIDATING' | 'APPROVED' | 'REJECTED' | 'MANUAL_REVIEW';
  latitude: number | null;
  longitude: number | null;
  distance: number | null;
  receiptImageUrl: string | null;
  ocrData: OCRData | null;
  fraudScore: number;
  fraudReasons: string[];
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
  venue: {
    id: string;
    name: string;
    nameBg: string;
  };
  sticker: {
    id: string;
    stickerId: string;
    location: {
      name: string;
      nameBg: string;
      locationType: string;
    };
  };
  card: {
    id: string;
    cardType: 'BASIC' | 'LIGHT' | 'PREMIUM';
    lastFourDigits: string;
  };
}

interface OCRData {
  amount: number | null;
  date: string | null;
  merchantName: string | null;
  confidence: number;
  rawText: string;
}

interface ReviewStats {
  pending: number;
  approved: number;
  rejected: number;
  avgFraudScore: number;
}

type FilterStatus = 'all' | 'MANUAL_REVIEW' | 'PENDING' | 'APPROVED' | 'REJECTED';
type FilterRisk = 'all' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

// ============================================
// Styled Components
// ============================================

const PageContainer = styled.div`
  max-width: 1400px;
  margin: 0 auto;
  padding: 24px;
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
`;

const Header = styled.div`
  margin-bottom: 32px;
`;

const Title = styled.h1`
  font-size: 32px;
  font-weight: 700;
  color: white;
  margin-bottom: 8px;
`;

const Subtitle = styled.p`
  font-size: 16px;
  color: rgba(255, 255, 255, 0.9);
`;

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 20px;
  margin-bottom: 32px;
`;

const StatCard = styled.div<{ $color?: string }>`
  background: var(--color-background);
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  border-left: 4px solid ${props => props.$color || '#667eea'};
`;

const StatLabel = styled.div`
  font-size: 14px;
  color: var(--color-text-secondary);
  margin-bottom: 8px;
  font-weight: 500;
`;

const StatValue = styled.div`
  font-size: 36px;
  font-weight: 700;
  color: var(--color-text-primary);
`;

const FiltersBar = styled.div`
  background: var(--color-background);
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 24px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: center;
`;

const FilterGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 200px;
`;

const FilterLabel = styled.label`
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const Select = styled.select`
  padding: 10px 16px;
  border: 2px solid var(--color-border);
  border-radius: 8px;
  font-size: 14px;
  color: var(--color-text-primary);
  background: var(--color-background);
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    border-color: #667eea;
  }

  &:focus {
    outline: none;
    border-color: #667eea;
    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
  }
`;

const Input = styled.input`
  padding: 10px 16px;
  border: 2px solid var(--color-border);
  border-radius: 8px;
  font-size: 14px;
  color: var(--color-text-primary);
  background: var(--color-background);
  transition: all 0.2s ease;

  &:focus {
    outline: none;
    border-color: #667eea;
    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
  }
`;

const ScansGrid = styled.div`
  display: grid;
  gap: 20px;
`;

const ScanCard = styled.div<{ $selected?: boolean }>`
  background: var(--color-background);
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  cursor: pointer;
  transition: all 0.2s ease;
  border: 2px solid ${props => props.$selected ? '#667eea' : 'transparent'};

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.15);
  }
`;

const ScanHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
`;

const ScanInfo = styled.div`
  flex: 1;
`;

const ScanId = styled.div`
  font-size: 12px;
  color: var(--color-text-tertiary);
  margin-bottom: 4px;
  font-family: monospace;
`;

const VenueName = styled.div`
  font-size: 18px;
  font-weight: 700;
  color: var(--color-text-primary);
  margin-bottom: 4px;
`;

const StickerInfo = styled.div`
  font-size: 14px;
  color: var(--color-text-secondary);
`;

const RiskBadge = styled.div<{ $level: string }>`
  padding: 6px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  background: ${props => {
    switch (props.$level) {
      case 'CRITICAL': return '#f44336';
      case 'HIGH': return '#ff9800';
      case 'MEDIUM': return '#ffc107';
      case 'LOW': return '#4caf50';
      default: return '#9e9e9e';
    }
  }};
  color: white;
`;

const ScanDetails = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 16px;
`;

const DetailItem = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const DetailLabel = styled.span`
  font-size: 12px;
  color: var(--color-text-tertiary);
  font-weight: 500;
`;

const DetailValue = styled.span`
  font-size: 16px;
  color: var(--color-text-primary);
  font-weight: 600;
`;

const FraudScoreBar = styled.div`
  margin-bottom: 16px;
`;

const ScoreLabel = styled.div`
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 600;
`;

const ScoreBarContainer = styled.div`
  width: 100%;
  height: 8px;
  background: #e0e0e0;
  border-radius: 4px;
  overflow: hidden;
`;

const ScoreBarFill = styled.div<{ $score: number }>`
  height: 100%;
  width: ${props => props.$score}%;
  background: ${props => {
    if (props.$score < 10) return '#4caf50';
    if (props.$score < 30) return '#ffc107';
    if (props.$score < 60) return '#ff9800';
    return '#f44336';
  }};
  transition: width 0.3s ease;
`;

const FraudReasonsList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 16px 0;
`;

const FraudReason = styled.li`
  padding: 8px 12px;
  background: #fff3e0;
  border-left: 3px solid #ff9800;
  margin-bottom: 8px;
  font-size: 14px;
  color: var(--color-text-secondary);
  border-radius: 4px;
`;

const ActionButtons = styled.div`
  display: flex;
  gap: 12px;
  margin-top: 16px;
`;

const Button = styled.button<{ $variant?: 'approve' | 'reject' | 'view' }>`
  padding: 12px 24px;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s ease;
  flex: 1;
  background: ${props => {
    switch (props.$variant) {
      case 'approve': return 'linear-gradient(135deg, #4caf50 0%, #66bb6a 100%)';
      case 'reject': return 'linear-gradient(135deg, #f44336 0%, #e57373 100%)';
      case 'view': return 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
      default: return 'linear-gradient(135deg, #616161 0%, #757575 100%)';
    }
  }};
  color: white;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }
`;

const EmptyState = styled.div`
  background: var(--color-background);
  border-radius: 12px;
  padding: 60px 24px;
  text-align: center;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
`;

const EmptyIcon = styled.div`
  font-size: 64px;
  margin-bottom: 16px;
`;

const EmptyTitle = styled.h3`
  font-size: 24px;
  color: var(--color-text-primary);
  margin-bottom: 8px;
`;

const EmptyText = styled.p`
  font-size: 16px;
  color: var(--color-text-secondary);
`;

const LoadingSpinner = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 60px;
  background: var(--color-background);
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
`;

const Spinner = styled.div`
  width: 50px;
  height: 50px;
  border: 4px solid var(--color-border);
  border-top-color: #667eea;
  border-radius: 50%;
  animation: spin 1s linear infinite;

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
`;

const BulkActionsBar = styled.div<{ $visible: boolean }>`
  position: fixed;
  bottom: ${props => props.$visible ? '24px' : '-100px'};
  left: 50%;
  transform: translateX(-50%);
  background: var(--color-background);
  border-radius: 12px;
  padding: 16px 24px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
  display: flex;
  align-items: center;
  gap: 16px;
  transition: bottom 0.3s ease;
  z-index: 1000;
`;

const BulkInfo = styled.div`
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary);
`;

const BulkButton = styled(Button)`
  flex: 0 0 auto;
  min-width: 120px;
`;

// ============================================
// Modal Components
// ============================================

const Modal = styled.div<{ $isOpen: boolean }>`
  display: ${props => props.$isOpen ? 'flex' : 'none'};
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  z-index: 2000;
  align-items: center;
  justify-content: center;
  padding: 24px;
`;

const ModalContent = styled.div`
  background: var(--color-background);
  border-radius: 16px;
  max-width: 800px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
  padding: 32px;
`;

const ModalHeader = styled.div`
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 2px solid var(--color-border);
`;

const ModalTitle = styled.h2`
  font-size: 24px;
  font-weight: 700;
  color: var(--color-text-primary);
  margin-bottom: 8px;
`;

const ModalSubtitle = styled.div`
  font-size: 14px;
  color: var(--color-text-secondary);
`;

const ModalSection = styled.div`
  margin-bottom: 24px;
`;

const SectionTitle = styled.h3`
  font-size: 16px;
  font-weight: 700;
  color: var(--color-text-primary);
  margin-bottom: 12px;
`;

const TextArea = styled.textarea`
  width: 100%;
  min-height: 100px;
  padding: 12px 16px;
  border: 2px solid var(--color-border);
  border-radius: 8px;
  font-size: 14px;
  color: var(--color-text-primary);
  background: var(--color-background);
  font-family: inherit;
  resize: vertical;
  transition: all 0.2s ease;

  &:focus {
    outline: none;
    border-color: #667eea;
    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
  }
`;

const ModalActions = styled.div`
  display: flex;
  gap: 12px;
  margin-top: 24px;
`;

// ============================================
// Main Component
// ============================================

export const AdminScanReviewPage: React.FC = () => {
  const [scans, setScans] = useState<StickerScan[]>([]);
  const [stats, setStats] = useState<ReviewStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedScans, setSelectedScans] = useState<Set<string>>(new Set());
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('MANUAL_REVIEW');
  const [filterRisk, setFilterRisk] = useState<FilterRisk>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'approve' | 'reject'>('approve');
  const [reviewNotes, setReviewNotes] = useState('');
  const [verifiedAmount, setVerifiedAmount] = useState('');
  const [currentScan, setCurrentScan] = useState<StickerScan | null>(null);
  const [currentScanId, setCurrentScanId] = useState<string | null>(null);

  // Fetch scans and stats
  useEffect(() => {
    fetchScans();
    fetchStats();
  }, [filterStatus, filterRisk]);

  const fetchScans = async () => {
    try {
      setLoading(true);
      const token = authStorage.getItem('token');
      const params = new URLSearchParams();

      if (filterStatus !== 'all') {
        params.append('status', filterStatus);
      }
      if (filterRisk !== 'all') {
        params.append('riskLevel', filterRisk);
      }

      const response = await fetch(
        `${API_CONFIG.baseURL}/api/stickers/admin/pending-review?${params}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) throw new Error('Failed to fetch scans');

      const data = await response.json();
      setScans(data);
    } catch (error) {
      console.error('Error fetching scans:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const token = authStorage.getItem('token');
      const response = await fetch(
        `${API_CONFIG.baseURL}/api/stickers/admin/stats`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const handleScanSelect = (scanId: string) => {
    const newSelected = new Set(selectedScans);
    if (newSelected.has(scanId)) {
      newSelected.delete(scanId);
    } else {
      newSelected.add(scanId);
    }
    setSelectedScans(newSelected);
  };

  const openReviewModal = (scanId: string, mode: 'approve' | 'reject') => {
    const scan = scans.find(s => s.id === scanId) || null;
    setCurrentScanId(scanId);
    setCurrentScan(scan);
    setModalMode(mode);
    setReviewNotes('');
    // Seed override input with the scan's billAmount so admins edit rather than retype.
    setVerifiedAmount(scan ? String(scan.billAmount) : '');
    setModalOpen(true);
  };

  const handleReview = async () => {
    if (!currentScanId) return;

    try {
      const token = authStorage.getItem('token');
      const endpoint = modalMode === 'approve' ? 'approve' : 'reject';

      // Only send verifiedAmount when approving AND the admin actually changed it
      // from the scan's original billAmount — otherwise we'd trigger a needless
      // recompute (and persist the same value as an "override").
      const body: Record<string, unknown> = { notes: reviewNotes || undefined };
      if (modalMode === 'approve' && currentScan && verifiedAmount !== '') {
        const parsed = Number(verifiedAmount);
        if (!isFinite(parsed) || parsed <= 0) {
          alert('Verified amount must be a positive number');
          return;
        }
        if (parsed !== currentScan.billAmount) {
          body.verifiedAmount = parsed;
        }
      }

      const response = await fetch(
        `${API_CONFIG.baseURL}/api/stickers/admin/${endpoint}/${currentScanId}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        }
      );

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err?.error || `Failed to ${modalMode} scan`);
      }

      await fetchScans();
      await fetchStats();

      setModalOpen(false);
      setCurrentScanId(null);
      setCurrentScan(null);
      setReviewNotes('');
      setVerifiedAmount('');
    } catch (error: any) {
      console.error(`Error ${modalMode}ing scan:`, error);
      alert(error?.message || `Failed to ${modalMode} scan. Please try again.`);
    }
  };

  const handleBulkApprove = async () => {
    if (selectedScans.size === 0) return;
    const ids = Array.from(selectedScans);

    if (!confirm(`Approve ${ids.length} scan(s)? This credits cashback and cannot be undone.`)) {
      return;
    }

    try {
      const token = authStorage.getItem('token');
      const response = await fetch(`${API_CONFIG.baseURL}/api/stickers/admin/bulk-approve`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ scanIds: ids }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.success === false) {
        throw new Error(data?.error || 'Failed to bulk approve scans');
      }
      if (data.errorCount > 0) {
        alert(`${data.successCount} approved, ${data.errorCount} failed. Check logs for details.`);
      }
      await fetchScans();
      await fetchStats();
      setSelectedScans(new Set());
    } catch (error: any) {
      console.error('Error bulk approving:', error);
      alert(error?.message || 'Failed to approve scans. Please try again.');
    }
  };

  const handleBulkReject = async () => {
    if (selectedScans.size === 0) return;
    const ids = Array.from(selectedScans);

    const reason = prompt(`Enter rejection reason for ${ids.length} scans:`);
    if (!reason) return;

    try {
      const token = authStorage.getItem('token');
      const response = await fetch(`${API_CONFIG.baseURL}/api/stickers/admin/bulk-reject`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ scanIds: ids, reason }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.success === false) {
        throw new Error(data?.error || 'Failed to bulk reject scans');
      }
      if (data.errorCount > 0) {
        alert(`${data.successCount} rejected, ${data.errorCount} failed. Check logs for details.`);
      }
      await fetchScans();
      await fetchStats();
      setSelectedScans(new Set());
    } catch (error: any) {
      console.error('Error bulk rejecting:', error);
      alert(error?.message || 'Failed to reject scans. Please try again.');
    }
  };

  // Filter scans by search query
  const filteredScans = scans.filter(scan => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      scan.id.toLowerCase().includes(query) ||
      scan.stickerId.toLowerCase().includes(query) ||
      scan.venue.name.toLowerCase().includes(query) ||
      scan.user.email.toLowerCase().includes(query)
    );
  });

  return (
    <PageContainer>
      <Header>
        <Title>Admin Scan Review</Title>
        <Subtitle>Review and approve flagged sticker scans</Subtitle>
      </Header>

      {stats && (
        <StatsGrid>
          <StatCard $color="#ff9800">
            <StatLabel>Pending Review</StatLabel>
            <StatValue>{stats.pending}</StatValue>
          </StatCard>
          <StatCard $color="#4caf50">
            <StatLabel>Approved Today</StatLabel>
            <StatValue>{stats.approved}</StatValue>
          </StatCard>
          <StatCard $color="#f44336">
            <StatLabel>Rejected Today</StatLabel>
            <StatValue>{stats.rejected}</StatValue>
          </StatCard>
          <StatCard $color="#667eea">
            <StatLabel>Avg Fraud Score</StatLabel>
            <StatValue>{stats.avgFraudScore.toFixed(1)}</StatValue>
          </StatCard>
        </StatsGrid>
      )}

      <FiltersBar>
        <FilterGroup>
          <FilterLabel>Status</FilterLabel>
          <Select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}
          >
            <option value="all">All Statuses</option>
            <option value="MANUAL_REVIEW">Manual Review</option>
            <option value="PENDING">Pending</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
          </Select>
        </FilterGroup>

        <FilterGroup>
          <FilterLabel>Risk Level</FilterLabel>
          <Select
            value={filterRisk}
            onChange={(e) => setFilterRisk(e.target.value as FilterRisk)}
          >
            <option value="all">All Risk Levels</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </Select>
        </FilterGroup>

        <FilterGroup style={{ flex: 1 }}>
          <FilterLabel>Search</FilterLabel>
          <Input
            type="text"
            placeholder="Search by ID, venue, or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </FilterGroup>
      </FiltersBar>

      {loading ? (
        <LoadingSpinner>
          <Spinner />
        </LoadingSpinner>
      ) : filteredScans.length === 0 ? (
        <EmptyState>
          <EmptyIcon>✅</EmptyIcon>
          <EmptyTitle>All Clear!</EmptyTitle>
          <EmptyText>No scans matching your filters. Great job!</EmptyText>
        </EmptyState>
      ) : (
        <ScansGrid>
          {filteredScans.map(scan => (
            <ScanCard
              key={scan.id}
              $selected={selectedScans.has(scan.id)}
              onClick={() => handleScanSelect(scan.id)}
            >
              <ScanHeader>
                <ScanInfo>
                  <ScanId>ID: {scan.id}</ScanId>
                  <VenueName>{scan.venue.name}</VenueName>
                  <StickerInfo>
                    {scan.sticker.stickerId} • {scan.sticker.location.name}
                  </StickerInfo>
                </ScanInfo>
                <RiskBadge $level={scan.riskLevel}>
                  {scan.riskLevel}
                </RiskBadge>
              </ScanHeader>

              <ScanDetails>
                <DetailItem>
                  <DetailLabel>Customer</DetailLabel>
                  <DetailValue>
                    {scan.user.firstName} {scan.user.lastName}
                  </DetailValue>
                </DetailItem>
                <DetailItem>
                  <DetailLabel>Bill Amount</DetailLabel>
                  <DetailValue>{scan.billAmount.toFixed(2)} лв</DetailValue>
                </DetailItem>
                <DetailItem>
                  <DetailLabel>Cashback</DetailLabel>
                  <DetailValue>{scan.cashbackAmount.toFixed(2)} лв</DetailValue>
                </DetailItem>
                <DetailItem>
                  <DetailLabel>Card Type</DetailLabel>
                  <DetailValue>{scan.card.cardType}</DetailValue>
                </DetailItem>
                <DetailItem>
                  <DetailLabel>Distance</DetailLabel>
                  <DetailValue>
                    {scan.distance !== null ? `${scan.distance.toFixed(0)}m` : 'N/A'}
                  </DetailValue>
                </DetailItem>
                <DetailItem>
                  <DetailLabel>Scan Time</DetailLabel>
                  <DetailValue>
                    {new Date(scan.createdAt).toLocaleString()}
                  </DetailValue>
                </DetailItem>
              </ScanDetails>

              <FraudScoreBar>
                <ScoreLabel>
                  <span>Fraud Score</span>
                  <span>{scan.fraudScore.toFixed(1)}/100</span>
                </ScoreLabel>
                <ScoreBarContainer>
                  <ScoreBarFill $score={scan.fraudScore} />
                </ScoreBarContainer>
              </FraudScoreBar>

              {scan.fraudReasons.length > 0 && (
                <FraudReasonsList>
                  {scan.fraudReasons.map((reason, idx) => (
                    <FraudReason key={idx}>
                      <FraudReasonTag reason={reason} />
                    </FraudReason>
                  ))}
                </FraudReasonsList>
              )}

              <ActionButtons onClick={(e) => e.stopPropagation()}>
                <Button
                  $variant="approve"
                  onClick={() => openReviewModal(scan.id, 'approve')}
                >
                  ✓ Approve
                </Button>
                <Button
                  $variant="reject"
                  onClick={() => openReviewModal(scan.id, 'reject')}
                >
                  ✗ Reject
                </Button>
                {scan.receiptImageUrl && (
                  <Button
                    $variant="view"
                    onClick={() => window.open(scan.receiptImageUrl!, '_blank')}
                  >
                    🖼️ View Receipt
                  </Button>
                )}
              </ActionButtons>
            </ScanCard>
          ))}
        </ScansGrid>
      )}

      <BulkActionsBar $visible={selectedScans.size > 0}>
        <BulkInfo>{selectedScans.size} scans selected</BulkInfo>
        <BulkButton $variant="approve" onClick={handleBulkApprove}>
          Approve All
        </BulkButton>
        <BulkButton $variant="reject" onClick={handleBulkReject}>
          Reject All
        </BulkButton>
        <BulkButton onClick={() => setSelectedScans(new Set())}>
          Clear
        </BulkButton>
      </BulkActionsBar>

      <Modal $isOpen={modalOpen} onClick={() => setModalOpen(false)}>
        <ModalContent onClick={(e) => e.stopPropagation()}>
          <ModalHeader>
            <ModalTitle>
              {modalMode === 'approve' ? '✓ Approve' : '✗ Reject'} Scan
            </ModalTitle>
            <ModalSubtitle>
              Add notes about your decision (optional)
            </ModalSubtitle>
          </ModalHeader>

          {modalMode === 'approve' && currentScan && (
            <ModalSection>
              <SectionTitle>
                Verified Bill Amount (лв)
              </SectionTitle>
              <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
                User submitted <strong>{currentScan.billAmount.toFixed(2)} лв</strong>
                {currentScan.ocrData?.amount != null ? ` — OCR detected ${currentScan.ocrData.amount.toFixed(2)} лв` : ''}.
                Edit this to correct the amount before approving; cashback will be recomputed.
              </div>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={verifiedAmount}
                onChange={(e) => setVerifiedAmount(e.target.value)}
                style={{ width: '100%' }}
              />
            </ModalSection>
          )}

          <ModalSection>
            <SectionTitle>Admin Notes</SectionTitle>
            <TextArea
              placeholder="Enter any notes about this decision..."
              value={reviewNotes}
              onChange={(e) => setReviewNotes(e.target.value)}
            />
          </ModalSection>

          <ModalActions>
            <Button
              $variant={modalMode}
              onClick={handleReview}
            >
              Confirm {modalMode === 'approve' ? 'Approval' : 'Rejection'}
            </Button>
            <Button onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
          </ModalActions>
        </ModalContent>
      </Modal>
    </PageContainer>
  );
};

export default AdminScanReviewPage;
