import { track, appOpened } from '../helpers/analytics.ts';

declare const reconfigureServer: (config?: Record<string, unknown>) => Promise<unknown>;

describe('AnalyticsController', () => {
  const analyticsAdapter = {
    appOpened: function () {},
    trackEvent: function () {},
  };

  it('should track a simple event', async () => {
    const trackSpy = spyOn(analyticsAdapter, 'trackEvent').and.callThrough();
    await reconfigureServer({ analyticsAdapter });

    await track('MyEvent', { key: 'value', count: '0' });

    expect(trackSpy).toHaveBeenCalled();
    const args = trackSpy.calls.first().args;
    expect(args[0]).toEqual('MyEvent');
    expect(args[1]).toEqual({ dimensions: { key: 'value', count: '0' } });
  });

  it('should track a app opened event', async () => {
    const appOpenedSpy = spyOn(analyticsAdapter, 'appOpened').and.callThrough();
    await reconfigureServer({ analyticsAdapter });

    await appOpened({ key: 'value', count: '0' });

    expect(appOpenedSpy).toHaveBeenCalled();
    const args = appOpenedSpy.calls.first().args;
    expect(args[0]).toEqual({ dimensions: { key: 'value', count: '0' } });
  });
});
