"use client";

import { FormEvent, useMemo, useState } from "react";

type LoginState = {
  error: string;
  success: string;
};

export default function Home() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [state, setState] = useState<LoginState>({ error: "", success: "" });

  const isButtonDisabled = useMemo(() => {
    return isSubmitting || !email.trim() || !password.trim();
  }, [email, isSubmitting, password]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setState({ error: "", success: "" });

    const normalizedEmail = email.trim().toLowerCase();
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailPattern.test(normalizedEmail)) {
      setState({ error: "Please enter a valid email address.", success: "" });
      return;
    }

    if (password.length < 8) {
      setState({
        error: "Password must be at least 8 characters.",
        success: "",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: normalizedEmail, password }),
      });

      const data = (await response.json()) as { message?: string };

      if (!response.ok) {
        setState({
          error: data.message ?? "Login failed. Please try again.",
          success: "",
        });
        return;
      }

      setState({
        error: "",
        success: data.message ?? "Login successful.",
      });
    } catch {
      setState({
        error: "Could not connect to server.",
        success: "",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_15%_20%,#ffe6bd_0%,#ffe6bd00_42%),radial-gradient(circle_at_85%_80%,#bfe7db_0%,#bfe7db00_40%),linear-gradient(140deg,#f7f8fc_0%,#f3efe4_48%,#f2f6ec_100%)] px-4 py-12 font-sans">
      <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(20,20,20,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(20,20,20,0.08)_1px,transparent_1px)] [background-size:28px_28px]" />

      <section className="relative w-full max-w-md rounded-3xl border border-black/10 bg-white/90 p-7 shadow-[0_30px_80px_-25px_rgba(20,20,20,0.45)] backdrop-blur md:p-9">
        <p className="mb-2 text-xs font-semibold tracking-[0.25em] text-emerald-700">
          TORI AI
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">
          Sign in
        </h1>
        <p className="mt-2 text-sm text-zinc-600">
          Use your email and password to access your workspace.
        </p>

        <form className="mt-7 space-y-4" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm text-zinc-700">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@company.com"
              className="h-11 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none ring-0 transition focus:border-emerald-600"
              required
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1.5 block text-sm text-zinc-700"
            >
              Password
            </label>
            <div className="flex h-11 items-center rounded-xl border border-zinc-300 bg-white pr-1 focus-within:border-emerald-600">
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="At least 8 characters"
                className="h-full w-full rounded-xl px-3 text-sm text-zinc-900 outline-none"
                required
                minLength={8}
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="rounded-lg px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-100"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          {state.error ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {state.error}
            </p>
          ) : null}

          {state.success ? (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {state.success}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isButtonDisabled}
            className="mt-2 h-11 w-full rounded-xl bg-zinc-900 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-400"
          >
            {isSubmitting ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}
