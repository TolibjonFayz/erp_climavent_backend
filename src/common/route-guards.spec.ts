import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';

// Har bir API route'da guard bo'lishi shart. 2026-10 da partners, audit-logs, come-and-goes
// va location-videos login'siz ochiq qolib ketgan edi — yangi endpoint guard'siz qo'shilsa,
// shu test yiqiladi. Ataylab ochiq route'lar faqat shu ro'yxatda.
// refresh/logout o'zi refresh token'ni tekshiradi (access token muddati o'tgan bo'ladi)
const PUBLIC_ROUTES = new Set(['POST users/login', 'POST users/refresh', 'POST users/logout']);

function controllerFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return controllerFiles(full);
    return e.name.endsWith('.controller.ts') ? [full] : [];
  });
}

const join = (...parts: unknown[]) =>
  parts
    .map((p) => String(p ?? '').replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/');

function collectRoutes() {
  const routes: { route: string; guarded: boolean }[] = [];
  for (const file of controllerFiles(path.join(__dirname, '..'))) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(file);
    for (const cls of Object.values(mod) as any[]) {
      if (typeof cls !== 'function' || Reflect.getMetadata(PATH_METADATA, cls) === undefined) continue;
      const base = Reflect.getMetadata(PATH_METADATA, cls);
      const classGuards = Reflect.getMetadata(GUARDS_METADATA, cls) || [];
      for (const name of Object.getOwnPropertyNames(cls.prototype)) {
        const handler = cls.prototype[name];
        if (name === 'constructor' || typeof handler !== 'function') continue;
        const method = Reflect.getMetadata(METHOD_METADATA, handler);
        if (method === undefined) continue;
        const methodGuards = Reflect.getMetadata(GUARDS_METADATA, handler) || [];
        routes.push({
          route: `${RequestMethod[method]} ${join(base, Reflect.getMetadata(PATH_METADATA, handler))}`,
          guarded: classGuards.length + methodGuards.length > 0,
        });
      }
    }
  }
  return routes;
}

describe('API route guards', () => {
  const routes = collectRoutes();

  it('controllerlar topildi', () => {
    expect(routes.length).toBeGreaterThan(50);
  });

  it("guard'siz route faqat ataylab ochiq ro'yxatda", () => {
    const open = routes.filter((r) => !r.guarded).map((r) => r.route);
    expect(open.filter((r) => !PUBLIC_ROUTES.has(r))).toEqual([]);
  });

  it("ochiq ro'yxatdagi route'lar haqiqatan mavjud (eskirgan yozuv qolmasin)", () => {
    const all = new Set(routes.map((r) => r.route));
    for (const r of PUBLIC_ROUTES) expect(all.has(r)).toBe(true);
  });
});
