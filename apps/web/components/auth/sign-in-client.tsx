"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";

import { postJson } from "@/lib/client/api";
import { ArrowUpRightIcon, GithubIcon, GoogleIcon, ShieldIcon } from "../ui/icons";

type SocialProvider = "google" | "github";

function safeNext(value: string | null): string {
  return value && value.startsWith("/") && !value.startsWith("//") && !value.includes("\\")
    ? value
    : "/subscribe";
}

export function SignInClient() {
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState<SocialProvider | "password" | null>(null);
  const [error, setError] = useState("");

  function socialSignIn(provider: SocialProvider) {
    setError("");
    setLoading(provider);
    const query = new URLSearchParams({ provider, next });
    window.location.assign(`/api/auth/signin?${query.toString()}`);
  }

  async function passwordSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading("password");
    try {
      const result = await postJson<{ ok: true; next: string }>("/api/auth/password", {
        email,
        password,
        next,
      });
      window.location.assign(result.next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sign-in could not be completed.");
      setLoading(null);
    }
  }

  return (
    <div className="sign-in-panel">
      <div className="sign-in-panel__head">
        <span className="section-code">ACCOUNT / ACCESS</span>
        <h1>Continue your research.</h1>
        <p>Use your usual social account, or enter account credentials supplied for website review.</p>
      </div>

      {error ? <div className="form-error" role="alert">{error}</div> : null}

      <div className="sign-in-socials">
        <button disabled={loading !== null} onClick={() => socialSignIn("google")} type="button">
          <GoogleIcon size={18} />
          {loading === "google" ? "Connecting…" : "Continue with Google"}
        </button>
        <button aria-label="Continue with GitHub" disabled={loading !== null} onClick={() => socialSignIn("github")} type="button">
          <GithubIcon size={19} />
        </button>
      </div>

      <div className="sign-in-divider"><span>OR USE EMAIL</span></div>

      <form className="credential-form" onSubmit={passwordSignIn}>
        <label htmlFor="review-email">Email address</label>
        <input
          autoComplete="username"
          id="review-email"
          inputMode="email"
          onChange={(event) => setEmail(event.target.value)}
          placeholder="name@example.com"
          required
          type="email"
          value={email}
        />
        <label htmlFor="review-password">Password</label>
        <input
          autoComplete="current-password"
          id="review-password"
          minLength={8}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Enter your password"
          required
          type="password"
          value={password}
        />
        <button className="primary-button primary-button--wide" disabled={loading !== null} type="submit">
          {loading === "password" ? "Signing in…" : "Sign in with email"}
          {loading !== "password" ? <ArrowUpRightIcon size={17} /> : null}
        </button>
      </form>

      <p className="sign-in-security"><ShieldIcon size={14} /> Passwords are verified by Supabase Auth and are never stored by MicroManus.</p>
      <p className="sign-in-legal">By continuing, you agree to the <Link href="/terms">Terms</Link> and acknowledge the <Link href="/privacy">Privacy Policy</Link>.</p>
    </div>
  );
}
