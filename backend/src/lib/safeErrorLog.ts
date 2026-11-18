// Turns a caught error into one log line that carries no user data.
//
// pg errors carry `detail` ("Key (email)=(a@b.c) already exists."), `where`,
// and Drizzle wraps them in a DrizzleQueryError whose message (and therefore
// stack) holds the SQL text and every bound parameter. None of that may reach
// the logs. What is kept: the error name, the pg code / constraint / table /
// column / routine, the message with quoted values, e-mail addresses and URLs
// replaced, and the stack frames without the message.

const MAX_MESSAGE = 300;
const MAX_FRAMES = 8;

type ErrLike = {
  name?: unknown;
  message?: unknown;
  stack?: unknown;
  code?: unknown;
  constraint?: unknown;
  table?: unknown;
  column?: unknown;
  routine?: unknown;
  cause?: unknown;
};

function isObject(v: unknown): v is ErrLike {
  return typeof v === "object" && v !== null;
}

// Values that may come from users: quoted strings, `(col)=(value)` pairs,
// e-mail addresses and anything URL-shaped (connection strings included).
export function redactText(text: string, max = MAX_MESSAGE): string {
  // Cut before the regexes run, so a huge message can't make them slow.
  const out = text
    .slice(0, max * 4)
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, "<url>")
    .replace(/\([^()]*\)=\([^()]*\)/g, "(…)=(…)")
    .replace(/"[^"]*"/g, '"…"')
    .replace(/'[^']*'/g, "'…'")
    .replace(/[^\s@"'<>()[\]{},;:]+@[^\s@"'<>()[\]{},;:]+\.[a-z]{2,}/gi, "<email>")
    .replace(/\s+/g, " ")
    .trim();
  return out.length > max ? `${out.slice(0, max)}…` : out;
}

// Only the "    at fn (file:line:col)" lines: the first line(s) of a stack
// repeat the message, which is exactly what must not be logged. A frame must
// also end like one (file:line:col, <anonymous> or native), so a value inside
// the message that happens to contain "\n    at " is not taken for a frame.
const FRAME = /^\s+at\s.*(?::\d+:\d+\)?|<anonymous>\)?|native\)?)$/;

export function stackFrames(stack: unknown, max = MAX_FRAMES): string[] {
  if (typeof stack !== "string") return [];
  // No cut here: in a DrizzleQueryError the frames follow a message that can be
  // hundreds of kB (bulk insert SQL + params); lines that do not start with
  // "  at " fail the regex at once, so this stays linear.
  return stack
    .split("\n")
    .filter((l) => FRAME.test(l))
    .slice(0, max)
    .map((l) => redactText(l.trim(), 200));
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v !== "" ? v : undefined;
}

// The innermost error that looks like a pg DatabaseError (has a string SQLSTATE code).
function findPgError(err: ErrLike): ErrLike | undefined {
  let cur: unknown = err;
  for (let i = 0; i < 5 && isObject(cur); i++) {
    if (typeof cur.code === "string" && /^[0-9A-Z]{5}$/.test(cur.code)) return cur;
    cur = cur.cause;
  }
  return undefined;
}

// DrizzleQueryError does not set `name`, so it is recognised by its class name
// or by the `query` / `params` fields it adds.
function isDrizzleQueryError(err: ErrLike): boolean {
  return err.constructor?.name === "DrizzleQueryError" || ("query" in err && "params" in err);
}

export function describeError(err: unknown): string {
  if (!isObject(err)) return `non-error value (${typeof err})`;

  const drizzleQuery = isDrizzleQueryError(err);
  const ownName = str(err.name);
  const name = drizzleQuery ? "DrizzleQueryError" : ownName ?? err.constructor?.name ?? "Error";
  const pg = findPgError(err);
  const parts = [`name=${name}`];

  if (pg) {
    for (const key of ["code", "constraint", "table", "column", "routine"] as const) {
      const v = str(pg[key]);
      if (v) parts.push(`${key}=${redactText(v, 80)}`);
    }
  }

  // A DrizzleQueryError's own message is "Failed query: <sql> params: <values>";
  // the useful text is the cause's message.
  const source: ErrLike | undefined = pg ?? (drizzleQuery ? (isObject(err.cause) ? err.cause : undefined) : err);
  const message = source ? str(source.message) : undefined;
  if (message) parts.push(`message=${redactText(message)}`);

  const frames = stackFrames(err.stack);
  return frames.length ? `${parts.join(" ")}\n    ${frames.join("\n    ")}` : parts.join(" ");
}
