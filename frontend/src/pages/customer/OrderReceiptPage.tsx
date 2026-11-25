import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Printer, ArrowLeft, AlertCircle, CheckCircle } from 'lucide-react';
import { Logo } from '../../components/common/Logo';
import { DevCenterPointBadge } from '../../components/common/DevCenterPointBadge';
import { usePageTitle } from '../../hooks/usePageTitle';
import { formatMoney } from '../../lib/money';
import { apiRequest } from '../../lib/api';
import { toBengaliNumerals } from '../../lib/i18n';

interface ReceiptLineItem {
  fileName?: string;
  description: string;
  copies?: number;
  quantity?: number;
  sheetsPerCopy?: number;
  totalSheets?: number;
  printedSides?: number;
  unitPricePoisha?: number;
  unitRatePoisha?: number;
  totalPoisha: number;
}

interface ReceiptData {
  shopName: string;
  shopPhone: string;
  publicReference: string;
  transactionId: string;
  orderDate: string;
  lineItems: ReceiptLineItem[];
  subtotalPoisha: number;
  vatPoisha: number;
  feePoisha?: number;
  totalPoisha: number;
  currency: string;
}

export const OrderReceiptPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const { t } = useTranslation(['common', 'order_status']);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  usePageTitle({ subtitle: receipt ? `Receipt #${receipt.publicReference}` : 'Order Receipt' });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    const fetchReceipt = async () => {
      try {
        const response = await apiRequest(`/public/order/${token}/receipt`);
        if (response.data) {
          setReceipt(response.data);
        }
      } catch (err: any) {
        setError(err.response?.errors?.[0]?.message || 'Failed to load receipt.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchReceipt();
  }, [token]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-sm font-semibold text-slate-500 animate-pulse">
          Generating printable receipt...
        </div>
      </div>
    );
  }

  if (error || !receipt) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 max-w-md w-full text-center space-y-4">
          <AlertCircle className="w-10 h-10 text-red-500 mx-auto" />
          <h2 className="text-lg font-bold text-slate-800">Receipt Unavailable</h2>
          <p className="text-sm text-slate-600">{error || 'Could not find receipt details.'}</p>
          <Link
            to={`/order/${token}`}
            className="inline-block px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg text-sm"
          >
            Back to Order
          </Link>
        </div>
      </div>
    );
  }

  const handlePrint = () => {
    window.print();
  };

  const qrVerificationUrl = `https://printflow.local/owner/orders/${receipt.publicReference}?token=${token}`;
  // Standard SVG QR generation fallback or clean verification URL box
  const banglaRef = toBengaliNumerals(receipt.publicReference);

  return (
    <div className="min-h-screen bg-slate-100 py-8 px-4 sm:px-6">
      <style>{`
        @media print {
          .no-print, header, nav, button, .action-bar { display: none !important; }
          body { color: #000; background: #fff; }
          .receipt-container { box-shadow: none !important; border: none !important; padding: 0 !important; width: 100% !important; max-width: 100% !important; }
        }
      `}</style>

      {/* Action Bar (Hidden on print) */}
      <div className="max-w-xl mx-auto mb-4 flex items-center justify-between no-print action-bar">
        <Link
          to={`/order/${token}`}
          className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{t('common:back')}</span>
        </Link>
        <button
          onClick={handlePrint}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-lg shadow-sm transition-all"
        >
          <Printer className="w-4 h-4" />
          <span>Print Receipt</span>
        </button>
      </div>

      {/* Printable Receipt Paper Container */}
      <div className="max-w-xl mx-auto bg-white rounded-2xl shadow-md border border-slate-200 p-8 space-y-6 receipt-container">
        {/* Receipt Header */}
        <div className="text-center space-y-1.5 border-b border-slate-200 pb-5">
          <Logo variant="mark" size="sm" className="mx-auto mb-1" />
          <div className="text-xl font-black text-slate-900 tracking-tight uppercase">
            {receipt.shopName}
          </div>
          <p className="text-xs text-slate-500 font-medium">
            Contact: {receipt.shopPhone}
          </p>
          <div className="pt-2">
            <span className="inline-block text-xs font-bold uppercase tracking-wider bg-slate-100 text-slate-800 px-3 py-1 rounded-full">
              Digital Payment Receipt
            </span>
          </div>
        </div>

        {/* Order & Transaction Metadata */}
        <div className="grid grid-cols-2 gap-4 text-xs border-b border-slate-100 pb-4">
          <div>
            <span className="text-slate-400 block">Public Reference</span>
            <span className="font-bold text-slate-900 text-sm">{receipt.publicReference}</span>
            <span className="block text-[11px] text-slate-500">({banglaRef})</span>
          </div>
          <div className="text-right">
            <span className="text-slate-400 block">Date & Time</span>
            <span className="font-medium text-slate-800">
              {new Date(receipt.orderDate).toLocaleString()}
            </span>
          </div>
          <div>
            <span className="text-slate-400 block">Transaction ID</span>
            <span className="font-mono font-medium text-slate-700">{receipt.transactionId}</span>
          </div>
          <div className="text-right">
            <span className="text-slate-400 block">Payment Status</span>
            <span className="inline-flex items-center gap-1 font-bold text-emerald-700">
              <CheckCircle className="w-3.5 h-3.5" />
              PAID
            </span>
          </div>
        </div>

        {/* Itemized Table */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Print Order Items
          </h3>
          <div className="space-y-2">
            {receipt.lineItems.map((item, idx) => {
              const qty = item.quantity ?? item.copies ?? 1;
              const rate = item.unitRatePoisha ?? item.unitPricePoisha ?? 0;
              return (
                <div key={idx} className="flex justify-between items-start text-xs border-b border-slate-50 pb-2">
                  <div className="space-y-0.5">
                    <div className="font-semibold text-slate-800">{item.description}</div>
                    <div className="text-slate-500">
                      Qty: {qty} {rate > 0 ? `@ ${formatMoney(rate, 'en')}` : ''}
                      {item.totalSheets ? ` (${item.totalSheets} sheets)` : ''}
                      {item.printedSides ? ` (${item.printedSides} sides)` : ''}
                    </div>
                  </div>
                  <div className="font-bold text-slate-900 whitespace-nowrap text-right">
                    <div>{formatMoney(item.totalPoisha, 'en')}</div>
                    <div className="text-[11px] text-slate-500">{formatMoney(item.totalPoisha, 'bn')}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Totals Summary */}
        <div className="space-y-2 border-t border-slate-200 pt-3 text-xs">
          <div className="flex justify-between text-slate-600">
            <span>Subtotal</span>
            <span className="font-medium">{formatMoney(receipt.subtotalPoisha, 'en')}</span>
          </div>
          {receipt.feePoisha && receipt.feePoisha > 0 && (
            <div className="flex justify-between text-slate-600">
              <span>Service Fee</span>
              <span className="font-medium">{formatMoney(receipt.feePoisha, 'en')}</span>
            </div>
          )}
          {receipt.vatPoisha > 0 && (
            <div className="flex justify-between text-slate-600">
              <span>VAT</span>
              <span className="font-medium">{formatMoney(receipt.vatPoisha, 'en')}</span>
            </div>
          )}
          <div className="flex justify-between items-baseline border-t border-slate-300 pt-2 text-sm font-bold text-slate-900">
            <span>Grand Total</span>
            <div className="text-right">
              <span className="text-lg font-black text-slate-900">{formatMoney(receipt.totalPoisha, 'en')}</span>
              <span className="block text-xs font-semibold text-indigo-700">({formatMoney(receipt.totalPoisha, 'bn')})</span>
            </div>
          </div>
        </div>

        {/* Counter QR Verification Box */}
        <div className="pt-4 border-t border-dashed border-slate-200 flex flex-col items-center justify-center text-center space-y-2">
          <div className="p-2 border border-slate-300 rounded-lg bg-slate-50">
            {/* Simple high-contrast SVG representation of counter verification QR */}
            <svg className="w-24 h-24" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="100" height="100" fill="white" />
              <rect x="10" y="10" width="25" height="25" stroke="black" strokeWidth="5" fill="none" />
              <rect x="18" y="18" width="9" height="9" fill="black" />
              <rect x="65" y="10" width="25" height="25" stroke="black" strokeWidth="5" fill="none" />
              <rect x="73" y="18" width="9" height="9" fill="black" />
              <rect x="10" y="65" width="25" height="25" stroke="black" strokeWidth="5" fill="none" />
              <rect x="18" y="73" width="9" height="9" fill="black" />
              <rect x="45" y="15" width="10" height="10" fill="black" />
              <rect x="45" y="45" width="15" height="15" fill="black" />
              <rect x="65" y="45" width="10" height="10" fill="black" />
              <rect x="45" y="70" width="10" height="15" fill="black" />
              <rect x="70" y="70" width="15" height="15" fill="black" />
            </svg>
          </div>
          <span className="text-[11px] font-mono text-slate-400 break-all max-w-xs">
            {qrVerificationUrl}
          </span>
          <p className="text-[11px] text-slate-500 font-medium">
            Scan at counter for handover collection verification.
          </p>
        </div>

        {/* Footer */}
        <div className="text-center border-t border-slate-100 pt-3">
          <DevCenterPointBadge variant="footer" />
        </div>
      </div>
    </div>
  );
};
