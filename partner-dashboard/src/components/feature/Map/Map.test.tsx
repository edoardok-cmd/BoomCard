import { render, screen } from '@testing-library/react';
import Map from './Map';

describe('Map', () => {
  it('renders without crashing', () => {
    render(<Map>Test</Map>);
    expect(screen.getByText('Test')).toBeInTheDocument();
  });
});