import { playwrightLauncher } from '@web/test-runner-playwright';

export default {
    nodeResolve: true,
    browsers: [
        playwrightLauncher({
            product: 'chromium',
            headless: false,
            createBrowserContext: ({ browser }) =>
                browser.newContext({
                    ignoreHTTPSErrors: true,
                    permissions: ['clipboard-read', 'clipboard-write'],
                }),
            args: [
                '--headless=new',

                // `window.gc`
                '--js-flags=--expose-gc',
                '--enable-experimental-web-platform-features',

                /**
                 * Cause `measureUserAgentSpecificMemory()` to GC immediately,
                 * instead of up to 20s later:
                 * https://web.dev/articles/monitor-total-page-memory-usage#local_testing
                 **/
                '--enable-blink-features=ForceEagerMeasureMemory',
            ],
        }),
    ],
    plugins: [
        {
            name: 'memory-plugin',
            transform(context) {
                context.set('Cross-Origin-Opener-Policy', 'same-origin');
                context.set('Cross-Origin-Embedder-Policy', 'credentialless');
            }
        },
    ],
};
