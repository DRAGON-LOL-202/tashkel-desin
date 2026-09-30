import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { LogIn } from "lucide-react";
import { useAuth } from "../components/auth/AuthProvider";
import { defaultPathForRole } from "../lib/permissions";
import { errorMessage } from "../lib/api";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { FieldWrap, Input } from "../components/ui/Field";

export default function LoginPage() {
  const { user, login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (user) return <Navigate to={defaultPathForRole(user.accessRole)} replace />;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await login(username.trim(), password);
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-background px-4 py-10 text-text" dir="rtl">
      <div className="mx-auto flex w-full max-w-md flex-col gap-6">
        <div>
          <p className="text-sm font-bold text-primary-deep">TASHKEEL.CNC</p>
          <h1 className="mt-2 text-2xl font-bold">تسجيل الدخول</h1>
          <p className="mt-1 text-sm text-muted">أدخل اسم المستخدم وكلمة المرور للمتابعة.</p>
        </div>
        <Card className="p-5">
          <form onSubmit={handleSubmit} noValidate>
            <FieldWrap label="اسم المستخدم" htmlFor="username">
              <Input
                id="username"
                autoComplete="username"
                autoCapitalize="none"
                dir="ltr"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                required
              />
            </FieldWrap>
            <FieldWrap label="كلمة المرور" htmlFor="password">
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                dir="ltr"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </FieldWrap>
            {error && (
              <p role="alert" className="mb-4 rounded-control bg-problem/10 px-3 py-2 text-sm text-problem">
                {error}
              </p>
            )}
            <Button
              type="submit"
              className="w-full"
              icon={<LogIn size={15} />}
              disabled={submitting || !username.trim() || !password}
            >
              {submitting ? "جارٍ الدخول..." : "دخول"}
            </Button>
          </form>
        </Card>
      </div>
    </main>
  );
}
