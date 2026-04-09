"use client";

/**
 * @module ContactSupportForm
 *
 * Homepage contact form that creates a new support thread by POSTing to
 * `/api/support/contact`. Requires an authenticated session; unauthenticated
 * visitors see a sign-in prompt instead.
 *
 * After a successful submission the thread appears in the user's
 * {@link SupportInbox} where staff replies can be read and answered.
 *
 * @see SupportInbox — where the user views and replies to threads
 */

import Link from "next/link";
import { useState } from "react";
import { useSession } from "next-auth/react";

const MIN_MESSAGE_LENGTH = 10;
const MAX_MESSAGE_LENGTH = 1200;

/**
 * Renders a contact-support form (textarea + send button) for authenticated users.
 * Unauthenticated or loading states display a placeholder message instead.
 */
export default function ContactSupportForm() {
  const { data: session, status } = useSession();
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const trimmedLength = message.trim().length;
  const canSubmit =
    status === "authenticated" &&
    !isSubmitting &&
    trimmedLength >= MIN_MESSAGE_LENGTH &&
    trimmedLength <= MAX_MESSAGE_LENGTH;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    setIsSubmitting(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/support/contact", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: message.trim(),
        }),
      });

      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(payload.error || "Could not send your request.");
        return;
      }

      setSuccess("Message sent. We will reply in the app.");
      setMessage("");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (status === "loading") {
    return (
      <p className="mt-5 rounded-2xl border border-white/15 bg-black/20 px-4 py-3 text-sm text-neutral-300">
        Loading sign-in status...
      </p>
    );
  }

  if (status !== "authenticated" || !session?.user?.email) {
    return (
      <p className="mt-5 rounded-2xl border border-dashed border-white/15 px-4 py-3 text-sm text-neutral-400">
        Sign in with Google first, then send your support request here.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-5 space-y-3">
      <p className="text-xs text-neutral-400">
        Sending as {session.user.name || session.user.email}
      </p>

      <label className="block">
        <span className="sr-only">Support message</span>
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="What do you need help with?"
          rows={4}
          maxLength={MAX_MESSAGE_LENGTH}
          className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white placeholder:text-neutral-500 focus:border-blue-400/80 focus:outline-none"
        />
      </label>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-neutral-400">
          {trimmedLength}/{MAX_MESSAGE_LENGTH}
        </p>
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-full bg-blue-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? "Sending..." : "Send support request"}
        </button>
      </div>

      {error ? (
        <p className="rounded-xl border border-red-500/35 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      ) : null}

      {success ? (
        <p className="rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
          {success}
        </p>
      ) : null}

      <p className="text-xs text-neutral-400">
        View replies in your{" "}
        <Link href="/support" className="text-blue-300 hover:text-blue-200">
          support inbox
        </Link>
        .
      </p>
    </form>
  );
}
