import { screen } from '@testing-library/react';
import type * as React from 'react';
import type { IWorkflowProps } from '../webparts/aiCoeFrontDoor/components/workflows/shared';
import type { IPieceWorkflowDefinition } from '../webparts/aiCoeFrontDoor/workflows/types';
import { renderWithFrontDoor } from './renderWithFrontDoor';
import type { FrontDoorRenderResult, ITestFrontDoorOptions } from './renderWithFrontDoor';

export interface IWorkflowHarness extends FrontDoorRenderResult {
  onExit: jest.Mock;
  onDraftsChanged: jest.Mock;
}

export interface IWorkflowPageOptions extends ITestFrontDoorOptions {
  resumeDraft?: boolean;
}

/** Renders a workflow page with mocked navigation callbacks inside the fake front door. */
export function renderWorkflowPage(build: (props: IWorkflowProps) => React.ReactElement, options: IWorkflowPageOptions = {}): IWorkflowHarness {
  const onExit: jest.Mock = jest.fn();
  const onDraftsChanged: jest.Mock = jest.fn();
  const { resumeDraft = false, ...frontDoorOptions } = options;
  const result: FrontDoorRenderResult = renderWithFrontDoor(build({ resumeDraft, onExit, onDraftsChanged }), frontDoorOptions);
  return { ...result, onExit, onDraftsChanged };
}

export const ISO_TIMESTAMP: RegExp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/** Waits for the boot sequence to show the first question. */
export async function firstStepOf(definition: IPieceWorkflowDefinition): Promise<void> {
  await screen.findByRole('heading', { level: 2, name: definition.steps[0].title });
}
