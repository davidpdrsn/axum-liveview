use crate::life_cycle::{self, MessageFromSocketData};

#[derive(Debug, Clone)]
#[non_exhaustive]
pub enum EventData {
    FormSubmit(FormSubmit),
    FormChange(FormChange),
    InputChange(InputChange),
    InputFocus(InputFocus),
    InputBlur(InputBlur),
    Key(Key),
    Mouse(Mouse),
    Scroll(Scroll),
}

impl From<MessageFromSocketData> for Option<EventData> {
    fn from(data: MessageFromSocketData) -> Self {
        match data {
            MessageFromSocketData::Click
            | MessageFromSocketData::WindowFocus
            | MessageFromSocketData::WindowBlur
            | MessageFromSocketData::None => None,
            MessageFromSocketData::FormSubmit { query } => {
                Some(EventData::FormSubmit(FormSubmit { query }))
            }
            MessageFromSocketData::FormChange { query } => {
                Some(EventData::FormChange(FormChange { query }))
            }
            MessageFromSocketData::InputFocus { value } => {
                Some(EventData::InputFocus(InputFocus { value }))
            }
            MessageFromSocketData::InputBlur { value } => {
                Some(EventData::InputBlur(InputBlur { value }))
            }
            MessageFromSocketData::InputChange { value } => {
                let value = match value {
                    life_cycle::InputValue::Bool(x) => InputChange::Bool(x),
                    life_cycle::InputValue::String(x) => InputChange::String(x),
                    life_cycle::InputValue::Strings(x) => InputChange::Strings(x),
                };
                Some(EventData::InputChange(value))
            }
            MessageFromSocketData::Key {
                key,
                code,
                alt,
                ctrl,
                shift,
                meta,
            } => Some(EventData::Key(Key {
                key,
                code,
                alt,
                ctrl,
                shift,
                meta,
            })),
            MessageFromSocketData::Mouse {
                client_x,
                client_y,
                page_x,
                page_y,
                offset_x,
                offset_y,
                movement_x,
                movement_y,
                screen_x,
                screen_y,
            } => Some(EventData::Mouse(Mouse {
                client_x,
                client_y,
                page_x,
                page_y,
                offset_x,
                offset_y,
                movement_x,
                movement_y,
                screen_x,
                screen_y,
            })),
            MessageFromSocketData::Scroll { scroll_x, scroll_y } => {
                Some(EventData::Scroll(Scroll { scroll_x, scroll_y }))
            }
        }
    }
}

#[derive(Debug, Clone)]
pub struct FormSubmit {
    query: String,
}

impl FormSubmit {
    pub fn query(&self) -> &str {
        &self.query
    }
}

#[derive(Debug, Clone)]
pub struct FormChange {
    query: String,
}

impl FormChange {
    pub fn query(&self) -> &str {
        &self.query
    }
}

#[derive(Debug, Clone)]
pub struct InputFocus {
    value: String,
}

impl InputFocus {
    pub fn value(&self) -> &str {
        &self.value
    }
}

#[derive(Debug, Clone)]
pub struct InputBlur {
    value: String,
}

impl InputBlur {
    pub fn value(&self) -> &str {
        &self.value
    }
}

#[derive(Clone, Debug)]
pub enum InputChange {
    Bool(bool),
    String(String),
    Strings(Vec<String>),
}

#[derive(Debug, Clone)]
pub struct Key {
    key: String,
    code: String,
    alt: bool,
    ctrl: bool,
    shift: bool,
    meta: bool,
}

impl Key {
    pub fn key(&self) -> &str {
        &self.key
    }

    pub fn code(&self) -> &str {
        &self.code
    }

    pub fn alt(&self) -> bool {
        self.alt
    }

    pub fn ctrl(&self) -> bool {
        self.ctrl
    }

    pub fn shift(&self) -> bool {
        self.shift
    }

    pub fn meta(&self) -> bool {
        self.meta
    }
}

#[derive(Debug, Clone)]
pub struct Mouse {
    client_x: f64,
    client_y: f64,
    page_x: f64,
    page_y: f64,
    offset_x: f64,
    offset_y: f64,
    movement_x: f64,
    movement_y: f64,
    screen_x: f64,
    screen_y: f64,
}

impl Mouse {
    pub fn client_x(&self) -> f64 {
        self.client_x
    }

    pub fn client_y(&self) -> f64 {
        self.client_y
    }

    pub fn page_x(&self) -> f64 {
        self.page_x
    }

    pub fn page_y(&self) -> f64 {
        self.page_y
    }

    pub fn offset_x(&self) -> f64 {
        self.offset_x
    }

    pub fn offset_y(&self) -> f64 {
        self.offset_y
    }

    pub fn movement_x(&self) -> f64 {
        self.movement_x
    }

    pub fn movement_y(&self) -> f64 {
        self.movement_y
    }

    pub fn screen_x(&self) -> f64 {
        self.screen_x
    }

    pub fn screen_y(&self) -> f64 {
        self.screen_y
    }
}

#[derive(Debug, Clone)]
pub struct Scroll {
    scroll_x: f64,
    scroll_y: f64,
}

impl Scroll {
    pub fn scroll_x(&self) -> f64 {
        self.scroll_x
    }

    pub fn scroll_y(&self) -> f64 {
        self.scroll_y
    }
}
