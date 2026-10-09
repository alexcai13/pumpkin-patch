import { defineConfig } from 'vite';

export default defineConfig({
    base: './',
    build: {
        rollupOptions: {
            output: {
                manualChunks: {
                    phaser: ['phaser']
                }
            }
        },
    },
    server: {
        port: 8080,
        // Listen on your network too, so a second computer on the same Wi-Fi
        // can join at http://<your-computer's-ip>:8080
        host: true,
        // Allow importing ../shared (code shared with the server).
        fs: { allow: ['..'] }
    }
});
