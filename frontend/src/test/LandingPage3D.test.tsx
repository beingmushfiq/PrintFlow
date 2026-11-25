import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '../lib/i18n';
import { LandingHome } from '../pages/public/LandingPage';

const mockApiRequest = vi.fn();

vi.mock('../lib/api', () => ({
  apiRequest: (...args: any[]) => mockApiRequest(...args),
}));

describe('3D Storytelling LandingPage & Hero', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    mockApiRequest.mockReset();
    mockApiRequest.mockResolvedValue({
      data: {
        shops: [
          { id: '1', name: 'PrintFlow Main Shop', slug: 'printflow-main', address: 'Nilkhet, Dhaka' },
          { id: '2', name: 'DCP Counter', slug: 'dcp', address: 'Mirpur, Dhaka' },
        ],
      },
    });
  });

  it('renders platform brief, 3D storytelling chapters, and dynamic shop selector', async () => {
    render(
      <MemoryRouter>
        <LandingHome />
      </MemoryRouter>
    );

    expect(screen.getByText(/Scan Counter QR. Upload Securely in Seconds\./i)).toBeInTheDocument();
    expect(screen.getByText(/Zero-Float Duplex Math & Instant Checkout\./i)).toBeInTheDocument();
    expect(screen.getByText(/Leased to Counter Printer\. Shredded Immediately After\./i)).toBeInTheDocument();

    const select = await screen.findByLabelText(/Select Print Shop/i);
    fireEvent.change(select, { target: { value: 'dcp' } });

    const customerLinks = screen.getAllByRole('link', { name: /Customer Point/i });
    expect(customerLinks[0]).toHaveAttribute('href', '/s/dcp');
  });

  it('updates live 3D interactive Poisha sample readout when toggling B&W/Color and Simplex/Duplex', async () => {
    render(
      <MemoryRouter>
        <LandingHome />
      </MemoryRouter>
    );

    await screen.findByLabelText(/Select Print Shop/i);

    // Default: B&W + Duplex (Model A) => 500 Poisha = ৳ 5.00
    expect(screen.getByText('৳ 5.00')).toBeInTheDocument();

    // Toggle to Color + Duplex => 3000 Poisha = ৳ 30.00
    const colorBtns = screen.getAllByRole('button', { name: /B&W Ink/i });
    fireEvent.click(colorBtns[colorBtns.length - 1]);
    expect(screen.getByText('৳ 30.00')).toBeInTheDocument();

    // Toggle to Simplex => 4000 Poisha = ৳ 40.00
    fireEvent.click(screen.getByRole('button', { name: /Duplex \(Model A\)/i }));
    expect(screen.getByText('৳ 40.00')).toBeInTheDocument();
  });

  it('translates all 3D storytelling chapters to Bengali cleanly on toggle', async () => {
    render(
      <MemoryRouter>
        <LandingHome />
      </MemoryRouter>
    );

    const toggle = screen.getByRole('button', { name: /toggle language/i });
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(screen.getByText(/কিউআর স্ক্যান করুন। নিরাপদে ফাইল পাঠান।/i)).toBeInTheDocument();
    });
    expect(screen.getByText('৳৫.০০')).toBeInTheDocument();
    expect(screen.queryByText(/landing\./i)).not.toBeInTheDocument();
  });
});
