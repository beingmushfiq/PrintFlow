import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PhoneIntake } from '../components/PhoneIntake';
import '../lib/i18n';

describe('PhoneIntake Component', () => {
  it('renders input with BD flag badge and placeholder', () => {
    const handleChange = vi.fn();
    render(<PhoneIntake value="" onChange={handleChange} />);

    expect(screen.getByText('+880')).toBeInTheDocument();
    const input = screen.getByRole('textbox');
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('type', 'tel');
  });

  it('normalizes input and notifies parent with valid status', () => {
    const handleChange = vi.fn();
    render(<PhoneIntake value="" onChange={handleChange} />);

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '+880 1712-345678' } });

    expect(handleChange).toHaveBeenCalledWith('01712345678', true);
  });

  it('displays validation error when touched and invalid', () => {
    const handleChange = vi.fn();
    render(<PhoneIntake value="01012345678" onChange={handleChange} />);

    const input = screen.getByRole('textbox');
    fireEvent.blur(input);

    expect(screen.getByRole('paragraph')).toHaveTextContent(/Bangladeshi mobile number/i);
  });

  it('triggers onSubmit on Enter key if input is valid', () => {
    const handleChange = vi.fn();
    const handleSubmit = vi.fn();
    render(
      <PhoneIntake
        value="01712345678"
        onChange={handleChange}
        onSubmit={handleSubmit}
      />
    );

    const input = screen.getByRole('textbox');
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    expect(handleSubmit).toHaveBeenCalled();
  });
});
