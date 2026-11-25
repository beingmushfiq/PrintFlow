import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DollarSign,
  Calculator,
  Save,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { apiRequest } from '../../lib/api';
import { formatMoney } from '../../lib/money';

export const PricingPage: React.FC = () => {
  const { t } = useTranslation(['common', 'owner']);
  const [baseRate, setBaseRate] = useState<number>(200);
  const [duplexModel, setDuplexModel] = useState<string>('model_b');
  const [duplexDiscount, setDuplexDiscount] = useState<number>(20);
  const [flatSheetFee, setFlatSheetFee] = useState<number>(350);
  const [colorRate, setColorRate] = useState<number>(1000);
  const [colorDuplexDiscount, setColorDuplexDiscount] = useState<number>(10);
  const [colorFlatSheetFee, setColorFlatSheetFee] = useState<number>(1800);
  const [minOrderFloor, setMinOrderFloor] = useState<number>(500);
  const [vatBasisPoints, setVatBasisPoints] = useState<number>(500);

  // Live calculator test state
  const [samplePages, setSamplePages] = useState<number>(5);
  const [sampleCopies, setSampleCopies] = useState<number>(1);
  const [sampleDuplex, setSampleDuplex] = useState<boolean>(true);
  const [sampleColorMode, setSampleColorMode] = useState<'mono' | 'color'>('mono');

  const [saving, setSaving] = useState<boolean>(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchPricing = async () => {
    try {
      const res = await apiRequest('/owner/pricing');
      if (res.data) {
        setBaseRate(res.data.base_simplex_poisha ?? 200);
        setDuplexModel(res.data.duplex_model ?? 'model_b');
        setDuplexDiscount(res.data.duplex_discount_percent ?? 20);
        setFlatSheetFee(res.data.flat_duplex_sheet_poisha ?? 350);
        setColorRate(res.data.color_simplex_poisha ?? 1000);
        setColorDuplexDiscount(res.data.color_duplex_discount_percent ?? 10);
        setColorFlatSheetFee(res.data.color_flat_duplex_sheet_poisha ?? 1800);
        setMinOrderFloor(res.data.minimum_order_floor_poisha ?? 500);
        setVatBasisPoints(res.data.vat_basis_points ?? 500);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to load pricing');
    }
  };

  useEffect(() => {
    fetchPricing();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (baseRate <= 0 || colorRate <= 0) {
      setErrorMsg('Base rates must be positive');
      return;
    }
    if (duplexDiscount < 0 || duplexDiscount > 100 || colorDuplexDiscount < 0 || colorDuplexDiscount > 100) {
      setErrorMsg('Discounts must be between 0% and 100%');
      return;
    }

    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      await apiRequest('/owner/pricing', {
        method: 'PUT',
        body: JSON.stringify({
          base_simplex_poisha: baseRate,
          duplex_model: duplexModel,
          duplex_discount_percent: duplexDiscount,
          flat_duplex_sheet_poisha: flatSheetFee,
          color_simplex_poisha: colorRate,
          color_duplex_discount_percent: colorDuplexDiscount,
          color_flat_duplex_sheet_poisha: colorFlatSheetFee,
          minimum_order_floor_poisha: minOrderFloor,
          vat_basis_points: vatBasisPoints,
        }),
      });
      setSuccessMsg('Pricing profile saved successfully');
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to save pricing configuration');
    } finally {
      setSaving(false);
    }
  };

  // Immediate Live Preview calculation
  const calculatePreview = () => {
    const pages = Math.max(1, samplePages);
    const copies = Math.max(1, sampleCopies);
    const activeBase = sampleColorMode === 'color' ? colorRate : baseRate;
    const activeDiscount = sampleColorMode === 'color' ? colorDuplexDiscount : duplexDiscount;
    const activeFlatSheet = sampleColorMode === 'color' ? colorFlatSheetFee : flatSheetFee;

    if (!sampleDuplex) {
      const totalSheets = pages * copies;
      const totalSides = pages * copies;
      const subtotalPoisha = activeBase * totalSides;
      return { totalSheets, totalSides, subtotalPoisha, frontSides: totalSides, backSides: 0 };
    }

    const frontSides = Math.ceil(pages / 2);
    const backSides = Math.floor(pages / 2);
    const totalSheets = frontSides * copies;
    const totalSides = pages * copies;

    let costPerCopy = 0;
    if (duplexModel === 'model_a') {
      const oddSheet = pages % 2 === 1 ? 1 : 0;
      costPerCopy = (backSides * activeFlatSheet) + (oddSheet * activeBase);
    } else {
      const discountedRate = Math.round(activeBase * (1 - activeDiscount / 100));
      costPerCopy = (frontSides * activeBase) + (backSides * discountedRate);
    }

    const subtotalPoisha = costPerCopy * copies;
    return { totalSheets, totalSides, subtotalPoisha, frontSides, backSides };
  };

  const preview = calculatePreview();

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-150">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink flex items-center space-x-2.5">
          <DollarSign className="w-6 h-6 text-accent" />
          <span>{t('owner:pricing_editor')}</span>
        </h1>
        <p className="text-sm text-muted">
          Configure per-printed-side rates, dynamic duplex discount rules, and zero-float Poisha minor units
        </p>
      </div>

      {successMsg && (
        <div className="p-4 rounded-xl bg-status-success/10 border border-status-success/30 text-status-success text-sm flex items-center space-x-2">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 rounded-xl bg-status-error/10 border border-status-error/30 text-status-error text-sm flex items-center space-x-2">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Main Settings Form */}
        <form onSubmit={handleSave} className="lg:col-span-7 space-y-6">
          <div className="p-6 rounded-2xl bg-surface border border-border shadow-xs space-y-5">
            <h2 className="font-bold text-base text-ink">Base Print Rates</h2>

            {/* Base Simplex Rate */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-ink">
                {t('owner:base_simplex')} (in Poisha)
              </label>
              <div className="flex items-center space-x-3">
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={baseRate}
                  onChange={(e) => setBaseRate(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-border bg-paper focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
                />
                <span className="shrink-0 text-sm font-bold text-ink w-24">
                  {formatMoney(baseRate)}
                </span>
              </div>
              <p className="text-[11px] text-muted">Standard rate charged for one printed side (100 Poisha = ৳ 1.00)</p>
            </div>

            {/* Duplex Model Selector */}
            <div className="space-y-2 pt-2 border-t border-border">
              <label className="block text-xs font-semibold text-ink">Duplex Calculation Engine</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setDuplexModel('model_b')}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    duplexModel === 'model_b'
                      ? 'border-accent bg-accent/5 ring-2 ring-accent/20'
                      : 'border-border bg-paper'
                  }`}
                >
                  <p className="text-xs font-bold text-ink">Model B (Discount %)</p>
                  <p className="text-[11px] text-muted">Discount on the back side of each sheet</p>
                </button>

                <button
                  type="button"
                  onClick={() => setDuplexModel('model_a')}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    duplexModel === 'model_a'
                      ? 'border-accent bg-accent/5 ring-2 ring-accent/20'
                      : 'border-border bg-paper'
                  }`}
                >
                  <p className="text-xs font-bold text-ink">Model A (Flat Sheet Fee)</p>
                  <p className="text-[11px] text-muted">Fixed price per 2-sided physical sheet</p>
                </button>
              </div>
            </div>

            {/* Duplex parameter based on model */}
            {duplexModel === 'model_b' ? (
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-ink">
                  {t('owner:duplex_discount')}
                </label>
                <div className="flex items-center space-x-3">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={duplexDiscount}
                    onChange={(e) => setDuplexDiscount(parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-border bg-paper focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
                  />
                  <span className="shrink-0 text-sm font-bold text-ink w-24">
                    {duplexDiscount}%
                  </span>
                </div>
                <p className="text-[11px] text-muted">Applied to second side (e.g. 20% discount on 200 Poisha = 160 Poisha)</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-ink">
                  Flat Duplex Sheet Fee (Poisha)
                </label>
                <div className="flex items-center space-x-3">
                  <input
                    type="number"
                    min="1"
                    value={flatSheetFee}
                    onChange={(e) => setFlatSheetFee(parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-border bg-paper focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
                  />
                  <span className="shrink-0 text-sm font-bold text-ink w-24">
                    {formatMoney(flatSheetFee)}
                  </span>
                </div>
              </div>
            )}

            {/* Color Print Rates */}
            <div className="space-y-4 pt-3 border-t border-border">
              <h3 className="font-bold text-sm text-ink">Color Print Rates</h3>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-ink">
                  {t('owner:color_simplex')} (in Poisha)
                </label>
                <div className="flex items-center space-x-3">
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={colorRate}
                    onChange={(e) => setColorRate(parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-border bg-paper focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
                  />
                  <span className="shrink-0 text-sm font-bold text-ink w-24">
                    {formatMoney(colorRate)}
                  </span>
                </div>
                <p className="text-[11px] text-muted">Standard rate charged for one color printed side (100 Poisha = ৳ 1.00)</p>
              </div>

              {duplexModel === 'model_b' ? (
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-ink">
                    {t('owner:color_duplex_discount')}
                  </label>
                  <div className="flex items-center space-x-3">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={colorDuplexDiscount}
                      onChange={(e) => setColorDuplexDiscount(parseInt(e.target.value) || 0)}
                      className="w-full px-3 py-2 text-sm rounded-xl border border-border bg-paper focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
                    />
                    <span className="shrink-0 text-sm font-bold text-ink w-24">
                      {colorDuplexDiscount}%
                    </span>
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-ink">
                    {t('owner:color_flat_duplex')}
                  </label>
                  <div className="flex items-center space-x-3">
                    <input
                      type="number"
                      min="1"
                      value={colorFlatSheetFee}
                      onChange={(e) => setColorFlatSheetFee(parseInt(e.target.value) || 0)}
                      className="w-full px-3 py-2 text-sm rounded-xl border border-border bg-paper focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
                    />
                    <span className="shrink-0 text-sm font-bold text-ink w-24">
                      {formatMoney(colorFlatSheetFee)}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Minimum floor and VAT */}
            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-ink">{t('owner:minimum_order')}</label>
                <input
                  type="number"
                  min="0"
                  value={minOrderFloor}
                  onChange={(e) => setMinOrderFloor(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-border bg-paper focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
                />
                <span className="text-[11px] text-muted block">{formatMoney(minOrderFloor)} floor</span>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-ink">{t('owner:vat_rate')} (Basis Points)</label>
                <input
                  type="number"
                  min="0"
                  step="50"
                  value={vatBasisPoints}
                  onChange={(e) => setVatBasisPoints(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-border bg-paper focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
                />
                <span className="text-[11px] text-muted block">{(vatBasisPoints / 100).toFixed(2)}% Tax</span>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={saving}
                className="flex items-center justify-center space-x-2 w-full py-2.5 rounded-xl bg-accent hover:bg-accent/90 text-white font-semibold text-xs shadow-sm transition-all disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>{saving ? 'Saving...' : t('owner:save_changes')}</span>
              </button>
            </div>
          </div>
        </form>

        {/* Live Preview Calculator Card */}
        <div className="lg:col-span-5 space-y-4">
          <div className="p-6 rounded-2xl bg-surface border border-accent/30 shadow-xs space-y-4">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-lg bg-accent-soft text-accent flex items-center justify-center">
                <Calculator className="w-4 h-4" />
              </div>
              <h2 className="font-bold text-base text-ink">{t('owner:live_calculator')}</h2>
            </div>

            <p className="text-xs text-muted">
              Test customer order scenarios in real-time with zero latency.
            </p>

            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted font-medium">Document Pages:</span>
                <div className="flex items-center space-x-2">
                  <input
                    type="range"
                    min="1"
                    max="20"
                    value={samplePages}
                    onChange={(e) => setSamplePages(parseInt(e.target.value))}
                    className="w-24 accent-accent"
                  />
                  <span className="w-6 text-right font-bold text-ink">{samplePages}</span>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-muted font-medium">Copies:</span>
                <div className="flex items-center space-x-2">
                  <input
                    type="range"
                    min="1"
                    max="5"
                    value={sampleCopies}
                    onChange={(e) => setSampleCopies(parseInt(e.target.value))}
                    className="w-24 accent-accent"
                  />
                  <span className="w-6 text-right font-bold text-ink">{sampleCopies}</span>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-muted font-medium">Color Mode:</span>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => setSampleColorMode('mono')}
                    className={`px-2 py-1 rounded text-[11px] font-semibold border ${
                      sampleColorMode === 'mono' ? 'bg-accent text-white border-accent' : 'bg-paper text-muted border-border'
                    }`}
                  >
                    B&amp;W
                  </button>
                  <button
                    type="button"
                    onClick={() => setSampleColorMode('color')}
                    className={`px-2 py-1 rounded text-[11px] font-semibold border ${
                      sampleColorMode === 'color' ? 'bg-accent text-white border-accent' : 'bg-paper text-muted border-border'
                    }`}
                  >
                    Color
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-muted font-medium">Print Sides:</span>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => setSampleDuplex(false)}
                    className={`px-2 py-1 rounded text-[11px] font-semibold border ${
                      !sampleDuplex ? 'bg-accent text-white border-accent' : 'bg-paper text-muted border-border'
                    }`}
                  >
                    Simplex
                  </button>
                  <button
                    type="button"
                    onClick={() => setSampleDuplex(true)}
                    className={`px-2 py-1 rounded text-[11px] font-semibold border ${
                      sampleDuplex ? 'bg-accent text-white border-accent' : 'bg-paper text-muted border-border'
                    }`}
                  >
                    Duplex
                  </button>
                </div>
              </div>
            </div>

            {/* Calculated Breakdown Display */}
            <div className="p-4 rounded-xl bg-paper border border-border space-y-2 text-xs">
              <div className="flex justify-between text-muted">
                <span>Total Physical Sheets:</span>
                <span className="font-semibold text-ink">{preview.totalSheets}</span>
              </div>
              <div className="flex justify-between text-muted">
                <span>Printed Sides:</span>
                <span className="font-semibold text-ink">{preview.totalSides}</span>
              </div>
              <div className="border-t border-border pt-2 flex justify-between font-bold text-sm text-ink">
                <span>Estimated Customer Total:</span>
                <span className="text-accent">{formatMoney(preview.subtotalPoisha)}</span>
              </div>
              <p className="text-[10px] text-muted text-right font-mono">
                ({preview.subtotalPoisha} Poisha)
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PricingPage;
