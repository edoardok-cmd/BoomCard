import { render, screen } from '@testing-library/react';
import Alert from './Alert';

describe('Alert', () => {
  it('renders without crashing', () => {
    render(<Alert>Test</Alert>);
    expect(screen.getByText('Test')).toBeInTheDocument();
  });
});