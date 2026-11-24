import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { UploadCloud, Plus } from 'lucide-react';
import { FileCard, type UploadFileItem } from './FileCard';
import { apiRequest } from '../lib/api';

export interface FileUploadDropzoneProps {
  publicToken: string;
  onFilesChanged?: (readyFiles: UploadFileItem[]) => void;
  maxFiles?: number;
  disabled?: boolean;
}

export const FileUploadDropzone: React.FC<FileUploadDropzoneProps> = ({
  publicToken,
  onFilesChanged,
  maxFiles = 10,
  disabled = false,
}) => {
  const { t } = useTranslation(['storefront', 'common']);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<UploadFileItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const notifyChange = (updatedFiles: UploadFileItem[]) => {
    setFiles(updatedFiles);
    if (onFilesChanged) {
      const readyOnly = updatedFiles.filter(f => f.status === 'ready');
      onFilesChanged(readyOnly);
    }
  };

  const processUpload = async (file: File) => {
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newItem: UploadFileItem = {
      id: tempId,
      name: file.name,
      sizeBytes: file.size,
      mimeType: file.type || 'application/octet-stream',
      progress: 10,
      status: 'uploading',
    };

    setFiles(prev => [...prev, newItem]);

    try {
      // 1. Request presigned upload slot
      const presignRes = await apiRequest<{
        file_id: string;
        object_key: string;
        upload_url: string;
        method: string;
        headers: Record<string, string>;
      }>('/public/upload/presign', {
        method: 'POST',
        body: JSON.stringify({
          public_token: publicToken,
          original_name: file.name,
          size_bytes: file.size,
          mime_type: file.type || 'application/octet-stream',
        }),
      });

      const { file_id, upload_url, method, headers } = presignRes.data;

      // Update file ID to server ULID
      setFiles(prev => prev.map(f => f.id === tempId ? { ...f, id: file_id, progress: 40 } : f));

      // 2. Upload document bytes
      let uploadSuccess = false;
      try {
        if (method === 'PUT') {
          const s3Res = await fetch(upload_url, {
            method: 'PUT',
            headers: {
              ...headers,
              'Content-Type': file.type || 'application/octet-stream',
            },
            body: file,
          });
          uploadSuccess = s3Res.ok;
        }
      } catch {
        uploadSuccess = false;
      }

      // If S3 direct upload was not successful or fallback was provided, stream directly to backend
      if (!uploadSuccess) {
        const directUrl = upload_url.includes('/upload/direct/')
          ? upload_url
          : `/api/v1/public/upload/direct/${file_id}?public_token=${encodeURIComponent(publicToken)}`;

        await apiRequest(directUrl, {
          method: 'POST',
          body: file,
          headers: {
            'Content-Type': file.type || 'application/octet-stream',
            'X-Order-Token': publicToken,
          },
        });
      }

      // 3. Mark verifying
      setFiles(prev => prev.map(f => f.id === file_id ? { ...f, progress: 90, status: 'verifying' } : f));

      // 4. Confirm upload and inspect document
      const confirmRes = await apiRequest<{
        file: {
          id: string;
          original_name: string;
          mime_type: string;
          size_bytes: number;
          page_count: number;
          preview_url?: string;
        };
      }>('/public/upload/confirm', {
        method: 'POST',
        body: JSON.stringify({
          public_token: publicToken,
          file_id: file_id,
        }),
      });

      const confirmedFile = confirmRes.data.file;

      setFiles(prev => {
        const next = prev.map(f => f.id === file_id ? {
          ...f,
          progress: 100,
          status: 'ready' as const,
          pageCount: confirmedFile.page_count,
          previewUrl: confirmedFile.preview_url,
        } : f);
        if (onFilesChanged) {
          onFilesChanged(next.filter(i => i.status === 'ready'));
        }
        return next;
      });

    } catch (err: any) {
      const errorMsg = err.response?.errors?.[0]?.message || err.message || t('common:error');
      setFiles(prev => {
        const next = prev.map(f => (f.id === tempId || f.name === file.name) ? {
          ...f,
          status: 'error' as const,
          errorMessage: errorMsg,
        } : f);
        if (onFilesChanged) {
          onFilesChanged(next.filter(i => i.status === 'ready'));
        }
        return next;
      });
    }
  };

  const handleFiles = (incomingFiles: FileList | null) => {
    if (!incomingFiles || incomingFiles.length === 0 || disabled) return;

    const availableSlots = maxFiles - files.length;
    const toProcess = Array.from(incomingFiles).slice(0, availableSlots);

    for (const file of toProcess) {
      processUpload(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (!disabled && e.dataTransfer.files) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleRemove = (id: string) => {
    const updated = files.filter(f => f.id !== id);
    notifyChange(updated);
  };

  return (
    <div className="space-y-4 w-full">
      {/* Drop area */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !disabled && fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
          isDragging
            ? 'border-accent bg-accent-soft/50 scale-[1.01]'
            : 'border-border bg-paper hover:bg-paper-dark hover:border-accent/40'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        role="button"
        tabIndex={0}
        aria-label={t('storefront:drop_hint')}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          disabled={disabled}
          accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
          onChange={(e) => handleFiles(e.target.files)}
          className="hidden"
        />

        <div className="flex flex-col items-center justify-center space-y-3">
          <div className="w-14 h-14 rounded-full bg-accent-soft text-accent flex items-center justify-center shadow-inner">
            <UploadCloud className="w-7 h-7" />
          </div>

          <div>
            <p className="text-base font-semibold text-ink">
              {t('storefront:drop_hint')}
            </p>
            <p className="text-xs text-muted mt-1">
              {t('storefront:supported_formats')}
            </p>
          </div>

          <button
            type="button"
            className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-lg bg-accent text-white font-medium text-sm shadow hover:bg-accent/90 transition-colors pointer-events-none"
          >
            <Plus className="w-4 h-4" />
            <span>{t('storefront:select_files')}</span>
          </button>
        </div>
      </div>

      {/* File List Cards */}
      {files.length > 0 && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between text-xs font-semibold text-muted px-1">
            <span>{t('storefront:files_uploaded')} ({files.length})</span>
            <span>
              {files.filter(f => f.status === 'ready').length} {t('common:ready', { defaultValue: 'ready' })}
            </span>
          </div>

          <div className="space-y-2">
            {files.map(file => (
              <FileCard
                key={file.id}
                item={file}
                onRemove={handleRemove}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
