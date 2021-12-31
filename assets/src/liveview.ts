import morphdom from "morphdom"

export interface LiveViewOptions {
  host: string;
  port: number;
  onSocketOpen?: () => void;
  onSocketMessage?: () => void;
  onSocketClose?: () => void;
  onSocketError?: () => void;
}

export function connectAndRun(options: LiveViewOptions) {
  const socket = new WebSocket(`ws://${options.host}:${options.port}/live`)

  var firstConnect = true

  socket.addEventListener("open", () => {
    onOpen(socket)

    if (firstConnect) {
      bindInitialEvents(socket)
    }
  })
}

function onOpen(socket: WebSocket) {
  mountComponents(socket)
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
