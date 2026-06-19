import { describe, it, expect } from 'vitest';
import { transition, INITIAL_SCREEN, type FlowContext } from '@core/index';

const SAVE: FlowContext = { hasSave: true };
const NO_SAVE: FlowContext = { hasSave: false };

describe('screen flow transition', () => {
  it('boots at Title', () => {
    expect(INITIAL_SCREEN).toBe('Title');
  });

  it('Title + NewGame -> InLevel', () => {
    expect(transition('Title', 'NewGame', NO_SAVE)).toEqual({ ok: true, next: 'InLevel' });
  });

  it('MainMenu + RequestResume with a save -> InLevel', () => {
    expect(transition('MainMenu', 'RequestResume', SAVE)).toEqual({ ok: true, next: 'InLevel' });
  });

  it('MainMenu + RequestResume without a save -> rejected', () => {
    expect(transition('MainMenu', 'RequestResume', NO_SAVE).ok).toBe(false);
  });

  it('opens Settings and Back returns to the menu', () => {
    expect(transition('MainMenu', 'OpenSettings', NO_SAVE)).toEqual({ ok: true, next: 'Settings' });
    expect(transition('Settings', 'Back', NO_SAVE)).toEqual({ ok: true, next: 'MainMenu' });
  });

  it('Pause and Resume toggle between InLevel and Paused', () => {
    expect(transition('InLevel', 'Pause', NO_SAVE)).toEqual({ ok: true, next: 'Paused' });
    expect(transition('Paused', 'Resume', NO_SAVE)).toEqual({ ok: true, next: 'InLevel' });
  });

  it('Paused + RestartLevel -> InLevel', () => {
    expect(transition('Paused', 'RestartLevel', NO_SAVE)).toEqual({ ok: true, next: 'InLevel' });
  });

  it('Abandon flows through an explicit confirmation', () => {
    expect(transition('Paused', 'RequestAbandon', NO_SAVE)).toEqual({ ok: true, next: 'AbandonConfirm' });
    expect(transition('AbandonConfirm', 'ConfirmAbandon', NO_SAVE)).toEqual({ ok: true, next: 'Title' });
    expect(transition('AbandonConfirm', 'CancelAbandon', NO_SAVE)).toEqual({ ok: true, next: 'Paused' });
  });

  it('an undefined (state, event) pair is rejected and never throws', () => {
    expect(() => transition('Title', 'ConfirmAbandon', NO_SAVE)).not.toThrow();
    expect(transition('Title', 'ConfirmAbandon', NO_SAVE).ok).toBe(false);
    expect(transition('InLevel', 'NewGame', NO_SAVE).ok).toBe(false);
  });

  it('is pure: identical inputs yield identical results', () => {
    expect(transition('Paused', 'RequestAbandon', SAVE)).toEqual(
      transition('Paused', 'RequestAbandon', SAVE),
    );
  });
});
