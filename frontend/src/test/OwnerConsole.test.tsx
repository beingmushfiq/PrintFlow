import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AgentPairingModal } from '../components/owner/AgentPairingModal';
import { ControlledReprintModal } from '../components/owner/ControlledReprintModal';
import { apiRequest } from '../lib/api';
import '../lib/i18n';

vi.mock('../lib/api', () => ({
  apiRequest: vi.fn(),
}));

describe('Owner Console Modals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('AgentPairingModal renders properly when open and hides when closed', async () => {
    (apiRequest as any).mockResolvedValue({
      data: {
        pairing_code: '883921',
        expires_in_seconds: 300,
      },
    });

    const { rerender } = render(<AgentPairingModal isOpen={false} onClose={vi.fn()} />);
    expect(screen.queryByText('Setup Instructions:')).not.toBeInTheDocument();

    rerender(<AgentPairingModal isOpen={true} onClose={vi.fn()} />);
    expect(screen.getByText('Setup Instructions:')).toBeInTheDocument();
    expect(screen.getByText(/Windows 10\/11 Desktop Agent/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('883921')).toBeInTheDocument();
    });
  });

  it('ControlledReprintModal enforces reason and confirmation checkbox before submit', async () => {
    (apiRequest as any).mockResolvedValue({
      data: {
        job_id: 'job_456',
        status: 'queued',
      },
    });

    const onSuccess = vi.fn();
    const onClose = vi.fn();

    render(
      <ControlledReprintModal
        isOpen={true}
        orderId="ord_123"
        orderReference="ORD-2026-99"
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    expect(screen.getByText('Controlled Reprint')).toBeInTheDocument();
    expect(screen.getByText('ORD-2026-99')).toBeInTheDocument();

    const submitBtn = screen.getByRole('button', { name: /Confirm & Send to Spooler/i });
    expect(submitBtn).toBeDisabled();

    // Type a reason
    const textarea = screen.getByPlaceholderText(/paper jam during print/i);
    fireEvent.change(textarea, { target: { value: 'Printer paper jammed mid-job' } });
    expect(submitBtn).toBeDisabled();

    // Toggle confirm checkbox
    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);

    expect(submitBtn).not.toBeDisabled();
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalledWith('/owner/orders/ord_123/reprint', {
        method: 'POST',
        body: JSON.stringify({ reason: 'Printer paper jammed mid-job' }),
      });
      expect(onSuccess).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });
});
