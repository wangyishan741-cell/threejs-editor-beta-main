import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import { nanjingAppearancePublishing } from './build/nanjingAppearancePublishing.js'
import { nanjingProjectSnapshots } from './build/nanjingProjectSnapshots.js'

// Local development acceptance reports. A bounded in-memory buffer avoids
// browser multi-download prompts during repeated performance comparisons.
function nanjingBenchmarkReports() {
  const reports = []
  return {
    name: 'nanjing-benchmark-reports',
    configureServer(server) {
      server.middlewares.use('/__nanjing-benchmark', (req, res, next) => {
        const address = (req.socket.remoteAddress || '').replace(/^::ffff:/, '')
        const local = (req.socket.localAddress || '').replace(/^::ffff:/, '')
        const localClient = ['127.0.0.1', '::1', local].includes(address)
        const sameOrigin = req.headers.origin === `http://${req.headers.host}`
        // A user-triggered benchmark on the LAN Mac may submit its own metrics.
        // Reading the report collection remains restricted to the server machine.
        if (!localClient && (req.method !== 'POST' || !sameOrigin)) { res.statusCode = 403; res.end(); return }
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.setHeader('Cache-Control', 'no-store')
        if (req.method === 'GET') { res.end(JSON.stringify(reports)); return }
        if (req.method !== 'POST') { next(); return }
        let body = ''
        req.on('data', chunk => { body += chunk; if (body.length > 65536) req.destroy() })
        req.on('end', () => {
          try {
            const report = JSON.parse(body)
            if (report.benchmark !== 'nanjing-reference-orbit-v3-480-samples' || typeof report.fps !== 'number') throw new Error('invalid report')
            reports.push(report)
            if (reports.length > 10) reports.shift()
            res.end('{"ok":true}')
          } catch { res.statusCode = 400; res.end('{"ok":false}') }
        })
      })
    },
  }
}

export default defineConfig({

  define: {

    __isProduction__: process.env.NODE_ENV === 'production'

  },

  plugins: [
    nanjingAppearancePublishing({ root: process.cwd() }),
    nanjingProjectSnapshots({ root: process.cwd() }),
    nanjingBenchmarkReports(),
    {

      transformIndexHtml: html => {

        if (process.env.NODE_ENV === 'production') {

          html = html.replace(/<head>/, `<head>\n
          <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-8697430839896878" crossorigin="anonymous"></script> 
          <script async src="https://www.googletagmanager.com/gtag/js?id=G-LKJQBJNGVF"></script>
          <script>
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());

            gtag('config', 'G-LKJQBJNGVF');
          </script>
          <script>
            var _hmt = _hmt || [];
            (function() {
              var hm = document.createElement("script");
              hm.src = "https://hm.baidu.com/hm.js?85aef82369b0fe002f0e62a775344e89";
              var s = document.getElementsByTagName("script")[0]; 
              s.parentNode.insertBefore(hm, s);
            })();
            </script>
          `)

        }

        return html

      }
    },

    vue()

  ],

  resolve: {

    alias: [
      {
        find: /^three$/,
        replacement: path.resolve(__dirname, 'node_modules/three')
      }
    ]

  },

  base: './',

  server: {

    // Windows can report EBUSY while large model files are being copied to
    // an acceptance build. These generated/static assets do not need HMR;
    // watching them can terminate the development server's FSWatcher.
    watch: {
      ignored: ['**/.nanjing/**', '**/dist*/**', '**/public/**'],
      // Atomic file replacement can miss native Windows watch notifications,
      // leaving Vite's transformed module older than the file on disk.
      usePolling: process.platform === 'win32', interval: 750,
    },

    port: 5173,

    strictPort: true,

    open: false,

    host: '0.0.0.0'

  }

})
