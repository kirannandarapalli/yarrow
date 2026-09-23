const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function boot() {
  const opened = [];
  const listeners = [];
  const appended = [];
  function Node() {}
  Node.prototype.appendChild = function (node) {
    appended.push(node);
    const left = node && node.reenter;
    if (left) {
      node.reenter = left - 1;
      this.appendChild({ nodeType: 1, localName: "span", reenter: left - 1 });
    }
    return node;
  };
  Node.prototype.insertBefore = function (node) {
    appended.push(node);
    return node;
  };
  const context = {
    opened,
    listeners,
    appended,
    Node,
    URL,
    location: { href: "https://news.example/story" },
    MutationObserver: class {
      observe() {}
    },
    document: {
      documentElement: { dataset: {} },
      addEventListener() {},
    },
  };
  context.window = context;
  context.open = function nativeOpen(url) {
    opened.push(url);
    return { url };
  };
  context.addEventListener = function (type, fn) {
    listeners.push({ type, fn });
  };
  vm.createContext(context);
  const root = path.join(__dirname, "..");
  vm.runInContext(fs.readFileSync(path.join(root, "shared/blocklist.js"), "utf8"), context);
  vm.runInContext(fs.readFileSync(path.join(root, "shared/match.js"), "utf8"), context);
  vm.runInContext(fs.readFileSync(path.join(root, "content/page.js"), "utf8"), context);
  return context;
}

function element(partial) {
  return Object.assign(
    {
      nodeType: 1,
      closest() {
        return null;
      },
    },
    partial
  );
}

function fire(context, type, target) {
  const listener = context.listeners.find((item) => item.type === type);
  const event = {
    type,
    target,
    key: type === "keydown" ? "Enter" : "",
    defaultPrevented: false,
    preventDefault() {
      event.defaultPrevented = true;
    },
    stopPropagation() {},
  };
  listener.fn(event);
  return event;
}

test("a normal link click does not also open an ad tab", () => {
  const context = boot();
  const link = element({
    href: "https://news.example/next",
    getBoundingClientRect() {
      return { width: 80, height: 20 };
    },
    closest(selector) {
      return selector === "a[href]" ? link : null;
    },
  });
  fire(context, "click", link);
  const blocked = context.open("https://doubleclick.net/aclk");
  assert.equal(context.opened.includes("https://doubleclick.net/aclk"), false);
  assert.equal(typeof blocked.document.write, "function");
  const booking = context.open("https://partner.example/booking");
  assert.equal(booking.url, "https://partner.example/booking");
});

test("a button inside a modal can open the page it points to", () => {
  const context = boot();
  context.getComputedStyle = () => ({ display: "block", visibility: "visible", opacity: "1" });
  const dialog = element({
    getBoundingClientRect() {
      return { width: 480, height: 320 };
    },
  });
  const button = element({
    getBoundingClientRect() {
      return { width: 120, height: 40 };
    },
    closest(selector) {
      if (selector.includes("button") || selector.includes("role='button'")) return button;
      if (selector.includes("dialog")) return dialog;
      return null;
    },
  });
  const event = fire(context, "click", button);
  assert.equal(event.defaultPrevented, false);
  const popup = context.open("https://partner.example/checkout");
  assert.equal(popup.url, "https://partner.example/checkout");
});

test("a button can still open a real popup", () => {
  const context = boot();
  const button = element({
    closest(selector) {
      return selector.includes("button") ? button : null;
    },
  });
  fire(context, "click", button);
  const popup = context.open("https://accounts.google.com/o/oauth2/v2/auth");
  assert.equal(popup.url, "https://accounts.google.com/o/oauth2/v2/auth");
  assert.deepEqual(context.opened, ["https://accounts.google.com/o/oauth2/v2/auth"]);
});

test("a visible new-tab link is left alone", () => {
  const context = boot();
  context.getComputedStyle = (node) =>
    node.displayContents
      ? { display: "contents", visibility: "visible", opacity: "1" }
      : { display: "block", visibility: "visible", opacity: "1" };
  const child = element({
    getBoundingClientRect() {
      return { width: 120, height: 24 };
    },
  });
  const link = element({
    href: "https://partner.example/story",
    target: "_blank",
    displayContents: true,
    children: [child],
    getBoundingClientRect() {
      return { width: 0, height: 0 };
    },
    closest(selector) {
      return selector === "a[href]" ? link : null;
    },
  });
  const event = fire(context, "click", link);
  assert.equal(event.defaultPrevented, false);
  const popup = context.open("https://partner.example/story?ref=home");
  assert.equal(popup.url, "https://partner.example/story?ref=home");
  const blank = context.open("about:blank");
  assert.equal(blank.url, "about:blank");
});

test("pressing down on a link does not cancel the click that opens a tab", () => {
  const context = boot();
  context.getComputedStyle = () => ({ display: "block", visibility: "visible", opacity: "1" });
  const link = element({
    href: "https://mietwagenvergleich.check24.de/jump-in/offer/1",
    children: [],
    getBoundingClientRect() {
      return { width: 195, height: 50 };
    },
    closest(selector) {
      return selector === "a[href]" ? link : null;
    },
  });
  const down = fire(context, "pointerdown", link);
  assert.equal(down.defaultPrevented, false);
  const popup = context.open("about:blank");
  assert.equal(popup.url, "about:blank");
});

test("a hidden new-tab anchor is still blocked", () => {
  const context = boot();
  context.getComputedStyle = () => ({ display: "block", visibility: "visible", opacity: "1" });
  const link = element({
    href: "https://sponsor.example/offer",
    target: "_blank",
    children: [],
    getBoundingClientRect() {
      return { width: 1, height: 1 };
    },
    closest(selector) {
      return selector === "a[href]" ? link : null;
    },
  });
  const event = fire(context, "click", link);
  assert.equal(event.defaultPrevented, true);
  const blocked = context.open("about:blank");
  assert.equal(context.opened.includes("about:blank"), false);
  assert.equal(typeof blocked.document.write, "function");
});

test("ad links do not navigate", () => {
  const context = boot();
  const link = element({
    href: "https://doubleclick.net/aclk",
    closest(selector) {
      return selector === "a[href]" ? link : null;
    },
  });
  const event = fire(context, "click", link);
  assert.equal(event.defaultPrevented, true);
  assert.equal(context.opened.includes("https://doubleclick.net/aclk"), false);
});

test("a click that the page cannot describe does not throw", () => {
  const context = boot();
  const link = element({
    closest() {
      throw new Error("bad closest");
    },
  });
  assert.doesNotThrow(() => fire(context, "click", link));
});

test("a nested append still inserts every node", () => {
  const context = boot();
  const parent = new context.Node();
  const child = { nodeType: 1, localName: "div", reenter: 5 };
  assert.equal(parent.appendChild(child), child);
  assert.equal(context.appended.length, 6);
});

test("appending a normal node still works, and a broken node does not throw", () => {
  const context = boot();
  const parent = new context.Node();
  const child = { nodeType: 1, localName: "div" };
  assert.equal(parent.appendChild(child), child);
  const broken = {
    nodeType: 1,
    get localName() {
      throw new Error("bad node");
    },
  };
  assert.equal(parent.appendChild(broken), broken);
  assert.deepEqual(context.appended, [child, broken]);
});

test("a pop script is not inserted into the page", () => {
  const context = boot();
  const parent = new context.Node();
  const script = {
    nodeType: 1,
    localName: "script",
    getAttribute(name) {
      return name === "src" ? "https://oo.iniquegearbox.com/rOQrKsD3puWAnFY/140399" : null;
    },
  };
  assert.equal(parent.appendChild(script), script);
  assert.deepEqual(context.appended, []);
});

test("turning the blocker off lets the ad through", () => {
  const context = boot();
  context.document.documentElement.dataset.blockee = "off";
  const link = element({
    href: "https://news.example/next",
    closest(selector) {
      return selector === "a[href]" ? link : null;
    },
  });
  fire(context, "click", link);
  const popup = context.open("https://popads.net/show");
  assert.equal(popup.url, "https://popads.net/show");
});
