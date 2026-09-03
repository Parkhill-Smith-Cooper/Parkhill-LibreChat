import React from 'react';
import { ErrorTypes } from 'librechat-data-provider';
import { render, screen } from '@testing-library/react';
import translation from '~/locales/en/translation.json';
import Error from '../Error';

/**
 * Resolves keys against the real English catalog rather than a stub, so a typed error whose
 * localization key is missing or misspelled fails here instead of reaching users as a raw key.
 */
jest.mock('~/hooks', () => ({
  useLocalize:
    () =>
    (key: string): string =>
      (jest.requireActual('~/locales/en/translation.json') as Record<string, string>)[key] ?? key,
}));

const catalog = translation as Record<string, string>;

describe('Error — typed provider errors', () => {
  it('renders the localized copy for a rejected Google video', () => {
    /** The exact payload `resolveGoogleVideoError` emits from the server. */
    const payload = JSON.stringify({ type: ErrorTypes.GOOGLE_VIDEO_UNPROCESSABLE });
    render(<Error text={payload} />);

    expect(screen.getByText(catalog.com_error_google_video_unprocessable)).toBeInTheDocument();
  });

  it('names video length, the dominant cause, in the copy', () => {
    expect(catalog.com_error_google_video_unprocessable).toMatch(/too long/i);
  });

  it('replaces LangChain model-not-found attribution with localized guidance', () => {
    const raw =
      'An error occurred while processing the request: 404 404 page not found Troubleshooting URL: https://docs.langchain.com/oss/javascript/langchain/errors/MODEL_NOT_FOUND/';
    render(<Error text={raw} />);

    expect(screen.getByText(catalog.com_error_model_not_found)).toBeInTheDocument();
    expect(screen.queryByText(/langchain\.com/i)).not.toBeInTheDocument();
  });

  it('replaces the LangGraph recursion-limit text with localized guidance', () => {
    const raw =
      'An error occurred while processing the request: Recursion limit of 58 reached without hitting a stop condition. You can increase the limit by setting the "recursionLimit" config key. Troubleshooting URL: https://docs.langchain.com/oss/javascript/langgraph/GRAPH_RECURSION_LIMIT/';
    render(<Error text={raw} />);

    expect(screen.getByText(catalog.com_error_recursion_limit)).toBeInTheDocument();
    expect(screen.queryByText(/recursionLimit/)).not.toBeInTheDocument();
  });

  it('matches the recursion-limit sentence without the troubleshooting URL', () => {
    const raw =
      'An error occurred while resuming the request: Recursion limit of 158 reached without hitting a stop condition.';
    render(<Error text={raw} />);

    expect(screen.getByText(catalog.com_error_recursion_limit)).toBeInTheDocument();
  });

  it('falls back to the raw provider text for an unmapped error', () => {
    const raw =
      '[GoogleGenerativeAI Error]: [400 Bad Request] Request contains an invalid argument';
    render(<Error text={raw} />);

    expect(
      screen.getByText(new RegExp(raw.slice(0, 30).replace(/[[\]]/g, '\\$&'))),
    ).toBeInTheDocument();
  });
});
