import { render, screen } from '@testing-library/react';
import Sidebar from './Sidebar';

describe('Sidebar', () => {
  it('renders without crashing', () => {
    render(<Sidebar>Test</Sidebar>);
    expect(screen.getByText('Test')).toBeInTheDocument();
  });
});