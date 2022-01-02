import morphdom from "morphdom"

export interface LiveViewOptions {
  host: string;
  port: number;
  onSocketOpen?: () => void;
  // onSocketMessage?: () => void;
  onSocketClose?: () => void;
  onSocketError?: () => void;
  onClosedForGood?: () => void;
}

interface ConnectState {
  firstConnect: boolean;
  closedForGood: boolean;
}

interface ViewStates {
  [index: string]: ViewState;
}

interface ViewState {
  [index: string | number]: string | string[] | null | ViewState;
}

export function connectAndRun(options: LiveViewOptions) {
  var connectState = {
    firstConnect: true,
    closedForGood: false,
  }

  doConnectAndRun(options, connectState)
}

function doConnectAndRun(options: LiveViewOptions, connectState: ConnectState) {
  const socket = new WebSocket(`ws://${options.host}:${options.port}/live`)

  const viewStates = {}

  socket.addEventListener("open", () => {
    onOpen(socket, connectState, options)
  })

  socket.addEventListener("message", (event) => {
    onMessage(socket, event, connectState, options, viewStates)
  })

  socket.addEventListener("close", () => {
    onClose(socket, connectState, options)
  })

  socket.addEventListener("error", () => {
    onError(socket, connectState, options)
  })
}

function onOpen(socket: WebSocket, connectState: ConnectState, options: LiveViewOptions) {
  options.onSocketOpen?.()
  mountComponents(socket)

  if (connectState.firstConnect) {
    bindInitialEvents(socket)
  }
}

interface HealthPing { t: "h" }
interface InitialRender { t: "i", i: string, d: ViewState }
interface Rendered { t: "r", i: string, d: ViewState }
interface JsCommand { t: "j", i: string, d: JsCommandData[] }
interface LiveViewGone { t: "liveview-gone", i: string }

type Msg = HealthPing | InitialRender | Rendered | JsCommand | LiveViewGone

interface JsCommandData { delay_ms: number | null, kind: JsCommandKind }

function onMessage(socket: WebSocket, event: MessageEvent, connectState: ConnectState, options: LiveViewOptions, viewStates: ViewStates) {
  const payload: Msg = JSON.parse(event.data)

  if (payload.t === "h") {
    socket.send(JSON.stringify({ "h": "ok" }))

  } else if (payload.t === "i") {
    // initial-render

    const liveviewId = payload.i
    const data = payload.d
    const element = document.querySelector(`[data-liveview-id="${liveviewId}"]`)
    if (!element) { throw "Element not found" }
    const html = buildHtmlFromState(data)
    updateDom(socket, element, html)
    viewStates[liveviewId] = data

  } else if (payload.t === "r") {
    // rendered
    const liveviewId = payload.i
    const diff = payload.d
    const element = document.querySelector(`[data-liveview-id="${liveviewId}"]`)
    if (!element) { throw "Element not found" }

    const state = viewStates[liveviewId]
    if (!state) { throw "No liveview state found" }
    patchViewState(state, diff)

    var newState = viewStates[liveviewId]
    if (!newState) { throw "state not found after merging" }
    const html = buildHtmlFromState(newState)
    updateDom(socket, element, html)

  } else if (payload.t === "j") {
    // js-command
    payload.d.forEach((cmd) => {
      handleJsCommand(cmd)
    })
    // handleJsCommand(data)

  } else if (payload.t === "liveview-gone") {
    // liveview-gone
    const liveviewId = payload.i
    console.error(
      `Something went wrong on the server and liveview ${liveviewId} is gone`
    )
    socket.close()
    connectState.closedForGood = true

  } else {
    const _: never = payload
  }
}

function onClose(socket: WebSocket, connectState: ConnectState, options: LiveViewOptions) {
  options.onSocketClose?.()
  reconnect(socket, connectState, options)
}

function onError(socket: WebSocket, connectState: ConnectState, options: LiveViewOptions) {
  options.onSocketError?.()
}

function reconnect(socket: WebSocket, connectState: ConnectState, options: LiveViewOptions) {
  if (connectState.closedForGood) {
    options.onClosedForGood?.()
    return;
  }

  connectState.firstConnect = false
  setTimeout(() => {
    doConnectAndRun(options, connectState)
  }, 1000)
}

function socketSend(socket: WebSocket, liveviewId: string, topic: string, data: object) {
  let msg = [liveviewId, topic, data]
  socket.send(JSON.stringify(msg))
}

function mountComponents(socket: WebSocket) {
  const liveviewIdAttr = "data-liveview-id"

  document.querySelectorAll(`[${liveviewIdAttr}]`).forEach((component) => {
    const liveviewId = component.getAttribute(liveviewIdAttr)

    if (liveviewId) {
      socketSend(socket, liveviewId, "axum/mount-liveview", {})
    }
  })
}

function bindInitialEvents(socket: WebSocket) {
  var elements = new Set()
  for (let def of elementLocalAttrs) {
    document.querySelectorAll(`[${def.attr}]`).forEach((el) => {
      if (!elements.has(el)) {
        addEventListeners(socket, el)
      }
      elements.add(el)
    })
  }

  for (let def of windowAttrs) {
    document.querySelectorAll(`[${def.attr}]`).forEach((el) => {
        bindLiveEvent(socket, el, def)
    })
  }
}

function addEventListeners(socket: WebSocket, element: Element) {
    const defs = elementLocalAttrs

  for (let def of elementLocalAttrs) {
    bindLiveEvent(socket, element, def)
  }
}

interface EventData {
  e: string;
  m?: JSON | string;
  v?: FormData | InputValue;
  cx?: number;
  cy?: number;
  px?: number;
  py?: number;
  ox?: number;
  oy?: number;
  mx?: number;
  my?: number;
  sx?: number;
  sy?: number;
  k?: string;
  kc?: string;
  a?: boolean;
  c?: boolean;
  s?: boolean;
  me?: boolean;
}

function bindLiveEvent(
  socket: WebSocket,
  element: Element,
  { attr, eventName, bindEventTo }: AttrDef,
) {
  var actualBindEventTo: Element | typeof window = bindEventTo || element

  if (!element.getAttribute?.(attr)) {
    return;
  }

  var f = (event: Event) => {
    let liveviewId = element.closest("[data-liveview-id]")?.getAttribute("data-liveview-id")
    if (!liveviewId) return
    let msg = element.getAttribute(attr)
    if (!msg) return

    var data: EventData = { e: eventName };

    try {
      data.m = JSON.parse(msg);
    } catch {
      data.m = msg;
    }

    if (element.nodeName === "FORM") {
      data.v = serializeForm(element)
    } else {
      const value = inputValue(element)
      if (value) {
        data.v = value
      }
    }

    if (event instanceof MouseEvent) {
      data.cx = event.clientX
      data.cy = event.clientY
      data.px = event.pageX
      data.py = event.pageY
      data.ox = event.offsetX
      data.oy = event.offsetY
      data.mx = event.movementX
      data.my = event.movementY
      data.sx = event.screenX
      data.sy = event.screenY
    }

    if (event instanceof KeyboardEvent) {
      if (
        element.hasAttribute("axm-key") &&
        element?.getAttribute("axm-key")?.toLowerCase() !== event.key.toLowerCase()
      ) {
        return;
      }

      data.k = event.key
      data.kc = event.code
      data.a = event.altKey
      data.c = event.ctrlKey
      data.s = event.shiftKey
      data.me = event.metaKey
    }

    socketSend(socket, liveviewId, `axum/${attr}`, data)
  }

  var delayMs = numberAttr(element, "axm-debounce")
  if (delayMs) {
    f = debounce(f, delayMs)
  }

  var delayMs = numberAttr(element, "axm-throttle")
  if (delayMs) {
    f = throttle(f, delayMs)
  }

  actualBindEventTo.addEventListener(eventName, (event) => {
    if (!(event instanceof KeyboardEvent)) {
      event.preventDefault()
    }
    f(event)
  })
}

interface AttrDef { attr: string; eventName: string; bindEventTo?: typeof window }

const elementLocalAttrs: AttrDef[] = [
  { attr: "axm-click", eventName: "click" },
  { attr: "axm-input", eventName: "input" },
  { attr: "axm-blur", eventName: "blur" },
  { attr: "axm-focus", eventName: "focus" },
  { attr: "axm-change", eventName: "change" },
  { attr: "axm-submit", eventName: "submit" },
  { attr: "axm-keydown", eventName: "keydown" },
  { attr: "axm-keyup", eventName: "keyup" },
  { attr: "axm-mouseenter", eventName: "mouseenter" },
  { attr: "axm-mouseover", eventName: "mouseover" },
  { attr: "axm-mouseleave", eventName: "mouseleave" },
  { attr: "axm-mouseout", eventName: "mouseout" },
  { attr: "axm-mousemove", eventName: "mousemove" },
]

const windowAttrs: AttrDef[] = [
  { attr: "axm-window-keydown", eventName: "keydown", bindEventTo: window },
  { attr: "axm-window-keyup", eventName: "keyup", bindEventTo: window },
  { attr: "axm-window-focus", eventName: "focus", bindEventTo: window },
  { attr: "axm-window-blur", eventName: "blur", bindEventTo: window },
]

interface FormData {
  [index: string]: any;
}

function serializeForm(element: Element): FormData {
  var formData: FormData = {}

  element.querySelectorAll("textarea").forEach((child) => {
    const name = child.getAttribute("name")
    if (!name) { return }

    formData[name] = child.value
  })

  element.querySelectorAll("input").forEach((child) => {
    const name = child.getAttribute("name")
    if (!name) { return }

    if (child.getAttribute("type") === "radio") {
      if (child.checked) {
        formData[name] = child.value
      }
    } else if (child.getAttribute("type") === "checkbox") {
      if (!formData[name]) {
        formData[name] = {}
      }
      formData[name][child.value] = child.checked
    } else {
      formData[name] = child.value
    }
  })

  element.querySelectorAll("select").forEach((child) => {
    const name = child.getAttribute("name")
    if (!name) return

      if (child.hasAttribute("multiple")) {
        const values = Array.from(child.selectedOptions).map((opt) => opt.value)
        formData[name] = values
      } else {
        formData[name] = child.value
      }
  })

  return formData
}

type InputValue = string | string[] | boolean

function inputValue(element: Element): InputValue | null {
  if (element instanceof HTMLTextAreaElement) {
    return element.value

  } else if (element instanceof HTMLInputElement) {
    if (element.getAttribute("type") === "radio" || element.getAttribute("type") === "checkbox") {
      return element.checked
    } else {
      return element.value
    }

  } else if (element instanceof HTMLSelectElement) {
    if (element.hasAttribute("multiple")) {
      return Array.from(element.selectedOptions).map((opt) => opt.value)
    } else {
      return element.value
    }

  } else {
    return null
  }
}

function numberAttr(element: Element, attr: string): number | null {
  const value = element.getAttribute(attr)
  if (value) {
    const number = parseInt(value, 10)
    if (number) {
      return number
    }
  }
  return null
}

type Fn<
  In extends unknown[],
> = (...args: In) => void;

function debounce<In extends unknown[]>(f: Fn<In>, delayMs: number): Fn<In> {
  var timeout: number
  return (...args) => {
    if (timeout) {
      clearTimeout(timeout)
    }

    timeout = setTimeout(() => {
      f(...args)
    }, delayMs)
  }
}

function throttle<In extends unknown[]>(f: Fn<In>, delayMs: number): Fn<In> {
  var timeout: number | null
  return (...args) => {
    if (timeout) {
      return
    } else {
      f(...args)
      timeout = setTimeout(() => {
        timeout = null
      }, delayMs)
    }
  }
}

const fixed = "f";

function buildHtmlFromState(state: ViewState): string {
    var combined = ""

    const f = state[fixed]
    if (!Array.isArray(f)) {
      throw "fixed is not an array"
    }

    f.forEach((value, i) => {
      combined = combined.concat(value)
      const variable = state[i]

      if (variable === undefined || variable === null) {
        return
      }

      if (typeof variable === "string") {
        combined = combined.concat(variable)

      } else if (Array.isArray(variable)) {
        throw "wat"

      } else {
        combined = combined.concat(buildHtmlFromState(variable))
      }
    })

    return combined
}

function updateDom(socket: WebSocket, element: Element, html: string) {
    morphdom(element, html, {
        onNodeAdded: (node) => {
          if (node instanceof Element) {
            addEventListeners(socket, node)
          }
          return node
        },
        onBeforeElUpdated: (fromEl, toEl) => {
          const tag = toEl.tagName

          if (fromEl instanceof HTMLInputElement && toEl instanceof HTMLInputElement) {
            if (toEl.getAttribute("type") === "radio" || toEl.getAttribute("type") === "checkbox") {
              toEl.checked = fromEl.checked;
            } else {
              toEl.value = fromEl.value;
            }
          }

          if (fromEl instanceof HTMLTextAreaElement && toEl instanceof HTMLTextAreaElement) {
            toEl.value = fromEl.value;
          }

          if (fromEl instanceof HTMLOptionElement && toEl instanceof HTMLOptionElement) {
            if (toEl.closest("select")?.hasAttribute("multiple")) {
              toEl.selected = fromEl.selected
            }
          }

          if (fromEl instanceof HTMLSelectElement && toEl instanceof HTMLSelectElement && !toEl.hasAttribute("multiple")) {
            toEl.value = fromEl.value
          }

          return true
        },
    })
}

function patchViewState(state: ViewState, diff: ViewState) {
  for (const [key, val] of Object.entries(diff)) {
    if (typeof val === "string" || Array.isArray(val)) {
      state[key] = val

    } else if (val === null) {
      delete state[key]

    } else if (typeof val === "object") {
      const nestedState = state[key]
      if (typeof nestedState === "object" && !Array.isArray(nestedState) && nestedState !== null) {
        patchViewState(nestedState, val)
      }

    } else {
      const _: never = val
    }
  }
}

type JsCommandKind =
  { AddClass: { selector: string, klass: string } }
  | { RemoveClass: { selector: string, klass: string } }
  | { ToggleClass: { selector: string, klass: string } }
  | { NavigateTo: { uri: string } }
  | { ClearValue: { selector: string } }
  | { SetTitle: { title: string } }
  | { HistoryPushState: { uri: string } }

function handleJsCommand(cmd: JsCommandData) {
  const run = () => {
    if ("AddClass" in cmd.kind) {
      const { selector, klass } = cmd.kind.AddClass
      document.querySelectorAll(selector).forEach((element) => {
        element.classList.add(klass)
      })

    } else if ("RemoveClass" in cmd.kind) {
      const { selector, klass } = cmd.kind.RemoveClass
      document.querySelectorAll(selector).forEach((element) => {
        element.classList.remove(klass)
      })

    } else if ("ToggleClass" in cmd.kind) {
      const { selector, klass } = cmd.kind.ToggleClass
      document.querySelectorAll(selector).forEach((element) => {
        element.classList.toggle(klass)
      })

    } else if ("NavigateTo" in cmd.kind) {
      const { uri } = cmd.kind.NavigateTo
      if (uri.startsWith("http")) {
        window.location.href = uri
      } else {
        window.location.pathname = uri
      }

    } else if ("ClearValue" in cmd.kind) {
      const { selector } = cmd.kind.ClearValue
      document.querySelectorAll(selector).forEach((element) => {
        if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) {
          element.value = ""
        }
      })

    } else if ("SetTitle" in cmd.kind) {
      document.title = cmd.kind.SetTitle.title

    } else if ("HistoryPushState" in cmd.kind) {
      window.history.pushState({}, "", cmd.kind.HistoryPushState.uri);

    } else {
      const _: never = cmd.kind
    }
  }

  if (cmd.delay_ms) {
    setTimeout(run, cmd.delay_ms)
  } else {
    run()
  }
}
