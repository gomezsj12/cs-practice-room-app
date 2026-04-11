import { Fragment, type ReactNode } from "react";

const linkClassName =
  "inline text-sky-400 text-sm leading-5 underline decoration-sky-400/80 underline-offset-2 [text-underline-position:from-font] hover:text-sky-300 focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500";

type MatchKind = "telegram" | "email" | "phone";

type TextMatch = {
  start: number;
  end: number;
  kind: MatchKind;
  raw: string;
  telegramUser?: string;
};

function normalizeTelegramHref(raw: string): string {
  const m = raw.match(/t\.me\/([a-zA-Z0-9_]+)/i);
  return m ? `https://t.me/${m[1]}` : raw;
}

function phoneDigits(display: string): string {
  return display.replace(/\D/g, "");
}

function looksLikePhoneToken(s: string): boolean {
  const digits = phoneDigits(s);
  if (digits.length < 10 || digits.length > 15) {
    return false;
  }
  return /^[\d\s+().-]+$/.test(s.trim());
}

/** Whole line is a phone number (Fillout contact block layout). */
function isPhoneOnlyLine(line: string): boolean {
  return looksLikePhoneToken(line.trim());
}

function collectMatches(line: string): TextMatch[] {
  const found: TextMatch[] = [];

  const tgRe = /https?:\/\/(?:www\.)?t\.me\/([a-zA-Z0-9_]+)\/?/gi;
  let m: RegExpExecArray | null;
  while ((m = tgRe.exec(line)) !== null) {
    found.push({
      start: m.index,
      end: m.index + m[0].length,
      kind: "telegram",
      raw: m[0],
      telegramUser: m[1],
    });
  }

  const emailRe = /[a-zA-Z0-9._+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  while ((m = emailRe.exec(line)) !== null) {
    found.push({
      start: m.index,
      end: m.index + m[0].length,
      kind: "email",
      raw: m[0],
    });
  }

  const phoneRe =
    /(?:\+\d{1,3}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}\b|\b\d{10}\b|\b\+?\d[\d().\s-]{8,14}\d\b/g;
  while ((m = phoneRe.exec(line)) !== null) {
    if (looksLikePhoneToken(m[0])) {
      found.push({
        start: m.index,
        end: m.index + m[0].length,
        kind: "phone",
        raw: m[0],
      });
    }
  }

  found.sort((a, b) => a.start - b.start);

  const merged: TextMatch[] = [];
  let lastEnd = -1;
  for (const item of found) {
    if (item.start >= lastEnd) {
      merged.push(item);
      lastEnd = item.end;
    }
  }
  return merged;
}

function PhoneLink({ display }: { display: string }) {
  const href = `tel:${phoneDigits(display)}`;
  return (
    <>
      <a href={href} className={`${linkClassName} sm:hidden`}>
        {display}
      </a>
      <span className="hidden text-sm leading-5 sm:inline">{display}</span>
    </>
  );
}

function renderMatch(match: TextMatch, key: string): ReactNode {
  if (match.kind === "telegram" && match.telegramUser) {
    return (
      <a
        key={key}
        href={normalizeTelegramHref(match.raw)}
        target="_blank"
        rel="noopener noreferrer"
        className={linkClassName}
      >
        @{match.telegramUser}
      </a>
    );
  }

  if (match.kind === "email") {
    return (
      <a key={key} href={`mailto:${match.raw}`} className={linkClassName}>
        {match.raw}
      </a>
    );
  }

  return (
    <Fragment key={key}>
      <PhoneLink display={match.raw} />
    </Fragment>
  );
}

function LineWithLinks({ line, lineKey }: { line: string; lineKey: number }) {
  const matches = collectMatches(line);
  if (matches.length === 0) {
    return line;
  }

  const nodes: ReactNode[] = [];
  let cursor = 0;
  let i = 0;
  for (const match of matches) {
    if (match.start > cursor) {
      nodes.push(line.slice(cursor, match.start));
    }
    nodes.push(renderMatch(match, `${lineKey}-${i}`));
    i += 1;
    cursor = match.end;
  }
  if (cursor < line.length) {
    nodes.push(line.slice(cursor));
  }
  return <>{nodes}</>;
}

/**
 * Renders plain-text event descriptions with mailto links, t.me links as @handles,
 * and tel: links only for small viewports (see {@link PhoneLink}).
 * Each line uses the same line-height as links (`leading-5`); `gap-y-1` adds a
 * small, fixed gap between rows so spacing stays even and compact.
 */
export function DescriptionBodyWithLinks({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const lines = text.split("\n");
  const rootClass = ["flex flex-col gap-y-1", className].filter(Boolean).join(" ");

  return (
    <div className={rootClass}>
      {lines.map((line, lineIndex) => {
        if (line === "") {
          return null;
        }
        return (
          <div
            key={lineIndex}
            className={`min-h-5 text-sm leading-5${isPhoneOnlyLine(line) ? " sm:mt-1.5" : ""}`}
          >
            <LineWithLinks line={line} lineKey={lineIndex} />
          </div>
        );
      })}
    </div>
  );
}
