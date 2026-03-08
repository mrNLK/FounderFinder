import { useState, useEffect } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import AIFundDashboard from "@/components/AIFundDashboard";
import { LogIn, Loader2, Search, ShieldX } from "lucide-react";
import { fetchActiveAppMembership } from "@/lib/app-membership";

function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        if (!session) {
          setAuthorized(null);
        }
      }
    );

    return () => listener?.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setAuthorized(null);
      return;
    }

    checkMembership();
  }, [session]);

  const checkMembership = async () => {
    try {
      const membership = await fetchActiveAppMembership("founderfinder");
      setAuthorized(membership !== null);
    } catch (error) {
      console.error("Founder Finder membership check failed:", error);
      setAuthorized(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!session) {
    return <LoginPage />;
  }

  if (authorized === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!authorized) {
    return <AccessDenied />;
  }

  return <>{children}</>;
}

function AccessDenied() {
  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="w-12 h-12 rounded-xl bg-destructive/10 flex items-center justify-center mx-auto">
          <ShieldX className="w-6 h-6 text-destructive" />
        </div>
        <h1 className="text-2xl font-semibold text-foreground">Access Restricted</h1>
        <p className="text-muted-foreground text-sm">
          Founder Finder is restricted to approved AI Fund members. Contact
          mike@aifund.ai if you need access.
        </p>
        <button
          onClick={handleSignOut}
          className="px-4 py-2 rounded-lg bg-secondary text-secondary-foreground text-sm hover:bg-secondary/80 transition-colors"
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}

function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Auth failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto">
            <Search className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-2xl font-semibold text-foreground">Founder Finder</h1>
          <p className="text-muted-foreground text-sm">
            AI Fund Venture Creation Pipeline
          </p>
          <p className="text-xs text-muted-foreground">
            Private app. Approved members only.
          </p>
        </div>

        <form onSubmit={handleEmailAuth} className="space-y-4">
          {error && (
            <div className="px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@aifund.ai"
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your password"
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <LogIn className="w-4 h-4" />
            )}
            Sign In
          </button>
        </form>
        <p className="text-center text-xs text-muted-foreground">
          No self-serve access. Contact mike@aifund.ai if you need an account.
        </p>
      </div>
    </div>
  );
}

function AppShell() {
  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Search className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-foreground leading-tight">
                Founder Finder
              </h1>
              <p className="text-[10px] text-muted-foreground leading-tight">
                AI Fund Pipeline
              </p>
            </div>
          </div>

          <button
            onClick={handleSignOut}
            className="px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <AIFundDashboard />
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthGate>
      <AppShell />
    </AuthGate>
  );
}
