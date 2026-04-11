let installed = false;
let themeObserver: MutationObserver | null = null;
let themeFadeTimer = 0;
let navObserver: MutationObserver | null = null;
let navSyncTimer = 0;

const ACTIVE_NAV_SELECTORS = [
  ".VPSidebarItem .item .link.active",
  ".VPDocAside .outline-link.active",
  ".VPLocalNavOutlineDropdown .outline-link.active",
];

function getScrollTarget(hash: string): HTMLElement | null {
  if (!hash) {
    return null;
  }

  const id = decodeURIComponent(hash.replace(/^#/, ""));
  return document.getElementById(id);
}

function getScrollTop(target: HTMLElement): number {
  const nav = document.querySelector(".VPNav") as HTMLElement | null;
  const navHeight = nav?.offsetHeight ?? 72;
  const rect = target.getBoundingClientRect();
  return window.scrollY + rect.top - navHeight - 20;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function animateScrollTo(top: number): void {
  const start = window.scrollY;
  const distance = top - start;
  const duration = Math.max(
    220,
    Math.min(360, Math.abs(distance) * 0.18),
  );
  const startTime = performance.now();

  const step = (now: number) => {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = easeOutCubic(progress);
    window.scrollTo({
      top: start + distance * eased,
      behavior: "auto",
    });

    if (progress < 1) {
      window.requestAnimationFrame(step);
    }
  };

  window.requestAnimationFrame(step);
}

function handleAnchorClick(event: MouseEvent): void {
  const anchor = (event.target as HTMLElement | null)?.closest(
    'a[href*="#"]',
  ) as HTMLAnchorElement | null;

  if (!anchor) {
    return;
  }

  const url = new URL(anchor.href, window.location.href);
  if (url.pathname !== window.location.pathname || !url.hash) {
    return;
  }

  const target = getScrollTarget(url.hash);
  if (!target) {
    return;
  }

  event.preventDefault();
  history.pushState(null, "", url.hash);
  animateScrollTo(getScrollTop(target));
}

function handleHashNavigation(): void {
  const target = getScrollTarget(window.location.hash);
  if (!target) {
    return;
  }

  window.setTimeout(() => {
    animateScrollTo(getScrollTop(target));
  }, 40);
}

function installThemeFadeBehavior(): void {
  const root = document.documentElement;
  const body = document.body;
  if (!body) {
    return;
  }

  let wasDark = root.classList.contains("dark");

  themeObserver = new MutationObserver(() => {
    const isDark = root.classList.contains("dark");
    if (isDark === wasDark) {
      return;
    }

    window.clearTimeout(themeFadeTimer);
    body.dataset.themeFadeFrom = wasDark ? "dark" : "light";
    body.classList.remove("theme-fading-out");
    body.classList.add("theme-fading");

    window.requestAnimationFrame(() => {
      body.classList.add("theme-fading-out");
    });

    themeFadeTimer = window.setTimeout(() => {
      body.classList.remove("theme-fading", "theme-fading-out");
      delete body.dataset.themeFadeFrom;
    }, 220);

    wasDark = isDark;
  });

  themeObserver.observe(root, {
    attributes: true,
    attributeFilter: ["class"],
  });
}

function getScrollableAncestor(element: HTMLElement): HTMLElement | null {
  let current = element.parentElement;

  while (current && current !== document.body) {
    const style = window.getComputedStyle(current);
    const overflowY = style.overflowY;
    const canScroll =
      /(auto|scroll|overlay)/.test(overflowY) &&
      current.scrollHeight > current.clientHeight + 1;

    if (canScroll) {
      return current;
    }

    current = current.parentElement;
  }

  return null;
}

function scrollActiveItemIntoView(target: HTMLElement): void {
  const container = getScrollableAncestor(target);
  if (!container) {
    return;
  }

  const shouldCenter =
    Boolean(
      target.closest(".VPDocAside, .VPLocalNavOutlineDropdown"),
    ) &&
    !target.closest(".VPSidebar");

  if (shouldCenter) {
    const targetOffsetTop = target.offsetTop - container.offsetTop;
    const desiredTop =
      targetOffsetTop - (container.clientHeight - target.offsetHeight) / 2;
    const maxTop = Math.max(0, container.scrollHeight - container.clientHeight);
    const nextTop = Math.max(0, Math.min(desiredTop, maxTop));

    if (Math.abs(container.scrollTop - nextTop) > 2) {
      container.scrollTo({
        top: nextTop,
        behavior: "smooth",
      });
    }
    return;
  }

  const containerRect = container.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const padding = 24;
  const topDelta = targetRect.top - containerRect.top;
  const bottomDelta = targetRect.bottom - containerRect.bottom;

  if (topDelta < padding) {
    container.scrollTo({
      top: container.scrollTop + topDelta - padding,
      behavior: "smooth",
    });
    return;
  }

  if (bottomDelta > -padding) {
    container.scrollTo({
      top: container.scrollTop + bottomDelta + padding,
      behavior: "smooth",
    });
  }
}

function syncActiveNavItems(): void {
  const seen = new Set<HTMLElement>();

  for (const selector of ACTIVE_NAV_SELECTORS) {
    const activeItems = document.querySelectorAll<HTMLElement>(selector);
    for (const item of activeItems) {
      if (seen.has(item)) {
        continue;
      }
      seen.add(item);
      scrollActiveItemIntoView(item);
    }
  }
}

function scheduleActiveNavSync(delay = 0): void {
  window.clearTimeout(navSyncTimer);
  navSyncTimer = window.setTimeout(() => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        syncActiveNavItems();
      });
    });
  }, delay);
}

function installNavAutoScrollBehavior(): void {
  const originalPushState = history.pushState.bind(history);
  const originalReplaceState = history.replaceState.bind(history);

  history.pushState = function (...args) {
    originalPushState(...args);
    scheduleActiveNavSync(40);
  };

  history.replaceState = function (...args) {
    originalReplaceState(...args);
    scheduleActiveNavSync(40);
  };

  navObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      const target =
        mutation.target instanceof HTMLElement ? mutation.target : null;
      const relevant =
        target?.closest(".VPSidebar, .VPDocAside, .VPLocalNavOutlineDropdown") ||
        (mutation.addedNodes.length > 0
          ? document.querySelector(
              ".VPSidebar, .VPDocAside, .VPLocalNavOutlineDropdown",
            )
          : null);

      if (relevant) {
        scheduleActiveNavSync(0);
        return;
      }
    }
  });

  navObserver.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["class", "aria-current"],
  });

  window.addEventListener("load", () => scheduleActiveNavSync(80), {
    once: true,
  });
  window.addEventListener("hashchange", () => scheduleActiveNavSync(40));
  window.addEventListener("popstate", () => scheduleActiveNavSync(40));
  scheduleActiveNavSync(80);
}

export function installThemeBehavior(): void {
  if (installed) {
    return;
  }

  installed = true;
  document.addEventListener("click", handleAnchorClick, true);
  window.addEventListener("hashchange", handleHashNavigation);
  installThemeFadeBehavior();
  installNavAutoScrollBehavior();
}
