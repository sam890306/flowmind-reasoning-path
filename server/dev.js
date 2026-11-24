// Local API server: `npm run dev` starts this next to Vite, which proxies /api to it.
import http from 'node:http'
import handler from './app.js'

const port = Number(process.env.API_PORT || 8787)
http.createServer(handler).listen(port, () => console.log(`api  http://localhost:${port}/api`))
