import { useState, useRef, useCallback } from 'react';
import styled from 'styled-components';
import toast from 'react-hot-toast';
import { bulkImportService, BulkImportResult, PartnerImportResult } from '../services/bulkImport.service';

// ─── Styled Components ────────────────────────────────────────────────────────

const Container = styled.div`
  max-width: 960px;
  margin: 0 auto;
  padding: 2rem 1.5rem;
`;

const Title = styled.h1`
  font-size: 1.75rem;
  font-weight: 700;
  background: linear-gradient(135deg, #dc2626 0%, #ea580c 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin-bottom: 0.5rem;
`;

const Subtitle = styled.p`
  color: var(--color-text-secondary);
  margin-bottom: 1.75rem;
  font-size: 0.95rem;
`;

const TabRow = styled.div`
  display: flex;
  gap: 0;
  border-bottom: 2px solid var(--color-border);
  margin-bottom: 1.75rem;
`;

const Tab = styled.button.withConfig({ shouldForwardProp: (p) => p !== 'active' })<{ active: boolean }>`
  padding: 0.65rem 1.5rem;
  font-size: 0.9rem;
  font-weight: 600;
  background: none;
  border: none;
  border-bottom: 3px solid ${({ active }) => (active ? '#dc2626' : 'transparent')};
  margin-bottom: -2px;
  color: ${({ active }) => (active ? '#dc2626' : 'var(--color-text-secondary)')};
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
  &:hover { color: #dc2626; }
`;

const Card = styled.div`
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
`;

const CardTitle = styled.h2`
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 1rem;
  color: var(--color-text-primary);
`;

const TemplateBtn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.6rem 1.25rem;
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s;
  &:hover { opacity: 0.9; }
  &:disabled { opacity: 0.5; cursor: default; }
`;

const DropZone = styled.div.withConfig({ shouldForwardProp: (p) => !['isDragging', 'hasFile'].includes(p) })<{ isDragging: boolean; hasFile: boolean }>`
  border: 2px dashed ${({ isDragging, hasFile }) =>
    isDragging ? '#dc2626' : hasFile ? '#10b981' : 'var(--color-border)'};
  border-radius: 10px;
  padding: 2rem;
  text-align: center;
  background: ${({ isDragging }) => isDragging ? 'rgba(220,38,38,0.04)' : 'var(--color-background)'};
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
  &:hover { border-color: #dc2626; }
`;

const DropZoneText = styled.p`
  color: var(--color-text-secondary);
  font-size: 0.875rem;
  margin: 0.5rem 0 0;
`;

const FileName = styled.span`
  font-weight: 600;
  color: var(--color-text-primary);
`;

const ImageList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0.75rem 0 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
`;

const ImageTag = styled.li`
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 0.25rem 0.6rem;
  font-size: 0.78rem;
  color: var(--color-text-secondary);
  display: flex;
  align-items: center;
  gap: 0.4rem;
`;

const RemoveBtn = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  color: var(--color-text-secondary);
  padding: 0;
  font-size: 0.9rem;
  line-height: 1;
  &:hover { color: #ef4444; }
`;

const SubmitBtn = styled.button`
  width: 100%;
  padding: 0.75rem;
  background: linear-gradient(135deg, #dc2626 0%, #ea580c 100%);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
  transition: opacity 0.15s;
  &:hover { opacity: 0.9; }
  &:disabled { opacity: 0.5; cursor: default; }
`;

const ResultCard = styled.div.withConfig({ shouldForwardProp: (p) => p !== 'hasErrors' })<{ hasErrors: boolean }>`
  background: ${({ hasErrors }) => hasErrors ? 'rgba(239,68,68,0.05)' : 'rgba(16,185,129,0.05)'};
  border: 1px solid ${({ hasErrors }) => hasErrors ? '#ef4444' : '#10b981'};
  border-radius: 12px;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
`;

const ResultTitle = styled.h3.withConfig({ shouldForwardProp: (p) => p !== 'hasErrors' })<{ hasErrors: boolean }>`
  color: ${({ hasErrors }) => hasErrors ? '#ef4444' : '#10b981'};
  font-size: 1rem;
  font-weight: 700;
  margin-bottom: 1rem;
`;

const StatRow = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 0.75rem;
  margin-bottom: 1rem;
`;

const StatBox = styled.div`
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 0.75rem 1rem;
  text-align: center;
`;

const StatValue = styled.div`
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--color-text-primary);
`;

const StatLabel = styled.div`
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  margin-top: 0.1rem;
`;

const MessageList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0;
`;

const MessageItem = styled.li<{ type: 'error' | 'warning' }>`
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.4rem 0;
  font-size: 0.85rem;
  color: ${({ type }) => type === 'error' ? '#ef4444' : '#f59e0b'};
  border-bottom: 1px solid var(--color-border);
  &:last-child { border-bottom: none; }
`;

const HowTo = styled.div`
  font-size: 0.85rem;
  color: var(--color-text-secondary);
  line-height: 1.6;
  ol, ul { padding-left: 1.25rem; margin: 0.5rem 0 0; }
  code {
    background: var(--color-background);
    border: 1px solid var(--color-border);
    border-radius: 4px;
    padding: 0.1rem 0.35rem;
    font-size: 0.8rem;
    font-family: monospace;
    color: var(--color-text-primary);
  }
`;

const TierBadge = styled.span`
  display: inline-block;
  background: #fef3c7;
  color: #92400e;
  border: 1px solid #fbbf24;
  border-radius: 6px;
  padding: 0.15rem 0.6rem;
  font-size: 0.78rem;
  font-weight: 700;
  margin-left: 0.5rem;
`;

const PartnerListTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 0.82rem;
  margin-top: 0.75rem;
  th, td {
    text-align: left;
    padding: 0.4rem 0.6rem;
    border-bottom: 1px solid var(--color-border);
  }
  th { color: var(--color-text-secondary); font-weight: 600; }
  td { color: var(--color-text-primary); }
  tr:last-child td { border-bottom: none; }
`;

// ─── Shared drop-zone sub-component ──────────────────────────────────────────

interface DropZoneProps {
  file: File | null;
  isDragging: boolean;
  onDrop: (e: React.DragEvent) => void;
  onDragOver: () => void;
  onDragLeave: () => void;
  onClick: () => void;
  label: string;
}

function SpreadsheetDropZone({ file, isDragging, onDrop, onDragOver, onDragLeave, onClick, label }: DropZoneProps) {
  return (
    <DropZone
      isDragging={isDragging}
      hasFile={!!file}
      onClick={onClick}
      onDragOver={(e) => { e.preventDefault(); onDragOver(); }}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {file ? (
        <>
          <div>📄</div>
          <FileName>{file.name}</FileName>
          <DropZoneText>Click or drag to replace</DropZoneText>
        </>
      ) : (
        <>
          <div style={{ fontSize: '2rem' }}>📊</div>
          <DropZoneText>{label}</DropZoneText>
        </>
      )}
    </DropZone>
  );
}

// ─── Premium Import Tab (existing single-partner/multiple-offers) ─────────────

function PremiumImportTab() {
  const [spreadsheet, setSpreadsheet] = useState<File | null>(null);
  const [images, setImages] = useState<File[]>([]);
  const [isDraggingSheet, setIsDraggingSheet] = useState(false);
  const [isDraggingImages, setIsDraggingImages] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BulkImportResult | null>(null);

  const spreadsheetInputRef = useRef<HTMLInputElement>(null);
  const imagesInputRef = useRef<HTMLInputElement>(null);

  const handleDownloadTemplate = async () => {
    try {
      await bulkImportService.downloadTemplate();
      toast.success('Template downloaded');
    } catch (err: any) {
      toast.error(err.message || 'Failed to download template');
    }
  };

  const handleSpreadsheetDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingSheet(false);
    const file = e.dataTransfer.files[0];
    if (file) setSpreadsheet(file);
  }, []);

  const handleImagesDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingImages(false);
    const newFiles = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
    setImages((prev) => {
      const existing = new Set(prev.map((f) => f.name));
      return [...prev, ...newFiles.filter((f) => !existing.has(f.name))];
    });
  }, []);

  const handleImagesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFiles = Array.from(e.target.files ?? []);
    setImages((prev) => {
      const existing = new Set(prev.map((f) => f.name));
      return [...prev, ...newFiles.filter((f) => !existing.has(f.name))];
    });
    e.target.value = '';
  };

  const handleSubmit = async () => {
    if (!spreadsheet) { toast.error('Please select a spreadsheet file first'); return; }
    setLoading(true);
    setResult(null);
    try {
      const res = await bulkImportService.import(spreadsheet, images);
      setResult(res);
      if (res.errors.length === 0) toast.success(`Import complete — ${res.offersCreated} offers created`);
      else toast.error(`Import finished with ${res.errors.length} error(s)`);
    } catch (err: any) {
      toast.error(err.message || 'Import failed');
    } finally {
      setLoading(false);
    }
  };

  const hasErrors = (result?.errors.length ?? 0) > 0;

  return (
    <>
      <Card>
        <CardTitle>Step 1 — Download Template</CardTitle>
        <TemplateBtn onClick={handleDownloadTemplate}>⬇ Download XLSX Template</TemplateBtn>
        <HowTo style={{ marginTop: '1rem' }}>
          <ol>
            <li>File name (without extension) becomes the partner's business name.</li>
            <li>Partner fields (<code>partner_*</code>) are read from the <strong>first data row</strong> only.</li>
            <li>Each row = <strong>one offer</strong>. Leave partner fields blank in rows 2+.</li>
            <li>Tags: comma-separated in one cell.</li>
            <li>Images: <code>{'{'}slugified_title{'}'}_N.jpg</code> (e.g. <code>summer-discount_1.jpg</code>).</li>
          </ol>
        </HowTo>
      </Card>

      <Card>
        <CardTitle>Step 2 — Upload Spreadsheet</CardTitle>
        <SpreadsheetDropZone
          file={spreadsheet}
          isDragging={isDraggingSheet}
          onDrop={handleSpreadsheetDrop}
          onDragOver={() => setIsDraggingSheet(true)}
          onDragLeave={() => setIsDraggingSheet(false)}
          onClick={() => spreadsheetInputRef.current?.click()}
          label="Drop your CSV or XLSX file here, or click to browse"
        />
        <input ref={spreadsheetInputRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) setSpreadsheet(f); }} />
      </Card>

      <Card>
        <CardTitle>Step 3 — Upload Images (optional)</CardTitle>
        <DropZone
          isDragging={isDraggingImages}
          hasFile={images.length > 0}
          onClick={() => imagesInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setIsDraggingImages(true); }}
          onDragLeave={() => setIsDraggingImages(false)}
          onDrop={handleImagesDrop}
        >
          <div style={{ fontSize: '2rem' }}>🖼️</div>
          <DropZoneText>Drop images here or click to browse. Name them: <code style={{ fontFamily: 'monospace', background: 'none' }}>offer-slug_1.jpg</code></DropZoneText>
        </DropZone>
        <input ref={imagesInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleImagesChange} />
        {images.length > 0 && (
          <ImageList>
            {images.map((img) => (
              <ImageTag key={img.name}>
                🖼 {img.name}
                <RemoveBtn onClick={() => setImages((p) => p.filter((f) => f.name !== img.name))} title="Remove">×</RemoveBtn>
              </ImageTag>
            ))}
          </ImageList>
        )}
      </Card>

      <SubmitBtn onClick={handleSubmit} disabled={loading || !spreadsheet}>
        {loading ? 'Importing…' : 'Run Premium Import'}
      </SubmitBtn>

      {result && (
        <ResultCard hasErrors={hasErrors} style={{ marginTop: '1.5rem' }}>
          <ResultTitle hasErrors={hasErrors}>
            {hasErrors ? '⚠ Import completed with errors' : '✅ Import successful'}
          </ResultTitle>
          <StatRow>
            <StatBox><StatValue>{result.partnerCreated ? '✓' : '—'}</StatValue><StatLabel>Partner {result.partnerCreated ? 'Created' : 'Existing'}</StatLabel></StatBox>
            <StatBox><StatValue>{result.offersCreated}</StatValue><StatLabel>Offers Created</StatLabel></StatBox>
            <StatBox><StatValue>{result.offersSkipped}</StatValue><StatLabel>Offers Skipped</StatLabel></StatBox>
            <StatBox><StatValue>{result.imagesUploaded}</StatValue><StatLabel>Images Uploaded</StatLabel></StatBox>
          </StatRow>
          <div style={{ marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
            Partner: <strong>{result.businessName}</strong> ({result.partnerId})
          </div>
          {result.errors.length > 0 && (
            <>
              <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#ef4444', marginBottom: '0.4rem' }}>Errors ({result.errors.length})</div>
              <MessageList>{result.errors.map((e, i) => <MessageItem key={i} type="error">⛔ {e}</MessageItem>)}</MessageList>
            </>
          )}
          {result.warnings.length > 0 && (
            <>
              <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#f59e0b', margin: '0.75rem 0 0.4rem' }}>Warnings ({result.warnings.length})</div>
              <MessageList>{result.warnings.map((w, i) => <MessageItem key={i} type="warning">⚠ {w}</MessageItem>)}</MessageList>
            </>
          )}
        </ResultCard>
      )}
    </>
  );
}

// ─── Partners Import Tab (multiple partners per file, tier from filename) ─────

function PartnersImportTab() {
  const [spreadsheet, setSpreadsheet] = useState<File | null>(null);
  const [images, setImages] = useState<File[]>([]);
  const [isDraggingSheet, setIsDraggingSheet] = useState(false);
  const [isDraggingImages, setIsDraggingImages] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PartnerImportResult | null>(null);

  const spreadsheetInputRef = useRef<HTMLInputElement>(null);
  const imagesInputRef = useRef<HTMLInputElement>(null);

  const handleDownloadTemplate = async () => {
    try {
      await bulkImportService.downloadPartnersTemplate();
      toast.success('Partners template downloaded');
    } catch (err: any) {
      toast.error(err.message || 'Failed to download template');
    }
  };

  const handleSpreadsheetDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingSheet(false);
    const file = e.dataTransfer.files[0];
    if (file) setSpreadsheet(file);
  }, []);

  const handleImagesDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingImages(false);
    const newFiles = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
    setImages((prev) => {
      const existing = new Set(prev.map((f) => f.name));
      return [...prev, ...newFiles.filter((f) => !existing.has(f.name))];
    });
  }, []);

  const handleImagesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFiles = Array.from(e.target.files ?? []);
    setImages((prev) => {
      const existing = new Set(prev.map((f) => f.name));
      return [...prev, ...newFiles.filter((f) => !existing.has(f.name))];
    });
    e.target.value = '';
  };

  // Detect tier from filename for live preview
  const detectedTier = (() => {
    if (!spreadsheet) return null;
    const base = spreadsheet.name.replace(/\.[^.]+$/, '');
    const m = base.match(/_([a-zA-Z0-9]+)$/);
    return m ? m[1].toUpperCase() : null;
  })();

  const handleSubmit = async () => {
    if (!spreadsheet) { toast.error('Please select a spreadsheet file first'); return; }
    setLoading(true);
    setResult(null);
    try {
      const res = await bulkImportService.importPartners(spreadsheet, images);
      setResult(res);
      if (res.errors.length === 0) toast.success(`Import complete — ${res.partnersCreated} partners created`);
      else toast.error(`Import finished with ${res.errors.length} error(s)`);
    } catch (err: any) {
      toast.error(err.message || 'Import failed');
    } finally {
      setLoading(false);
    }
  };

  const hasErrors = (result?.errors.length ?? 0) > 0;

  return (
    <>
      <Card>
        <CardTitle>Step 1 — Download Partners Template</CardTitle>
        <TemplateBtn onClick={handleDownloadTemplate}>⬇ Download Partners XLSX Template</TemplateBtn>
        <HowTo style={{ marginTop: '1rem' }}>
          <ol>
            <li>Each row = <strong>one partner</strong> (unlike Premium Import where each row = one offer).</li>
            <li>
              Partner tier is set by the <strong>filename suffix</strong>:
              <ul>
                <li><code>partners_basic.xlsx</code> → tier: BASIC</li>
                <li><code>sofia_gold.xlsx</code> → tier: GOLD</li>
                <li><code>vip_venues_vip.xlsx</code> → tier: VIP</li>
              </ul>
            </li>
            <li>If no suffix or unknown tier, partners are created without a type.</li>
            <li>Images per partner: <code>{'{'}business-name-slug{'}'}_1.jpg</code> (e.g. <code>example-restaurant_1.jpg</code>).</li>
            <li>If partner email already exists the partner is <strong>updated</strong>, not duplicated.</li>
          </ol>
        </HowTo>
      </Card>

      <Card>
        <CardTitle>Step 2 — Upload Spreadsheet</CardTitle>
        {spreadsheet && detectedTier && (
          <div style={{ marginBottom: '0.75rem', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
            Detected tier from filename: <TierBadge>{detectedTier}</TierBadge>
          </div>
        )}
        {spreadsheet && !detectedTier && (
          <div style={{ marginBottom: '0.75rem', fontSize: '0.85rem', color: '#f59e0b' }}>
            ⚠ No tier suffix detected in filename — partners will have no type assigned.
          </div>
        )}
        <SpreadsheetDropZone
          file={spreadsheet}
          isDragging={isDraggingSheet}
          onDrop={handleSpreadsheetDrop}
          onDragOver={() => setIsDraggingSheet(true)}
          onDragLeave={() => setIsDraggingSheet(false)}
          onClick={() => spreadsheetInputRef.current?.click()}
          label="Drop your CSV or XLSX file here (e.g. partners_basic.xlsx)"
        />
        <input ref={spreadsheetInputRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) setSpreadsheet(f); }} />
      </Card>

      <Card>
        <CardTitle>Step 3 — Upload Partner Logos (optional)</CardTitle>
        <DropZone
          isDragging={isDraggingImages}
          hasFile={images.length > 0}
          onClick={() => imagesInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setIsDraggingImages(true); }}
          onDragLeave={() => setIsDraggingImages(false)}
          onDrop={handleImagesDrop}
        >
          <div style={{ fontSize: '2rem' }}>🖼️</div>
          <DropZoneText>Partner logos: <code style={{ fontFamily: 'monospace', background: 'none' }}>business-name-slug_1.jpg</code></DropZoneText>
        </DropZone>
        <input ref={imagesInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleImagesChange} />
        {images.length > 0 && (
          <ImageList>
            {images.map((img) => (
              <ImageTag key={img.name}>
                🖼 {img.name}
                <RemoveBtn onClick={() => setImages((p) => p.filter((f) => f.name !== img.name))} title="Remove">×</RemoveBtn>
              </ImageTag>
            ))}
          </ImageList>
        )}
      </Card>

      <SubmitBtn onClick={handleSubmit} disabled={loading || !spreadsheet}>
        {loading ? 'Importing…' : 'Run Partners Import'}
      </SubmitBtn>

      {result && (
        <ResultCard hasErrors={hasErrors} style={{ marginTop: '1.5rem' }}>
          <ResultTitle hasErrors={hasErrors}>
            {hasErrors ? '⚠ Import completed with errors' : '✅ Partners import successful'}
          </ResultTitle>
          <StatRow>
            <StatBox><StatValue>{result.partnersCreated}</StatValue><StatLabel>Partners Created</StatLabel></StatBox>
            <StatBox><StatValue>{result.partnersSkipped}</StatValue><StatLabel>Skipped / Errors</StatLabel></StatBox>
            <StatBox><StatValue>{result.imagesUploaded}</StatValue><StatLabel>Logos Uploaded</StatLabel></StatBox>
            <StatBox>
              <StatValue style={{ fontSize: '1rem' }}>{result.tierApplied ?? '—'}</StatValue>
              <StatLabel>Tier Applied</StatLabel>
            </StatBox>
          </StatRow>

          {result.partners.length > 0 && (
            <details style={{ marginBottom: '0.75rem' }}>
              <summary style={{ cursor: 'pointer', fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '0.5rem' }}>
                View {result.partners.length} partner(s)
              </summary>
              <PartnerListTable>
                <thead><tr><th>Business Name</th><th>ID</th><th>Status</th></tr></thead>
                <tbody>
                  {result.partners.map((p) => (
                    <tr key={p.id}>
                      <td>{p.businessName}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{p.id}</td>
                      <td style={{ color: p.created ? '#10b981' : '#f59e0b' }}>{p.created ? 'Created' : 'Updated'}</td>
                    </tr>
                  ))}
                </tbody>
              </PartnerListTable>
            </details>
          )}

          {result.errors.length > 0 && (
            <>
              <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#ef4444', marginBottom: '0.4rem' }}>Errors ({result.errors.length})</div>
              <MessageList>{result.errors.map((e, i) => <MessageItem key={i} type="error">⛔ {e}</MessageItem>)}</MessageList>
            </>
          )}
          {result.warnings.length > 0 && (
            <>
              <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#f59e0b', margin: '0.75rem 0 0.4rem' }}>Warnings ({result.warnings.length})</div>
              <MessageList>{result.warnings.map((w, i) => <MessageItem key={i} type="warning">⚠ {w}</MessageItem>)}</MessageList>
            </>
          )}
        </ResultCard>
      )}
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type TabId = 'premium' | 'partners';

export default function AdminBulkImportPage() {
  const [activeTab, setActiveTab] = useState<TabId>('premium');

  return (
    <Container>
      <Title>Bulk Import</Title>
      <Subtitle>
        Import partners and offers in bulk. Use <strong>Premium Import</strong> for a single partner with multiple offers,
        or <strong>Partners Import</strong> to onboard many partners at once with tier assignment.
      </Subtitle>

      <TabRow>
        <Tab active={activeTab === 'premium'} onClick={() => setActiveTab('premium')}>
          ⭐ Premium Import
        </Tab>
        <Tab active={activeTab === 'partners'} onClick={() => setActiveTab('partners')}>
          👥 Partners Import
        </Tab>
      </TabRow>

      {activeTab === 'premium' ? <PremiumImportTab /> : <PartnersImportTab />}
    </Container>
  );
}
