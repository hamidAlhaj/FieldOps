import { ApiError } from "../../services/http";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowRight, Check, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { Button, Logo } from "../../components/ui";
import { isDemo, service } from "../../services";
import { enterDemo } from "../../services/mocks/service";
import { Role, roleLabels, roles } from "../../services/contracts";
import { useSession } from "../../state/store";
const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(12, "Use at least 12 characters.").max(128),
});
const registerSchema = loginSchema.extend({
  displayName: z.string().trim().min(2, "Enter your full name.").max(160),
  organizationName: z
    .string()
    .trim()
    .min(2, "Enter your organization name.")
    .max(160),
});
type Fields = z.infer<typeof registerSchema>;
export function AuthPage({ register = false }: { register?: boolean }) {
  const navigate = useNavigate();
  const [role, setRole] = useState<Role>("DISPATCHER");
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState("");
  const {
    register: field,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Fields>({
    resolver: zodResolver(register ? registerSchema : loginSchema),
  });
  const submit = handleSubmit(async (data) => {
    setError("");
    try {
      const user = await (register
        ? service.register(data)
        : service.login(data));
      useSession.getState().setUser(user);
      navigate("/", { replace: true });
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : "Unable to connect. Please try again.",
      );
    }
  });
  return (
    <div className="auth-layout">
      <aside className="auth-story">
        <Logo />
        <div>
          <span className="eyebrow">GOOD WORK STARTS HERE</span>
          <h1>
            Great teams.
            <br />
            Extraordinary
            <br />
            <em>fieldwork.</em>
          </h1>
          <p>
            The people, places, and moving parts of your operation. Finally,
            working together.
          </p>
          <div className="auth-illustration" aria-hidden="true">
            <div className="orbit one" />
            <div className="orbit two" />
            <span className="orbit-point p1" />
            <span className="orbit-point p2" />
            <div className="floating-card">
              <span className="success-circle">
                <Check size={20} />
              </span>
              <div>
                <strong>Job completed</strong>
                <small>Another promise delivered.</small>
              </div>
            </div>
          </div>
        </div>
        <small>Built for the people who keep things running.</small>
      </aside>
      <main className="auth-main">
        <div className="mobile-logo">
          <Logo />
        </div>
        <div className="auth-form">
          <span className="eyebrow">YOUR WORKSPACE, CONNECTED</span>
          <h2>
            {isDemo
              ? "Meet your new command center."
              : register
                ? "Make room for better work."
                : "Welcome back."}
          </h2>
          <p>
            {isDemo
              ? "Explore a working preview with sample operations. Choose a perspective to get started."
              : register
                ? "Create your account and a new organization."
                : "Sign in to bring your day into focus."}
          </p>
          {isDemo ? (
            <>
              <div className="demo-notice">
                <ShieldCheck size={20} />
                <span>
                  <strong>Demo workspace</strong>
                  <small>
                    Sample data only. No account or credentials required.
                  </small>
                </span>
              </div>
              <label htmlFor="demo-role">Explore as</label>
              <select
                id="demo-role"
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
              >
                {roles.map((r) => (
                  <option key={r} value={r}>
                    {roleLabels[r]}
                  </option>
                ))}
              </select>
              <Button
                onClick={() => {
                  useSession.getState().setUser(enterDemo(role));
                  navigate("/", { replace: true });
                }}
              >
                Explore workspace <ArrowRight size={18} />
              </Button>
              <p className="form-footnote">
                A preview of the FieldOps experience. Changes are not saved.
              </p>
            </>
          ) : (
            <form onSubmit={submit} noValidate>
              {register && (
                <>
                  <label htmlFor="displayName">Full name</label>
                  <input
                    id="displayName"
                    autoComplete="name"
                    {...field("displayName")}
                    aria-invalid={!!errors.displayName}
                    aria-describedby="name-error"
                  />
                  <span className="field-error" id="name-error">
                    {errors.displayName?.message}
                  </span>
                  <label htmlFor="organizationName">Organization name</label>
                  <input
                    id="organizationName"
                    autoComplete="organization"
                    {...field("organizationName")}
                    aria-invalid={!!errors.organizationName}
                    aria-describedby="org-error"
                  />
                  <span className="field-error" id="org-error">
                    {errors.organizationName?.message}
                  </span>
                </>
              )}
              <label htmlFor="email">Work email</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@company.com"
                {...field("email")}
                aria-invalid={!!errors.email}
                aria-describedby="email-error"
              />
              <span id="email-error" className="field-error">
                {errors.email?.message}
              </span>
              <label htmlFor="password">Password</label>
              <div className="password-field">
                <input
                  id="password"
                  type={visible ? "text" : "password"}
                  autoComplete={register ? "new-password" : "current-password"}
                  {...field("password")}
                  aria-invalid={!!errors.password}
                  aria-describedby="password-error"
                />
                <button
                  type="button"
                  className="icon-button"
                  aria-label={visible ? "Hide password" : "Show password"}
                  onClick={() => setVisible(!visible)}
                >
                  {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <span id="password-error" className="field-error">
                {errors.password?.message}
              </span>
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <Button type="submit" busy={isSubmitting}>
                {register ? "Create workspace" : "Sign in"}
                <ArrowRight size={18} />
              </Button>
              <p className="form-footnote">
                {register ? "Already have an account?" : "New to FieldOps?"}{" "}
                <Link to={register ? "/login" : "/register"}>
                  {register ? "Sign in" : "Create an account"}
                </Link>
              </p>
            </form>
          )}
          <div className="auth-security">
            <ShieldCheck size={15} /> A secure space for your operation.
          </div>
        </div>
        <footer>
          FieldOps <span>Thoughtfully built. Ready for the field.</span>
        </footer>
      </main>
    </div>
  );
}
