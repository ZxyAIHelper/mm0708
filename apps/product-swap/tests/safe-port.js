'use strict';

function listenOnSafePort(
    server,
    {
        host = '127.0.0.1',
        minPort = 20000,
        maxPort = 45000,
        maxAttempts = 30,
        random = Math.random,
    } = {},
) {
    return new Promise((resolve, reject) => {
        let attempts = 0;

        const attempt = () => {
            attempts += 1;
            const port = minPort + Math.floor(
                random() * (maxPort - minPort + 1),
            );
            const cleanup = () => {
                server.removeListener('error', onError);
                server.removeListener('listening', onListening);
            };
            const onListening = () => {
                cleanup();
                resolve(server.address());
            };
            const onError = (error) => {
                cleanup();
                if (error?.code === 'EADDRINUSE'
                    && attempts < maxAttempts) {
                    attempt();
                    return;
                }
                reject(error);
            };

            server.once('error', onError);
            server.once('listening', onListening);
            try {
                server.listen(port, host);
            } catch (error) {
                onError(error);
            }
        };

        attempt();
    });
}

module.exports = { listenOnSafePort };
