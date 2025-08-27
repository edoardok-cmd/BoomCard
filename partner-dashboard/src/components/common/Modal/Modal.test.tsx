import { render, screen } from '@testing-library/react';
import Modal from './Modal';

describe('Modal', () => {
  it('renders without crashing', () => {
    render(<Modal>Test</Modal>);
    expect(screen.getByText('Test')).toBeInTheDocument();
  });
});