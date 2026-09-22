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
    closest(selector) {
      return selector === "a[href]" ? link : null;
    },
  });
  fire(context, "click", link);
  const popup = context.open("https://unknown-sponsor.test/landing");
  assert.equal(popup, null);
  assert.deepEqual(context.opened, []);
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
  assert.equal(context.open("https://doubleclick.net/aclk"), null);
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
