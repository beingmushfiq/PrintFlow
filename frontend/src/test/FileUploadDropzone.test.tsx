import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FileUploadDropzone } from '../components/FileUploadDropzone';
import '../lib/i18n';

describe('FileUploadDropzone Component', () => {
  it('renders drop area and browse button', () => {
    render(<FileUploadDropzone publicToken="test_token_123" />);

    expect(screen.getByText(/Drag and drop your PDF or image files/i)).toBeInTheDocument();
    expect(screen.getByText(/Select Files/i)).toBeInTheDocument();
  });

  it('handles drag over and drag leave styling', () => {
    const { container } = render(<FileUploadDropzone publicToken="test_token_123" />);

    const dropArea = container.querySelector('[role="button"]')!;
    expect(dropArea).toBeInTheDocument();

    fireEvent.dragOver(dropArea);
    fireEvent.dragLeave(dropArea);
  });
});
