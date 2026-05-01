import React, { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { useLanguage } from '../contexts/LanguageContext';
import { fraudAdminService } from '../services/fraudAdmin.service';
import { apiService } from '../services/api.service';
import { Shield, ChevronDown, ChevronRight, Save, Search, Loader, Info } from 'lucide-react';

// ─────────────────────── Styled Components ───────────────────────

const PageContainer = styled.div`
  max-width: 1400px;
  margin: 0 auto;
  padding: 2rem;
`;

const PageHeader = styled.div`
  margin-bottom: 2rem;
`;

const Title = styled.h1`
  font-size: 2rem;
  font-weight: 700;
  color: var(--color-text-primary);
  margin: 0 0 0.5rem 0;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  svg { color: var(--color-text-secondary); }
`;

const VenueSelector = styled.div`
  background: var(--color-background);
  border: 2px solid var(--color-border);
  border-radius: 1rem;
  padding: 1.5rem;
  margin-bottom: 2rem;
`;

const VenueSelectorLabel = styled.label`
  display: block;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-text-secondary);
  margin-bottom: 0.5rem;
`;

const SearchWrapper = styled.div`
  position: relative;
  margin-bottom: 0.75rem;
  svg {
    position: absolute;
    left: 0.75rem;
    top: 50%;
    transform: translateY(-50%);
    width: 16px;
    height: 16px;
    color: var(--color-text-secondary);
  }
`;

const SearchInput = styled.input`
  width: 100%;
  box-sizing: border-box;
  padding: 0.625rem 0.875rem 0.625rem 2.25rem;
  border: 2px solid var(--color-border);
  border-radius: 0.75rem;
  font-size: 0.9rem;
  background: var(--color-background);
  color: var(--color-text-primary);
  &:focus { outline: none; border-color: #000; }
`;

const VenueSelect = styled.select`
  width: 100%;
  padding: 0.625rem 0.875rem;
  border: 2px solid var(--color-border);
  border-radius: 0.75rem;
  font-size: 0.9rem;
  background: var(--color-background);
  color: var(--color-text-primary);
  cursor: pointer;
  &:focus { outline: none; border-color: #000; }
`;

const SectionHeader = styled.button<{ $expanded: boolean }>`
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 1rem 1.25rem;
  background: var(--color-background);
  border: 2px solid var(--color-border);
  border-radius: ${p => p.$expanded ? '1rem 1rem 0 0' : '1rem'};
  font-size: 1rem;
  font-weight: 700;
  color: var(--color-text-primary);
  cursor: pointer;
  transition: all 0.15s;
  text-align: left;
  &:hover { background: rgba(0,0,0,0.02); }
  svg { width: 18px; height: 18px; color: var(--color-text-secondary); flex-shrink: 0; }
`;

const FormSection = styled.div<{ $expanded: boolean }>`
  display: ${p => p.$expanded ? 'block' : 'none'};
  background: var(--color-background);
  border: 2px solid var(--color-border);
  border-top: none;
  border-radius: 0 0 1rem 1rem;
  padding: 1.25rem;
  margin-bottom: 1rem;
`;

const SectionWrapper = styled.div`
  margin-bottom: 1rem;
`;

const FormRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 0;
  border-bottom: 1px solid var(--color-border);
  &:last-child { border-bottom: none; }
`;

const FormLabel = styled.label`
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-text-secondary);
  flex: 1;
  min-width: 0;
`;

const FormInput = styled.input`
  width: 140px;
  padding: 0.5rem 0.75rem;
  border: 2px solid var(--color-border);
  border-radius: 0.5rem;
  font-size: 0.9rem;
  text-align: right;
  background: var(--color-background);
  color: var(--color-text-primary);
  &:focus { outline: none; border-color: #000; }
`;

const FormCheckbox = styled.input`
  width: 20px;
  height: 20px;
  cursor: pointer;
  accent-color: #000;
`;

const SaveButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  width: 100%;
  padding: 1rem;
  margin-top: 1rem;
  background: #000;
  color: #fff;
  border: none;
  border-radius: 0.75rem;
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s;
  &:hover:not(:disabled) { box-shadow: 0 4px 12px rgba(0,0,0,0.2); }
  &:disabled { opacity: 0.45; cursor: not-allowed; }
  svg { width: 18px; height: 18px; }
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 4rem 2rem;
  background: var(--color-background);
  border: 2px dashed var(--color-border);
  border-radius: 1rem;
  color: var(--color-text-secondary);
`;

const InfoBanner = styled.div`
  display: flex;
  gap: 0.75rem;
  padding: 1rem 1.25rem;
  margin-bottom: 1.5rem;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 0.75rem;
  font-size: 0.875rem;
  color: #1e3a8a;
  line-height: 1.5;
  svg { width: 18px; height: 18px; color: #2563eb; flex-shrink: 0; margin-top: 2px; }
  a { color: #1d4ed8; text-decoration: underline; font-weight: 600; }
`;

// Global system rules panel — spec §7.4
const GlobalRulesPanel = styled.div`
  margin-bottom: 2rem;
  background: var(--color-background);
  border: 2px solid var(--color-border);
  border-radius: 1rem;
  overflow: hidden;
`;

const GlobalRulesHeader = styled.div`
  padding: 1rem 1.25rem;
  background: rgba(0,0,0,0.02);
  border-bottom: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const GlobalRulesTitle = styled.h2`
  font-size: 1rem;
  font-weight: 700;
  color: var(--color-text-primary);
  margin: 0;
`;

const GlobalRulesGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
  gap: 0;
`;

const GlobalRuleItem = styled.div<{ $accent: string }>`
  padding: 1rem 1.25rem;
  border-right: 1px solid var(--color-border);
  border-bottom: 1px solid var(--color-border);
  &:last-child { border-right: none; }
`;

const GlobalRuleRange = styled.div<{ $color: string }>`
  font-size: 1.375rem;
  font-weight: 800;
  color: ${p => p.$color};
  margin-bottom: 0.2rem;
`;

const GlobalRuleLabel = styled.div`
  font-size: 0.875rem;
  font-weight: 700;
  color: var(--color-text-primary);
`;

const GlobalRuleDesc = styled.div`
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  margin-top: 0.15rem;
`;

const GlobalRulesNote = styled.div`
  padding: 0.75rem 1.25rem;
  border-top: 1px solid var(--color-border);
  font-size: 0.75rem;
  color: var(--color-text-secondary);
`;

const SpinnerWrapper = styled.div`
  display: flex;
  justify-content: center;
  padding: 4rem;
  svg {
    animation: spin 1s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
`;

const Toast = styled.div<{ $ok: boolean }>`
  position: fixed; top: 1.5rem; right: 1.5rem; z-index: 2000;
  background: ${p => p.$ok ? '#10b981' : '#dc2626'};
  color: #fff;
  padding: 0.75rem 1.5rem;
  border-radius: 0.75rem;
  font-weight: 600;
  box-shadow: 0 4px 16px rgba(0,0,0,0.15);
`;

// ─────────────────────── Defaults ───────────────────────

// Per-venue overrides for fraud & scan limits ONLY. Cashback percentages are
// matrix-driven (Admin › Cashback Rates) and the partner's discountRate is
// managed in Admin › Partners — do not duplicate those here.
// Mirrors the live fields in the Prisma VenueFraudConfig schema defaults.
type FraudConfigForm = {
  minBillAmount: number;
  maxCashbackPerScan: number;
  maxScansPerDay: number;
  maxScansPerMonth: number;
  gpsVerificationEnabled: boolean;
  gpsRadiusMeters: number;
  ocrVerificationEnabled: boolean;
  templateMatchEnabled: boolean;
  templateVisualWeight: number;
  templateMerchantWeight: number;
  templateKeywordWeight: number;
  templateMinSimilarity: number;
  templateFraudPoints: number;
  templateMerchantThreshold: number;
};

const DEFAULT_CONFIG: FraudConfigForm = {
  minBillAmount: 0,
  maxCashbackPerScan: 0,
  maxScansPerDay: 999999,
  maxScansPerMonth: 999999,
  gpsVerificationEnabled: true,
  gpsRadiusMeters: 100,
  ocrVerificationEnabled: true,
  templateMatchEnabled: false,
  templateVisualWeight: 0.5,
  templateMerchantWeight: 0.3,
  templateKeywordWeight: 0.2,
  templateMinSimilarity: 0.6,
  templateFraudPoints: 20,
  templateMerchantThreshold: 0.8,
};

// ─────────────────────── Component ───────────────────────

interface Venue {
  id: string;
  businessName: string;
}

type SectionKey = 'limits' | 'fraud' | 'template';

export const AdminVenueFraudConfigPage: React.FC = () => {
  const { language } = useLanguage();

  // Venues
  const [venues, setVenues] = useState<Venue[]>([]);
  const [venueSearch, setVenueSearch] = useState('');
  const [selectedVenueId, setSelectedVenueId] = useState('');

  // Config form
  const [formData, setFormData] = useState({ ...DEFAULT_CONFIG });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [configLoaded, setConfigLoaded] = useState(false);

  // UI
  const [expandedSections, setExpandedSections] = useState<Record<SectionKey, boolean>>({
    limits: true,
    fraud: true,
    template: false,
  });
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const notify = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  // ── Load venues on mount ──────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const res = await apiService.get<{ success: boolean; data: Venue[] }>('/partners');
        if (res.data) setVenues(res.data);
      } catch (err) {
        console.error('Failed to load venues:', err);
      }
    })();
  }, []);

  // ── Load config when venue changes ────────────────────────────
  const loadConfig = useCallback(async (venueId: string) => {
    if (!venueId) return;
    setLoading(true);
    setConfigLoaded(false);
    try {
      const res = await fraudAdminService.getVenueConfig(venueId);
      if (res.success && res.data) {
        const d = res.data;
        setFormData({
          minBillAmount: d.minBillAmount,
          maxCashbackPerScan: d.maxCashbackPerScan ?? 0,
          maxScansPerDay: d.maxScansPerDay,
          maxScansPerMonth: d.maxScansPerMonth,
          gpsVerificationEnabled: d.gpsVerificationEnabled,
          gpsRadiusMeters: d.gpsRadiusMeters,
          ocrVerificationEnabled: d.ocrVerificationEnabled,
          templateMatchEnabled: d.templateMatchEnabled,
          templateVisualWeight: d.templateVisualWeight,
          templateMerchantWeight: d.templateMerchantWeight,
          templateKeywordWeight: d.templateKeywordWeight,
          templateMinSimilarity: d.templateMinSimilarity,
          templateFraudPoints: d.templateFraudPoints,
          templateMerchantThreshold: d.templateMerchantThreshold,
        });
      } else {
        setFormData({ ...DEFAULT_CONFIG });
      }
      setConfigLoaded(true);
    } catch (err) {
      console.error('Failed to load venue config:', err);
      setFormData({ ...DEFAULT_CONFIG });
      setConfigLoaded(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedVenueId) loadConfig(selectedVenueId);
  }, [selectedVenueId, loadConfig]);

  // ── Handlers ──────────────────────────────────────────────────
  const handleNumberChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value === '' ? 0 : Number(value) }));
  };

  const handleCheckboxChange = (field: string, checked: boolean) => {
    setFormData(prev => ({ ...prev, [field]: checked }));
  };

  const toggleSection = (key: SectionKey) => {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = async () => {
    if (!selectedVenueId) return;

    // Template scoring is a weighted sum of three signals; if the weights don't
    // add up to ~1.0 the per-receipt match score becomes meaningless. We allow
    // a small float-arithmetic tolerance so 0.5+0.3+0.2 still passes.
    if (formData.templateMatchEnabled) {
      const weightSum =
        formData.templateVisualWeight +
        formData.templateMerchantWeight +
        formData.templateKeywordWeight;
      if (Math.abs(weightSum - 1) > 0.01) {
        notify(
          language === 'bg'
            ? `Сборът на теглата (визуално + търговец + ключови думи) трябва да е 1.0 (текущо: ${weightSum.toFixed(2)})`
            : `Template weights (visual + merchant + keyword) must sum to 1.0 (current: ${weightSum.toFixed(2)})`,
          false
        );
        return;
      }
    }

    setSaving(true);
    try {
      await fraudAdminService.updateVenueConfig(selectedVenueId, formData);
      notify(language === 'bg' ? 'Конфигурацията е запазена' : 'Configuration saved');
    } catch (err) {
      console.error('Failed to save config:', err);
      notify(language === 'bg' ? 'Грешка при запазване' : 'Failed to save', false);
    } finally {
      setSaving(false);
    }
  };

  // ── Filtered venues ───────────────────────────────────────────
  const filteredVenues = venues.filter(v =>
    v.businessName.toLowerCase().includes(venueSearch.toLowerCase())
  );

  // ── Section rendering helper ──────────────────────────────────
  const renderSection = (
    key: SectionKey,
    title: string,
    titleBg: string,
    children: React.ReactNode
  ) => (
    <SectionWrapper key={key}>
      <SectionHeader
        $expanded={expandedSections[key]}
        onClick={() => toggleSection(key)}
        type="button"
      >
        {expandedSections[key] ? <ChevronDown /> : <ChevronRight />}
        {language === 'bg' ? titleBg : title}
      </SectionHeader>
      <FormSection $expanded={expandedSections[key]}>
        {children}
      </FormSection>
    </SectionWrapper>
  );

  const renderNumberField = (
    field: string,
    label: string,
    labelBg: string,
    step: number,
    min?: number,
    max?: number
  ) => (
    <FormRow key={field}>
      <FormLabel>{language === 'bg' ? labelBg : label}</FormLabel>
      <FormInput
        type="number"
        step={step}
        min={min}
        max={max}
        value={(formData as Record<string, unknown>)[field] as number}
        onChange={e => handleNumberChange(field, e.target.value)}
      />
    </FormRow>
  );

  const renderCheckboxField = (
    field: string,
    label: string,
    labelBg: string
  ) => (
    <FormRow key={field}>
      <FormLabel>{language === 'bg' ? labelBg : label}</FormLabel>
      <FormCheckbox
        type="checkbox"
        checked={(formData as Record<string, unknown>)[field] as boolean}
        onChange={e => handleCheckboxChange(field, e.target.checked)}
      />
    </FormRow>
  );

  // ─────────────────────── Render ───────────────────────

  return (
    <PageContainer>
      {toast && <Toast $ok={toast.ok}>{toast.msg}</Toast>}

      <PageHeader>
        <Title>
          <Shield />
          {language === 'bg' ? 'Конфигурация за Измами' : 'Venue Fraud Configuration'}
        </Title>
      </PageHeader>

      {/* ── Global System Rules — spec §7.4 ──────────────── */}
      <GlobalRulesPanel>
        <GlobalRulesHeader>
          <Shield size={16} />
          <GlobalRulesTitle>
            {language === 'bg' ? 'Глобални правила на системата' : 'Global System Rules'}
          </GlobalRulesTitle>
        </GlobalRulesHeader>
        <GlobalRulesGrid>
          <GlobalRuleItem $accent="#4caf50">
            <GlobalRuleRange $color="#4caf50">0 – 30</GlobalRuleRange>
            <GlobalRuleLabel>
              {language === 'bg' ? 'Автоматично одобрение' : 'Auto-approve'}
            </GlobalRuleLabel>
            <GlobalRuleDesc>
              {language === 'bg'
                ? 'Транзакциите се одобряват без ръчна намеса'
                : 'Transactions approved without manual review'}
            </GlobalRuleDesc>
          </GlobalRuleItem>
          <GlobalRuleItem $accent="#ff9800">
            <GlobalRuleRange $color="#ff9800">31 – 60</GlobalRuleRange>
            <GlobalRuleLabel>
              {language === 'bg' ? 'Изисква преглед' : 'Manual review required'}
            </GlobalRuleLabel>
            <GlobalRuleDesc>
              {language === 'bg'
                ? 'Администраторът трябва да прегледа и одобри'
                : 'Admin must review and approve'}
            </GlobalRuleDesc>
          </GlobalRuleItem>
          <GlobalRuleItem $accent="#f44336">
            <GlobalRuleRange $color="#f44336">61+</GlobalRuleRange>
            <GlobalRuleLabel>
              {language === 'bg' ? 'Висок риск' : 'High risk'}
            </GlobalRuleLabel>
            <GlobalRuleDesc>
              {language === 'bg'
                ? 'Вероятна измама — задължителен ръчен преглед'
                : 'Probable fraud — mandatory manual review'}
            </GlobalRuleDesc>
          </GlobalRuleItem>
          <GlobalRuleItem $accent="#667eea">
            <GlobalRuleRange $color="#667eea">—</GlobalRuleRange>
            <GlobalRuleLabel>
              {language === 'bg' ? 'Ръчна намеса (супер-админ)' : 'Manual override (super-admin)'}
            </GlobalRuleLabel>
            <GlobalRuleDesc>
              {language === 'bg'
                ? 'Одобри/отхвърли директно от Преглед на рискови транзакции'
                : 'Approve/reject directly from Risk Review tab'}
            </GlobalRuleDesc>
          </GlobalRuleItem>
        </GlobalRulesGrid>
        <GlobalRulesNote>
          {language === 'bg'
            ? 'Праговете (0–30, 31–60, 61+) са системни константи. Конфигурацията по-долу задава лимити на ниво обект.'
            : 'Thresholds (0–30, 31–60, 61+) are system constants. The configuration below sets per-venue limits.'}
        </GlobalRulesNote>
      </GlobalRulesPanel>

      {/* ── Venue Selector ────────────────────────────────── */}
      <VenueSelector>
        <VenueSelectorLabel>
          {language === 'bg' ? 'Изберете обект' : 'Select Venue'}
        </VenueSelectorLabel>
        <SearchWrapper>
          <Search />
          <SearchInput
            type="text"
            placeholder={language === 'bg' ? 'Търсене на обект...' : 'Search venues...'}
            value={venueSearch}
            onChange={e => setVenueSearch(e.target.value)}
          />
        </SearchWrapper>
        <VenueSelect
          value={selectedVenueId}
          onChange={e => setSelectedVenueId(e.target.value)}
        >
          <option value="">
            {language === 'bg' ? '-- Изберете обект --' : '-- Select a venue --'}
          </option>
          {filteredVenues.map(v => (
            <option key={v.id} value={v.id}>{v.businessName}</option>
          ))}
        </VenueSelect>
      </VenueSelector>

      {/* ── States ────────────────────────────────────────── */}
      {!selectedVenueId && (
        <EmptyState>
          {language === 'bg'
            ? 'Изберете обект, за да видите конфигурацията'
            : 'Select a venue to view its fraud configuration'}
        </EmptyState>
      )}

      {selectedVenueId && loading && (
        <SpinnerWrapper>
          <Loader size={40} />
        </SpinnerWrapper>
      )}

      {/* ── Config Form ───────────────────────────────────── */}
      {selectedVenueId && !loading && configLoaded && (
        <>
          <InfoBanner>
            <Info />
            <div>
              {language === 'bg' ? (
                <>
                  Тази страница настройва <strong>лимити и проверки за измама</strong> за обекта.
                  Процентът кешбек се определя от матрицата [5, 10, 15, 20, 25] в{' '}
                  <a href="/admin/cashback/rates">Админ › Кешбек ставки</a>, а отстъпката на партньора се
                  управлява в <a href="/admin/partners">Админ › Партньори</a>.
                </>
              ) : (
                <>
                  This page configures <strong>scan limits and fraud checks</strong> for this venue.
                  Cashback percentages are set by the matrix [5, 10, 15, 20, 25] in{' '}
                  <a href="/admin/cashback/rates">Admin › Cashback Rates</a>, and the partner's discount
                  rate is managed in <a href="/admin/partners">Admin › Partners</a>.
                </>
              )}
            </div>
          </InfoBanner>

          {/* Section 1: Scan Limits */}
          {renderSection('limits', 'Scan Limits', 'Лимити за сканиране', (
            <>
              {renderNumberField('minBillAmount', 'Min Bill Amount (BGN)', 'Мин. сума на сметка (лв)', 1, 0)}
              {renderNumberField('maxCashbackPerScan', 'Max Cashback Per Scan (BGN, 0 = default cap)', 'Макс. кешбек на скан (лв, 0 = по подразб.)', 1, 0)}
              {renderNumberField('maxScansPerDay', 'Max Scans Per Day', 'Макс. сканирания на ден', 1, 1)}
              {renderNumberField('maxScansPerMonth', 'Max Scans Per Month', 'Макс. сканирания на месец', 1, 1)}
            </>
          ))}

          {/* Section 2: Fraud Detection */}
          {renderSection('fraud', 'Fraud Detection', 'Разпознаване на измами', (
            <>
              {renderCheckboxField('gpsVerificationEnabled', 'GPS Verification Enabled', 'GPS верификация')}
              {renderNumberField('gpsRadiusMeters', 'GPS Radius (meters)', 'GPS радиус (метри)', 50, 0)}
              {renderCheckboxField('ocrVerificationEnabled', 'OCR Verification Enabled', 'OCR верификация')}
            </>
          ))}

          {/* Section 4: Template Matching */}
          {renderSection('template', 'Template Matching', 'Съпоставяне с шаблон', (
            <>
              {renderCheckboxField('templateMatchEnabled', 'Template Match Enabled', 'Активно съпоставяне с шаблон')}
              {renderNumberField('templateVisualWeight', 'Visual Weight (0-1)', 'Визуално тегло (0-1)', 0.05, 0, 1)}
              {renderNumberField('templateMerchantWeight', 'Merchant Weight (0-1)', 'Тегло на търговец (0-1)', 0.05, 0, 1)}
              {renderNumberField('templateKeywordWeight', 'Keyword Weight (0-1)', 'Тегло на ключови думи (0-1)', 0.05, 0, 1)}
              {renderNumberField('templateMinSimilarity', 'Min Similarity (0-1)', 'Мин. сходство (0-1)', 0.05, 0, 1)}
              {renderNumberField('templateFraudPoints', 'Fraud Points', 'Точки за измама', 5, 0)}
              {renderNumberField('templateMerchantThreshold', 'Merchant Threshold (0-1)', 'Праг на търговец (0-1)', 0.05, 0, 1)}
            </>
          ))}

          {/* Save Button */}
          <SaveButton onClick={handleSave} disabled={saving}>
            {saving ? <Loader size={18} /> : <Save />}
            {saving
              ? (language === 'bg' ? 'Запазване...' : 'Saving...')
              : (language === 'bg' ? 'Запази конфигурация' : 'Save Configuration')}
          </SaveButton>
        </>
      )}
    </PageContainer>
  );
};

export default AdminVenueFraudConfigPage;
