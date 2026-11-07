import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { ArrowRight, Sparkles } from "lucide-react";
import { apiRequest } from "../../lib/api";
import type { UserProfile } from "../../types/chat";

type AuthGateProps = {
  onAuthenticated: (user: UserProfile) => void;
};

export function AuthGate({ onAuthenticated }: AuthGateProps) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [error, setError] = useState("");
  const signInMutation = useMutation({
    mutationFn: (profile: { email: string; name: string; dateOfBirth: string }) =>
      apiRequest<{ user: UserProfile }>("/api/auth/sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      }),
  });

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      const result = await signInMutation.mutateAsync({ email, name, dateOfBirth });
      onAuthenticated(result.user);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not sign in.");
    }
  }

  return (
    <div className="auth-overlay">
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="auth-brand"><span><Sparkles size={19} /></span> DAZZ</div>
        <h1 id="auth-title">A little room to think.</h1>
        <p className="auth-description">
          Sign in with your email address and date of birth.
        </p>
        <form onSubmit={(event) => void signIn(event)} className="auth-form">
          <label htmlFor="auth-name">Name</label>
          <input
            id="auth-name"
            autoComplete="name"
            maxLength={100}
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Your name"
          />
          <label htmlFor="auth-email">Email address</label>
          <input
            id="auth-email"
            type="email"
            autoComplete="email"
            maxLength={320}
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
          />
          <label htmlFor="auth-dob">Date of birth</label>
          <input
            id="auth-dob"
            type="date"
            autoComplete="bday"
            max={new Date().toISOString().slice(0, 10)}
            required
            value={dateOfBirth}
            onChange={(event) => setDateOfBirth(event.target.value)}
          />
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="auth-submit" type="submit" disabled={signInMutation.isPending}>
            {signInMutation.isPending ? "Signing in..." : "Continue"} <ArrowRight size={16} />
          </button>
        </form>
        <p className="auth-privacy">
          Email and date of birth are used to find your account. This sign-in flow does not send an email.
        </p>
      </section>
    </div>
  );
}
