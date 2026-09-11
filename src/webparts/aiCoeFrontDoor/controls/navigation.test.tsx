import { fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';
import { createBranding } from '../branding/branding';
import { createWorkflowCatalog } from '../content/workflows/catalog';
import { ConfirmDialog } from './ConfirmDialog';
import { HeroNetworkSvg } from './HeroNetworkSvg';
import { LoadingState } from './LoadingState';
import { SecondaryActions } from './SecondaryActions';
import { StepNav } from './StepNav';
import { WorkflowHeader } from './WorkflowHeader';

describe('SecondaryActions', () => {
  it('offers save draft and start over, and announces notices', () => {
    const onSaveDraft: jest.Mock = jest.fn();
    const onStartOver: jest.Mock = jest.fn();
    const { rerender } = render(<SecondaryActions onSaveDraft={onSaveDraft} onStartOver={onStartOver} notice="Draft saved on this device." />);
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start over' }));
    expect(onSaveDraft).toHaveBeenCalledTimes(1);
    expect(onStartOver).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toHaveTextContent('Draft saved on this device.');

    rerender(<SecondaryActions onSaveDraft={onSaveDraft} onStartOver={onStartOver} notice={undefined} showSaveDraft={false} />);
    expect(screen.queryByRole('button', { name: 'Save draft' })).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('StepNav', () => {
  it('wires back, continue and the secondary actions', () => {
    const onBack: jest.Mock = jest.fn();
    const onContinue: jest.Mock = jest.fn();
    const onSaveDraft: jest.Mock = jest.fn();
    const onStartOver: jest.Mock = jest.fn();
    render(<StepNav onBack={onBack} onContinue={onContinue} continueLabel="Review my answers" onSaveDraft={onSaveDraft} onStartOver={onStartOver} notice={undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review my answers' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start over' }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(onSaveDraft).toHaveBeenCalledTimes(1);
    expect(onStartOver).toHaveBeenCalledTimes(1);
  });
});

describe('ConfirmDialog', () => {
  const props = {
    title: 'Start over?',
    body: "This will clear your answers for this topic. You can't undo this.",
    confirmLabel: 'Start over',
    cancelLabel: 'Keep my answers'
  };

  it('renders nothing while closed', () => {
    const { container } = render(<ConfirmDialog open={false} onConfirm={jest.fn()} onCancel={jest.fn()} {...props} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders an alert dialog that focuses the cancel button', () => {
    const onConfirm: jest.Mock = jest.fn();
    const onCancel: jest.Mock = jest.fn();
    render(<ConfirmDialog open={true} onConfirm={onConfirm} onCancel={onCancel} {...props} />);
    const dialog: HTMLElement = screen.getByRole('alertdialog', { name: 'Start over?' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText("This will clear your answers for this topic. You can't undo this.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep my answers' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Start over' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Keep my answers' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(2);
    fireEvent.click(dialog);
    expect(onCancel).toHaveBeenCalledTimes(2);
    fireEvent.click(dialog.parentElement as HTMLElement);
    expect(onCancel).toHaveBeenCalledTimes(3);
  });
});

describe('HeroNetworkSvg', () => {
  it('renders the decorative network illustration', () => {
    render(<HeroNetworkSvg />);
    const svg: HTMLElement = screen.getByRole('img', { name: 'Abstract connected network' });
    expect(svg).toHaveAttribute('viewBox', '0 0 760 300');
    expect(svg).toHaveClass('ai-hero-network');
    expect(svg.querySelectorAll('circle')).toHaveLength(15);
    expect(svg.querySelectorAll('path')).toHaveLength(8);
  });
});

describe('LoadingState and WorkflowHeader', () => {
  it('announces loading text politely', () => {
    render(<LoadingState text="Setting things up…" />);
    expect(screen.getByRole('status')).toHaveTextContent('Setting things up…');
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
  });

  it('shows the workflow title with a way back to all topics', () => {
    const onExit: jest.Mock = jest.fn();
    render(<WorkflowHeader workflow={createWorkflowCatalog(createBranding('Overture')).idea} onExit={onExit} />);
    expect(screen.getByRole('heading', { name: 'I have an idea for using AI' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'All topics' }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});
