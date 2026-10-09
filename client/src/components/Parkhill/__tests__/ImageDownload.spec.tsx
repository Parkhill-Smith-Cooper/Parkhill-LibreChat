import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import Image from '~/components/Chat/Messages/Content/Image';
import { recordImageDownload } from '../downloads';

/**
 * Guards the fork's one-line hook in upstream `Image.tsx`: if an upstream merge
 * drops it, downloads silently stop reaching the Tech Hub gallery.
 */
jest.mock('../downloads', () => ({ recordImageDownload: jest.fn() }));

jest.mock('librechat-data-provider', () => ({
  ...jest.requireActual('librechat-data-provider'),
  apiBaseUrl: () => '',
}));

jest.mock('@librechat/client', () => ({
  Skeleton: () => null,
}));

jest.mock('~/components/Chat/Messages/Content/DialogImage', () => ({
  __esModule: true,
  default: ({ isOpen, downloadImage }: { isOpen: boolean; downloadImage: () => void }) =>
    isOpen ? <button type="button" aria-label="download" onClick={() => downloadImage()} /> : null,
}));

describe('Image download recording', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn().mockRejectedValue(new Error('offline'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('records the stored filepath when the user downloads', () => {
    const filepath = 'https://blob.example/images/u1/gen.png';
    render(<Image imagePath={filepath} altText="gen.png" />);
    fireEvent.click(screen.getByRole('button', { name: 'View gen.png in dialog' }));
    fireEvent.click(screen.getByRole('button', { name: 'download' }));
    expect(recordImageDownload).toHaveBeenCalledWith(filepath);
  });

  it('does not record when the image is only viewed', () => {
    render(<Image imagePath="/images/u1/gen.png" altText="gen.png" />);
    fireEvent.click(screen.getByRole('button', { name: 'View gen.png in dialog' }));
    expect(recordImageDownload).not.toHaveBeenCalled();
  });
});
