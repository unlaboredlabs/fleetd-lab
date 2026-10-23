import { makeFetch } from 'supertest-fetch'
import { describe, expect, it } from 'vitest'
import { App, type Request } from '../../packages/app/src/index'
import { InitAppAndTest } from '../../test_helpers/initAppAndTest'

const errorApp = () =>
  new App({
    onError: (err, _req, res) => res.status(500).end(`Error: ${err instanceof Error ? err.message : err}`)
  })

describe('app.param', () => {
  it('passes the param value and name to the handler', async () => {
    const { fetch, app } = InitAppAndTest((req, res) => void res.send(req.params.id), '/user/:id')

    const calls: [string, string][] = []
    app.param('id', (req, _res, next, value, name) => {
      calls.push([value, name])
      expect(req.params.id).toBe(value)
      next()
    })

    await fetch('/user/42').expect(200, '42')
    expect(calls).toEqual([['42', 'id']])
  })
  it('changes to req are visible to the route handler', async () => {
    const app = new App<Request & { user?: string }>()

    app
      .param('id', (req, _res, next, value) => {
        req.params.id = `#${value}`
        req.user = `user ${value}`
        next()
      })
      .get('/user/:id', (req, res) => void res.send(`${req.params.id} ${req.user}`))

    await makeFetch(app.listen())('/user/7').expect(200, '#7 user 7')
  })
  it('runs several handlers for one name in registration order', async () => {
    const app = new App()
    const order: number[] = []

    app.param('id', (_req, _res, next) => {
      order.push(1)
      next()
    })
    app.param('id', (_req, _res, next) => {
      order.push(2)
      next()
    })
    app.get('/:id', (_req, res) => void res.send(order.join(',')))

    await makeFetch(app.listen())('/x').expect(200, '1,2')
  })
  it('returns the app for chaining', () => {
    const app = new App()

    expect(app.param('id', (_req, _res, next) => next())).toBe(app)
  })
  it('runs once per value across matched routes', async () => {
    const app = new App()
    let count = 0

    app.param('id', (req, _res, next, value) => {
      count++
      req.params.id = value.toUpperCase()
      next()
    })
    app.get('/user/:id', (req, _res, next) => {
      expect(req.params.id).toBe('ABC')
      next()
    })
    app.get('/user/:id', (req, res) => void res.send(`${req.params.id} ${count}`))

    await makeFetch(app.listen())('/user/abc').expect(200, 'ABC 1')
  })
  it('runs again when a later route has a different value', async () => {
    const app = new App()
    const values: string[] = []

    app.param('id', (_req, _res, next, value) => {
      values.push(value)
      next()
    })
    app.get('/user/:id/*', (_req, _res, next) => next())
    app.get('/user/a/:id', (_req, res) => void res.send(values.join(',')))

    await makeFetch(app.listen())('/user/a/b').expect(200, 'a,b')
  })
  it('supports async handlers', async () => {
    const app = new App()

    app.param('id', async (req, _res, next, value) => {
      await new Promise((resolve) => setTimeout(resolve, 5))
      req.params.id = `async ${value}`
      next()
    })
    app.get('/:id', (req, res) => void res.send(req.params.id))

    await makeFetch(app.listen())('/1').expect(200, 'async 1')
  })
  it('next(err) skips the route and reaches onError', async () => {
    const app = errorApp()
    let routeRan = false

    app.param('id', (_req, _res, next) => next(new Error('next')))
    app.get('/:id', (_req, res) => {
      routeRan = true
      res.send('route')
    })

    await makeFetch(app.listen())('/1').expect(500, 'Error: next')
    expect(routeRan).toBe(false)
  })
  it('a thrown error skips the route and reaches onError', async () => {
    const app = errorApp()
    let routeRan = false

    app.param('id', () => {
      throw new Error('thrown')
    })
    app.get('/:id', (_req, res) => {
      routeRan = true
      res.send('route')
    })

    await makeFetch(app.listen())('/1').expect(500, 'Error: thrown')
    expect(routeRan).toBe(false)
  })
  it('a rejected promise skips the route and reaches onError', async () => {
    const app = errorApp()
    let routeRan = false

    app.param('id', () => Promise.reject(new Error('rejected')))
    app.param('name', async () => {
      throw new Error('async')
    })
    app.get('/a/:id', (_req, res) => {
      routeRan = true
      res.send('route')
    })
    app.get('/b/:name', (_req, res) => {
      routeRan = true
      res.send('route')
    })

    const fetch = makeFetch(app.listen())
    await fetch('/a/1').expect(500, 'Error: rejected')
    await fetch('/b/1').expect(500, 'Error: async')
    expect(routeRan).toBe(false)
  })
  it('does not run for routes or middleware without the param', async () => {
    const app = new App()
    let count = 0

    app.param('id', (_req, _res, next) => {
      count++
      next()
    })
    app.use('/:id', (_req, _res, next) => next())
    app.get('/:name', (_req, res) => void res.send(`${count}`))

    await makeFetch(app.listen())('/1').expect(200, '0')
  })
  it('does not apply across mounted sub-apps', async () => {
    const app = new App()
    const sub = new App()
    const calls: string[] = []

    app.param('id', (_req, _res, next) => {
      calls.push('parent')
      next()
    })
    sub.param('id', (_req, _res, next) => {
      calls.push('sub')
      next()
    })
    sub.get('/:id', (_req, res) => void res.send(calls.join(',')))
    app.use('/sub', sub)
    app.get('/:id', (_req, res) => void res.send(calls.join(',')))

    const fetch = makeFetch(app.listen())
    await fetch('/sub/1').expect(200, 'sub')
    calls.length = 0
    await fetch('/1').expect(200, 'parent')
  })
  it('handles a route param named constructor', async () => {
    const app = new App()

    app.get('/a/:constructor', (req, res) => void res.send(req.params.constructor))

    const fetch = makeFetch(app.listen())
    await fetch('/a/x').expect(200, 'x')

    const calls: string[] = []
    app.param('constructor', (_req, _res, next, value) => {
      calls.push(value)
      next()
    })

    await fetch('/a/y').expect(200, 'y')
    expect(calls).toEqual(['y'])
  })
  it('handles a route param named __proto__', async () => {
    const app = new App()
    let count = 0

    app.get('/b/:__proto__', (_req, res) => void res.send(`${count}`))

    const fetch = makeFetch(app.listen())
    await fetch('/b/x').expect(200, '0')

    expect(
      app.param('__proto__', (_req, _res, next) => {
        count++
        next()
      })
    ).toBe(app)
    expect(app.paramHandlers.__proto__).toHaveLength(1)

    // the url params never carry a __proto__ key, so its handlers are not run with an inherited value
    await fetch('/b/y').expect(200, '0')
  })
  it('runs handlers for each param of a route', async () => {
    const app = new App()
    const calls: string[] = []

    app.param('user', (_req, _res, next, value, name) => {
      calls.push(`${name}=${value}`)
      next()
    })
    app.param('post', (req, _res, next, value, name) => {
      calls.push(`${name}=${value}`)
      req.params.post = `post ${value}`
      next()
    })
    app.get('/:user/:post', (req, res) => void res.send(`${calls.join(',')} ${req.params.post}`))

    await makeFetch(app.listen())('/u1/p2').expect(200, 'user=u1,post=p2 post p2')
  })
})
