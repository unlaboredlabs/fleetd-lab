import { makeFetch } from 'supertest-fetch'
import { describe, it } from 'vitest'
import { App } from '../../packages/app/src/index'

// Reported: routing goes wrong once a middleware mounted on a path has run.
describe('repro: middleware mounted on a path', () => {
  it('serves the route registered under the mount path', async () => {
    const app = new App()

    app.use('/api', (_req, _res, next) => next())
    app.get('/api/me', (_req, res) => void res.send('api me'))
    app.get('/me', (_req, res) => void res.send('root me'))

    const fetch = makeFetch(app.listen())

    await fetch('/api/me').expect(200, 'api me')
  })
})
