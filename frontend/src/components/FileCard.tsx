import React from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, Image as ImageIcon, Trash2, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';

export interface UploadFileItem {
  id: string;
  name: string;
  sizeBytes: number;
  mimeType: string;
  progress: number;
  status: 'pending' | 'uploading' | 'verifying' | 'ready' | 'error';
  pageCount?: number;
  errorMessage?: string;
  previewUrl?: string;
}

export interface FileCardProps {
  item: UploadFileItem;
  onRemove: (id: string) => void;
  onRetry?: (id: string) => void;
}

export const FileCard: React.FC<FileCardProps> = ({ item, onRemove, onRetry }) => {
  const { t } = useTranslation(['storefront', 'common']);

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const isPdf = item.mimeType === 'application/pdf' || item.name.toLowerCase().endsWith('.pdf');

  return (
    <div className="bg-surface border border-border rounded-xl p-4 shadow-sm space-y-3 transition-all hover:border-accent/40">
      <div className="flex items-start justify-between space-x-3">
        {/* File Type Icon */}
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
          isPdf ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-accent'
        }`}>
          {isPdf ? <FileText className="w-5 h-5" /> : <ImageIcon className="w-5 h-5" />}
        </div>

        {/* File Details */}
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-ink truncate" title={item.name}>
            {item.name}
          </h4>
          <div className="flex items-center space-x-2 text-xs text-muted mt-0.5">
            <span>{formatSize(item.sizeBytes)}</span>
            {item.pageCount !== undefined && item.pageCount > 0 && (
              <>
                <span>•</span>
                <span className="font-medium text-ink">
                  {t('storefront:pages_detected', { count: item.pageCount })}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Remove Button (min 44px touch target) */}
        <button
          type="button"
          onClick={() => onRemove(item.id)}
          className="w-11 h-11 flex items-center justify-center text-muted hover:text-status-danger hover:bg-red-50 rounded-lg transition-colors"
          aria-label={t('common:remove', { defaultValue: 'Remove file' })}
          title={t('common:remove', { defaultValue: 'Remove file' })}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Progress or Status */}
      {item.status === 'uploading' && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted">
            <span className="flex items-center space-x-1.5 text-accent font-medium">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>{t('storefront:uploading', { defaultValue: 'Uploading...' })}</span>
            </span>
            <span className="font-semibold text-accent">{item.progress}%</span>
          </div>
          <div className="w-full bg-paper rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-accent h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${item.progress}%` }}
            />
          </div>
        </div>
      )}

      {item.status === 'verifying' && (
        <div className="flex items-center space-x-2 text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
          <span className="font-medium">
            {t('storefront:verifying', { defaultValue: 'Verifying pages & security scan...' })}
          </span>
        </div>
      )}

      {item.status === 'ready' && (
        <div className="flex items-center justify-between text-xs">
          <span className="inline-flex items-center space-x-1 text-status-success font-medium bg-emerald-50 px-2 py-1 rounded">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{t('storefront:ready_for_quote', { defaultValue: 'Ready for print' })}</span>
          </span>
          {item.pageCount && (
            <span className="text-muted font-medium">
              {item.pageCount} {item.pageCount === 1 ? 'page' : 'pages'}
            </span>
          )}
        </div>
      )}

      {item.status === 'error' && (
        <div className="flex items-start justify-between space-x-2 text-xs text-status-danger bg-red-50 p-2.5 rounded-lg">
          <div className="flex items-start space-x-1.5 flex-1">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="font-medium">{item.errorMessage || t('common:error')}</span>
          </div>
          {onRetry && (
            <button
              type="button"
              onClick={() => onRetry(item.id)}
              className="font-bold underline text-status-danger hover:text-red-700 shrink-0 ml-2"
            >
              {t('common:retry')}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
