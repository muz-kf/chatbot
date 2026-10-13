import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Sparkles } from "lucide-react";
import type { UserProfile } from "../../types/chat";

type AuthGateProps = {
  onAuthenticated: (user: UserProfile) => void;
};

export function AuthGate({ onAuthenticated }: AuthGateProps) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [strictAuth, setStrictAuth] = useState(true);
  const [modeLoading, setModeLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/auth/mode", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load authentication settings.");
        const result = (await response.json()) as { requiresEmailVerification?: boolean };
        setStrictAuth(result.requiresEmailVerification !== false);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setStrictAuth(true);
          setError("Could not load authentication settings. Email verification will be required.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setModeLoading(false);
      });
    return () => controller.abort();
  }, []);

  async function requestCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        strictAuth ? "/api/auth/send-code" : "/api/auth/dev-sign-in",
        {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, dateOfBirth }),
        },
      );
      const result = (await response.json()) as {
        message?: string;
        error?: string;
        user?: UserProfile;
      };
      if (!response.ok) throw new Error(result.error || "Could not send a sign-in code.");
      if (result.user) {
        onAuthenticated(result.user);
        return;
      }
      setCodeSent(true);
      setNotice(result.message || "Check your inbox for a six-digit sign-in code.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not send a sign-in code.");
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code, name, dateOfBirth }),
      });
      const result = (await response.json()) as { user?: UserProfile; error?: string };
      if (!response.ok || !result.user) throw new Error(result.error || "Could not verify that code.");
      onAuthenticated(result.user);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not verify that code.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-overlay">
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="auth-brand"><span><Sparkles size={19} /></span> DAZZ</div>
        {codeSent ? (
          <>
            <button
              className="auth-back"
              type="button"
              onClick={() => {
                setCodeSent(false);
                setCode("");
                setError("");
              }}
            >
              <ArrowLeft size={14} /> Edit profile
            </button>
            <h1 id="auth-title">Check your email</h1>
            <p className="auth-description">Enter the six-digit code sent to <strong>{email}</strong>.</p>
            <form onSubmit={(event) => void verifyCode(event)} className="auth-form">
              <label htmlFor="auth-code">Verification code</label>
              <input
                id="auth-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
              />
              {notice && <p className="auth-notice" role="status">{notice}</p>}
              {error && <p className="auth-error" role="alert">{error}</p>}
              <button className="auth-submit" type="submit" disabled={loading || code.length !== 6}>
                {loading ? "Verifying..." : "Verify and continue"} <ArrowRight size={16} />
              </button>
            </form>
          </>
        ) : (
          <>
            <h1 id="auth-title">A little room to think.</h1>
            <p className="auth-description">
              {strictAuth
                ? "Add your profile details to get started. We’ll verify your email before saving your account."
                : "Development sign-in is enabled. Your email and date of birth will be used to find or create your local profile; no email will be sent."}
            </p>
            <form onSubmit={(event) => void requestCode(event)} className="auth-form">
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
              <button className="auth-submit" type="submit" disabled={loading || modeLoading}>
                {loading
                  ? (strictAuth ? "Sending code..." : "Signing in...")
                  : modeLoading
                    ? "Loading..."
                    : strictAuth
                      ? "Continue with email"
                      : "Continue"} <ArrowRight size={16} />
              </button>
            </form>
            <p className="auth-privacy">
              {strictAuth
                ? "Your name and date of birth are saved to your profile. Chats are private to your verified email."
                : "Development mode only. Date of birth is not a secure substitute for a password."}
            </p>
          </>
        )}
      </section>
    </div>
  );
}
