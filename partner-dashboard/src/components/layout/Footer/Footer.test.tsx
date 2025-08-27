import { render, screen } from '@testing-library/react';
import Footer from './Footer';

describe('Footer', () => {
  it('renders without crashing', () => {
    render(<Footer>Test</Footer>);
    expect(screen.getByText('Test')).toBeInTheDocument();
  });
});