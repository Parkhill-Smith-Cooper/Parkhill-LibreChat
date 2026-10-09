import { request } from 'librechat-data-provider';
import { recordImageDownload } from '../downloads';

describe('recordImageDownload', () => {
  let postSpy: jest.SpyInstance;

  beforeEach(() => {
    postSpy = jest.spyOn(request, 'post');
  });

  afterEach(() => {
    postSpy.mockRestore();
  });

  it('posts the stored filepath', () => {
    postSpy.mockResolvedValue(undefined);
    recordImageDownload('https://blob.example/images/u1/gen.png');
    expect(postSpy).toHaveBeenCalledWith('/api/parkhill/image-downloads', {
      filepath: 'https://blob.example/images/u1/gen.png',
    });
  });

  it('skips an empty filepath', () => {
    recordImageDownload('');
    expect(postSpy).not.toHaveBeenCalled();
  });

  it('swallows a failed request', async () => {
    postSpy.mockRejectedValue(new Error('network'));
    expect(() => recordImageDownload('/images/u1/gen.png')).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});
