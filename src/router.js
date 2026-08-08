import { ROUTES } from './constants.js';

const VALID = new Set(Object.values(ROUTES));

export class Router {
  constructor(onRoute) {
    this.onRoute = onRoute;
    this.handlePop = this.handlePop.bind(this);
    this.started = false;
  }

  start() {
    if (this.started) return;
    this.started = true;
    window.addEventListener('popstate', this.handlePop);
    this.handlePop();
  }

  stop() {
    if (!this.started) return;
    window.removeEventListener('popstate', this.handlePop);
    this.started = false;
  }

  routeFromLocation() {
    const candidate = new URLSearchParams(window.location.search).get('screen') || ROUTES.HOME;
    return VALID.has(candidate) ? candidate : ROUTES.HOME;
  }

  handlePop() { this.onRoute(this.routeFromLocation()); }

  makeUrl(route) {
    if (!VALID.has(route)) route = ROUTES.HOME;
    const url = new URL(window.location.href);
    if (route === ROUTES.HOME) url.searchParams.delete('screen');
    else url.searchParams.set('screen', route);
    return { route, url };
  }

  go(route) {
    const next = this.makeUrl(route);
    history.pushState({}, '', next.url);
    this.onRoute(next.route);
  }

  replace(route) {
    const next = this.makeUrl(route);
    history.replaceState({}, '', next.url);
    this.onRoute(next.route);
  }
}
