import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FileCard, type UploadFileItem } from '../components/FileCard';
import '../lib/i18n';

describe('FileCard Component', () => {
  const readyItem: UploadFileItem = {
    id: 'file_001',
    name: 'Lecture_Notes.pdf',
    sizeBytes: 2048576, // ~2MB
    mimeType: 'application/pdf',
    progress: 100,
    status: 'ready',
    pageCount: 12,
  };

  it('renders file details including sanitized name, size, and page count', () => {
    const handleRemove = vi.fn();
    render(<FileCard item={readyItem} onRemove={handleRemove} />);

    expect(screen.getByText('Lecture_Notes.pdf')).toBeInTheDocument();
    expect(screen.getByText(/2.0 MB/)).toBeInTheDocument();
    expect(screen.getByText(/12 pages/i)).toBeInTheDocument();
  });

  it('calls onRemove when delete button is clicked', () => {
    const handleRemove = vi.fn();
    render(<FileCard item={readyItem} onRemove={handleRemove} />);

    const removeBtn = screen.getByRole('button', { name: /remove/i });
    fireEvent.click(removeBtn);

    expect(handleRemove).toHaveBeenCalledWith('file_001');
  });

  it('displays progress bar when status is uploading', () => {
    const uploadingItem: UploadFileItem = {
      id: 'file_002',
      name: 'Passport.png',
      sizeBytes: 512000,
      mimeType: 'image/png',
      progress: 65,
      status: 'uploading',
    };

    render(<FileCard item={uploadingItem} onRemove={vi.fn()} />);

    expect(screen.getByText('65%')).toBeInTheDocument();
    expect(screen.getByText(/uploading/i)).toBeInTheDocument();
  });

  it('displays error message and retry button when status is error', () => {
    const handleRetry = vi.fn();
    const errorItem: UploadFileItem = {
      id: 'file_003',
      name: 'Corrupted.pdf',
      sizeBytes: 1024,
      mimeType: 'application/pdf',
      progress: 0,
      status: 'error',
      errorMessage: 'Password-protected PDFs are not supported.',
    };

    render(<FileCard item={errorItem} onRemove={vi.fn()} onRetry={handleRetry} />);

    expect(screen.getByText(/Password-protected/i)).toBeInTheDocument();
    const retryBtn = screen.getByRole('button', { name: /retry/i });
    fireEvent.click(retryBtn);
    expect(handleRetry).toHaveBeenCalledWith('file_003');
  });
});
