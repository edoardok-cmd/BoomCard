import { render, screen } from '@testing-library/react';
import QRScanner from './QRScanner';

describe('QRScanner', () => {
  it('renders without crashing', () => {
    render(<QRScanner>Test</QRScanner>);
    expect(screen.getByText('Test')).toBeInTheDocument();
  });
});