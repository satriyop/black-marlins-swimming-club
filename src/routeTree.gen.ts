/* eslint-disable */
// @ts-nocheck
import { Route as rootRouteImport } from './routes/__root'
import { Route as IndexRouteImport } from './routes/index'
import { Route as AktivitasRouteImport } from './routes/aktivitas'
import { Route as EventRouteImport } from './routes/event'
import { Route as LatihanRouteImport } from './routes/latihan'
import { Route as LoginRouteImport } from './routes/login'
import { Route as TerimaRouteImport } from './routes/terima'
import { Route as UndanganRouteImport } from './routes/undangan'
import { Route as PerenangRouteImport } from './routes/perenang'
import { Route as EventIdRouteImport } from './routes/event_.$id'
import { Route as LatihanIdRouteImport } from './routes/latihan_.$id'
import { Route as PerenangIdRouteImport } from './routes/perenang_.$id'
import { Route as ApiAuthSplatRouteImport } from './routes/api/auth/$'

const IndexRoute = IndexRouteImport.update({ id: '/', path: '/', getParentRoute: () => rootRouteImport } as any)
const AktivitasRoute = AktivitasRouteImport.update({ id: '/aktivitas', path: '/aktivitas', getParentRoute: () => rootRouteImport } as any)
const EventRoute = EventRouteImport.update({ id: '/event', path: '/event', getParentRoute: () => rootRouteImport } as any)
const LatihanRoute = LatihanRouteImport.update({ id: '/latihan', path: '/latihan', getParentRoute: () => rootRouteImport } as any)
const LoginRoute = LoginRouteImport.update({ id: '/login', path: '/login', getParentRoute: () => rootRouteImport } as any)
const TerimaRoute = TerimaRouteImport.update({ id: '/terima', path: '/terima', getParentRoute: () => rootRouteImport } as any)
const UndanganRoute = UndanganRouteImport.update({ id: '/undangan', path: '/undangan', getParentRoute: () => rootRouteImport } as any)
const PerenangRoute = PerenangRouteImport.update({ id: '/perenang', path: '/perenang', getParentRoute: () => rootRouteImport } as any)
const EventIdRoute = EventIdRouteImport.update({ id: '/event/$id', path: '/event/$id', getParentRoute: () => rootRouteImport } as any)
const LatihanIdRoute = LatihanIdRouteImport.update({ id: '/latihan/$id', path: '/latihan/$id', getParentRoute: () => rootRouteImport } as any)
const PerenangIdRoute = PerenangIdRouteImport.update({ id: '/perenang/$id', path: '/perenang/$id', getParentRoute: () => rootRouteImport } as any)
const ApiAuthSplatRoute = ApiAuthSplatRouteImport.update({ id: '/api/auth/$', path: '/api/auth/$', getParentRoute: () => rootRouteImport } as any)

export interface FileRoutesByFullPath {
  '/': typeof IndexRoute
  '/aktivitas': typeof AktivitasRoute
  '/event': typeof EventRoute
  '/latihan': typeof LatihanRoute
  '/login': typeof LoginRoute
  '/terima': typeof TerimaRoute
  '/undangan': typeof UndanganRoute
  '/perenang': typeof PerenangRoute
  '/event/$id': typeof EventIdRoute
  '/latihan/$id': typeof LatihanIdRoute
  '/perenang/$id': typeof PerenangIdRoute
  '/api/auth/$': typeof ApiAuthSplatRoute
}
export interface FileRoutesByTo {
  '/': typeof IndexRoute
  '/aktivitas': typeof AktivitasRoute
  '/event': typeof EventRoute
  '/latihan': typeof LatihanRoute
  '/login': typeof LoginRoute
  '/terima': typeof TerimaRoute
  '/undangan': typeof UndanganRoute
  '/perenang': typeof PerenangRoute
  '/event/$id': typeof EventIdRoute
  '/latihan/$id': typeof LatihanIdRoute
  '/perenang/$id': typeof PerenangIdRoute
  '/api/auth/$': typeof ApiAuthSplatRoute
}
export interface FileRoutesById {
  __root__: typeof rootRouteImport
  '/': typeof IndexRoute
  '/aktivitas': typeof AktivitasRoute
  '/event': typeof EventRoute
  '/latihan': typeof LatihanRoute
  '/login': typeof LoginRoute
  '/terima': typeof TerimaRoute
  '/undangan': typeof UndanganRoute
  '/perenang': typeof PerenangRoute
  '/event/$id': typeof EventIdRoute
  '/latihan/$id': typeof LatihanIdRoute
  '/perenang/$id': typeof PerenangIdRoute
  '/api/auth/$': typeof ApiAuthSplatRoute
}
export interface FileRouteTypes {
  fileRoutesByFullPath: FileRoutesByFullPath
  fullPaths: '/' | '/aktivitas' | '/event' | '/latihan' | '/login' | '/terima' | '/undangan' | '/perenang' | '/event/$id' | '/latihan/$id' | '/perenang/$id' | '/api/auth/$'
  fileRoutesByTo: FileRoutesByTo
  to: '/' | '/aktivitas' | '/event' | '/latihan' | '/login' | '/terima' | '/undangan' | '/perenang' | '/event/$id' | '/latihan/$id' | '/perenang/$id' | '/api/auth/$'
  id: '__root__' | '/' | '/aktivitas' | '/event' | '/latihan' | '/login' | '/terima' | '/undangan' | '/perenang' | '/event/$id' | '/latihan/$id' | '/perenang/$id' | '/api/auth/$'
  fileRoutesById: FileRoutesById
}
export interface RootRouteChildren {
  IndexRoute: typeof IndexRoute
  AktivitasRoute: typeof AktivitasRoute
  EventRoute: typeof EventRoute
  LatihanRoute: typeof LatihanRoute
  LoginRoute: typeof LoginRoute
  TerimaRoute: typeof TerimaRoute
  UndanganRoute: typeof UndanganRoute
  PerenangRoute: typeof PerenangRoute
  EventIdRoute: typeof EventIdRoute
  LatihanIdRoute: typeof LatihanIdRoute
  PerenangIdRoute: typeof PerenangIdRoute
  ApiAuthSplatRoute: typeof ApiAuthSplatRoute
}

declare module '@tanstack/react-router' {
  interface FileRoutesByPath {
    '/': { id: '/'; path: '/'; fullPath: '/'; preLoaderRoute: typeof IndexRouteImport; parentRoute: typeof rootRouteImport }
    '/aktivitas': { id: '/aktivitas'; path: '/aktivitas'; fullPath: '/aktivitas'; preLoaderRoute: typeof AktivitasRouteImport; parentRoute: typeof rootRouteImport }
    '/event': { id: '/event'; path: '/event'; fullPath: '/event'; preLoaderRoute: typeof EventRouteImport; parentRoute: typeof rootRouteImport }
    '/latihan': { id: '/latihan'; path: '/latihan'; fullPath: '/latihan'; preLoaderRoute: typeof LatihanRouteImport; parentRoute: typeof rootRouteImport }
    '/login': { id: '/login'; path: '/login'; fullPath: '/login'; preLoaderRoute: typeof LoginRouteImport; parentRoute: typeof rootRouteImport }
    '/terima': { id: '/terima'; path: '/terima'; fullPath: '/terima'; preLoaderRoute: typeof TerimaRouteImport; parentRoute: typeof rootRouteImport }
    '/undangan': { id: '/undangan'; path: '/undangan'; fullPath: '/undangan'; preLoaderRoute: typeof UndanganRouteImport; parentRoute: typeof rootRouteImport }
    '/perenang': { id: '/perenang'; path: '/perenang'; fullPath: '/perenang'; preLoaderRoute: typeof PerenangRouteImport; parentRoute: typeof rootRouteImport }
    '/event/$id': { id: '/event/$id'; path: '/event/$id'; fullPath: '/event/$id'; preLoaderRoute: typeof EventIdRouteImport; parentRoute: typeof rootRouteImport }
    '/latihan/$id': { id: '/latihan/$id'; path: '/latihan/$id'; fullPath: '/latihan/$id'; preLoaderRoute: typeof LatihanIdRouteImport; parentRoute: typeof rootRouteImport }
    '/perenang/$id': { id: '/perenang/$id'; path: '/perenang/$id'; fullPath: '/perenang/$id'; preLoaderRoute: typeof PerenangIdRouteImport; parentRoute: typeof rootRouteImport }
    '/api/auth/$': { id: '/api/auth/$'; path: '/api/auth/$'; fullPath: '/api/auth/$'; preLoaderRoute: typeof ApiAuthSplatRouteImport; parentRoute: typeof rootRouteImport }
  }
}

const rootRouteChildren: RootRouteChildren = {
  IndexRoute, AktivitasRoute, EventRoute, LatihanRoute, LoginRoute, TerimaRoute, UndanganRoute,
  PerenangRoute, EventIdRoute, LatihanIdRoute, PerenangIdRoute, ApiAuthSplatRoute,
}
export const routeTree = rootRouteImport._addFileChildren(rootRouteChildren)._addFileTypes<FileRouteTypes>()

import type { getRouter } from './router.tsx'
import type { createStart } from '@tanstack/react-start'
declare module '@tanstack/react-start' {
  interface Register {
    ssr: true
    router: Awaited<ReturnType<typeof getRouter>>
  }
}
